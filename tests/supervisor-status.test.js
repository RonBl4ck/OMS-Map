const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('api/config-data entrega sheets_url_supervisor ÚNICAMENTE al rol admin', async () => {
    const configDataHandler = require('../api/config-data.js');

    // 1. Simular petición de un contratista (COBRA)
    let contractorPayload = null;
    const reqContractor = {
        method: 'GET',
        url: '/api/config-data?role=contractor',
        query: { role: 'contractor' },
        headers: {}
    };
    const resContractor = {
        setHeader() {},
        writeHead() {},
        end(data) { contractorPayload = JSON.parse(data); },
        status() { return { send(data) { contractorPayload = JSON.parse(data); } }; }
    };
    await configDataHandler(reqContractor, resContractor);

    assert.equal(contractorPayload.sheets_url_supervisor, '', 'Contratista no debe recibir sheets_url_supervisor');

    // 2. Simular petición de PLUZ (admin)
    let adminPayload = null;
    const reqAdmin = {
        method: 'GET',
        url: '/api/config-data?role=admin',
        query: { role: 'admin' },
        headers: {}
    };
    const resAdmin = {
        setHeader() {},
        writeHead() {},
        end(data) { adminPayload = JSON.parse(data); },
        status() { return { send(data) { adminPayload = JSON.parse(data); } }; }
    };
    await configDataHandler(reqAdmin, resAdmin);

    assert.ok(typeof adminPayload.sheets_url_supervisor === 'string', 'Admin debe recibir string para sheets_url_supervisor');
});

test('api/update-supervisor-status deniega acceso (403) a contratistas y roles no admin', async () => {
    const handler = require('../api/update-supervisor-status.js');

    let statusCode = 200;
    let payload = null;
    const req = {
        method: 'POST',
        headers: {},
        body: {
            ticket: '998877',
            estado: 'En Sitio',
            detalle: 'Prueba',
            role: 'contractor'
        }
    };
    const res = {
        setHeader() {},
        writeHead(code) { statusCode = code; },
        end(data) { payload = JSON.parse(data); },
        status(code) { statusCode = code; return { send(data) { payload = JSON.parse(data); } }; }
    };

    await handler(req, res);

    assert.equal(statusCode, 403);
    assert.equal(payload.success, false);
    assert.match(payload.message, /No autorizado/);
});

test('api/update-supervisor-status valida campos obligatorios (ticket y estado/criticidad)', async () => {
    const handler = require('../api/update-supervisor-status.js');

    // Sin ticket
    let statusCode = 200;
    let payload = null;
    const reqSinTicket = {
        method: 'POST',
        headers: { 'x-user-role': 'admin' },
        body: { estadoOperativo: 'EN CAMINO' }
    };
    const res = {
        setHeader() {},
        writeHead(code) { statusCode = code; },
        end(data) { payload = JSON.parse(data); },
        status(code) { statusCode = code; return { send(data) { payload = JSON.parse(data); } }; }
    };

    await handler(reqSinTicket, res);
    assert.equal(statusCode, 400);
    assert.match(payload.message, /ticket es obligatorio/);

    // Sin estado operativo ni criticidad
    const reqSinEstado = {
        method: 'POST',
        headers: { 'x-user-role': 'admin' },
        body: { ticket: '12345' }
    };
    await handler(reqSinEstado, res);
    assert.equal(statusCode, 400);
    assert.match(payload.message, /al menos un estado operativo o nivel de criticidad/);
});

test('api/update-supervisor-status procesa correctamente petición admin con respaldo local', async () => {
    const handler = require('../api/update-supervisor-status.js');

    let statusCode = 200;
    let payload = null;
    const req = {
        method: 'POST',
        headers: { 'x-user-role': 'admin' },
        body: {
            ticket: 'TEST-8849',
            sed: 'SED-40192',
            horaInicio: '2026-10-22 10:15',
            alimentador: 'SJL-04',
            empresa: 'COBRA',
            estadoOperativo: 'EN EJECUCION',
            detalleOperativo: 'Brigada en maniobras de prueba',
            estadoCritico: 'QUANTICO',
            detalleCritico: 'Cliente electrodependiente',
            role: 'admin',
            scriptUrl: 'http://invalid-test-url-fallback.local'
        }
    };
    const res = {
        setHeader() {},
        writeHead(code) { statusCode = code; },
        end(data) { payload = JSON.parse(data); },
        status(code) { statusCode = code; return { send(data) { payload = JSON.parse(data); } }; }
    };

    await handler(req, res);

    assert.equal(statusCode, 200);
    assert.equal(payload.success, true);
    assert.ok(payload.logEntry);
    assert.equal(payload.logEntry.ticket, 'TEST-8849');
    assert.equal(payload.logEntry.sed, 'SED-40192');
    assert.equal(payload.logEntry.horaInicio, '2026-10-22 10:15');
    assert.equal(payload.logEntry.alimentador, 'SJL-04');
    assert.equal(payload.logEntry.empresa, 'COBRA');
    assert.equal(payload.logEntry.estadoOperativo, 'EN EJECUCION');
    assert.equal(payload.logEntry.estadoCritico, 'QUANTICO');
    assert.equal(payload.logEntry.detalleCritico, 'Cliente electrodependiente');
    assert.equal(payload.logEntry.usuario, 'PLUZ');
    assert.match(payload.logEntry.fecha, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('index.html cuenta con el modal de supervisión, las 2 columnas y el botón de exportación', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
    assert.ok(html.includes('id="supervisorModalOverlay"'), 'Debe existir el modal supervisorModalOverlay');
    assert.ok(html.includes('id="thSupervisorOperativoCol"'), 'Debe existir la cabecera thSupervisorOperativoCol');
    assert.ok(html.includes('id="thSupervisorCriticoCol"'), 'Debe existir la cabecera thSupervisorCriticoCol');
    assert.ok(html.includes('id="checkFilterQuanticoCritico"'), 'Debe existir el checkbox checkFilterQuanticoCritico');
    assert.ok(html.includes('id="btnExportFilteredTable"'), 'Debe existir el botón btnExportFilteredTable');
    assert.ok(html.includes('id="supTimelineContainer"'), 'Debe existir el contenedor del timeline');
    assert.ok(html.includes('id="btnSaveSupervisorLog"'), 'Debe existir el botón de guardar');
    assert.ok(html.includes('id="tabHistorialPluz"'), 'Debe existir la pestaña tabHistorialPluz');
    assert.ok(html.includes('id="historialPluzOverlay"'), 'Debe existir la vista historialPluzOverlay');
    assert.ok(html.includes('id="btnOpenHistorialPluzFromTdOms"'), 'Debe existir el acceso directo en indicadores');
    assert.ok(html.includes('assets/js/45-historial-pluz.js'), 'Debe cargar el script 45-historial-pluz.js');
});

test('00-core.js y 60-auth.js indexan novedades por SED y por Ticket', () => {
    const coreCode = fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf-8');
    const authCode = fs.readFileSync(path.join(root, 'assets', 'js', '60-auth.js'), 'utf-8');
    const dashCode = fs.readFileSync(path.join(root, 'assets', 'js', '20-dashboard.js'), 'utf-8');

    assert.ok(coreCode.includes('supervisorRecordsBySedMap'), '00-core.js debe definir supervisorRecordsBySedMap');
    assert.ok(coreCode.includes('getSupervisorLogsForSed'), '00-core.js debe exponer getSupervisorLogsForSed');
    assert.ok(dashCode.includes('cleanSedVal'), '20-dashboard.js debe capturar cleanSedVal');
    assert.ok(dashCode.includes('cleanHoraIniVal'), '20-dashboard.js debe capturar cleanHoraIniVal');
    assert.ok(authCode.includes('supervisorRecordsBySedMap'), '60-auth.js debe poblar supervisorRecordsBySedMap');
});

test('45-historial-pluz.js restringe la lista exclusivamente a Quánticos y Críticos, descartando Vencidos o normales', () => {
    const hpCode = fs.readFileSync(path.join(root, 'assets', 'js', '45-historial-pluz.js'), 'utf-8');
    assert.ok(hpCode.includes('isTicketQuanticoOrCritico'), 'Debe incluir función de filtrado para Quánticos y Críticos');
    assert.ok(hpCode.includes('isEntryQuantico'), 'Debe validar si la entrada es Quántica');
    assert.ok(hpCode.includes('isEntryCritico'), 'Debe validar si la entrada es Crítica');
    assert.ok(!hpCode.includes("data-val=\"VENCIDO\""), 'No debe contener chip de Vencidos');
});

test('api/update-supervisor-status envía 1 único POST batch (upsert_supervisor_batch) con todos los tickets', async () => {
    const handler = require('../api/update-supervisor-status.js');
    const originalFetch = global.fetch;
    const fetchCalls = [];

    global.fetch = async (url, opts) => {
        fetchCalls.push({ url, opts, body: JSON.parse(opts.body) });
        return {
            ok: true,
            status: 200,
            async text() {
                return JSON.stringify({
                    success: true,
                    inserted: 3,
                    updated: 1,
                    skipped: 1,
                    total: 5,
                    message: 'SEGUIMIENTO_SUPERVISOR: 3 nuevos, 1 actualizados, 1 sin cambios.'
                });
            }
        };
    };

    try {
        let statusCode = 200;
        let payload = null;
        const req = {
            method: 'POST',
            headers: { 'x-user-role': 'admin' },
            body: {
                role: 'admin',
                scriptUrl: 'https://script.google.com/macros/s/fake-test-id/exec',
                estadoOperativo: 'EN EJECUCION',
                tickets: [
                    { ticket: '2600001', jc: 'PEREZ' },
                    { ticket: '2600002', jc: 'GOMEZ' },
                    { ticket: '2600003', jc: 'LOPEZ' },
                    { ticket: '2600004', jc: 'DIAZ' },
                    { ticket: '2600005', jc: 'RUIZ' }
                ]
            }
        };
        const res = {
            setHeader() {},
            writeHead(code) { statusCode = code; },
            end(data) { payload = JSON.parse(data); },
            status(code) { statusCode = code; return { send(data) { payload = JSON.parse(data); } }; }
        };

        await handler(req, res);

        assert.equal(statusCode, 200);
        assert.equal(fetchCalls.length, 1, 'Debe realizar exactamente 1 POST batch a Apps Script');
        assert.equal(fetchCalls[0].body.action, 'upsert_supervisor_batch');
        assert.equal(fetchCalls[0].body.entries.length, 5);
        assert.equal(payload.syncedToSheets, true);
        assert.equal(payload.inserted, 3);
        assert.equal(payload.updated, 1);
        assert.equal(payload.skipped, 1);
    } finally {
        global.fetch = originalFetch;
    }
});

test('60-auth.js expande Historial_JSON (1 fila/ticket) y mantiene retrocompatibilidad con filas legacy', () => {
    const vm = require('node:vm');
    const authCode = fs.readFileSync(path.join(root, 'assets', 'js', '60-auth.js'), 'utf-8');
    const fnStart = authCode.indexOf('function buildSupervisorMapsFromRows');
    assert.ok(fnStart !== -1, '60-auth.js debe definir buildSupervisorMapsFromRows');
    let depth = 0;
    let fnEnd = -1;
    for (let i = authCode.indexOf('{', fnStart); i < authCode.length; i++) {
        if (authCode[i] === '{') depth++;
        else if (authCode[i] === '}') {
            depth--;
            if (depth === 0) { fnEnd = i + 1; break; }
        }
    }
    assert.ok(fnEnd > fnStart, 'Debe extraer el bloque completo de buildSupervisorMapsFromRows');
    const fnSource = authCode.slice(fnStart, fnEnd);

    const ctx = {
        getProp(obj, ...keys) {
            for (const k of keys) {
                if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
            }
            return '';
        },
        Map,
        Array,
        Object,
        String,
        JSON,
        console
    };
    vm.createContext(ctx);
    vm.runInContext(fnSource, ctx);

    const byTicket = new Map();
    const bySed = new Map();

    const rows = [
        // Caso 1: 1 fila con 1 solo evento (Historial_JSON vacío)
        {
            Fecha_Hora: '2026-11-25 08:00:00',
            Ticket: '2600100',
            SED: '00100A',
            Hora_Inicio: '25/11/2026 07:30:00',
            Alimentador: 'A-01',
            Empresa: 'COBRA',
            Estado_Operativo: 'EN CAMINO',
            JC: 'PEREZ',
            Fin_Estimado: '',
            Detalle_Operativo: 'Saliendo a zona',
            Estado_Critico: '',
            Detalle_Critico: '',
            Usuario: 'PLUZ',
            Actualizaciones: '1',
            Historial_JSON: ''
        },
        // Caso 2: 1 fila con Historial_JSON de 2 eventos previos (orden cronológico antiguo -> penúltimo)
        {
            Fecha_Hora: '2026-11-25 11:00:00',
            Ticket: '2600200',
            SED: '00200B',
            Hora_Inicio: '25/11/2026 07:00:00',
            Alimentador: 'B-02',
            Empresa: 'DOMINION',
            Estado_Operativo: 'NORMALIZADO',
            JC: 'QUISPE',
            Fin_Estimado: '2026-11-25 11:30',
            Detalle_Operativo: 'Energizado OK',
            Estado_Critico: 'CRITICO',
            Detalle_Critico: 'Hospital cercano',
            Usuario: 'PLUZ',
            Actualizaciones: '3',
            Historial_JSON: JSON.stringify([
                { f: '2026-11-25 08:00:00', op: 'EN CAMINO', jc: 'QUISPE' },
                { f: '2026-11-25 09:30:00', op: 'EN EJECUCION', jc: 'QUISPE', fe: '2026-11-25 11:30', do: 'Cambiando fusible', cr: 'CRITICO', dc: 'Hospital cercano' }
            ])
        },
        // Caso 3: Filas legacy repetidas sin Historial_JSON
        {
            Fecha_Hora: '2026-11-24 10:00:00',
            Ticket: '2600300',
            SED: '00300C',
            Empresa: 'PA',
            Estado_Operativo: 'EN CAMINO',
            JC: 'SILVA'
        },
        {
            Fecha_Hora: '2026-11-24 12:00:00',
            Ticket: '2600300',
            SED: '00300C',
            Empresa: 'PA',
            Estado_Operativo: 'EN EJECUCION',
            JC: 'SILVA'
        },
        // Caso 4: Historial_JSON malformado no debe romper el parseo
        {
            Fecha_Hora: '2026-11-25 12:00:00',
            Ticket: '2600400',
            SED: '00400D',
            Empresa: 'LARI',
            Estado_Operativo: 'IMPEDIDO',
            Historial_JSON: '{malformed-json'
        }
    ];

    ctx.buildSupervisorMapsFromRows(rows, byTicket, bySed);

    // Caso 1
    const r1 = byTicket.get('2600100');
    assert.ok(r1);
    assert.equal(r1.history.length, 1);
    assert.equal(r1.latest.estadoOperativo, 'EN CAMINO');

    // Caso 2: history ordenado del más reciente (latest) al más antiguo
    const r2 = byTicket.get('2600200');
    assert.ok(r2);
    assert.equal(r2.history.length, 3);
    assert.equal(r2.latest.estadoOperativo, 'NORMALIZADO');
    assert.equal(r2.history[0].estadoOperativo, 'NORMALIZADO');
    assert.equal(r2.history[1].estadoOperativo, 'EN EJECUCION');
    assert.equal(r2.history[1].detalleOperativo, 'Cambiando fusible');
    assert.equal(r2.history[1].sed, '00200B');
    assert.equal(r2.history[1].usuario, 'PLUZ');
    assert.equal(r2.history[2].estadoOperativo, 'EN CAMINO');
    assert.equal(bySed.get('00200B').length, 3);

    // Caso 3: Legacy
    const r3 = byTicket.get('2600300');
    assert.ok(r3);
    assert.equal(r3.history.length, 2);
    assert.equal(r3.latest.estadoOperativo, 'EN EJECUCION');
    assert.equal(r3.history[0].estadoOperativo, 'EN EJECUCION');
    assert.equal(r3.history[1].estadoOperativo, 'EN CAMINO');

    // Caso 4: JSON malformado tolerado
    const r4 = byTicket.get('2600400');
    assert.ok(r4);
    assert.equal(r4.history.length, 1);
    assert.equal(r4.latest.estadoOperativo, 'IMPEDIDO');
});
