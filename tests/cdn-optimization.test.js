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

test('vercel.json fuerza revalidación estricta de index.html y raíz sin servir copias stale', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    const htmlRule = vercelConfig.headers.find(h => h.source.includes('index.html'));
    assert.ok(htmlRule, 'Debe existir regla para index.html en vercel.json');
    const cacheHeader = htmlRule.headers.find(h => h.key.toLowerCase() === 'cache-control');
    assert.equal(
        cacheHeader.value,
        'public, max-age=0, must-revalidate',
        'index.html debe revalidar siempre con ETag/304 sin s-maxage ni stale-while-revalidate'
    );
});

test('syncHtmlAssetVersions agrega ?v=<hash8> a assets sin versión y solo cambia los modificados', () => {
    const { computeFileHash, syncHtmlAssetVersions } = require('../scripts/sync-asset-versions');
    const hashFoundation = computeFileHash(path.join(root, 'assets', 'css', '00-foundation.css'));
    const hashCore = computeFileHash(path.join(root, 'assets', 'js', '00-core.js'));
    assert.match(hashFoundation, /^[a-f0-9]{8}$/);

    const sampleHtml = [
        '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />',
        '<link rel="stylesheet" href="assets/css/00-foundation.css">',
        `<script src="assets/js/00-core.js?v=${hashCore}"></script>`,
        '<script src="assets/js/70-admin.js"></script>'
    ].join('\n');

    const result = syncHtmlAssetVersions(sampleHtml, root);
    assert.equal(result.missing.length, 0);
    assert.deepEqual(result.unchanged, ['assets/js/00-core.js']);
    assert.equal(result.updated.length, 2);
    assert.match(result.html, new RegExp(`assets/css/00-foundation\\.css\\?v=${hashFoundation}`));
    assert.match(result.html, /assets\/js\/70-admin\.js\?v=[a-f0-9]{8}/);
    assert.match(result.html, /https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.css"/);
});

test('todos los assets locales CSS y JS en index.html tienen ?v=<hash8> sincronizado con el archivo en disco', () => {
    const { syncIndexHtmlVersions } = require('../scripts/sync-asset-versions');
    const result = syncIndexHtmlVersions({ rootDir: root, checkOnly: true });
    assert.deepEqual(
        result.updated,
        [],
        `Ejecuta "node scripts/sync-asset-versions.js" para sincronizar: ${result.updated.map(u => u.asset).join(', ')}`
    );
    assert.ok(result.unchanged.length >= 20, 'Debe validar todos los scripts y hojas de estilo locales');
});
