const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadScript(name) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', name), 'utf8');
  const element = { addEventListener() {}, style: {}, classList: { add() {}, remove() {} } };
  const context = { console, document: { getElementById() { return element; }, querySelectorAll() { return []; } }, sessionStorage: { getItem() { return '*'; } } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test('resume los casos por estado del plazo sin solaparlos', () => {
  const context = loadScript('20-dashboard.js');
  const summary = context.summarizeDeadlineStatus([
    { sla: { pct: 20 } }, { sla: { pct: 74 } },
    { sla: { pct: 75 } }, { sla: { pct: 99 } },
    { sla: { pct: 100 } }, { sla: { pct: 140 } }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), { total: 6, within: 2, warning: 2, overdue: 2 });
});

test('clasifica la actividad técnica en tres estados operativos', () => {
  const context = loadScript('40-tecnicos.js');
  assert.equal(context.techActivityStatus(30 * 60).key, 'recent');
  assert.equal(context.techActivityStatus(3 * 3600).key, 'attention');
  assert.equal(context.techActivityStatus(5 * 3600).key, 'alert');
});
