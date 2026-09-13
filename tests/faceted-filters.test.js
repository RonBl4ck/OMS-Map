const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadCore() {
  const context = {
    console, Date, Map, Set, setTimeout, clearTimeout,
    document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/00-core.js'), 'utf8'), context);
  return context;
}

test('calcula opciones de un filtro usando las selecciones de los demás', () => {
  const { getFacetedFilterValues } = loadCore();
  const records = [
    { empresa: 'COBRA', falla: 'FUSIBLE' },
    { empresa: 'COBRA', falla: 'SUMINISTRO' },
    { empresa: 'LARI', falla: 'RED AEREA' }
  ];
  const fields = { empresa: 'company', falla: 'fault' };
  const values = getFacetedFilterValues(records, 'falla', fields, { company: ['COBRA'], fault: [] }, 'fault');
  assert.deepEqual(Array.from(values), ['FUSIBLE', 'SUMINISTRO']);
});

test('la búsqueda local del mapa no conserva un botón Buscar redundante', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const mapSource = fs.readFileSync(path.join(root, 'assets/js/10-map.js'), 'utf8');
  assert.doesNotMatch(html, /id="btnBuscar"/);
  assert.match(mapSource, /debounceUi\(filterMapMarkers/);
});

test('seguimiento ofrece jerarquía automática y acceso directo por técnicos', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'assets/js/40-tecnicos.js'), 'utf8');
  assert.match(html, /id="btnTechChartMode"/);
  assert.match(source, /techChartMode/);
  assert.match(source, /field:'Empresa'/);
  assert.match(source, /field:'Skill'/);
  assert.match(source, /field:'Tecnico visible'/);
});
