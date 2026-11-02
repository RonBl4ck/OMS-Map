const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const authJsPath = path.join(__dirname, '..', 'assets', 'js', '60-auth.js');
const authJsCode = fs.readFileSync(authJsPath, 'utf8');

// Mock simple de sessionStorage para tests en Node.js
class MockSessionStorage {
    constructor() {
        this.store = new Map();
    }
    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }
    setItem(key, value) {
        this.store.set(key, String(value));
    }
    removeItem(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
}

// Configurar global sessionStorage antes de cargar el módulo
global.sessionStorage = new MockSessionStorage();

const authModule = require('../assets/js/60-auth.js');

test('60-auth.js define o exporta funciones utilitarias y mapa global', () => {
    // Verificación estática en el código fuente
    assert.match(authJsCode, /function\s+getSessionCache\s*\(/, 'Debe definir getSessionCache');
    assert.match(authJsCode, /function\s+setSessionCache\s*\(/, 'Debe definir setSessionCache');
    assert.match(authJsCode, /async\s+function\s+fetchWithTimeout\s*\(/, 'Debe definir fetchWithTimeout');
    assert.match(authJsCode, /function\s+rebuildOmsTicketIndex\s*\(/, 'Debe definir rebuildOmsTicketIndex');
    assert.match(authJsCode, /window\.omsRecordsByTicketMap\s*=/, 'Debe declarar omsRecordsByTicketMap');

    // Verificación en exportaciones del módulo
    assert.equal(typeof authModule.getSessionCache, 'function', 'getSessionCache debe ser función');
    assert.equal(typeof authModule.setSessionCache, 'function', 'setSessionCache debe ser función');
    assert.equal(typeof authModule.fetchWithTimeout, 'function', 'fetchWithTimeout debe ser función');
    assert.equal(typeof authModule.rebuildOmsTicketIndex, 'function', 'rebuildOmsTicketIndex debe ser función');
});

test('omsRecordsByTicketMap es un Map y está disponible globalmente', () => {
    assert.ok(authModule.omsRecordsByTicketMap instanceof Map, 'omsRecordsByTicketMap debe ser una instancia de Map');
    assert.ok(globalThis.omsRecordsByTicketMap instanceof Map, 'globalThis.omsRecordsByTicketMap debe ser una instancia de Map');
});

test('loadData implementa carga paralela con Promise.allSettled', () => {
    assert.match(authJsCode, /Promise\.allSettled\s*\(\s*\[\s*sedsCriticasPromise\s*,\s*supervisorPromise\s*\]\s*\)/, 
        'loadData debe descargar SEDS_CRITICAS y SEGUIMIENTO_SUPERVISOR en paralelo con Promise.allSettled');
    assert.match(authJsCode, /getSessionCache\s*\(\s*['"]oms_config_data_['"]/,
        'loadData debe revisar el caché de config antes de invocar la Serverless function');
    assert.match(authJsCode, /rebuildOmsTicketIndex\s*\(\s*\)/,
        'loadData debe invocar rebuildOmsTicketIndex tras parsear los registros');
});

test('Caché con TTL: getSessionCache y setSessionCache gestionan expiración y errores', async () => {
    global.sessionStorage.clear();

    const testData = { role: 'admin', sheets_url: 'https://example.com/sheet' };
    authModule.setSessionCache('test_cfg', testData);

    // Recuperar antes del TTL
    const cached = authModule.getSessionCache('test_cfg', 1000);
    assert.deepEqual(cached, testData, 'Debe retornar los datos cacheados correctamente');

    // Simular expiración de TTL de 10ms
    await new Promise(r => setTimeout(r, 20));
    const expired = authModule.getSessionCache('test_cfg', 10);
    assert.equal(expired, null, 'Debe retornar null cuando el TTL ha expirado');

    // Manejo de JSON corrupto sin lanzar error
    global.sessionStorage.setItem('corrupt_key', '{not_valid_json');
    assert.equal(authModule.getSessionCache('corrupt_key', 5000), null, 'Debe manejar JSON malformado devolviendo null');
});

test('fetchWithTimeout cancela petición cuando se excede timeoutMs', async () => {
    // Simular un fetch que tarda 100ms pero con timeout de 20ms
    const slowFetch = (url, opts) => new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
        });
    });

    const origFetch = global.fetch;
    global.fetch = slowFetch;

    try {
        await assert.rejects(
            async () => {
                await authModule.fetchWithTimeout('https://fake-endpoint.com', {}, 25);
            },
            { name: 'TimeoutError' },
            'fetchWithTimeout debe lanzar TimeoutError si excede el tiempo límite'
        );
    } finally {
        global.fetch = origFetch;
    }
});

test('rebuildOmsTicketIndex indexa tickets por ticket, caso, nro_caso e incidencia en O(1)', () => {
    global.tdOmsRecords = [
        { ticket: '1001', caso: 'C-200', nro_caso: 'NC-300', incidencia: 'INC-400', falla: 'BT' },
        { Ticket: '1002', Caso: 'C-201', Nro_Caso: 'NC-301', Incidencia: 'INC-401', falla: 'MT' }
    ];
    global.ejecutadosRecords = [
        { nro_ticket: '5001', nro_caso: 'NC-700', incidencia: 'INC-800', empresa: 'LARI' }
    ];
    global.llamadasRecords = [
        { ticket: '9001', caso: 'C-900', incidencia: 'INC-999' }
    ];

    authModule.rebuildOmsTicketIndex();
    const map = authModule.omsRecordsByTicketMap;

    // Búsqueda O(1) exacta y lowercase
    assert.ok(map.has('1001'), 'Debe indexar ticket 1001');
    assert.ok(map.has('c-200'), 'Debe indexar caso C-200 en lowercase');
    assert.ok(map.has('NC-300'), 'Debe indexar nro_caso NC-300');
    assert.ok(map.has('INC-400'), 'Debe indexar incidencia INC-400');

    assert.equal(map.get('1001').falla, 'BT');
    assert.equal(map.get('NC-301').falla, 'MT');
    assert.equal(map.get('5001').empresa, 'LARI');
    assert.equal(map.get('INC-999').ticket, '9001');
});

test('handleLogin guarda data.config en sesión si viene en la respuesta', async () => {
    global.sessionStorage.clear();

    const origFetch = global.fetch;
    global.fetch = async (url, opts) => {
        return {
            ok: true,
            json: async () => ({
                success: true,
                user: 'ADMIN_TEST',
                contractor: '*',
                role: 'admin',
                config: { sheets_url: 'https://test-sheet.com' }
            })
        };
    };

    try {
        await authModule.handleLogin('ADMIN_TEST', 'secret');
        const cachedConfig = authModule.getSessionCache('oms_config_data_admin', 15 * 60 * 1000);
        assert.deepEqual(cachedConfig, { sheets_url: 'https://test-sheet.com' }, 
            'handleLogin debe cachear data.config bajo oms_config_data_admin');
    } finally {
        global.fetch = origFetch;
    }
});
