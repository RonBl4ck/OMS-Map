const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const coreSource = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', '00-core.js'), 'utf8');
const mapSource = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', '10-map.js'), 'utf8');
const dashSource = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', '20-dashboard.js'), 'utf8');
const htmlSource = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

test('index.html incluye contenedores para filtro por Día en Mapa e Indicadores', () => {
    assert.match(htmlSource, /id="mapMultiDia"/);
    assert.match(htmlSource, /id="tdMultiDia"/);
});

test('10-map.js configura filtro de Día en Mapa e Indicadores y en el facetado', () => {
    assert.match(mapSource, /dia:\s*'mapMultiDia'/);
    assert.match(mapSource, /dia:\s*'tdMultiDia'/);
    assert.match(mapSource, /mapCtrlDia\s*=\s*initMultiSelect\("mapMultiDia",\s*"Día"/);
    assert.match(mapSource, /tdCtrlDia\s*=\s*initMultiSelect\("tdMultiDia",\s*"Día"/);
});

test('20-dashboard.js aplica orden cronológico con sortDias en renderModernCharts', () => {
    assert.match(dashSource, /sortDias/);
    assert.match(dashSource, /const selDias = tdCtrlDia \? tdCtrlDia\.getSelected\(\) : \[\];/);
});

test('sortDias ordena fechas en español respetando el cambio de mes', () => {
    // Evaluamos parseDiaValue y sortDias en un contexto limpio
    const fnExtract = new Function(`
        ${coreSource.substring(coreSource.indexOf('const SPANISH_MONTHS_MAP'), coreSource.indexOf('// === COMPONENTE MULTI-SELECT CHECKBOX ==='))}
        return { parseDiaValue, sortDias };
    `)();

    const { parseDiaValue, sortDias } = fnExtract;

    assert.equal(parseDiaValue('30-oct') < parseDiaValue('01-nov'), true, '30-oct debe ser anterior a 01-nov');
    assert.equal(parseDiaValue('31-oct') < parseDiaValue('01-nov'), true, '31-oct debe ser anterior a 01-nov');
    assert.equal(parseDiaValue('01-nov') < parseDiaValue('02-nov'), true, '01-nov debe ser anterior a 02-nov');

    const dias = ['01-nov', '02-nov', '30-oct', '31-oct'];
    dias.sort(sortDias);
    assert.deepEqual(dias, ['30-oct', '31-oct', '01-nov', '02-nov'], 'Las fechas deben quedar en orden cronológico estricto');
});
