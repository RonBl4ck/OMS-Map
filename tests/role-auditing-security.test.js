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

test('perfil ALFACO está disponible y filtra casos propios asignados como ALFACO', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /<option\s+value="ALFACO">/, 'index.html debe contener el perfil ALFACO en el selector');

    const coreJs = fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf8');
    const vm = require('node:vm');
    const ctx = {
        console,
        Date,
        Map,
        Set,
        setTimeout,
        clearTimeout,
        document: { addEventListener() {}, getElementById() { return null; } }
    };
    vm.createContext(ctx);
    vm.runInContext(coreJs, ctx);

    const testRecords = [
        { ticket: 'T1', Contratista: 'ALFACO' },
        { ticket: 'T2', Contratista: 'COBRA' },
        { ticket: 'T3', Contratista: 'INMEL' },
        { ticket: 'T4', Contratista: 'DOMINION' }
    ];

    const filtered = ctx.filterRecordsForAssignedContractor(testRecords, 'ALFACO');
    assert.equal(filtered.length, 1, 'ALFACO debe ver exclusivamente sus propios registros');
    assert.deepEqual(filtered.map(r => r.ticket), ['T1']);
});

test('api/login autentica correctamente al perfil ALFACO con clave alfaco-2026', async () => {
    const loginHandler = require('../api/login.js');
    let payload = null;
    let statusCode = 200;

    const reqValid = {
        method: 'POST',
        body: { user: 'ALFACO', password: 'alfaco-2026' },
        headers: {}
    };
    const resValid = {
        setHeader() {},
        writeHead(c) { statusCode = c; },
        end(data) { payload = JSON.parse(data); },
        status(c) { statusCode = c; return { send(d) { payload = JSON.parse(d); } }; }
    };
    await loginHandler(reqValid, resValid);

    assert.equal(statusCode, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.user, 'ALFACO');
    assert.equal(payload.contractor, 'ALFACO');
    assert.equal(payload.role, 'contractor');

    // Alias FACO
    let aliasPayload = null;
    let aliasStatusCode = 200;
    const reqAlias = {
        method: 'POST',
        body: { user: 'FACO', password: 'alfaco-2026' },
        headers: {}
    };
    const resAlias = {
        setHeader() {},
        writeHead(c) { aliasStatusCode = c; },
        end(data) { aliasPayload = JSON.parse(data); },
        status(c) { aliasStatusCode = c; return { send(d) { aliasPayload = JSON.parse(d); } }; }
    };
    await loginHandler(reqAlias, resAlias);
    assert.equal(aliasStatusCode, 200);
    assert.equal(aliasPayload.success, true);
    assert.equal(aliasPayload.user, 'ALFACO');
    assert.equal(aliasPayload.contractor, 'ALFACO');

    // Clave incorrecta
    let errPayload = null;
    let errStatusCode = 200;
    const reqInvalid = {
        method: 'POST',
        body: { user: 'ALFACO', password: 'wrong-password' },
        headers: {}
    };
    const resInvalid = {
        setHeader() {},
        writeHead(c) { errStatusCode = c; },
        end(data) { errPayload = JSON.parse(data); },
        status(c) { errStatusCode = c; return { send(d) { errPayload = JSON.parse(d); } }; }
    };
    await loginHandler(reqInvalid, resInvalid);

    assert.equal(errStatusCode, 401);
    assert.equal(errPayload.success, false);
});

test('10-map.js detecta la fecha de subida antes de filtrar y muestra 0 cuando no hay casos', () => {
    const mapJs = fs.readFileSync(path.join(root, 'assets', 'js', '10-map.js'), 'utf8');
    assert.match(mapJs, /const\s+fullDataset\s*=\s*Array\.isArray\(data\)/, 'processRawData debe conservar el dataset completo');
    assert.match(mapJs, /lastUploadTimeRaw\s*=\s*fullDataset\[0\]\.FECHA_ACTUALIZACION_SISTEMA/, 'Debe extraer la fecha del dataset original antes del filtro');
    assert.match(mapJs, /topNavCount.*?count\s*>\s*0\s*\?\s*`🚨\s*\$\{count\}`\s*:\s*'0'/, 'topNavCount debe mostrar 0 cuando no hay casos');
});


test('topNavCount en 10-map.js contabiliza el total de incidencias incluyendo casos sin GPS', () => {
    const mapJs = fs.readFileSync(path.join(root, 'assets', 'js', '10-map.js'), 'utf8');
    assert.match(mapJs, /allRecordsSource\s*=\s*\(tdOmsRecords\s*&&\s*tdOmsRecords\.length\s*>\s*0\)\s*\?\s*tdOmsRecords\s*:\s*mapLocations/);
    assert.match(mapJs, /matchesCurrentMapFilter\(record\)/);
});

test('tab Productividad se habilita tras login con aislamiento de empresa y sin acceso a Llamadas para contratas', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /id=["']tabSeguimientoDia["'][^>]*style=["'][^"']*display:\s*none;?["']/, 'tabSeguimientoDia debe estar oculto por defecto antes del login');

    const authJs = fs.readFileSync(path.join(root, 'assets', 'js', '60-auth.js'), 'utf8');
    assert.match(authJs, /tabSeguimientoDia\.style\.display\s*=\s*''/, 'updateUserBadge debe mostrar tabSeguimientoDia tras autenticar');
    assert.match(authJs, /btnSubnavCallsFromSeg\.style\.display\s*=\s*isAdmin\s*\?\s*''\s*:\s*'none'/, 'updateUserBadge debe ocultar subnav de Llamadas para contratas');

    const navJs = fs.readFileSync(path.join(root, 'assets', 'js', '50-navigation.js'), 'utf8');
    assert.match(navJs, /function showSeguimientoDiaView\(\)[\s\S]*?selectPrimaryView\('productivity'\)/, 'showSeguimientoDiaView debe permitir acceso autenticado');
    assert.match(navJs, /function showLlamadasView\(\)[\s\S]*?sessionStorage\.getItem\(['"]oms_user_role['"]\)\s*!==\s*['"]admin['"]/, 'showLlamadasView debe seguir bloqueado si no es admin');

    const segDiaJs = fs.readFileSync(path.join(root, 'assets', 'js', '22-seguimiento-dia.js'), 'utf8');
    assert.match(segDiaJs, /if\s*\(!isAdmin\)/, '22-seguimiento-dia.js debe aislar el selector de empresa para usuarios no admin');
});

test('suministros reincidentes y cierres propios están habilitados para contratas pero SEDs críticas siguen exclusivas de PLUZ', () => {
    const dashJs = fs.readFileSync(path.join(root, 'assets', 'js', '20-dashboard.js'), 'utf8');
    const mgrJs = fs.readFileSync(path.join(root, 'assets', 'js', 'components', 'dashboardManager.js'), 'utf8');
    const popupsJs = fs.readFileSync(path.join(root, 'assets', 'js', 'templates', 'mapPopups.js'), 'utf8');
    const markersJs = fs.readFileSync(path.join(root, 'assets', 'js', 'components', 'markersManager.js'), 'utf8');
    const segDiaJs = fs.readFileSync(path.join(root, 'assets', 'js', '22-seguimiento-dia.js'), 'utf8');

    // Dashboard y componente: botón [⚠️ xN] y modal habilitados sobre registros filtrados
    assert.ok(dashJs.includes('(r.suministro_reincidente || (r.suministro_count >= 2))'), '20-dashboard.js debe habilitar botón btn-ticket-reinc');
    assert.ok(!dashJs.includes('isPluz && (r.suministro_reincidente'), '20-dashboard.js no debe restringir btn-ticket-reinc a isPluz');
    assert.ok(mgrJs.includes('(r.suministro_reincidente || (r.suministro_count >= 2))'), 'dashboardManager.js debe habilitar botón btn-ticket-reinc');
    assert.ok(!mgrJs.includes('isPluz && (r.suministro_reincidente'), 'dashboardManager.js no debe restringir btn-ticket-reinc a isPluz');
    assert.ok(!dashJs.includes('Acceso restringido: El historial de fallas'), 'openSuministroHistoryModal no debe bloquear a contratas');

    // Popups y marcadores del mapa: reincidencia de suministro habilitada, pero SED crítica exclusiva admin
    assert.ok(popupsJs.includes('const isSuministroReinc = Boolean(loc.suministro_reincidente'), 'mapPopups.js debe habilitar reincidencia de suministro');
    assert.ok(markersJs.includes('const isSuministroReinc = Boolean(loc.suministro_reincidente'), 'markersManager.js debe habilitar badge de reincidencia en marcador');
    assert.ok(popupsJs.includes('const isSedCrit = isAdmin &&'), 'mapPopups.js debe mantener SED crítica exclusiva para admin');

    // Balance Diario: cierres propios habilitados sobre ejecutados filtrados
    assert.ok(segDiaJs.includes('hasClosures = Array.isArray(item.closures)'), '22-seguimiento-dia.js debe habilitar acordeón de cierres sobre registros filtrados');
});
