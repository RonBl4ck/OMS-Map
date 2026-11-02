const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const storeModule = require('../assets/js/state/store.js');
const dateUtils = require('../assets/js/utils/dateUtils.js');
const geoUtils = require('../assets/js/utils/geoUtils.js');
const domUtils = require('../assets/js/utils/domUtils.js');
const sedGeometry = require('../assets/js/sed-geometry.js');

test('omsStore: gestiona estado reactivo, suscripciones y reset', () => {
    const { createStore } = storeModule;
    const store = createStore({ customKey: 'initial' });

    assert.equal(store.getState().customKey, 'initial');
    assert.deepEqual(store.getState().mapLocations, []);

    let notificationCount = 0;
    let latestState = null;
    let previousState = null;

    const unsubscribe = store.subscribe((next, prev) => {
        notificationCount++;
        latestState = next;
        previousState = prev;
    });

    store.setState({ mapLocations: [{ ticket: 'T-100', lat: -12.05, lon: -77.04 }] });
    assert.equal(notificationCount, 1);
    assert.equal(latestState.mapLocations.length, 1);
    assert.equal(latestState.mapLocations[0].ticket, 'T-100');
    assert.equal(previousState.mapLocations.length, 0);

    store.setState(prev => ({ tdOmsRecords: [{ ticket: 'TD-1' }] }));
    assert.equal(notificationCount, 2);
    assert.equal(store.getState().tdOmsRecords.length, 1);

    unsubscribe();
    store.setState({ customKey: 'afterUnsubscribe' });
    assert.equal(notificationCount, 2); // No debió incrementar

    store.reset();
    assert.deepEqual(store.getState().mapLocations, []);
    assert.deepEqual(store.getState().tdOmsRecords, []);
});

test('omsStore: sincronización bidireccional sobre globalThis/window', () => {
    const { createStore, attachGlobalBindings } = storeModule;
    const store = createStore();
    const fakeGlobal = {};
    attachGlobalBindings(store, fakeGlobal);

    // 1. Modificar desde el store debe reflejarse en fakeGlobal
    store.setState({ tdOmsRecords: [{ ticket: 'T-1' }, { ticket: 'T-2' }] });
    assert.equal(fakeGlobal.tdOmsRecords.length, 2);
    assert.equal(fakeGlobal.tdOmsRecords[0].ticket, 'T-1');

    // 2. Modificar desde fakeGlobal mediante asignación debe actualizar el store
    fakeGlobal.mapLocations = [{ ticket: 'LOC-1', sed: 'SED-01' }];
    assert.equal(store.getState().mapLocations.length, 1);
    assert.equal(store.getState().mapLocations[0].sed, 'SED-01');

    // 3. Mutación en Map
    fakeGlobal.supervisorRecordsMap.set('t-99', { state: 'ok' });
    assert.equal(store.getState().supervisorRecordsMap.get('t-99').state, 'ok');
});

test('dateUtils: parseDateFlexible soporta formatos DD/MM/YYYY, horas y formato ISO', () => {
    const dt1 = dateUtils.parseDateFlexible('15/10/2026 14:30:45');
    assert.ok(dt1 instanceof Date);
    assert.equal(dt1.getFullYear(), 2026);
    assert.equal(dt1.getMonth(), 9); // Octubre (0-index)
    assert.equal(dt1.getDate(), 15);
    assert.equal(dt1.getHours(), 14);
    assert.equal(dt1.getMinutes(), 30);
    assert.equal(dt1.getSeconds(), 45);

    const dtIso = dateUtils.parseDateFlexible('2026-11-02T10:00:00');
    assert.ok(dtIso instanceof Date);
    assert.equal(dtIso.getFullYear(), 2026);
    assert.equal(dtIso.getMonth(), 10);

    assert.equal(dateUtils.parseDateFlexible('N/A'), null);
    assert.equal(dateUtils.parseDateFlexible(null), null);
    assert.equal(dateUtils.parseDateFlexible('fecha-invalida'), null);
});

test('dateUtils: parseDiaValue y sortDias ordenan cronológicamente fechas en español', () => {
    assert.ok(dateUtils.parseDiaValue('30-oct') < dateUtils.parseDiaValue('01-nov'));
    assert.ok(dateUtils.parseDiaValue('31-oct') < dateUtils.parseDiaValue('01-nov'));
    assert.ok(dateUtils.parseDiaValue('01-nov') < dateUtils.parseDiaValue('02-nov'));

    const list = ['02-nov', '31-oct', '01-nov', '30-oct'];
    list.sort(dateUtils.sortDias);
    assert.deepEqual(list, ['30-oct', '31-oct', '01-nov', '02-nov']);

    const intervals = ['Intervalo 10-20', 'Intervalo 2-5', 'Intervalo 1-2'];
    intervals.sort(dateUtils.sortIntervals);
    assert.deepEqual(intervals, ['Intervalo 1-2', 'Intervalo 2-5', 'Intervalo 10-20']);
});

test('dateUtils: formatDurationHhMm y calculateTicketSla evalúan correctamente tiempos y SLA', () => {
    assert.equal(dateUtils.formatDurationHhMm(45, { inMinutes: true }), '45m');
    assert.equal(dateUtils.formatDurationHhMm(90, { inMinutes: true }), '1h 30m');
    assert.equal(dateUtils.formatDurationHhMm(2.5), '2h 30m');

    const mockRecord = {
        falla: 'RED AEREA',
        duracion: '3.0'
    };
    const slaResult = dateUtils.calculateTicketSla(mockRecord);
    assert.equal(slaResult.maxHours, 8);
    assert.equal(slaResult.status, 'ok');
    assert.equal(slaResult.statusClass, 'sla-ok');

    const overdueRecord = {
        falla: 'RED AEREA',
        duracion: '9.5'
    };
    const slaOverdue = dateUtils.calculateTicketSla(overdueRecord);
    assert.equal(slaOverdue.status, 'overdue');
    assert.equal(slaOverdue.statusClass, 'sla-overdue');
    assert.ok(slaOverdue.label.includes('Fuera de plazo'));
});

test('geoUtils: algoritmos geométricos puros convexHull, corridor, metrics y haversine', () => {
    const points = [
        [-12.0500, -77.0400],
        [-12.0510, -77.0410],
        [-12.0490, -77.0390],
        [-12.0500, -77.0370] // punto no colineal para formar polígono
    ];
    const hull = geoUtils.convexHull(points);
    assert.ok(hull.length >= 3);

    const dist = geoUtils.haversineDistance(-12.05, -77.04, -12.05, -77.05);
    assert.ok(dist > 1000 && dist < 1200, `Distancia esperada ~1088m, obtenida: ${dist}`);

    const metrics = geoUtils.computeMetrics(points);
    assert.equal(metrics.count, 4);
    assert.ok(Array.isArray(metrics.center));
    assert.ok(metrics.areaM2 > 0);

    const buffer = geoUtils.buildSedBufferPolygon(points, 50);
    assert.equal(buffer.kind, 'cloud');
    assert.ok(buffer.points.length >= 16);
});

test('geoUtils & sed-geometry: mantienen interoperabilidad total', () => {
    assert.equal(typeof sedGeometry.buildSedAreaShape, 'function');
    assert.equal(typeof sedGeometry.buildSedCloudShape, 'function');
    assert.equal(typeof sedGeometry.getSedCloudFocusStyle, 'function');
    assert.equal(typeof sedGeometry.shouldPersistSedCloudLabel, 'function');

    const shape = sedGeometry.buildSedAreaShape([[-12.05, -77.04]]);
    assert.equal(shape.kind, 'circle');
});

test('domUtils: escapeHtml, normalizeKey, getProp con caché, debounce y helpers de UI', async () => {
    assert.equal(domUtils.escapeHtml('<script>alert("xss")&\'</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&amp;&#039;&lt;/script&gt;');

    // getProp con variaciones y caché
    const record = { '  Alimentador ': 'ALIM-NORTE', 'Dirección': 'Av. Grau 456' };
    assert.equal(domUtils.getProp(record, 'Alimentador'), 'ALIM-NORTE');
    assert.equal(domUtils.getProp(record, 'direccion'), 'Av. Grau 456');
    assert.equal(domUtils.getProp(record, 'DIRECCION'), 'Av. Grau 456');
    assert.equal(domUtils.getProp(record, 'no_existe'), 'N/A');

    // Debounce
    let count = 0;
    const fn = domUtils.debounce(() => { count++; }, 20);
    fn();
    fn();
    fn();
    await new Promise(res => setTimeout(res, 50));
    assert.equal(count, 1);

    // Status classes y colores
    assert.equal(domUtils.getOmsStatusClass('Pendiente de atención'), 'pendiente');
    assert.equal(domUtils.getOmsStatusClass('En Ejecución'), 'ejecucion');
    assert.equal(domUtils.getOmsStatusClass('Ejecutado conforme'), 'ejecutado');
    assert.equal(domUtils.getOmsStatusColor('Pendiente'), '#FBC13F');

    // Faceted filtering
    const dataset = [
        { emp: 'LARI', zona: 'NORTE' },
        { emp: 'COBRA', zona: 'SUR' },
        { emp: 'COBRA', zona: 'NORTE' }
    ];
    const vals = domUtils.getFacetedFilterValues(dataset, 'emp', { zona: 'zonaCtrl' }, { zonaCtrl: ['NORTE'] }, 'empCtrl');
    assert.deepEqual(vals, ['COBRA', 'LARI']);
});

test('00-core.js: funciona en un contexto VM aislado integrando utilidades y estado', () => {
    const coreSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '00-core.js'), 'utf8');
    const ctx = {
        console,
        Date,
        Map,
        Set,
        setTimeout,
        clearTimeout,
        document: {
            addEventListener() {},
            getElementById() { return null; },
            querySelectorAll() { return []; }
        },
        sessionStorage: {
            getItem(key) {
                if (key === 'oms_user_role') return 'admin';
                return null;
            }
        }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(coreSource, ctx);

    assert.equal(typeof ctx.isExcludedFault, 'function');
    assert.equal(typeof ctx.normalizeLlaveCode, 'function');
    assert.equal(typeof ctx.recalculateTopCriticalSeds, 'function');
    assert.equal(typeof ctx.addSupervisorLogOptimistic, 'function');
    assert.equal(typeof ctx.getSupervisorLogsForSed, 'function');
    assert.equal(typeof ctx.isCurrentUserAdmin, 'function');
    assert.equal(ctx.isCurrentUserAdmin(), true);

    // Validar exclusión de fallas
    assert.equal(ctx.isExcludedFault('SUMINISTRO PARTICULAR'), true);
    assert.equal(ctx.isExcludedFault('RED AEREA'), false);

    // Validar agregado optimista de supervisión
    ctx.addSupervisorLogOptimistic({
        ticket: 'TEST-1234',
        sed: 'SED-888',
        estadoOperativo: 'En curso'
    });
    const supData = ctx.getSupervisorDataForTicket('TEST-1234');
    assert.ok(supData);
    assert.equal(supData.latest.ticket, 'TEST-1234');
    assert.equal(supData.latest.estadoOperativo, 'En curso');

    const sedLogs = ctx.getSupervisorLogsForSed('SED-888');
    assert.equal(sedLogs.length, 1);
    assert.equal(sedLogs[0].ticket, 'TEST-1234');
});
