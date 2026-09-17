const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const map = fs.readFileSync(path.join(root, 'assets', 'js', '10-map.js'), 'utf8');
const mapCss = fs.readFileSync(path.join(root, 'assets', 'css', '10-map.css'), 'utf8');
const modernCss = fs.readFileSync(path.join(root, 'assets', 'css', '90-modern.css'), 'utf8');

test('la búsqueda por dirección usa un único modo', () => {
  assert.doesNotMatch(html, /id="addressSearchMode"/);
  assert.doesNotMatch(html, /id="addressRadiusMap"/);
  assert.doesNotMatch(map, /mode === 'street'/);
});

test('los tickets cercanos no se convierten en un filtro que oculte puntos lejanos', () => {
  assert.doesNotMatch(map, /searchType === 'address' && addressSearchTicketKeys instanceof Set/);
  assert.match(map, /new Set\(\[\.\.\.exactKeys, \.\.\.nearbyKeys\]\)/);
});

test('el resultado de dirección se posiciona debajo de la barra real y sobre el mapa', () => {
  assert.match(mapCss, /top:\s*var\(--address-result-top(?:,\s*\d+px)?\)/);
  assert.match(mapCss, /z-index:\s*3200/);
  assert.match(map, /--address-result-top/);
});

test('el resultado por dirección se puede contraer y la búsqueda tiene acción táctil', () => {
  assert.match(html, /id="btnAddressSearch"/);
  assert.match(map, /btnAddressSearchEl\.addEventListener\('click', buscarDireccionEnMapa\)/);
  assert.match(map, /wireAddressResultToggle/);
  assert.match(mapCss, /\.address-result-box\.is-collapsed/);
});

test('la búsqueda por dirección usa siempre un radio de 500 metros', () => {
  assert.doesNotMatch(html, /id="addressRadiusMap"/);
  assert.match(map, /const ADDRESS_SEARCH_RADIUS_METERS = 500/);
  assert.doesNotMatch(map, /addressRadiusMap/);
});

test('el panel contraído se reduce a un control compacto y los iconos móviles quedan centrados', () => {
  assert.match(mapCss, /\.address-result-box\.is-collapsed\s*\{[^}]*width:\s*fit-content/);
  assert.match(mapCss, /\.address-result-box\.is-collapsed \.address-result-heading > div\s*\{\s*display:\s*none/);
  assert.match(modernCss, /#btnOpenConfig, #btnLogout\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*padding:\s*0 !important[^}]*font-size:\s*20px !important[^}]*line-height:\s*44px !important/);
});
