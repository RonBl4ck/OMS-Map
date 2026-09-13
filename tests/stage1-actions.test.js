const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadCore() {
  const source = fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf8');
  const context = {
    console,
    Date,
    Map,
    Set,
    setTimeout,
    clearTimeout,
    document: { addEventListener() {}, getElementById() { return null; } }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test('la descarga de un contratista conserva solo los registros de su empresa', () => {
  const context = loadCore();
  const records = [
    { Empresa: 'LARI' },
    { Contratista: 'DOMINION' },
    { CONTRATISTA: 'lari' }
  ];

  const result = context.filterRecordsForAssignedContractor(records, 'LARI');

  assert.equal(result.length, 2);
  assert.deepEqual(Array.from(result, row => row.Empresa || row.Contratista || row.CONTRATISTA), ['LARI', 'lari']);
});

test('PLUZ conserva el conjunto completo al descargar', () => {
  const context = loadCore();
  const records = [{ Empresa: 'LARI' }, { Empresa: 'COBRA' }];

  assert.equal(context.filterRecordsForAssignedContractor(records, '*').length, 2);
});

test('la selección múltiple acepta varias opciones y vacío equivale a Todos', () => {
  const { matchesMultiSelection } = loadCore();
  assert.equal(matchesMultiSelection('COBRA', ['COBRA', 'LARI']), true);
  assert.equal(matchesMultiSelection('PA', ['COBRA', 'LARI']), false);
  assert.equal(matchesMultiSelection('PA', []), true);
});

test('el shell ofrece un menú Acciones móvil con ambas descargas', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(html, /id=["']btnMobileActions["']/);
  assert.match(html, /aria-controls=["']mobileActionsMenu["']/);
  assert.match(html, /id=["']btn-mobile-download-base["']/);
  assert.match(html, /id=["']btn-mobile-download-ejecutados["']/);
});
