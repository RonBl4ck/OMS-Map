const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('index.html incluye Chart.js y 35-critical-panel.js', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /chart\.umd\.min\.js/, 'Chart.js debe estar presente en index.html');
    assert.match(html, /35-critical-panel\.js/, '35-critical-panel.js debe estar presente en index.html');
});

test('90-modern.css define animación de pulso crítico y drawer', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', '90-modern.css'), 'utf8');
    assert.match(css, /criticalMarkerPulse/, 'Debe existir la animación criticalMarkerPulse');
    assert.match(css, /\.is-sed-critica-pulse/, 'Debe existir la clase .is-sed-critica-pulse');
    assert.match(css, /\.critical-drawer/, 'Debe existir la clase .critical-drawer');
});

test('10-map.js asocia la clase de pulso y el botón de análisis a SEDs críticas', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '10-map.js'), 'utf8');
    assert.match(js, /is-sed-critica-pulse/, '10-map.js debe aplicar la clase is-sed-critica-pulse');
    assert.match(js, /openCriticalSedPanel/, '10-map.js debe permitir abrir el panel de análisis crítico');
});

test('35-critical-panel.js implementa el motor de rango y análisis inteligente', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '35-critical-panel.js'), 'utf8');
    assert.match(js, /function openCriticalSedPanel/, 'Debe definir openCriticalSedPanel');
    assert.match(js, /function setCriticalRange/, 'Debe definir setCriticalRange');
    assert.match(js, /function renderCriticalChart/, 'Debe definir renderCriticalChart');
    assert.match(js, /function renderCriticalInsights/, 'Debe definir renderCriticalInsights');
});

test('00-core.js excluye suministros del conteo de pendientes y restringe Top 4 a SEDs críticas', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '00-core.js'), 'utf8');
    assert.match(js, /function isExcludedFault/, '00-core.js debe definir isExcludedFault');
    assert.match(js, /function normalizeLlaveCode/, '00-core.js debe definir normalizeLlaveCode');
    assert.match(js, /if \(isExcludedFault\(loc\.falla\)\) return;/, 'recalculateTopCriticalSeds debe excluir fallas de suministros/acometidas');
});

test('10-map.js muestra botón de análisis si loc.es_sed_critica o loc.es_top_critica es verdadero', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '10-map.js'), 'utf8');
    assert.match(js, /\(loc\.es_sed_critica \|\| loc\.es_top_critica\)/, 'El botón de análisis debe mostrarse si la SED es crítica o top 4');
});

