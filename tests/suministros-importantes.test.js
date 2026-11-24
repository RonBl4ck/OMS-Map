const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const configHandler = require('../api/config-data');
const { omsStore } = require('../assets/js/state/store');
const MapPopups = require('../assets/js/templates/mapPopups');

const rootDir = path.join(__dirname, '..');

function createMockRes() {
    let statusCode = 0;
    let body = '';
    return {
        get statusCode() { return statusCode; },
        get body() { return body; },
        setHeader() {},
        status(code) { statusCode = code; return this; },
        send(payload) { body = payload; return this; },
        writeHead(code) { statusCode = code; },
        end(payload) { body = payload || ''; }
    };
}

test('api/config-data expone sheets_url_suministros_importantes solo a admin', async () => {
    const resAdmin = createMockRes();
    await configHandler(
        { method: 'GET', headers: {}, query: { role: 'admin' }, url: '/api/config-data?role=admin' },
        resAdmin
    );
    assert.equal(resAdmin.statusCode, 200);
    const adminPayload = JSON.parse(resAdmin.body);
    assert.match(adminPayload.sheets_url_suministros_importantes || '', /gid=1845027694/);

    const resContractor = createMockRes();
    await configHandler(
        { method: 'GET', headers: {}, query: { role: 'contractor' }, url: '/api/config-data?role=contractor' },
        resContractor
    );
    assert.equal(resContractor.statusCode, 200);
    const contractorPayload = JSON.parse(resContractor.body);
    assert.equal(contractorPayload.sheets_url_suministros_importantes, '');
});

test('omsStore inicializa GOOGLE_SHEET_SUMINISTROS_IMPORTANTES_URL y suministrosImportantesMap', () => {
    assert.equal(typeof omsStore.get('GOOGLE_SHEET_SUMINISTROS_IMPORTANTES_URL'), 'string');
    assert.ok(omsStore.get('suministrosImportantesMap') instanceof Map);
});

test('00-core.js normaliza suministros y resuelve getSuministroImportante / isSuministroImportante', () => {
    const coreCode = fs.readFileSync(path.join(rootDir, 'assets', 'js', '00-core.js'), 'utf8');
    const impMap = new Map([['13992', { suministro: '13992', titular: 'POLICIA NACIONAL DEL PERU' }]]);
    const sandbox = {
        console,
        Map,
        Set,
        omsStore: {
            get(key) {
                if (key === 'suministrosImportantesMap') return impMap;
                return key.includes('Map') ? new Map() : (key.includes('Set') ? new Set() : '');
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(coreCode, sandbox);

    assert.equal(sandbox.normalizeSuministroCode('0013992'), '13992');
    assert.equal(sandbox.normalizeSuministroCode('13992.0'), '13992');
    assert.equal(sandbox.normalizeSuministroCode(' 13992 '), '13992');
    assert.equal(sandbox.normalizeSuministroCode('N/A'), '');
    assert.equal(sandbox.normalizeSuministroCode('0000'), '');

    const info = sandbox.getSuministroImportante('0013992');
    assert.deepEqual(info, { suministro: '13992', titular: 'POLICIA NACIONAL DEL PERU' });
    assert.equal(sandbox.isSuministroImportante('13992.0'), true);
    assert.equal(sandbox.isSuministroImportante('9999999'), false);
});

test('mapPopups muestra tarjeta SUMINISTRO IMPORTANTE solo para admin (PLUZ)', () => {
    const loc = {
        ticket: '123456',
        odm: '987654',
        estado: 'PENDIENTE',
        empresa: 'COBRA',
        falla: 'SUMINISTRO',
        suministro: '13992',
        es_suministro_importante: true,
        suministro_importante_titular: 'POLICIA NACIONAL DEL PERU',
        sed: '00003S',
        direccion: 'JR. CHIRA',
        distrito: 'RIMAC',
        fecha_inicio: '24/11/2026 10:00',
        llamadas: 2,
        sla: { statusClass: 'sla-ok', label: 'En plazo', badgeBg: '#dcfce7', badgeColor: '#166534' }
    };

    const prevAdminFn = global.isCurrentUserAdmin;
    try {
        global.isCurrentUserAdmin = () => true;
        const adminHtml = MapPopups.renderIncidentPopup(loc);
        assert.match(adminHtml, /SUMINISTRO IMPORTANTE/);
        assert.match(adminHtml, /POLICIA NACIONAL DEL PERU/);

        const adminMarker = MapPopups.renderIncidentIcon(loc);
        assert.match(adminMarker, /is-suministro-importante/);
        assert.match(adminMarker, /marker-imp-badge/);

        global.isCurrentUserAdmin = () => false;
        const contractorHtml = MapPopups.renderIncidentPopup(loc);
        assert.doesNotMatch(contractorHtml, /SUMINISTRO IMPORTANTE/);
        assert.doesNotMatch(contractorHtml, /POLICIA NACIONAL DEL PERU/);

        const contractorMarker = MapPopups.renderIncidentIcon(loc);
        assert.doesNotMatch(contractorMarker, /is-suministro-importante/);
    } finally {
        if (prevAdminFn === undefined) delete global.isCurrentUserAdmin;
        else global.isCurrentUserAdmin = prevAdminFn;
    }
});

test('Contratos de HTML, CSS bundle, JS bundle, 60-auth y Apps Script (solo lectura)', () => {
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    assert.match(html, /id="lblImpSuminMap"/);
    assert.match(html, /id="chkImpSuminMap"/);
    assert.match(html, /id="lblImpSuminModal"/);
    assert.match(html, /id="chkImpSuminModal"/);

    const authJs = fs.readFileSync(path.join(rootDir, 'assets', 'js', '60-auth.js'), 'utf8');
    assert.match(authJs, /oms_suministros_importantes_csv/);
    assert.match(authJs, /suministrosImportantesPromise/);
    assert.match(authJs, /lblImpSuminMap/);

    const css = fs.readFileSync(path.join(rootDir, 'assets', 'css', '90-modern.css'), 'utf8');
    assert.match(css, /\.is-suministro-importante/);
    assert.match(css, /\.marker-imp-badge/);
    assert.match(css, /\.badge-suministro-importante/);

    const bundle = fs.readFileSync(path.join(rootDir, 'assets', 'js', '00-modules.bundle.js'), 'utf8');
    assert.match(bundle, /suministrosImportantesMap/);
    assert.match(bundle, /chkImpSuminMap/);

    const gas = fs.readFileSync(path.join(rootDir, 'scripts', 'google-apps-script-accesos.gs'), 'utf8');
    assert.match(gas, /get_suministros_importantes/);
    assert.match(gas, /SUMINISTROS_IMPORTANTES/);
    assert.doesNotMatch(gas, /delete_suministro_importante/);
});
