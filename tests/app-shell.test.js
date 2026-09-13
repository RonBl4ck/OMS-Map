const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('la navegación principal mantiene las vistas en una sola estructura', () => {
  for (const id of ['tabMapa', 'tabTdOms', 'tabTecnicos', 'tabLlamadas']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.doesNotMatch(html, /Volver al Mapa/i);
});

test('la interfaz usa plazo como término visible', () => {
  const visibleText = html.replace(/<!--[^]*?-->/g, '').replace(/<script[^]*?<\/script>/gi, '');
  const mapSource = fs.readFileSync(path.join(root, 'assets', 'js', '10-map.js'), 'utf8');
  assert.doesNotMatch(visibleText, />[^<]*SLA[^<]*</i);
  assert.doesNotMatch(mapSource, /title=[^\n]*SLA:/i);
  assert.match(visibleText, /plazo/i);
});

test('seguimiento conserva primer y último cierre como columnas separadas', () => {
  assert.match(html, /data-tech-sort=["']primer["'][^>]*>Primer cierre/i);
  assert.match(html, /data-tech-sort=["']ultimo["'][^>]*>Último cierre/i);
  assert.match(html, /id=["']techDetailKpiFirst["']/);
  assert.match(html, /id=["']techDetailKpiLast["']/);
});

test('indicadores presenta los cuatro estados operativos de plazo', () => {
  for (const id of ['kpiTotalInc', 'kpiWithinDeadline', 'kpiDeadlineWarning', 'kpiDeadlineOverdue']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});
