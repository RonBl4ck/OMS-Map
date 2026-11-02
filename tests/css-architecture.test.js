import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const cssDir = path.join(rootDir, 'assets', 'css');

const EXPECTED_MODULES = [
  '00-tokens.css',
  '10-layout.css',
  '20-map-leaflet.css',
  '30-tables-modals.css',
  '40-drawers-charts.css'
];

test('Los 5 nuevos archivos modulares CSS existen y no están vacíos', () => {
  for (const moduleFile of EXPECTED_MODULES) {
    const fullPath = path.join(cssDir, moduleFile);
    assert.equal(fs.existsSync(fullPath), true, `El archivo ${moduleFile} debe existir`);
    const content = fs.readFileSync(fullPath, 'utf8').trim();
    assert.ok(content.length > 200, `El archivo ${moduleFile} debe tener contenido sustancial (actual: ${content.length} bytes)`);
  }
});

test('00-tokens.css define paleta PLUZ, contratistas, superficies y modo oscuro', () => {
  const tokens = fs.readFileSync(path.join(cssDir, '00-tokens.css'), 'utf8');

  // Paleta corporativa PLUZ
  assert.match(tokens, /--pluz-blue\s*:/, 'Debe definir --pluz-blue');
  assert.match(tokens, /--pluz-yellow\s*:/, 'Debe definir --pluz-yellow');
  assert.match(tokens, /--pluz-green\s*:/, 'Debe definir --pluz-green');
  assert.match(tokens, /--pluz-dark\s*:/, 'Debe definir --pluz-dark');
  assert.match(tokens, /--pluz-red\s*:/, 'Debe definir --pluz-red');

  // Colores de contratistas
  assert.match(tokens, /--contractor-cobra\s*:/, 'Debe definir --contractor-cobra');
  assert.match(tokens, /--contractor-dominion\s*:/, 'Debe definir --contractor-dominion');
  assert.match(tokens, /--contractor-inmel\s*:/, 'Debe definir --contractor-inmel');
  assert.match(tokens, /--contractor-lari\s*:/, 'Debe definir --contractor-lari');

  // Estados operativos
  assert.match(tokens, /--color-pendiente\s*:/, 'Debe definir --color-pendiente');
  assert.match(tokens, /--color-ejecucion\s*:/, 'Debe definir --color-ejecucion');
  assert.match(tokens, /--color-ejecutado\s*:/, 'Debe definir --color-ejecutado');
  assert.match(tokens, /--color-critico\s*:/, 'Debe definir --color-critico');

  // Tokens de superficie, tipografía, sombras y curvas
  assert.match(tokens, /--surface\s*:/, 'Debe definir --surface');
  assert.match(tokens, /--border\s*:/, 'Debe definir --border');
  assert.match(tokens, /--font-sans\s*:/, 'Debe definir --font-sans');
  assert.match(tokens, /--shadow-lg\s*:/, 'Debe definir --shadow-lg');
  assert.match(tokens, /--ease-out\s*:/, 'Debe definir --ease-out');

  // Soporte de Modo Oscuro
  assert.match(tokens, /\[data-theme="dark"\]/, 'Debe contemplar soporte para [data-theme="dark"]');
});

test('10-layout.css implementa el shell, navegación superior, tabs y responsive', () => {
  const layout = fs.readFileSync(path.join(cssDir, '10-layout.css'), 'utf8');

  assert.match(layout, /\.top-navbar\s*\{/, 'Debe definir .top-navbar');
  assert.match(layout, /\.map-tabs-nav\s*\{/, 'Debe definir .map-tabs-nav');
  assert.match(layout, /\.tab-btn\.active\s*\{/, 'Debe definir estilo para tab activo');
  assert.match(layout, /\.app-data-status/, 'Debe definir .app-data-status');
  assert.match(layout, /\.td-oms-full-view/, 'Debe definir .td-oms-full-view');
  assert.match(layout, /@media\s*\(max-width:\s*900px\)/, 'Debe incluir breakpoint de 900px');
  assert.match(layout, /@media\s*\(max-width:\s*620px\)/, 'Debe incluir breakpoint móvil de 620px');
});

test('20-map-leaflet.css contiene MarkerCluster, controles y animaciones en mapa', () => {
  const mapCss = fs.readFileSync(path.join(cssDir, '20-map-leaflet.css'), 'utf8');

  assert.match(mapCss, /#map\s*\{/, 'Debe definir contenedor #map');
  assert.match(mapCss, /\.oms-marker-cluster/, 'Debe definir cluster MarkerCluster');
  assert.match(mapCss, /\.search-container-map/, 'Debe definir .search-container-map');
  assert.match(mapCss, /criticalMarkerPulse/, 'Debe definir animación criticalMarkerPulse');
  assert.match(mapCss, /\.marker-sla-badge\.is-sed-critica-pulse/, 'Debe definir clase .is-sed-critica-pulse');
  assert.match(mapCss, /\.ticket-map-link/, 'Debe definir .ticket-map-link');
});

test('30-tables-modals.css contiene tablas, modales y multi-select', () => {
  const tablesCss = fs.readFileSync(path.join(cssDir, '30-tables-modals.css'), 'utf8');

  assert.match(tablesCss, /#tdOmsTable/, 'Debe contener estilos para #tdOmsTable');
  assert.match(tablesCss, /\.calls-table/, 'Debe contener estilos para .calls-table');
  assert.match(tablesCss, /\.custom-multiselect/, 'Debe contener estilos para .custom-multiselect');
  assert.match(tablesCss, /\.call-detail-dialog/, 'Debe contener estilos para .call-detail-dialog');
  assert.match(tablesCss, /\.tech-detail-dialog/, 'Debe contener estilos para .tech-detail-dialog');
  assert.match(tablesCss, /\.sup-chip-btn/, 'Debe contener estilos para .sup-chip-btn');
  assert.match(tablesCss, /\.hp-ticket-card/, 'Debe contener estilos para .hp-ticket-card');
});

test('40-drawers-charts.css contiene drawer de SEDs críticas, gráficos y KPIs', () => {
  const drawerCss = fs.readFileSync(path.join(cssDir, '40-drawers-charts.css'), 'utf8');

  assert.match(drawerCss, /\.critical-drawer\s*\{/, 'Debe definir .critical-drawer');
  assert.match(drawerCss, /\.critical-drawer-header/, 'Debe definir .critical-drawer-header');
  assert.match(drawerCss, /\.critical-range-pills/, 'Debe definir .critical-range-pills');
  assert.match(drawerCss, /\.chart-card/, 'Debe definir .chart-card');
  assert.match(drawerCss, /\.chart-bar-interactive/, 'Debe definir .chart-bar-interactive');
  assert.match(drawerCss, /\.exec-kpi-card/, 'Debe definir .exec-kpi-card');
  assert.match(drawerCss, /\.critical-toast-banner/, 'Debe definir .critical-toast-banner');
});

test('90-modern.css enlaza los 5 módulos vía @import y mantiene contratos de compatibilidad', () => {
  const modernCss = fs.readFileSync(path.join(cssDir, '90-modern.css'), 'utf8');

  for (const moduleFile of EXPECTED_MODULES) {
    const importRegex = new RegExp(`@import\\s+["']${moduleFile}["']`);
    assert.match(modernCss, importRegex, `90-modern.css debe importar ${moduleFile}`);
  }

  // Compatibilidad exigida por tests existentes
  assert.match(modernCss, /criticalMarkerPulse/, '90-modern.css debe exponer animación criticalMarkerPulse');
  assert.match(modernCss, /\.is-sed-critica-pulse/, '90-modern.css debe exponer clase .is-sed-critica-pulse');
  assert.match(modernCss, /\.critical-drawer/, '90-modern.css debe exponer clase .critical-drawer');
  assert.match(modernCss, /#btnOpenConfig,\s*#btnLogout/, '90-modern.css debe exponer selector #btnOpenConfig, #btnLogout');
  assert.match(modernCss, /#tdOmsTable\s*\{[^}]*min-width:\s*980px/s, '90-modern.css debe mantener ancho mínimo de tabla TD-OMS');
});
