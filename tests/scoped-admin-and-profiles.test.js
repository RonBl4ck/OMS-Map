const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function createMockRes() {
    let statusCode = 200;
    let body = null;
    const headers = {};
    return {
        res: {
            setHeader(k, v) { headers[k] = v; },
            writeHead(code) { statusCode = code; },
            end(data) { body = data ? JSON.parse(data) : null; },
            status(code) {
                statusCode = code;
                return {
                    send(data) { body = typeof data === 'string' ? JSON.parse(data) : data; },
                    end(data) { body = data ? JSON.parse(data) : null; }
                };
            }
        },
        getStatus: () => statusCode,
        getBody: () => body,
        getHeaders: () => headers
    };
}

function createSessionStorageMock(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem(k) { return store.has(k) ? store.get(k) : null; },
        setItem(k, v) { store.set(k, String(v)); },
        removeItem(k) { store.delete(k); },
        clear() { store.clear(); }
    };
}

// a) api/_lib/auth-token.js
test('a) auth-token: createAuthToken firma y verifica contractor correctamente para Admin Acotado', () => {
    const { createAuthToken, verifyAuthToken } = require('../api/_lib/auth-token');
    const token = createAuthToken({
        user: 'ADMIN_NORTE',
        role: 'admin',
        contractor: 'COBRA,INMEL'
    });

    assert.ok(typeof token === 'string' && token.includes('.'));
    const verified = verifyAuthToken(token);
    assert.equal(verified.valid, true);
    assert.equal(verified.payload.user, 'ADMIN_NORTE');
    assert.equal(verified.payload.role, 'admin');
    assert.equal(verified.payload.contractor, 'COBRA,INMEL');
});

// b) api/get-users-admin.js
test('b) api/get-users-admin: GET ?public=1 devuelve 200, success: true y profiles sin exponer password', async () => {
    const getUsersAdminHandler = require('../api/get-users-admin');
    const { res, getStatus, getBody } = createMockRes();

    await getUsersAdminHandler({
        method: 'GET',
        url: '/api/get-users-admin?public=1',
        query: { public: '1' },
        headers: {}
    }, res);

    const body = getBody();
    assert.equal(getStatus(), 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.profiles) && body.profiles.length > 0, 'Debe retornar lista de perfiles');
    for (const profile of body.profiles) {
        assert.ok(profile.user, 'Cada perfil debe tener user');
        assert.ok(profile.role, 'Cada perfil debe tener role');
        assert.ok(profile.contractor, 'Cada perfil debe tener contractor');
        assert.equal('password' in profile, false, `Perfil ${profile.user} no debe exponer password`);
    }
});

// c) api/update-users.js
test('c) api/update-users: valida PIN, normaliza usuarios (PLUZ -> *, múltiples contratas -> coma) y preserva config.json', async () => {
    const updateUsersHandler = require('../api/update-users');
    const configPath = path.join(root, 'config.json');
    const hadConfig = fs.existsSync(configPath);
    const originalConfig = hadConfig ? fs.readFileSync(configPath, 'utf8') : null;
    const originalFetch = global.fetch;

    let capturedWebhookBody = null;
    global.fetch = async (_url, opts) => {
        capturedWebhookBody = JSON.parse(opts.body);
        return {
            ok: true,
            status: 200,
            async text() { return JSON.stringify({ success: true }); }
        };
    };

    try {
        // 1. PIN inválido -> 401
        const badPinMock = createMockRes();
        await updateUsersHandler({
            method: 'POST',
            body: {
                pin: 'PIN_INCORRECTO',
                users: [{ user: 'PLUZ', password: '123', role: 'admin', contractor: '*' }]
            },
            headers: {}
        }, badPinMock.res);
        assert.equal(badPinMock.getStatus(), 401);
        assert.equal(badPinMock.getBody().success, false);

        // 2. PIN válido -> normaliza usuarios y persiste sin error
        const masterPin = process.env.CONFIG_MASTER_PASSWORD || process.env.PLUZ_CONFIG_PIN || 'PLUZ_2026_PLUZ';
        const validMock = createMockRes();
        await updateUsersHandler({
            method: 'POST',
            body: {
                pin: masterPin,
                scriptUrl: '',
                users: [
                    { user: 'pluz', password: 'secret-pluz', contractor: 'COBRA' },
                    { user: 'admin_norte', password: 'secret-norte', role: 'admin', contractor: 'COBRA; inmel ' },
                    { user: 'lari', password: 'secret-lari', role: 'contractor', contractor: 'LARI' }
                ]
            },
            headers: {}
        }, validMock.res);

        const respBody = validMock.getBody();
        assert.equal(validMock.getStatus(), 200);
        assert.equal(respBody.success, true);

        assert.ok(capturedWebhookBody && Array.isArray(capturedWebhookBody.users));
        const pluzUser = capturedWebhookBody.users.find(u => u.user === 'PLUZ');
        const norteUser = capturedWebhookBody.users.find(u => u.user === 'ADMIN_NORTE');
        const lariUser = capturedWebhookBody.users.find(u => u.user === 'LARI');

        assert.ok(pluzUser);
        assert.equal(pluzUser.contractor, '*', 'PLUZ siempre debe quedar forzado a contractor="*"');
        assert.equal(pluzUser.role, 'admin', 'PLUZ debe mantener/normalizar role="admin" si viene como admin o verificar normalización');

        assert.ok(norteUser);
        assert.equal(norteUser.role, 'admin');
        assert.equal(norteUser.contractor, 'COBRA,INMEL', 'Múltiples contratas deben normalizarse con coma y mayúsculas');

        assert.ok(lariUser);
        assert.equal(lariUser.role, 'contractor');
        assert.equal(lariUser.contractor, 'LARI');

        if (hadConfig) {
            const savedCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            assert.equal(savedCfg.users.find(u => u.user === 'ADMIN_NORTE').contractor, 'COBRA,INMEL');
        }
    } finally {
        global.fetch = originalFetch;
        if (hadConfig) {
            fs.writeFileSync(configPath, originalConfig, 'utf8');
        } else if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
    }
});

// d) assets/js/00-core.js
test('d) 00-core.js: isCurrentUserSuperAdmin y recordMatchesAssignedContractor operan correctamente en VM', () => {
    const coreJs = fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf8');
    const sessionStorage = createSessionStorageMock();
    const ctx = {
        console,
        Date,
        Map,
        Set,
        setTimeout,
        clearTimeout,
        sessionStorage,
        window: {},
        document: { addEventListener() {}, getElementById() { return null; } }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(coreJs, ctx);

    // Super Admin (admin + *)
    sessionStorage.setItem('oms_user_role', 'admin');
    sessionStorage.setItem('oms_assigned_contractor', '*');
    assert.equal(ctx.isCurrentUserSuperAdmin(), true);

    // Scoped Admin (admin + COBRA,INMEL)
    sessionStorage.setItem('oms_user_role', 'admin');
    sessionStorage.setItem('oms_assigned_contractor', 'COBRA,INMEL');
    assert.equal(ctx.isCurrentUserSuperAdmin(), false);

    // Contractor (contractor + COBRA)
    sessionStorage.setItem('oms_user_role', 'contractor');
    sessionStorage.setItem('oms_assigned_contractor', 'COBRA');
    assert.equal(ctx.isCurrentUserSuperAdmin(), false);

    // recordMatchesAssignedContractor con empresas simples y múltiples
    assert.equal(ctx.recordMatchesAssignedContractor({ Contratista: 'COBRA' }, 'COBRA'), true);
    assert.equal(ctx.recordMatchesAssignedContractor({ Contratista: 'INMEL' }, 'COBRA'), false);
    assert.equal(ctx.recordMatchesAssignedContractor({ Contratista: 'COBRA' }, 'COBRA,INMEL'), true);
    assert.equal(ctx.recordMatchesAssignedContractor({ Contratista: 'INMEL' }, 'COBRA,INMEL'), true);
    assert.equal(ctx.recordMatchesAssignedContractor({ Contratista: 'LARI' }, 'COBRA,INMEL'), false);
    assert.equal(ctx.recordMatchesAssignedContractor({ Empresa: 'DOMINION' }, 'COBRA,INMEL'), false);
    assert.equal(ctx.recordMatchesAssignedContractor('COBRA', '*'), true);
});

// e) assets/js/60-auth.js
test('e) 60-auth.js: updateUserBadge oculta btnOpenConfig para Admin Acotado, muestra tabs admin y formatea navUserName', () => {
    const authJs = fs.readFileSync(path.join(root, 'assets', 'js', '60-auth.js'), 'utf8');
    const elements = new Map();
    const makeEl = (id) => {
        if (!elements.has(id)) {
            elements.set(id, { id, style: { display: '' }, innerText: '', onclick: null });
        }
        return elements.get(id);
    };

    const sessionStorage = createSessionStorageMock({
        oms_user_id: 'ADMIN_NORTE',
        oms_user_role: 'admin',
        oms_assigned_contractor: 'COBRA,INMEL'
    });

    const ctx = {
        console,
        Date,
        Map,
        Set,
        setTimeout,
        clearTimeout,
        sessionStorage,
        localStorage: createSessionStorageMock(),
        window: {},
        location: { reload() {} },
        document: {
            readyState: 'loading',
            addEventListener() {},
            getElementById: (id) => makeEl(id)
        }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(authJs, ctx);

    ctx.updateUserBadge();

    assert.equal(elements.get('btnOpenConfig').style.display, 'none', 'Admin Acotado no debe ver botón de configuración');
    assert.equal(elements.get('tabLlamadas').style.display, '', 'Admin Acotado debe ver tabLlamadas');
    assert.equal(elements.get('tabHistorialPluz').style.display, '', 'Admin Acotado debe ver tabHistorialPluz');
    assert.equal(elements.get('btnOpenHistorialPluzFromTdOms').style.display, 'inline-flex');
    assert.equal(elements.get('lblCriticaMap').style.display, 'inline-flex');
    assert.equal(
        elements.get('navUserName').innerText,
        '👤 ADMIN_NORTE'
    );

    // Verificar también Super Admin
    sessionStorage.setItem('oms_user_id', 'PLUZ');
    sessionStorage.setItem('oms_assigned_contractor', '*');
    ctx.updateUserBadge();
    assert.equal(elements.get('btnOpenConfig').style.display, 'inline-flex');
    assert.equal(elements.get('navUserName').innerText, '👤 PLUZ');
});

// f) assets/js/45-historial-pluz.js
test('f) 45-historial-pluz.js: getSupervisorTicketsList filtra tickets por oms_assigned_contractor="COBRA,INMEL"', () => {
    const coreJs = fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf8');
    const historialJs = fs.readFileSync(path.join(root, 'assets', 'js', '45-historial-pluz.js'), 'utf8')
        .replace(
            'window.initHistorialPluzEvents = initHistorialPluzEvents;',
            'window.initHistorialPluzEvents = initHistorialPluzEvents; window.getSupervisorTicketsList = getSupervisorTicketsList;'
        );

    const sessionStorage = createSessionStorageMock({
        oms_user_role: 'admin',
        oms_assigned_contractor: 'COBRA,INMEL'
    });

    const ctx = {
        console,
        Date,
        Map,
        Set,
        setTimeout,
        clearTimeout,
        sessionStorage,
        tdOmsRecords: [],
        ejecutadosRecords: [],
        llamadasRecords: [],
        window: {},
        document: {
            readyState: 'loading',
            addEventListener() {},
            getElementById() { return null; }
        }
    };
    ctx.window = ctx;
    ctx.window.omsRecordsByTicketMap = new Map();
    vm.createContext(ctx);
    vm.runInContext(coreJs, ctx);
    vm.runInContext(historialJs, ctx);

    ctx.supervisorRecordsMap.set('t1', { latest: { ticket: 'T1', empresa: 'COBRA', estadoCritico: 'QUANTICO', fecha: '2026-11-18 10:00' }, history: [] });
    ctx.supervisorRecordsMap.set('t2', { latest: { ticket: 'T2', empresa: 'INMEL', estadoCritico: 'CRITICO', fecha: '2026-11-18 11:00' }, history: [] });
    ctx.supervisorRecordsMap.set('t3', { latest: { ticket: 'T3', empresa: 'LARI', estadoCritico: 'QUANTICO', fecha: '2026-11-18 12:00' }, history: [] });
    ctx.supervisorRecordsMap.set('t4', { latest: { ticket: 'T4', empresa: 'DOMINION', estadoCritico: 'CRITICO', fecha: '2026-11-18 13:00' }, history: [] });

    const result = ctx.window.getSupervisorTicketsList();
    assert.equal(result.length, 2, 'Solo debe incluir tickets de COBRA e INMEL');
    assert.deepEqual(
        Array.from(result.map(r => r.latest.ticket)),
        ['T2', 'T1'],
        'Debe excluir LARI y DOMINION y ordenar por fecha descendente'
    );
});

// g) assets/js/30-llamadas.js
test('g) 30-llamadas.js: filterLlamadasByAssignedContractor filtra llamadas usando oms_assigned_contractor y omsRecordsByTicketMap', () => {
    const coreJs = fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf8');
    const llamadasJs = fs.readFileSync(path.join(root, 'assets', 'js', '30-llamadas.js'), 'utf8');

    const sessionStorage = createSessionStorageMock({
        oms_user_role: 'admin',
        oms_assigned_contractor: 'COBRA,INMEL'
    });

    const omsRecordsByTicketMap = new Map([
        ['TK-101', { ticket: 'TK-101', Contratista: 'COBRA' }],
        ['TK-102', { ticket: 'TK-102', Empresa: 'INMEL' }],
        ['TK-103', { ticket: 'TK-103', Contratista: 'LARI' }],
        ['TK-104', { ticket: 'TK-104', Empresa: 'DOMINION' }]
    ]);

    const ctx = {
        console,
        Date,
        Map,
        Set,
        setTimeout,
        clearTimeout,
        sessionStorage,
        window: {},
        document: {
            readyState: 'loading',
            addEventListener() {},
            getElementById() { return null; }
        }
    };
    ctx.window = ctx;
    ctx.window.omsRecordsByTicketMap = omsRecordsByTicketMap;
    vm.createContext(ctx);
    vm.runInContext(coreJs, ctx);
    vm.runInContext(llamadasJs, ctx);

    const sampleRows = [
        { aviso: 'A1', ticket: 'TK-101', empresa: '' },       // Resuelto por map -> COBRA (incluir)
        { aviso: 'A2', ticket: 'TK-102', empresa: '' },       // Resuelto por map -> INMEL (incluir)
        { aviso: 'A3', ticket: 'TK-103', empresa: '' },       // Resuelto por map -> LARI (excluir)
        { aviso: 'A4', ticket: 'TK-104', empresa: '' },       // Resuelto por map -> DOMINION (excluir)
        { aviso: 'A5', ticket: 'TK-999', empresa: 'COBRA' },  // Empresa directa -> COBRA (incluir)
        { aviso: 'A6', ticket: 'TK-998', empresa: 'LARI' }    // Empresa directa -> LARI (excluir)
    ];

    const filtered = ctx.filterLlamadasByAssignedContractor(sampleRows);
    assert.deepEqual(filtered.map(r => r.aviso), ['A1', 'A2', 'A5']);
});

// h) index.html, assets/js/70-admin.js y scripts/google-apps-script-accesos.gs
test('h) UI Admin y Apps Script contienen los controles de perfiles, roles, contratas y doPost', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const adminJs = fs.readFileSync(path.join(root, 'assets', 'js', '70-admin.js'), 'utf8');
    const gas = fs.readFileSync(path.join(root, 'scripts', 'google-apps-script-accesos.gs'), 'utf8');

    assert.match(html, /id="btnAddNewUserProfile"/, 'index.html debe tener #btnAddNewUserProfile');
    assert.match(html, /id="btnAddNewContractorOption"/, 'index.html debe tener #btnAddNewContractorOption');

    assert.match(adminJs, /btnAddNewUserProfile/, '70-admin.js debe enlazar #btnAddNewUserProfile');
    assert.match(adminJs, /btnAddNewContractorOption/, '70-admin.js debe enlazar #btnAddNewContractorOption');
    assert.match(adminJs, /cfg-u-role/, '70-admin.js debe renderizar/leer .cfg-u-role');
    assert.match(adminJs, /cfg-u-contractor/, '70-admin.js debe renderizar/leer .cfg-u-contractor');

    assert.match(gas, /function\s+doPost\s*\(/, 'google-apps-script-accesos.gs debe definir doPost');
});
