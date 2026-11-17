const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function createMockControl(initialValues, opts = {}) {
    const {
        hasSetOptions = true,
        hasSetBaseOptions = true,
        selected = initialValues,
        allSelected = true
    } = opts;

    let currentSelected = [...selected];
    let currentAllSelected = allSelected;
    const calls = {
        setBaseOptions: [],
        setOptions: [],
        setSelected: []
    };

    const ctrl = {
        _calls: calls,
        getSelected() {
            return [...currentSelected];
        },
        isAllSelected() {
            return currentAllSelected;
        },
        setSelected(vals, trigger) {
            calls.setSelected.push({ vals: [...vals], trigger });
            currentSelected = [...vals];
            currentAllSelected = false;
        }
    };

    if (hasSetOptions) {
        ctrl.setOptions = (nextValues) => {
            calls.setOptions.push([...nextValues]);
        };
    }
    if (hasSetBaseOptions) {
        ctrl.setBaseOptions = (baseValues) => {
            calls.setBaseOptions.push([...baseValues]);
        };
    }

    return ctrl;
}

function createMapContext(overrides = {}) {
    const initMultiSelectCalls = [];
    const initSedLayerCalls = [];

    const context = {
        console,
        Date,
        Map,
        Set,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Error,
        Math,
        JSON,
        parseInt,
        parseFloat,
        isNaN,
        setTimeout,
        clearTimeout,
        require,
        addEventListener() {},
        removeEventListener() {},
        sessionStorage: {
            getItem() { return null; },
            setItem() {},
            removeItem() {}
        },
        document: {
            body: { dataset: {} },
            getElementById() { return null; },
            querySelectorAll() { return []; },
            addEventListener() {}
        },
        filterRecordsForAssignedContractor(data) { return data; },
        getProp(item, ...keys) {
            for (const k of keys) {
                if (item && item[k] !== undefined && item[k] !== null && item[k] !== '') {
                    return String(item[k]);
                }
            }
            return 'N/A';
        },
        getEmoji() { return '⚡'; },
        isSedCritica() { return false; },
        calculateTicketSla() { return { statusClass: 'sla-ok', label: 'En plazo', elapsed: '1.0', maxHours: '4.0' }; },
        getTicketPluzStatus(ticket) { return ticket === 'T-1' ? 'EN EJECUCION' : 'SIN REGISTRO'; },
        applyMapFilters() {},
        applyDashboardFilters() {},
        filterMapMarkers() {},
        refreshDashboard() {},
        updateAddressSearchUi() {},
        initMultiSelect(containerId, titlePrefix, valuesList) {
            initMultiSelectCalls.push({ containerId, titlePrefix, valuesList: [...valuesList] });
            return createMockControl(valuesList, { hasSetOptions: true, hasSetBaseOptions: true });
        },
        initSedLayerMultiSelect(containerId, titlePrefix) {
            initSedLayerCalls.push({ containerId, titlePrefix });
            return createMockControl(['DAN', 'SUR'], { hasSetOptions: false, hasSetBaseOptions: false });
        },
        MarkersManager: {
            setupMapMarkers() {},
            filterMapMarkers() {}
        },
        omsStore: {
            setState() {}
        },
        rawData: [],
        mapLocations: [],
        tdOmsRecords: [],
        mapCtrlDia: null,
        mapCtrlEstado: null,
        mapCtrlEmpresa: null,
        mapCtrlFalla: null,
        mapCtrlEstadoPluz: null,
        mapCtrlCapaSed: null,
        tdCtrlDia: null,
        tdCtrlIntervalo: null,
        tdCtrlEmpresa: null,
        tdCtrlFalla: null,
        tdCtrlEstado: null,
        tdCtrlEstadoPluz: null,
        tdCtrlCapaSed: null,
        ...overrides
    };

    context.globalThis = context;
    context.window = context;

    const mapCode = fs.readFileSync(path.join(rootDir, 'assets', 'js', '10-map.js'), 'utf8');
    vm.createContext(context);
    vm.runInContext(mapCode, context);

    return { context, initMultiSelectCalls, initSedLayerCalls };
}

const sampleDataset = [
    {
        Ticket: 'T-1',
        Coordenadas: '-12.05,-77.04',
        Estados: 'PENDIENTE',
        Empresa: 'COBRA',
        Falla: 'FUSIBLE',
        'día': '17/11',
        Intervalo: '08:00-12:00',
        SED: '03033A'
    },
    {
        Ticket: 'T-2',
        Coordenadas: '-12.06,-77.05',
        Estados: 'EJECUCION',
        Empresa: 'LARI',
        Falla: 'CABLE',
        'día': '18/11',
        Intervalo: '12:00-16:00',
        SED: '04512B'
    }
];

test('processRawData reutiliza los 11 controles multiselect con setBaseOptions y setOptions sin recrearlos', () => {
    const { context, initMultiSelectCalls } = createMapContext();

    // Primera carga: inicializa controles
    context.processRawData(sampleDataset);
    assert.equal(initMultiSelectCalls.length, 11, 'La primera carga debe inicializar los 11 controles');

    const mapControlNames = [
        'mapCtrlDia', 'mapCtrlEstado', 'mapCtrlEmpresa', 'mapCtrlFalla', 'mapCtrlEstadoPluz'
    ];
    const tdControlNames = [
        'tdCtrlDia', 'tdCtrlIntervalo', 'tdCtrlEmpresa', 'tdCtrlFalla', 'tdCtrlEstado', 'tdCtrlEstadoPluz'
    ];
    const allControlNames = [...mapControlNames, ...tdControlNames];

    const initialRefs = Object.fromEntries(allControlNames.map(name => [name, context[name]]));

    // Simular segunda carga (live refresh)
    initMultiSelectCalls.length = 0;
    context.processRawData(sampleDataset);

    assert.equal(initMultiSelectCalls.length, 0, 'No debe volver a llamar initMultiSelect cuando los controles soportan setOptions');

    for (const name of allControlNames) {
        const ctrl = context[name];
        assert.equal(ctrl, initialRefs[name], `${name} debe conservar la misma instancia de control`);
        assert.equal(ctrl._calls.setBaseOptions.length, 1, `${name} debe actualizar opciones base con setBaseOptions`);
        assert.equal(ctrl._calls.setOptions.length, 1, `${name} debe actualizar opciones con setOptions`);
    }
});

test('syncMultiSelectControl conserva selección parcial si un control existente no implementa setOptions', () => {
    const legacyCtrl = createMockControl(['COBRA', 'LARI'], {
        hasSetOptions: false,
        hasSetBaseOptions: false,
        selected: ['COBRA'],
        allSelected: false
    });
    let firstEmpresaInit = true;
    const initMultiSelectCalls = [];

    const { context } = createMapContext({
        initMultiSelect(containerId, titlePrefix, valuesList) {
            initMultiSelectCalls.push({ containerId, titlePrefix, valuesList: [...valuesList] });
            if (containerId === 'mapMultiEmpresa' && firstEmpresaInit) {
                firstEmpresaInit = false;
                return legacyCtrl;
            }
            return createMockControl(valuesList, { hasSetOptions: true, hasSetBaseOptions: true });
        }
    });

    // Primera carga: mapCtrlEmpresa queda inicializado como legacyCtrl
    context.processRawData(sampleDataset);
    assert.equal(context.mapCtrlEmpresa, legacyCtrl);

    // Segunda carga: debe recrear el control y restaurar la selección previa
    initMultiSelectCalls.length = 0;
    context.processRawData(sampleDataset);

    assert.ok(initMultiSelectCalls.some(c => c.containerId === 'mapMultiEmpresa'), 'Debe recrear el control legacy con initMultiSelect');
    assert.notEqual(context.mapCtrlEmpresa, legacyCtrl);
    assert.deepEqual(context.mapCtrlEmpresa._calls.setSelected, [
        { vals: ['COBRA'], trigger: false }
    ], 'Debe restaurar la selección previa cuando !wasAll');
});

test('mapCtrlCapaSed y tdCtrlCapaSed conservan selección vacía (0 seleccionados) cuando !isAllSelected()', () => {
    const firstMapCapa = createMockControl(['DAN', 'SUR'], {
        hasSetOptions: false,
        hasSetBaseOptions: false,
        selected: [],
        allSelected: false
    });
    const firstTdCapa = createMockControl(['DAN', 'SUR'], {
        hasSetOptions: false,
        hasSetBaseOptions: false,
        selected: [],
        allSelected: false
    });
    let callCount = 0;

    const { context } = createMapContext({
        initSedLayerMultiSelect() {
            callCount++;
            if (callCount === 1) return firstMapCapa;
            if (callCount === 2) return firstTdCapa;
            return createMockControl(['DAN', 'SUR'], { hasSetOptions: false, hasSetBaseOptions: false });
        }
    });

    // Primera carga: simula usuario que dejó 0 capas seleccionadas (!isAllSelected())
    context.processRawData(sampleDataset);
    // Segunda carga (refresh): debe conservar [] vía setSelected([], false)
    context.processRawData(sampleDataset);

    assert.deepEqual(context.mapCtrlCapaSed._calls.setSelected, [
        { vals: [], trigger: false }
    ], 'mapCtrlCapaSed debe conservar 0 seleccionados cuando !isAllSelected()');
    assert.deepEqual(context.tdCtrlCapaSed._calls.setSelected, [
        { vals: [], trigger: false }
    ], 'tdCtrlCapaSed debe conservar 0 seleccionados cuando !isAllSelected()');
});

test('mapCtrlCapaSed y tdCtrlCapaSed no llaman setSelected si estaban en modo todas seleccionadas', () => {
    const firstMapCapa = createMockControl(['DAN', 'SUR'], {
        hasSetOptions: false,
        hasSetBaseOptions: false,
        selected: ['DAN', 'SUR'],
        allSelected: true
    });
    const firstTdCapa = createMockControl(['DAN', 'SUR'], {
        hasSetOptions: false,
        hasSetBaseOptions: false,
        selected: ['DAN', 'SUR'],
        allSelected: true
    });
    let callCount = 0;

    const { context } = createMapContext({
        initSedLayerMultiSelect() {
            callCount++;
            if (callCount === 1) return firstMapCapa;
            if (callCount === 2) return firstTdCapa;
            return createMockControl(['DAN', 'SUR'], { hasSetOptions: false, hasSetBaseOptions: false });
        }
    });

    context.processRawData(sampleDataset);
    context.processRawData(sampleDataset);

    assert.equal(context.mapCtrlCapaSed._calls.setSelected.length, 0);
    assert.equal(context.tdCtrlCapaSed._calls.setSelected.length, 0);
});

test('refreshLiveOmsData({ silent: true }) preserva oms_config_data_sed_layers mientras limpia CSVs', async () => {
    class MockSessionStorage {
        constructor() { this.store = new Map(); }
        getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
        setItem(k, v) { this.store.set(k, String(v)); }
        removeItem(k) { this.store.delete(k); }
        clear() { this.store.clear(); }
    }

    global.sessionStorage = new MockSessionStorage();
    global.loadData = async () => {};
    global.showAppNotification = () => {};

    const authPath = require.resolve(path.join(rootDir, 'assets', 'js', '60-auth.js'));
    delete require.cache[authPath];
    const authModule = require(authPath);

    global.sessionStorage.setItem('oms_seds_criticas_csv', 'csv1');
    global.sessionStorage.setItem('oms_supervisor_csv', 'csv2');
    global.sessionStorage.setItem('oms_config_data_sed_layers', '{"layers":[]}');

    await authModule.refreshLiveOmsData({ silent: true });

    assert.equal(global.sessionStorage.getItem('oms_seds_criticas_csv'), null, 'Debe limpiar oms_seds_criticas_csv');
    assert.equal(global.sessionStorage.getItem('oms_supervisor_csv'), null, 'Debe limpiar oms_supervisor_csv');
    assert.equal(global.sessionStorage.getItem('oms_config_data_sed_layers'), '{"layers":[]}', 'NO debe limpiar oms_config_data_sed_layers en modo silent');
});

test('refreshLiveOmsData() sin silent:true sí limpia oms_config_data_sed_layers además de los CSVs', async () => {
    class MockSessionStorage {
        constructor() { this.store = new Map(); }
        getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
        setItem(k, v) { this.store.set(k, String(v)); }
        removeItem(k) { this.store.delete(k); }
        clear() { this.store.clear(); }
    }

    global.sessionStorage = new MockSessionStorage();
    global.loadData = async () => {};
    global.showAppNotification = () => {};

    const authPath = require.resolve(path.join(rootDir, 'assets', 'js', '60-auth.js'));
    delete require.cache[authPath];
    const authModule = require(authPath);

    global.sessionStorage.setItem('oms_seds_criticas_csv', 'csv1');
    global.sessionStorage.setItem('oms_supervisor_csv', 'csv2');
    global.sessionStorage.setItem('oms_config_data_sed_layers', '{"layers":[]}');

    await authModule.refreshLiveOmsData();

    assert.equal(global.sessionStorage.getItem('oms_seds_criticas_csv'), null);
    assert.equal(global.sessionStorage.getItem('oms_supervisor_csv'), null);
    assert.equal(global.sessionStorage.getItem('oms_config_data_sed_layers'), null, 'Debe limpiar oms_config_data_sed_layers cuando no es silent');
});
