const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', '20-dashboard.js'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const modernCss = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'css', '90-modern.css'), 'utf8');

test('cada gráfico comunica su alcance y total de registros', () => {
  assert.match(source, /chart-card__header/);
  assert.doesNotMatch(source, /chart-card__total/);
  assert.match(source, /aria-label="Gráfico:/);
});

test('las filas de indicadores incluyen etiquetas para su lectura móvil', () => {
  for (const label of ['Ticket', 'Estado', 'Empresa', 'Falla', 'Intervalo', 'Día', 'SED', 'Alimentador', 'Afectación', 'Llamadas', 'ODM', 'Hora de inicio']) {
    assert.match(source, new RegExp(`data-label="${label}`));
  }
});

test('indicadores conserva una tabla compacta y desplazable en celular', () => {
  assert.match(html, /class="dashboard-table-scroll"[^>]*tabindex="0"[^>]*role="region"/);
  assert.match(html, /class="dashboard-table-hint"/);
  assert.match(modernCss, /#tdOmsTable\s*\{[^}]*min-width:\s*980px/s);
  assert.match(modernCss, /#tdOmsTable th:first-child,[^}]*#tdOmsTable td:first-child\s*\{[^}]*position:\s*sticky/s);
  assert.doesNotMatch(modernCss, /#tdOmsTable,\s*#tdOmsTable tbody,\s*#tdOmsTable tr,\s*#tdOmsTable td\s*\{\s*display:\s*block/);
});
