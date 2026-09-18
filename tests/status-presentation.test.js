const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf8');
const map = fs.readFileSync(path.join(root, 'assets', 'js', '10-map.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'assets', 'js', '20-dashboard.js'), 'utf8');
const dashboardCss = fs.readFileSync(path.join(root, 'assets', 'css', '20-dashboard.css'), 'utf8');

test('los estados OMS tienen una semántica PLUZ compartida', () => {
    assert.match(core, /function getOmsStatusClass\(status\)/);
    assert.match(core, /pendiente:\s*'#FBC13F'/);
    assert.match(core, /ejecucion:\s*'#3B599F'/);
    assert.match(core, /ejecutado:\s*'#6CAC5E'/);
    assert.match(core, /otros:\s*'#C1CBD6'/);
    assert.match(dashboard, /getOmsStatusColor\(s\.name\)/);
    assert.match(dashboardCss, /\.status-badge\.ejecutado\s*\{[^}]*#6CAC5E/s);
});

test('los tickets en ejecución muestran el vehículo detrás de su icono de falla', () => {
    assert.match(map, /const isExecution = stateClass === 'ejecucion'/);
    assert.match(map, /marker-vehicle-backdrop/);
    assert.match(map, /marker-fault-icon/);
});
