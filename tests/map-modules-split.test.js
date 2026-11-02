const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('assets/js/templates/mapPopups.js existe y expone los métodos requeridos', () => {
    const filePath = path.join(root, 'assets', 'js', 'templates', 'mapPopups.js');
    assert.ok(fs.existsSync(filePath), 'mapPopups.js debe existir en assets/js/templates/');

    const popups = require(filePath);
    assert.equal(typeof popups.renderIncidentPopup, 'function', 'renderIncidentPopup debe ser una función');
    assert.equal(typeof popups.renderIncidentIcon, 'function', 'renderIncidentIcon debe ser una función');
    assert.equal(typeof popups.renderSedPopup, 'function', 'renderSedPopup debe ser una función');
});

test('mapPopups.renderIncidentPopup sanitiza HTML y renderiza elementos clave', () => {
    const popups = require(path.join(root, 'assets', 'js', 'templates', 'mapPopups.js'));
    const mockLoc = {
        ticket: '<script>alert(1)</script>12345',
        odm: 'ODM-9988',
        estado: 'PENDIENTE',
        empresa: 'CAM',
        falla: 'FUSIBLE MT',
        sed: 'SED-01',
        alimentador: 'ALIM-01',
        suministro: '123456',
        suministro_count: 3,
        llamadas: '8',
        fecha_inicio: '02/11/2026 10:00',
        direccion: 'Av. Test 123 & "Especial"',
        distrito: 'CALLAO',
        lat: -12.05,
        lon: -77.04,
        es_sed_critica: true,
        sla: {
            statusClass: 'sla-warning',
            elapsed: '3.5',
            maxHours: '4.0',
            label: 'Alerta SLA'
        }
    };

    const html = popups.renderIncidentPopup(mockLoc);
    assert.ok(!html.includes('<script>'), 'Debe sanitizar tags maliciosos');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;12345'), 'Debe escapar caracteres especiales');
    assert.ok(html.includes('Av. Test 123 &amp; &quot;Especial&quot;'), 'Debe escapar ampersands y comillas');
    assert.ok(html.includes('https://www.google.com/maps?q=-12.05,-77.04'), 'Debe incluir enlace a Google Maps');
    assert.ok(html.includes('Alerta SLA'), 'Debe incluir etiqueta de SLA');
});

test('mapPopups.renderIncidentIcon incluye indicador de vehículo si está en ejecución', () => {
    const popups = require(path.join(root, 'assets', 'js', 'templates', 'mapPopups.js'));
    const mockExec = {
        ticket: 'T-100',
        estado: 'EJECUCION',
        falla: 'CABLE SUBTERRANEO',
        sla: { statusClass: 'sla-ok', label: 'En plazo' },
        es_top_critica: true
    };
    const iconExec = popups.renderIncidentIcon(mockExec);
    assert.ok(iconExec.includes('marker-vehicle-backdrop'), 'Ticket en ejecución debe incluir icono de vehículo');
    assert.ok(iconExec.includes('is-sed-critica-pulse'), 'Ticket top crítico debe incluir clase pulsante');
});

test('mapPopups.renderSedPopup construye popup con lista de tickets y estilo de zona', () => {
    const popups = require(path.join(root, 'assets', 'js', 'templates', 'mapPopups.js'));
    const mockSedData = {
        sed: '03033A',
        alimentador: 'MS-03',
        empresa: 'LIZMAN',
        es_critica: true,
        sed_count: 4,
        strokeColor: '#6d5bd0',
        tickets: [
            { ticket: 'TK-1', falla: 'FUSIBLE MT', sla: { label: 'En plazo' } },
            { ticket: 'TK-2', falla: 'CABLE MT', sla: { label: 'Vencido' } }
        ]
    };
    const html = popups.renderSedPopup(mockSedData);
    assert.ok(html.includes('Zona aproximada SED: 03033A'));
    assert.ok(html.includes('Tickets activos:</b> 2'));
    assert.ok(html.includes('TK-1'));
    assert.ok(html.includes('TK-2'));
    assert.ok(html.includes('🚨 SED CRÍTICA / REINCIDENTE'));
});

test('assets/js/components/mapManager.js existe y expone la API de control de mapa', () => {
    const filePath = path.join(root, 'assets', 'js', 'components', 'mapManager.js');
    assert.ok(fs.existsSync(filePath), 'mapManager.js debe existir en assets/js/components/');

    const mapManager = require(filePath);
    assert.equal(typeof mapManager.applyBaseLayers, 'function');
    assert.equal(typeof mapManager.initMap, 'function');
    assert.equal(typeof mapManager.locateUser, 'function');
    assert.equal(typeof mapManager.buscarDireccionEnMapa, 'function');
    assert.equal(typeof mapManager.focusTicketInMap, 'function');
    assert.equal(typeof mapManager.navigateToTicketOnMap, 'function');
    assert.equal(typeof mapManager.showMapNotice, 'function');
    assert.equal(typeof mapManager.initMapLegend, 'function');
    assert.equal(typeof mapManager.setMapLegendExpanded, 'function');
    assert.equal(mapManager.ADDRESS_SEARCH_RADIUS_METERS, 500);
});

test('mapManager valida coordenadas y normaliza texto de direcciones', () => {
    const mapManager = require(path.join(root, 'assets', 'js', 'components', 'mapManager.js'));

    const coords = mapManager.parsearCoordenadas('-12.0463, -77.0427');
    assert.deepEqual(coords, { lat: -12.0463, lon: -77.0427 });

    assert.equal(mapManager.parsearCoordenadas('no-coords'), null);
    assert.throws(() => mapManager.parsearCoordenadas('999.0, 999.0'), /Las coordenadas no son válidas/);

    const normalized = mapManager.normalizeAddressText('Av. Nicolás de Piérola # 123 - Lima!!');
    assert.equal(normalized, 'AV NICOLAS DE PIEROLA 123 LIMA');
});

test('assets/js/components/markersManager.js existe y expone la gestión de marcadores', () => {
    const filePath = path.join(root, 'assets', 'js', 'components', 'markersManager.js');
    assert.ok(fs.existsSync(filePath), 'markersManager.js debe existir en assets/js/components/');

    const markersManager = require(filePath);
    assert.equal(typeof markersManager.setupMapMarkers, 'function');
    assert.equal(typeof markersManager.filterMapMarkers, 'function');
    assert.equal(typeof markersManager.getMarkerIcon, 'function');
});

test('assets/js/components/sedCloudsManager.js existe y reutiliza convexHull', () => {
    const filePath = path.join(root, 'assets', 'js', 'components', 'sedCloudsManager.js');
    assert.ok(fs.existsSync(filePath), 'sedCloudsManager.js debe existir en assets/js/components/');

    const sedCloudsManager = require(filePath);
    assert.equal(typeof sedCloudsManager.renderSedPerimeters, 'function');
    assert.equal(typeof sedCloudsManager.renderSedClouds, 'function');
    assert.equal(typeof sedCloudsManager.highlightSedPerimeter, 'function');
    assert.equal(typeof sedCloudsManager.focusSedCloud, 'function');
    assert.equal(typeof sedCloudsManager.resetSedPerimeterStyles, 'function');
    assert.equal(typeof sedCloudsManager.syncSedCloudLabelVisibility, 'function');
    assert.equal(typeof sedCloudsManager.toggleSedPerimeters, 'function');
    assert.equal(typeof sedCloudsManager.convexHull, 'function');

    // Comprobar que convexHull devuelve puntos válidos
    const samplePts = [[-12.05, -77.04], [-12.06, -77.05], [-12.055, -77.045]];
    const hull = sedCloudsManager.convexHull(samplePts);
    assert.ok(Array.isArray(hull));
    assert.ok(hull.length >= 2);
});

test('10-map.js eliminó la función duplicada computeConvexHull', () => {
    const mapSource = fs.readFileSync(path.join(root, 'assets', 'js', '10-map.js'), 'utf8');
    assert.doesNotMatch(mapSource, /function\s+computeConvexHull\s*\(/, '10-map.js no debe contener la función duplicada computeConvexHull');
});
