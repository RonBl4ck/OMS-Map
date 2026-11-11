const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('vercel.json habilita caché de navegador y CDN para JS y CSS', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    const assetRule = vercelConfig.headers.find(h => h.source.includes('\\.css') && h.source.includes('\\.js'));
    assert.ok(assetRule, 'Debe existir regla para .css y .js en vercel.json');
    const cacheHeader = assetRule.headers.find(h => h.key.toLowerCase() === 'cache-control');
    assert.match(cacheHeader.value, /max-age=86400/, 'Debe permitir caché en navegador por 24h');
    assert.match(cacheHeader.value, /s-maxage=604800/, 'Debe permitir caché en CDN por 7 días');
    assert.doesNotMatch(cacheHeader.value, /max-age=0/, 'No debe forzar max-age=0 en cada petición');
});

test('index.html carga 00-modules.bundle.js en lugar de 13 scripts separados', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /assets\/js\/00-modules\.bundle\.js\?v=/, 'Debe cargar el bundle con versión');
    assert.doesNotMatch(html, /<script\s+src=["']assets\/js\/state\/store\.js["']>/, 'No debe cargar store.js suelto');
    assert.doesNotMatch(html, /<script\s+src=["']assets\/js\/components\/mapManager\.js["']>/, 'No debe cargar mapManager.js suelto');
});

test('index.html expone botón de refresco en vivo desde Google Sheets', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /id=["']btnRefreshLiveOms["']/, 'Debe contener botón #btnRefreshLiveOms');
    assert.match(html, /Actualizar datos desde Google Sheets/, 'Debe contener título descriptivo');
});

test('90-modern.css tiene los submódulos CSS inlinados sin @import activos fuera de comentarios', () => {
    const css = fs.readFileSync(path.join(root, 'assets', 'css', '90-modern.css'), 'utf8');
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(withoutComments, /@import\s+["']/, 'No debe haber @import activos que disparen peticiones en cascada');
});

test('00-core.js y domUtils.js unifican URLs de iconos SVG con query param de leyenda', () => {
    const core = fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf8');
    const dom = fs.readFileSync(path.join(root, 'assets', 'js', 'utils', 'domUtils.js'), 'utf8');
    for (const name of ['suministro', 'fusible', 'red_aerea', 'subterranea', 'poste']) {
        assert.match(core, new RegExp(`assets/icons/${name}\\.svg\\?v=20260913-map-legend`));
        assert.match(dom, new RegExp(`assets/icons/${name}\\.svg\\?v=20260913-map-legend`));
    }
});

test('60-auth.js expone refreshLiveOmsData y startLiveOmsAutoRefresh', () => {
    const authCode = fs.readFileSync(path.join(root, 'assets', 'js', '60-auth.js'), 'utf8');
    assert.match(authCode, /refreshLiveOmsData/);
    assert.match(authCode, /startLiveOmsAutoRefresh/);
    assert.match(authCode, /btnRefreshLiveOms/);
});
