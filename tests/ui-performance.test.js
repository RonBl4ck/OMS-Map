const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('agrupa entradas rápidas y conserva el último valor', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', '00-core.js'), 'utf8');
  const context = { console, setTimeout, clearTimeout, document: { addEventListener() {}, getElementById() { return null; } } };
  vm.createContext(context);
  vm.runInContext(source, context);
  const received = [];
  const handler = context.debounceUi(value => received.push(value), 15);
  handler('a');
  handler('ab');
  handler('abc');
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.deepEqual(received, ['abc']);
});

test('las transiciones interactivas declaran propiedades específicas', () => {
  const root = path.resolve(__dirname, '..');
  const css = [
    fs.readFileSync(path.join(root, 'assets', 'css', '10-map.css'), 'utf8'),
    fs.readFileSync(path.join(root, 'assets', 'css', '40-technicians.css'), 'utf8')
  ].join('\n');
  assert.doesNotMatch(css, /transition:\s*all\b/i);
});
