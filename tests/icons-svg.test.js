const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const iconsDir = path.join(__dirname, '..', 'assets', 'icons');
const iconNames = ['suministro', 'fusible', 'red_aerea', 'subterranea', 'poste'];

for (const name of iconNames) {
    test(`${name} es un SVG compacto, accesible y multicolor`, () => {
        const source = fs.readFileSync(path.join(iconsDir, `${name}.svg`), 'utf8');
        assert.match(source, /^<svg[^>]+viewBox="0 0 64 64"/);
        assert.match(source, /role="img"/);
        assert.match(source, /<title>[^<]+<\/title>/);
        assert.doesNotMatch(source, /<text\b|<filter\b|<image\b/);

        const colors = new Set([...source.matchAll(/#[0-9a-fA-F]{6}/g)].map(match => match[0].toLowerCase()));
        assert.ok(colors.size >= 2, 'el icono debe conservar color descriptivo');
        assert.ok(source.length < 2200, 'el icono debe mantenerse simple y liviano');
    });
}

test('la aplicación usa SVG para todos los tipos de falla', () => {
    const core = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '00-core.js'), 'utf8');
    const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    for (const name of iconNames) {
        assert.match(`${core}\n${page}`, new RegExp(`assets/icons/${name}\\.svg`));
    }
    assert.doesNotMatch(`${core}\n${page}`, /assets\/icons\/(?:suministro|fusible)\.png/);
});

test('el SLA usa una pestaña inferior sólida y deja el icono sobre fondo neutro', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', '10-map.css'), 'utf8');

    assert.match(css, /\.marker-sla-badge\s*\{[^}]*width:\s*36px[^}]*height:\s*36px/s);
    assert.match(css, /\.marker-sla-badge\s*\{[^}]*border:\s*0/s);
    assert.match(css, /\.fault-icon-img\s*\{[^}]*width:\s*30px[^}]*height:\s*30px/s);
    assert.match(css, /\.marker-sla-badge::after\s*\{[^}]*bottom:\s*-3px[^}]*height:\s*5px/s);
    assert.match(css, /\.marker-sla-badge\.sla-ok::after\s*\{[^}]*background:\s*#16a34a/s);
    assert.match(css, /\.marker-sla-badge\.sla-warning::after\s*\{[^}]*background:\s*#f59e0b/s);
    assert.match(css, /\.marker-sla-badge\.sla-overdue::after\s*\{[^}]*background:\s*#dc2626/s);
    assert.doesNotMatch(css, /\.marker-sla-badge\.sla-(?:ok|warning|overdue)\s*\{[^}]*background:/s);
    assert.doesNotMatch(css, /animation:\s*pulseSla/);
    assert.doesNotMatch(css, /@keyframes\s+pulseSla/);
});

test('la leyenda del mapa tiene un control desplegable accesible', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(page, /id="btnToggleMapLegend"[^>]+aria-expanded="true"[^>]+aria-controls="mapLegendContent"/);
    assert.match(page, /id="mapLegendContent"/);
});

test('los recursos de la leyenda invalidan el cache antiguo en cada despliegue', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const release = '20260913-map-legend';

    assert.match(page, new RegExp(`assets/css/10-map\\.css\\?v=${release}`));
    assert.match(page, new RegExp(`assets/js/10-map\\.js\\?v=${release}`));
    assert.match(page, new RegExp(`assets/js/80-bootstrap\\.js\\?v=${release}`));
    for (const name of iconNames) {
        assert.match(page, new RegExp(`assets/icons/${name}\\.svg\\?v=${release}`));
    }
});

test('el botón de perímetros usa un icono vectorial estable y estado accesible', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    assert.match(page, /id="btnToggleSedLayer"[^>]+aria-pressed="false"/);
    assert.match(page, /class="btn-layer-icon"[^>]+aria-hidden="true"[^>]*>\s*<svg/);
    assert.doesNotMatch(page, /📐\s*Perímetros SED/);
});
