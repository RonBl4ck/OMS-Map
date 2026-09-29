const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadTechniciansScript() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '40-tecnicos.js'), 'utf8');
    const context = {
        console,
        document: { getElementById: () => null, querySelectorAll: () => [] },
        sessionStorage: { getItem: () => '*' },
        tecnicosRecords: [],
        escapeHtml: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]),
        setInterval: () => 0,
        clearInterval: () => {},
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return context;
}

test('busca globalmente un ticket u ODM dentro de Tickets_Detalle', () => {
    const context = loadTechniciansScript();
    const rows = [
        {
            'Tecnico visible': 'Jorge Q.',
            Empresa: 'CONTRATA NORTE',
            Tickets_Detalle: JSON.stringify([
                { ticket: '2600153821', odm: '600204061', nota: 'Suministro con toma normal.' },
            ]),
        },
        {
            'Tecnico visible': 'Luis R.',
            Empresa: 'CONTRATA SUR',
            Tickets_Detalle: JSON.stringify([
                { ticket: '2600159999', odm: '600209999', nota: 'Trabajo concluido.' },
            ]),
        },
    ];

    const byTicket = context.findTechTicketMatches(rows, '2600153821');
    assert.equal(byTicket.length, 1);
    assert.equal(byTicket[0].row['Tecnico visible'], 'Jorge Q.');
    assert.equal(byTicket[0].ticket.odm, '600204061');

    const byOdm = context.findTechTicketMatches(rows, '600209999');
    assert.equal(byOdm.length, 1);
    assert.equal(byOdm[0].row.Empresa, 'CONTRATA SUR');
    assert.equal(byOdm[0].ticket.ticket, '2600159999');
});

test('la coincidencia global ignora espacios y admite búsquedas parciales', () => {
    const context = loadTechniciansScript();
    const rows = [{
        'Tecnico visible': 'Ana P.',
        Empresa: 'CONTRATA CENTRO',
        Tickets_Detalle: [{ ticket: '2600 153 821', odm: '600-204-061', nota: '' }],
    }];

    assert.equal(context.findTechTicketMatches(rows, '153821').length, 1);
    assert.equal(context.findTechTicketMatches(rows, '204061').length, 1);
    assert.equal(context.findTechTicketMatches(rows, '999999').length, 0);
});

test('prepara la nota completa para el detalle mediante clic', () => {
    const context = loadTechniciansScript();
    assert.equal(
        context.techTicketNoteText({ nota: 'Se reparó falso contacto\nTensión 218 V' }),
        'Se reparó falso contacto\nTensión 218 V',
    );
    assert.equal(context.techTicketNoteText({ nota: '   ' }), 'Sin nota específica registrada.');
});

test('filtra automáticamente por el día actual al inicializar seguimiento técnico', () => {
    const coreSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '00-core.js'), 'utf8');
    const techSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '40-tecnicos.js'), 'utf8');

    const fakeDoc = {
        addEventListener() {},
        getElementById() {
            return {
                innerHTML: '',
                className: '',
                appendChild() {},
            };
        },
        querySelectorAll() { return []; },
        createElement(tag) {
            const el = {
                tagName: tag,
                children: [],
                style: {},
                setAttribute() {},
                appendChild(child) { el.children.push(child); return child; },
                addEventListener() {},
            };
            return el;
        },
        createTextNode(text) { return { text }; },
    };

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yesterdayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.max(1, now.getDate() - 1)).padStart(2, '0')}`;

    const context = {
        console, Date, Map, Set, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
        document: fakeDoc,
        sessionStorage: { getItem: () => '*' },
        escapeHtml: v => String(v ?? ''),
    };

    vm.createContext(context);
    vm.runInContext(coreSource, context);
    vm.runInContext(`tecnicosRecords = [
        { 'día': '${todayStr}', Empresa: 'COBRA', 'Tecnico visible': 'Juan P.', Skill: 'BT', 'Zona / SET': 'NORTE', 'Estado de orden': 'Cerrado', 'Cantidad de trabajos': 3 },
        { 'día': '${yesterdayStr}', Empresa: 'COBRA', 'Tecnico visible': 'Pedro G.', Skill: 'BT', 'Zona / SET': 'SUR', 'Estado de orden': 'Cerrado', 'Cantidad de trabajos': 5 }
    ];`, context);
    vm.runInContext(techSource, context);

    context.initializeTechFilters();

    const visibleRecords = context.getVisibleTechRecords();
    assert.equal(visibleRecords.length, 1);
    assert.equal(visibleRecords[0]['Tecnico visible'], 'Juan P.');
    assert.equal(visibleRecords[0]['día'], todayStr);
});

