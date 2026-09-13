const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element() {
  return {
    dataset: {},
    disabled: false,
    hidden: false,
    innerText: '',
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); }
  };
}

function loadCore() {
  const status = element();
  const message = element();
  const retry = element();
  const toolbar = element();
  const controls = [element(), element(), element()];
  const kpis = [element(), element()];
  const ids = new Map([
    ['appDataStatus', status],
    ['appDataStatusMessage', message],
    ['btnRetryDataLoad', retry],
    ['mapSearchToolbar', toolbar]
  ]);
  const document = {
    addEventListener() {},
    getElementById(id) { return ids.get(id) || null; },
    querySelectorAll(selector) {
      if (selector === '[data-requires-primary-data]') return controls;
      if (selector === '[data-loading-kpi]') return kpis;
      return [];
    }
  };
  const context = { console, Date, Map, Set, setTimeout, clearTimeout, document };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', '00-core.js'), 'utf8'), context);
  return { context, status, message, retry, toolbar, controls, kpis };
}

test('loading comunica actividad, evita ceros provisionales y bloquea controles dependientes', () => {
  const app = loadCore();

  app.context.setAppDataLoadState('loading');

  assert.equal(app.status.dataset.state, 'loading');
  assert.equal(app.status.attributes['aria-busy'], 'true');
  assert.equal(app.message.innerText, 'Cargando datos…');
  assert.equal(app.retry.hidden, true);
  assert.equal(app.toolbar.attributes['aria-busy'], 'true');
  assert.deepEqual(Array.from(app.controls, control => control.disabled), [true, true, true]);
  assert.deepEqual(Array.from(app.kpis, kpi => kpi.innerText), ['—', '—']);
});

test('ready retira el estado de carga y habilita la operación', () => {
  const app = loadCore();
  app.context.setAppDataLoadState('loading');

  app.context.setAppDataLoadState('ready');

  assert.equal(app.status.dataset.state, 'ready');
  assert.equal(app.status.attributes['aria-busy'], 'false');
  assert.equal(app.message.innerText, 'Datos cargados');
  assert.equal(app.toolbar.attributes['aria-busy'], 'false');
  assert.deepEqual(Array.from(app.controls, control => control.disabled), [false, false, false]);
});

test('error ofrece reintento y mantiene bloqueadas las acciones sin datos', () => {
  const app = loadCore();

  app.context.setAppDataLoadState('error', 'No pudimos cargar los datos.');

  assert.equal(app.status.dataset.state, 'error');
  assert.equal(app.message.innerText, 'No pudimos cargar los datos.');
  assert.equal(app.retry.hidden, false);
  assert.deepEqual(Array.from(app.controls, control => control.disabled), [true, true, true]);
});
