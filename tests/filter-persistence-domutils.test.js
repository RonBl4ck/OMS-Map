const test = require('node:test');
const assert = require('node:assert/strict');

function createMockElement(tagName) {
    const listeners = {};
    const attributes = {};
    const classes = new Set();
    const el = {
        tagName: String(tagName).toUpperCase(),
        id: '',
        className: '',
        type: '',
        value: '',
        checked: false,
        innerHTML: '',
        innerText: '',
        style: {},
        children: [],
        attributes,
        listeners,
        classList: {
            add: (...cls) => cls.forEach(c => classes.add(c)),
            remove: (...cls) => cls.forEach(c => classes.delete(c)),
            toggle: (c) => {
                if (classes.has(c)) {
                    classes.delete(c);
                    return false;
                }
                classes.add(c);
                return true;
            },
            contains: (c) => classes.has(c)
        },
        setAttribute: (name, value) => {
            attributes[name] = String(value);
        },
        getAttribute: (name) => attributes[name],
        appendChild: (child) => {
            el.children.push(child);
            return child;
        },
        addEventListener: (event, handler) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
        },
        dispatchEvent: (event) => {
            const handlers = listeners[event.type] || [];
            handlers.forEach(fn => fn(event));
        },
        focus: () => {}
    };
    return el;
}

function setupMockDocument(containerIds = ['testMultiSelect']) {
    const containers = {};
    containerIds.forEach(id => {
        const el = createMockElement('div');
        el.id = id;
        containers[id] = el;
    });

    global.document = {
        getElementById: (id) => containers[id] || null,
        createElement: (tag) => createMockElement(tag),
        createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
        querySelectorAll: () => []
    };

    return containers;
}

test('DomUtils.initMultiSelect: setOptions conserva intendedSelectedVals cuando isAllSelectedState === false', () => {
    setupMockDocument(['filterTipo']);
    const domUtils = require('../assets/js/utils/domUtils.js');

    const ctrl = domUtils.initMultiSelect(
        'filterTipo',
        'Tipo',
        ['CABLE', 'FUSIBLE', 'POSTE'],
        () => {}
    );

    ctrl.setSelected(['FUSIBLE'], false);
    assert.deepEqual(ctrl.getSelected(), ['FUSIBLE']);
    assert.equal(ctrl.isAllSelected(), false);

    // Al cambiar opciones a un subconjunto sin FUSIBLE, getSelected queda vacío
    ctrl.setOptions(['CABLE', 'POSTE']);
    assert.deepEqual(ctrl.getSelected(), []);
    assert.equal(ctrl.isAllSelected(), false);

    // Al volver a incluir FUSIBLE en las opciones disponibles, se restaura automáticamente
    ctrl.setOptions(['CABLE', 'FUSIBLE', 'POSTE']);
    assert.deepEqual(ctrl.getSelected(), ['FUSIBLE']);
});

test('DomUtils.initMultiSelect: setOptions selecciona todas las opciones nuevas cuando isAllSelectedState === true', () => {
    setupMockDocument(['filterTipoAll']);
    const domUtils = require('../assets/js/utils/domUtils.js');

    const ctrl = domUtils.initMultiSelect(
        'filterTipoAll',
        'Tipo',
        ['CABLE', 'POSTE'],
        () => {}
    );

    assert.equal(ctrl.isAllSelected(), true);
    assert.deepEqual(ctrl.getSelected(), ['CABLE', 'POSTE']);

    ctrl.setOptions(['CABLE', 'FUSIBLE', 'POSTE']);
    assert.equal(ctrl.isAllSelected(), true);
    assert.deepEqual(ctrl.getSelected(), ['CABLE', 'FUSIBLE', 'POSTE']);
});

test('DomUtils.initMultiSelect: setSelected([], false) pone isAllSelected en false y limpia intendedSelectedVals', () => {
    setupMockDocument(['filterTipoEmpty']);
    const domUtils = require('../assets/js/utils/domUtils.js');

    const ctrl = domUtils.initMultiSelect(
        'filterTipoEmpty',
        'Tipo',
        ['CABLE', 'FUSIBLE', 'POSTE'],
        () => {}
    );

    ctrl.setSelected([], false);
    assert.equal(ctrl.isAllSelected(), false);
    assert.deepEqual(ctrl.getSelected(), []);

    // setOptions posterior debe mantener []
    ctrl.setOptions(['CABLE', 'FUSIBLE', 'POSTE', 'TRAFO']);
    assert.equal(ctrl.isAllSelected(), false);
    assert.deepEqual(ctrl.getSelected(), []);
});
