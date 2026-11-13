const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createCoreContext() {
    const context = {
        console,
        setTimeout,
        clearTimeout,
        Map,
        Set,
        Date,
        Math,
        JSON,
        Object,
        Array,
        String,
        Number,
        Boolean,
        RegExp,
        Error,
        parseInt,
        parseFloat,
        isNaN,
        Number,
        sessionStorage: {
            _data: { oms_user_role: 'admin' },
            getItem(k) { return this._data[k] || null; },
            setItem(k, v) { this._data[k] = String(v); }
        },
        window: {}
    };
    context.globalThis = context;
    context.window = context;

    const storeCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'state', 'store.js'), 'utf8');
    const coreCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '00-core.js'), 'utf8');
    vm.createContext(context);
    vm.runInContext(storeCode, context);
    vm.runInContext(coreCode, context);
    return context;
}

test('getTicketPluzStatus returns SIN REGISTRO when ticket has no supervisor log and uppercase status when logged', () => {
    const ctx = createCoreContext();
    assert.equal(ctx.getTicketPluzStatus('9001001'), 'SIN REGISTRO');

    ctx.addSupervisorLogOptimistic({
        ticket: '9001001',
        sed: '03033A',
        estadoOperativo: 'en ejecucion',
        jefeCuadrilla: 'JUAN PEREZ'
    });
    assert.equal(ctx.getTicketPluzStatus('9001001'), 'EN EJECUCION');

    // Ticket with only criticidad QUANTICO and no operative status should still be SIN REGISTRO for Estado (PLUZ)
    ctx.addSupervisorLogOptimistic({
        ticket: '9001002',
        sed: '04512B',
        estadoOperativo: '',
        estadoCritico: 'QUANTICO'
    });
    assert.equal(ctx.getTicketPluzStatus('9001002'), 'SIN REGISTRO');
});

test('syncRecordsPluzStatus updates tdOmsRecords and mapLocations optimistically', () => {
    const ctx = createCoreContext();
    const rec1 = { ticket: '11111', sed: '03033A', estado_pluz: 'SIN REGISTRO' };
    const rec2 = { ticket: '22222', sed: '04512B', estado_pluz: 'SIN REGISTRO' };
    ctx.tdOmsRecords.push(rec1, rec2);
    ctx.mapLocations.push(rec1);

    ctx.addSupervisorLogOptimistic({
        ticket: '11111',
        sed: '03033A',
        estadoOperativo: 'C. CAMPO'
    });

    assert.equal(rec1.estado_pluz, 'C. CAMPO');
    assert.equal(rec2.estado_pluz, 'SIN REGISTRO');
});

test('parseSedListInput and recordMatchesSedLayers filter tickets by named SED layers (e.g. DAN)', () => {
    const ctx = createCoreContext();

    const rawInput = `
        SED
        03033A
        SED 04512B-1, 08190C; 03033A
        00915D
    `;
    const parsed = Array.from(ctx.parseSedListInput(rawInput));
    assert.deepEqual(parsed, ['03033A', '04512B-1', '08190C', '00915D']);

    ctx.setSedLayersList([
        { name: 'dan', seds: parsed, updatedBy: 'PLUZ' },
        { name: 'sur', seds: ['07777X', '08888Y'], updatedBy: 'PLUZ' }
    ]);

    const layers = ctx.getSedLayersList();
    assert.equal(layers.length, 2);
    assert.equal(layers[0].name, 'DAN');

    const t1 = { ticket: '1', sed: '03033A' };
    const t2 = { ticket: '2', sed: 'SED 04512B-2' }; // shares base SED 04512B
    const t3 = { ticket: '3', sed: '915D' };         // matches 00915D without leading zeros
    const t4 = { ticket: '4', sed: '07777X' };       // in SUR layer
    const t5 = { ticket: '5', sed: '99999Z' };       // in no layer

    // When 0 layers are selected, all records match (no filter applied)
    assert.equal(ctx.recordMatchesSedLayers(t1, []), true);
    assert.equal(ctx.recordMatchesSedLayers(t5, []), true);

    // When DAN layer is selected, only t1, t2, t3 match
    assert.equal(ctx.recordMatchesSedLayers(t1, ['DAN']), true);
    assert.equal(ctx.recordMatchesSedLayers(t2, ['DAN']), true);
    assert.equal(ctx.recordMatchesSedLayers(t3, ['DAN']), true);
    assert.equal(ctx.recordMatchesSedLayers(t4, ['DAN']), false);
    assert.equal(ctx.recordMatchesSedLayers(t5, ['DAN']), false);

    // When both DAN and SUR layers are selected, t1..t4 match and t5 does not
    assert.equal(ctx.recordMatchesSedLayers(t4, ['DAN', 'SUR']), true);
    assert.equal(ctx.recordMatchesSedLayers(t5, ['DAN', 'SUR']), false);
});

test('/api/sed-layers endpoint validates admin access and normalizes layers', async () => {
    const handler = require('../api/sed-layers.js');
    const localBackupPath = path.join(__dirname, '..', 'data_sed_layers.json');
    const hadLocalBackup = fs.existsSync(localBackupPath);
    const prevLocalContent = hadLocalBackup ? fs.readFileSync(localBackupPath, 'utf8') : null;

    const createMockRes = (onResult) => ({
        setHeader() {},
        status(code) { this.statusCode = code; return this; },
        json(obj) { onResult(this.statusCode || 200, obj); return this; },
        send(str) { onResult(this.statusCode || 200, typeof str === 'string' ? JSON.parse(str) : str); return this; },
        end() {}
    });

    try {
        // Non-admin should be rejected with 403
        let statusCode = 200;
        let bodyObj = null;
        await handler(
            { method: 'GET', headers: {}, query: { role: 'contractor' } },
            createMockRes((code, obj) => { statusCode = code; bodyObj = obj; })
        );
        assert.equal(statusCode, 403);
        assert.equal(bodyObj.success, false);

        // Admin POST should normalize and save layers locally when webhook is not configured
        statusCode = 200;
        bodyObj = null;
        await handler(
            {
                method: 'POST',
                headers: { 'x-user-role': 'admin' },
                body: {
                    role: 'admin',
                    layers: [
                        { name: 'dan', seds: '03033A, 04512B\n08190C' }
                    ]
                }
            },
            createMockRes((code, obj) => { statusCode = code; bodyObj = obj; })
        );
        assert.equal(statusCode, 200);
        assert.equal(bodyObj.success, true);
        assert.equal(bodyObj.layers.length, 1);
        assert.equal(bodyObj.layers[0].name, 'DAN');
        assert.deepEqual(bodyObj.layers[0].seds, ['03033A', '04512B', '08190C']);
    } finally {
        if (hadLocalBackup) {
            fs.writeFileSync(localBackupPath, prevLocalContent, 'utf8');
        } else if (fs.existsSync(localBackupPath)) {
            fs.unlinkSync(localBackupPath);
        }
    }
});
