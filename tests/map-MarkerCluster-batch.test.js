const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mapJs = fs.readFileSync(path.join(root, 'assets', 'js', '10-map.js'), 'utf8');
const navJs = fs.readFileSync(path.join(root, 'assets', 'js', '50-navigation.js'), 'utf8');

test('10-map.js contiene markersGroup.addLayers para inserción por lotes en MarkerCluster', () => {
    assert.match(mapJs, /markersGroup\.addLayers\(/, 'Debe incluir llamada por lotes a markersGroup.addLayers');
});

test('10-map.js expone window.renderMapMarkers = setupMapMarkers como alias global', () => {
    assert.match(mapJs, /window\.renderMapMarkers\s*=\s*setupMapMarkers/, 'Debe exponer alias global renderMapMarkers');
});

test('showMapNotice sanitiza el mensaje con escapeHtml', () => {
    assert.match(mapJs, /function\s+showMapNotice\s*\(/);
    assert.match(mapJs, /escapeHtml\(String\(message/);
});

test('50-navigation.js referencia leafletMap?.invalidateSize en lugar de map?.invalidateSize', () => {
    assert.match(navJs, /leafletMap\?\.invalidateSize\?\.\(\)/, 'Debe invocar invalidateSize en leafletMap');
    assert.doesNotMatch(navJs, /setTimeout\(\(\)\s*=>\s*map\?\.invalidateSize/, 'No debe llamar a map?.invalidateSize sin definir');
});

test('filterMapMarkers implementa control de bounds iniciales con _mapInitialBoundsFitted y forceFitBounds', () => {
    assert.match(mapJs, /window\._mapInitialBoundsFitted/);
    assert.match(mapJs, /options\.forceFitBounds\s*===\s*true/);
});
