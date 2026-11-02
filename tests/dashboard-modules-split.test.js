const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// Import modular services and components directly via CommonJS
const SupervisorService = require('../assets/js/services/supervisorService.js');
const ChartsManager = require('../assets/js/components/chartsManager.js');
const ModalsManager = require('../assets/js/components/modalsManager.js');
const DashboardManager = require('../assets/js/components/dashboardManager.js');

test('SupervisorService: parseDateTimeCandidate normaliza formatos de fecha y hora correctamente', () => {
    assert.equal(typeof SupervisorService.parseDateTimeCandidate, 'function');

    // Hora sola (HH:MM)
    const today = SupervisorService.getLimaTodayStr();
    assert.equal(SupervisorService.parseDateTimeCandidate('14:30'), `${today} 14:30`);
    assert.equal(SupervisorService.parseDateTimeCandidate('2:30 pm'), `${today} 14:30`);
    assert.equal(SupervisorService.parseDateTimeCandidate('12:15 am'), `${today} 00:15`);

    // Fecha completa DD/MM/YYYY
    assert.equal(SupervisorService.parseDateTimeCandidate('15/11/2026 18:45'), '2026-11-15 18:45');
    assert.equal(SupervisorService.parseDateTimeCandidate('05-08-2026 09:20'), '2026-08-05 09:20');

    // Formato YYYY-MM-DD
    assert.equal(SupervisorService.parseDateTimeCandidate('2026-12-01 10:00'), '2026-12-01 10:00');

    // Vacío / inválido
    assert.equal(SupervisorService.parseDateTimeCandidate(''), '');
    assert.equal(SupervisorService.parseDateTimeCandidate(null), '');
});

test('SupervisorService: parseBulkTicketsWithJc extrae tickets, JC y hora estimada', () => {
    assert.equal(typeof SupervisorService.parseBulkTicketsWithJc, 'function');

    const input = "2600100200\tCARLOS MENDOZA\t16:00\n2600100201\t17:30\n2600100202\tLUIS GOMEZ";
    const parsed = SupervisorService.parseBulkTicketsWithJc(input);

    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].ticket, '2600100200');
    assert.equal(parsed[0].jc, 'CARLOS MENDOZA');
    assert.match(parsed[0].finEstimado, /16:00$/);

    assert.equal(parsed[1].ticket, '2600100201');
    assert.equal(parsed[1].jc, '');
    assert.match(parsed[1].finEstimado, /17:30$/);

    assert.equal(parsed[2].ticket, '2600100202');
    assert.equal(parsed[2].jc, 'LUIS GOMEZ');
});

test('SupervisorService: clases de badges de estado y criticidad', () => {
    assert.equal(SupervisorService.getSupervisorBadgeClass('En Camino'), 'sup-status-en-camino');
    assert.equal(SupervisorService.getSupervisorBadgeClass('En Sitio'), 'sup-status-en-sitio');
    assert.equal(SupervisorService.getSupervisorBadgeClass('En Ejecución'), 'sup-status-en-ejecucion');
    assert.equal(SupervisorService.getSupervisorBadgeClass('Normalizado'), 'sup-status-normalizado');

    assert.equal(SupervisorService.getCriticoBadgeClass('Quántico'), 'sup-status-quantico');
    assert.equal(SupervisorService.getCriticoBadgeClass('Vencido'), 'sup-status-vencido');
    assert.equal(SupervisorService.getCriticoBadgeClass('Crítico'), 'sup-status-critico');
    assert.equal(SupervisorService.getCriticoBadgeClass('Normal'), 'sup-status-normal');
});

test('ChartsManager: summarizeDeadlineStatus categoriza plazos sin solapamiento', () => {
    assert.equal(typeof ChartsManager.summarizeDeadlineStatus, 'function');

    const records = [
        { sla: { pct: 10 } },
        { sla: { pct: 74 } },
        { sla: { pct: 75 } },
        { sla: { pct: 99 } },
        { sla: { pct: 100 } },
        { sla: { pct: 150 } }
    ];

    const summary = ChartsManager.summarizeDeadlineStatus(records);
    assert.deepEqual(summary, { total: 6, within: 2, warning: 2, overdue: 2 });
});

test('ChartsManager: renderModernCharts genera SVG accesible con O(n) y matrixCounts', () => {
    let htmlOutput = '';
    const dummyDiv = {
        set innerHTML(val) { htmlOutput = val; },
        get innerHTML() { return htmlOutput; }
    };
    const fakeDoc = {
        getElementById(id) {
            if (id === 'tdOmsCharts') return dummyDiv;
            return null;
        }
    };

    const originalDoc = global.document;
    global.document = fakeDoc;
    global.getOmsStatusColor = () => '#3B599F';
    global.sortIntervals = (a, b) => String(a).localeCompare(String(b));
    global.sortDias = (a, b) => String(a).localeCompare(String(b));

    const records = [
        { ticket: '1001', empresa: 'COBRA', falla: 'RED AEREA', intervalo: '0-2h', dia: '02-nov', estado: 'Pendiente' },
        { ticket: '1002', empresa: 'LARI', falla: 'FUSIBLE', intervalo: '2-4h', dia: '02-nov', estado: 'En Ejecución' }
    ];

    try {
        ChartsManager.renderModernCharts(records);
        assert.match(htmlOutput, /chart-card__header/);
        assert.match(htmlOutput, /chart-bar-interactive/);
        assert.match(htmlOutput, /aria-label="Gráfico:/);
        assert.match(htmlOutput, /data-field="empresa"/);
    } finally {
        global.document = originalDoc;
    }
});

test('ModalsManager: gestiona selección de chips de supervisión', () => {
    const chipBtns = [
        {
            val: 'EN EJECUCION',
            getAttribute(attr) { return this.val; },
            classList: {
                classes: new Set(),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                contains(c) { return this.classes.has(c); }
            }
        },
        {
            val: 'EN SITIO',
            getAttribute(attr) { return this.val; },
            classList: {
                classes: new Set(),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                contains(c) { return this.classes.has(c); }
            }
        }
    ];

    const fakeDoc = {
        querySelectorAll(selector) {
            if (selector.includes('supQuickOperativoChips')) return chipBtns;
            return [];
        }
    };

    const originalDoc = global.document;
    global.document = fakeDoc;
    try {
        ModalsManager.updateSupervisorOperativoChipSelection('EN EJECUCION');
        assert.equal(chipBtns[0].classList.contains('active'), true);
        assert.equal(chipBtns[1].classList.contains('active'), false);

        ModalsManager.updateSupervisorOperativoChipSelection('EN SITIO');
        assert.equal(chipBtns[0].classList.contains('active'), false);
        assert.equal(chipBtns[1].classList.contains('active'), true);
    } finally {
        global.document = originalDoc;
    }
});

test('DashboardManager: parseTdOmsDate y formatShortDate', () => {
    assert.equal(typeof DashboardManager.parseTdOmsDate, 'function');
    assert.equal(typeof DashboardManager.formatShortDate, 'function');

    const ts1 = DashboardManager.parseTdOmsDate('12/10/2026 15:30:00');
    assert.ok(typeof ts1 === 'number' && ts1 > 0);

    const ts2 = DashboardManager.parseTdOmsDate('2026-10-12 15:30:00');
    assert.equal(ts1, ts2);

    const formatted = DashboardManager.formatShortDate('12/10/2026 15:30:00');
    assert.equal(formatted, '12/10 15:30');
});

test('DashboardManager: renderTdOmsTable incluye data-labels requeridos para visualización móvil', () => {
    let tableHtml = '';
    const fakeTableBody = {
        set innerHTML(val) { tableHtml = val; },
        get innerHTML() { return tableHtml; }
    };

    const fakeDoc = {
        getElementById(id) {
            if (id === 'tdOmsTableBody') return fakeTableBody;
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };

    const records = [{
        ticket: '2600999',
        odm: 'ODM-888',
        hora_inicio: '12/10/2026 14:00',
        sed: 'SED-101',
        falla: 'RED AEREA',
        llamadas: 3,
        estado: 'Pendiente',
        empresa: 'COBRA',
        intervalo: '0-2h',
        alimentador: 'ALIM-1',
        afectacion: 'Total'
    }];

    const originalDoc = global.document;
    global.document = fakeDoc;
    try {
        DashboardManager.renderTdOmsTable(records);
        for (const label of ['Ticket', 'ODM', 'Estado', 'Empresa', 'Falla', 'Intervalo', 'Hora de inicio', 'SED', 'Alimentador', 'Afectación', 'Llamadas']) {
            assert.match(tableHtml, new RegExp(`data-label="${label}"`), `Debe incluir data-label="${label}"`);
        }
        assert.doesNotMatch(tableHtml, /data-label="Día"/);
        assert.doesNotMatch(tableHtml, /data-label="Latitud"/);
        assert.doesNotMatch(tableHtml, /data-label="Longitud"/);
    } finally {
        global.document = originalDoc;
    }
});

test('35-critical-panel.js: define ensureChartJsLoaded y delega helpers duplicados', () => {
    const code = fs.readFileSync(path.join(root, 'assets', 'js', '35-critical-panel.js'), 'utf8');
    assert.match(code, /function ensureChartJsLoaded/, 'Debe definir ensureChartJsLoaded');
    assert.match(code, /chart\.umd\.min\.js/, 'Debe referenciar chart.umd.min.js para carga diferida');
    assert.match(code, /window\.ensureChartJsLoaded\s*=\s*ensureChartJsLoaded/, 'Debe exponer ensureChartJsLoaded en window');
    assert.match(code, /checkExcludedFault/, 'Debe utilizar checkExcludedFault en lugar de función duplicada');
    assert.match(code, /normLlaveCode/, 'Debe utilizar normLlaveCode en lugar de función duplicada');
});

test('20-dashboard.js: integra los módulos e implementa fachada global', () => {
    const code = fs.readFileSync(path.join(root, 'assets', 'js', '20-dashboard.js'), 'utf8');

    // Carga de módulos
    assert.match(code, /services\/supervisorService\.js/);
    assert.match(code, /components\/chartsManager\.js/);
    assert.match(code, /components\/modalsManager\.js/);
    assert.match(code, /components\/dashboardManager\.js/);

    // Contratos de compatibilidad
    assert.match(code, /window\.SupervisorService/);
    assert.match(code, /window\.ChartsManager/);
    assert.match(code, /window\.ModalsManager/);
    assert.match(code, /window\.DashboardManager/);
    assert.match(code, /window\.openSupervisorModal/);
    assert.match(code, /window\.parseBulkTicketsWithJc/);
    assert.match(code, /window\.renderModernCharts/);
    assert.match(code, /window\.renderTdOmsTable/);
    assert.match(code, /window\.downloadExcel/);
});
