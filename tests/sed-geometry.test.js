const assert = require('node:assert/strict');
const test = require('node:test');

const { buildSedAreaShape, buildSedCloudShape, getSedCloudFocusStyle, shouldPersistSedCloudLabel } = require('../assets/js/sed-geometry.js');

test('al enfocar una SED se enfatiza su nube y se atenúan las demás', () => {
    assert.deepEqual(getSedCloudFocusStyle(true, true), { opacity: 1, fillOpacity: 0.22 });
    assert.deepEqual(getSedCloudFocusStyle(false, true), { opacity: 0.3, fillOpacity: 0.035 });
    assert.deepEqual(getSedCloudFocusStyle(false, false), { opacity: 0.9, fillOpacity: 0.12 });
});

test('las etiquetas SED permanentes requieren varias fallas y un zoom cercano', () => {
    assert.equal(shouldPersistSedCloudLabel(1, 15), false);
    assert.equal(shouldPersistSedCloudLabel(2, 11), false);
    assert.equal(shouldPersistSedCloudLabel(2, 13), true);
});

test('una sola falla no crea nube ni etiqueta SED', () => {
    const shape = buildSedCloudShape([[-12.05, -77.04]]);

    assert.equal(shape.kind, 'empty');
    assert.equal(shape.labelCenter, null);
});

test('dos fallas crean una nube redondeada con centro para la etiqueta', () => {
    const shape = buildSedCloudShape([
        [-12.0500, -77.0400],
        [-12.0490, -77.0390],
    ], { paddingMeters: 75 });

    assert.equal(shape.kind, 'cloud');
    assert.ok(shape.points.length >= 16, 'la nube debe tener suficientes puntos para verse redondeada');
    assert.deepEqual(shape.labelCenter.map(value => Number(value.toFixed(4))), [-12.0495, -77.0395]);
});

test('la nube de tres fallas alineadas mantiene volumen sin formar un triángulo fino', () => {
    const shape = buildSedCloudShape([
        [-12.0500, -77.0400],
        [-12.0490, -77.0390],
        [-12.0480, -77.0380],
    ], { paddingMeters: 75 });

    assert.equal(shape.kind, 'cloud');
    assert.ok(shape.points.length >= 16);
    assert.ok(shape.paddingMeters >= 75);
});

test('tres tickets casi alineados producen un corredor con ancho mínimo', () => {
    const shape = buildSedAreaShape([
        [-12.0500, -77.0400],
        [-12.0490, -77.0390],
        [-12.0480, -77.03802],
    ], { corridorWidthMeters: 120 });

    assert.equal(shape.kind, 'corridor');
    assert.equal(shape.points.length, 4);
    assert.ok(shape.widthMeters >= 119);
});

test('tres tickets con área suficiente conservan un polígono', () => {
    const shape = buildSedAreaShape([
        [-12.0500, -77.0400],
        [-12.0500, -77.0375],
        [-12.0475, -77.0400],
    ], { corridorWidthMeters: 120 });

    assert.equal(shape.kind, 'polygon');
    assert.equal(shape.points.length, 3);
});

test('dos tickets forman un corredor y uno conserva un círculo', () => {
    assert.equal(buildSedAreaShape([[-12.05, -77.04]]).kind, 'circle');
    assert.equal(buildSedAreaShape([[-12.05, -77.04], [-12.049, -77.039]]).kind, 'corridor');
});
