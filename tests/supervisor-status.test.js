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
