const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf8');
const map = fs.readFileSync(path.join(root, 'assets', 'js', '10-map.js'), 'utf8');

test('el mapa carga el complemento de agrupamiento antes de su módulo', () => {
  assert.match(html, /leaflet\.markercluster[^]*10-map\.js/i);
});

test('todos los clusters se desactivan desde un único nivel de zoom', () => {
  assert.match(core, /MAP_CLUSTER_MAX_ZOOM\s*=\s*12/);
  assert.match(map, /L\.markerClusterGroup\s*\(/);
  assert.match(map, /disableClusteringAtZoom:\s*MAP_CLUSTER_MAX_ZOOM/);
});
