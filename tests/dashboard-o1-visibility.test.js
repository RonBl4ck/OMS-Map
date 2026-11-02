const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dashboardJs = fs.readFileSync(path.join(root, 'assets', 'js', '20-dashboard.js'), 'utf8');
const llamadasJs = fs.readFileSync(path.join(root, 'assets', 'js', '30-llamadas.js'), 'utf8');
const tecnicosJs = fs.readFileSync(path.join(root, 'assets', 'js', '40-tecnicos.js'), 'utf8');
const historialPluzJs = fs.readFileSync(path.join(root, 'assets', 'js', '45-historial-pluz.js'), 'utf8');

test('20-dashboard.js verifica document.visibilityState === "hidden" y clase hidden en el timer de refresco', () => {
    assert.match(dashboardJs, /document\.visibilityState\s*===\s*['"]hidden['"]/, 'Debe verificar visibilityState en el intervalo');
    assert.match(dashboardJs, /tdOmsModalOverlay/, 'Debe verificar existencia de modal tdOmsModalOverlay');
    assert.match(dashboardJs, /modal\.classList\.contains\(['"]hidden['"]\)/, 'Solo debe repintar si el modal no está oculto');
});

test('20-dashboard.js llama a setupMapMarkers con fallback a renderMapMarkers', () => {
    assert.match(dashboardJs, /typeof\s+setupMapMarkers\s*===\s*['"]function['"]\s*\?\s*setupMapMarkers\(\)\s*:\s*\(typeof\s+renderMapMarkers\s*===\s*['"]function['"]\s*&&\s*renderMapMarkers\(\)\)|if\s*\(typeof\s+setupMapMarkers\s*===\s*['"]function['"]\)\s*setupMapMarkers\(\);\s*else\s+if\s*\(typeof\s+renderMapMarkers\s*===\s*['"]function['"]\)\s*renderMapMarkers\(\);/, 'Debe invocar setupMapMarkers con fallback');
});

test('20-dashboard.js optimiza bucles O(n) en renderModernCharts con tabla de frecuencias matrixCounts', () => {
    assert.match(dashboardJs, /const\s+matrixCounts\s*=\s*\{\}/, 'Debe inicializar matrixCounts');
    assert.match(dashboardJs, /matrixCounts\[st\]\[cat\]\+\+/, 'Debe acumular conteos en un solo pase');
});

test('20-dashboard.js reutiliza window.ejecutadosRecords en downloadExecutedBase', () => {
    assert.match(dashboardJs, /Array\.isArray\(window\.ejecutadosRecords\)\s*&&\s*window\.ejecutadosRecords\.length\s*>\s*0/, 'Debe reutilizar base ejecutados en memoria');
});

test('30-llamadas.js unifica el conteo de llamadas calculando getCallCounts una sola vez y pasa counts a updateCallsSummary', () => {
    assert.match(llamadasJs, /const\s+counts\s*=\s*getCallCounts\(targetRecords\)/, 'Debe calcular counts una sola vez en renderLlamadasTable');
    assert.match(llamadasJs, /updateCallsSummary\(\s*targetRecords\s*,\s*counts\s*\)/, 'Debe pasar counts precalculado a updateCallsSummary');
    assert.match(llamadasJs, /rebuildOmsTicketIndex/, 'Debe llamar a rebuildOmsTicketIndex al cargar llamadas');
});

test('40-tecnicos.js verifica visibilityState y vista oculta en techRefreshTimer', () => {
    assert.match(tecnicosJs, /document\.visibilityState\s*===\s*['"]hidden['"]/, 'Debe pausar el timer si la pestaña está oculta');
    assert.match(tecnicosJs, /seguimientoView/, 'Debe verificar el elemento seguimientoView');
    assert.match(tecnicosJs, /classList\.contains\(['"]hidden['"]\)/, 'Debe verificar que seguimientoView no tenga la clase hidden');
});

test('45-historial-pluz.js usa Map para lookup O(1) de tickets en lugar de allSources.find', () => {
    assert.doesNotMatch(historialPluzJs, /allSources\.find\(/, 'No debe usar allSources.find');
    assert.match(historialPluzJs, /window\.omsRecordsByTicketMap\s+instanceof\s+Map/, 'Debe consultar window.omsRecordsByTicketMap');
    assert.match(historialPluzJs, /ticketMap\.get\(cleanTicket\)/, 'Debe realizar lookup O(1) con get(cleanTicket)');
});
