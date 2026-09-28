const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('api/config-data entrega URLs de SEDs críticas y llamadas ÚNICAMENTE al perfil admin', async () => {
    const configDataHandler = require('../api/config-data.js');

    // Simular petición de un contratista (COBRA)
    let contractorPayload = null;
    let contractorHeaders = {};
    const reqContractor = {
        method: 'GET',
        url: '/api/config-data?role=contractor',
        query: { role: 'contractor' },
        headers: {}
    };
    const resContractor = {
        setHeader(name, val) { contractorHeaders[name] = val; },
        writeHead(code) {},
        end(data) { contractorPayload = JSON.parse(data); },
        status(code) { return { send(data) { contractorPayload = JSON.parse(data); } }; }
    };
    await configDataHandler(reqContractor, resContractor);

    assert.equal(contractorPayload.sheets_url_sed_criticas, '', 'Contratista no debe recibir URL de SEDs Críticas');
    assert.equal(contractorPayload.sheets_url_llamadas, '', 'Contratista no debe recibir URL de Llamadas');
    assert.match(contractorHeaders['Cache-Control'], /private/, 'Cache-Control debe ser privado para evitar fugas por CDN');

    // Simular petición del admin (PLUZ)
    let adminPayload = null;
    const reqAdmin = {
        method: 'GET',
        url: '/api/config-data?role=admin',
        query: { role: 'admin' },
        headers: {}
    };
    const resAdmin = {
        setHeader(name, val) {},
        writeHead(code) {},
        end(data) { adminPayload = JSON.parse(data); },
        status(code) { return { send(data) { adminPayload = JSON.parse(data); } }; }
    };
    await configDataHandler(reqAdmin, resAdmin);

    assert.notEqual(adminPayload.sheets_url_sed_criticas, '', 'Admin PLUZ debe recibir URL de SEDs Críticas');
    assert.match(adminPayload.sheets_url_sed_criticas, /spreadsheets/, 'URL de SEDs críticas debe ser válida');
});

test('20-dashboard.js filtra la descarga de ejecutados por el contratista asignado', () => {
    const js = fs.readFileSync(path.join(root, 'assets', 'js', '20-dashboard.js'), 'utf8');
    assert.match(js, /filterRecordsForAssignedContractor\(parsed\.data,\s*assignedContractor\)/, 'downloadExecutedBase debe filtrar por empresa asignada');
});

test('40-tecnicos.js aísla los registros en memoria para el contratista asignado', () => {
    const js = fs.readFileSync(path.join(root, 'assets', 'js', '40-tecnicos.js'), 'utf8');
    assert.match(js, /tecnicosRecords\s*=\s*contractor\s*===\s*'\*'\s*\?\s*parsedData\s*:\s*parsedData\.filter/, 'loadTecnicos debe filtrar tecnicosRecords');
});

test('35-critical-panel.js restringe la apertura del panel y las alertas al rol admin', () => {
    const js = fs.readFileSync(path.join(root, 'assets', 'js', '35-critical-panel.js'), 'utf8');
    assert.match(js, /function openCriticalSedPanel[\s\S]*?isAdmin/, 'openCriticalSedPanel debe verificar si el usuario es admin');
    assert.match(js, /function checkAndNotifyCriticalSedsOnLoad[\s\S]*?if\s*\(!isAdmin\)\s*return/, 'checkAndNotifyCriticalSedsOnLoad debe silenciarse para contratistas');
});

test('60-auth.js oculta los filtros de SEDs Críticas para perfiles no admin', () => {
    const js = fs.readFileSync(path.join(root, 'assets', 'js', '60-auth.js'), 'utf8');
    assert.match(js, /lblCriticaMap\.style\.display\s*=\s*isAdmin\s*\?\s*'inline-flex'\s*:\s*'none'/, 'Debe ocultar el filtro de Top Críticas en mapa');
    assert.match(js, /lblCriticaModal\.style\.display\s*=\s*isAdmin\s*\?\s*'inline-flex'\s*:\s*'none'/, 'Debe ocultar el filtro de SED Crítica en modal TD OMS');
});
