const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets', 'js', '30-llamadas.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function loadCallsScript() {
  const context = { console };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test('resume llamadas por incidencias y contactos reiterados', () => {
  const { summarizeCallRecords } = loadCallsScript();
  const summary = summarizeCallRecords([
    { ticket: 'T1', suministro: 'S1' },
    { ticket: 'T1', suministro: 'S1' },
    { ticket: 'T2', suministro: 'S2' },
    { ticket: 'T3', suministro: 'S3' },
    { ticket: 'T3', suministro: 'S3' },
    { ticket: 'T3', suministro: 'S3' },
    { ticket: 'T3', suministro: 'S3' },
    { ticket: 'T3', suministro: 'S3' },
    { ticket: 'T3', suministro: 'S3' },
    { ticket: 'T3', suministro: 'S3' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
    totalCalls: 10,
    incidents: 3,
    repeated: 2,
    critical: 1
  });
});

test('agrupa la presión visual por ODM y usa ticket solo cuando falta', () => {
  const { getCallCounts, getCallGroupKey } = loadCallsScript();
  const rows = [
    { odm: '6001', ticket: 'T1' },
    { odm: '6001', ticket: 'T2' },
    { odm: '', ticket: 'T3' }
  ];
  assert.equal(getCallGroupKey(rows[0]), 'ODM:6001');
  assert.equal(getCallGroupKey(rows[2]), 'TICKET:T3');
  assert.deepEqual(JSON.parse(JSON.stringify(getCallCounts(rows))), { 'ODM:6001': 2, 'TICKET:T3': 1 });
});

test('seguimiento y llamadas usan el multiselect común', () => {
  for (const id of ['callsRepeatFilter', 'callsStatusFilter', 'techDate', 'techCompany', 'techName', 'techSkill', 'techZone', 'techState']) {
    assert.match(html, new RegExp(`<div id=["']${id}["']`));
  }
  assert.match(source, /initMultiSelect\("callsRepeatFilter"/);
});

test('clasifica la presión de llamadas por ticket', () => {
  const { callPressure } = loadCallsScript();
  assert.equal(callPressure(1).key, 'normal');
  assert.equal(callPressure(2).key, 'repeated');
  assert.equal(callPressure(7).key, 'critical');
});

test('la vista de llamadas incluye resumen, filtros y detalle accesible', () => {
  for (const id of ['callsKpiTotal', 'callsKpiIncidents', 'callsKpiRepeated', 'callsKpiCritical', 'callsRepeatFilter', 'callsStatusFilter', 'callsLoadMore', 'callDetailOverlay']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /role=["']dialog["'][^>]*aria-modal=["']true["']/);
});

test('comunica los estados de carga y error sin bloquear la interfaz', () => {
  assert.match(source, /aria-busy/);
  assert.match(source, /calls-loading-row/);
  assert.match(source, /calls-error-row/);
});
