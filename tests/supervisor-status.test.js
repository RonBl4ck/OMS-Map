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

test('api/update-supervisor-status valida campos obligatorios (ticket y estado)', async () => {
    const handler = require('../api/update-supervisor-status.js');

    // Sin ticket
    let statusCode = 200;
    let payload = null;
    const reqSinTicket = {
        method: 'POST',
        headers: { 'x-user-role': 'admin' },
        body: { estado: 'Buscando Falla' }
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

    // Sin estado
    const reqSinEstado = {
        method: 'POST',
        headers: { 'x-user-role': 'admin' },
        body: { ticket: '12345' }
    };
    await handler(reqSinEstado, res);
    assert.equal(statusCode, 400);
    assert.match(payload.message, /estado de supervisión es obligatorio/);
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
            estado: 'En Sitio',
            detalle: 'Brigada en maniobras de prueba',
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
    assert.equal(payload.logEntry.estado, 'En Sitio');
    assert.equal(payload.logEntry.usuario, 'PLUZ');
    assert.match(payload.logEntry.fecha, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('index.html cuenta con el modal de supervisión y la columna en la tabla', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
    assert.ok(html.includes('id="supervisorModalOverlay"'), 'Debe existir el modal supervisorModalOverlay');
    assert.ok(html.includes('id="thSupervisorCol"'), 'Debe existir la cabecera thSupervisorCol en tdOmsTable');
    assert.ok(html.includes('id="supTimelineContainer"'), 'Debe existir el contenedor del timeline');
    assert.ok(html.includes('id="btnSaveSupervisorLog"'), 'Debe existir el botón de guardar');
});
