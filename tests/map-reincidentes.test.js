const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('mapPopups.renderIncidentIcon incluye badge e indicador de suministro reincidente', () => {
    const popups = require(path.join(root, 'assets', 'js', 'templates', 'mapPopups.js'));
    
    // Caso 1: Suministro reincidente con 3 fallas en ventana de 2 días
    const locReinc = {
        ticket: '1001',
        estado: 'PENDIENTE',
        falla: 'SUMINISTRO',
        suministro: '555123',
        suministro_count: 3,
        suministro_ventana_dias: 2,
        suministro_reincidente: true,
        sla: { statusClass: 'sla-ok', label: 'En plazo' }
    };

    const iconHtml = popups.renderIncidentIcon(locReinc);
    assert.ok(iconHtml.includes('is-suministro-reincidente'), 'Debe incluir la clase CSS is-suministro-reincidente');
    assert.ok(iconHtml.includes('marker-reinc-badge'), 'Debe incluir el elemento marker-reinc-badge');
    assert.ok(iconHtml.includes('x3'), 'Debe mostrar el conteo x3 en el badge');
    assert.ok(iconHtml.includes('⚠️ S. REINCIDENTE'), 'El title del icono debe alertar de suministro reincidente');
    assert.ok(iconHtml.includes('3 fallas en 2 días'), 'El tooltip debe indicar cantidad de fallas y ventana de días');

    // Caso 2: Suministro normal (no reincidente)
    const locNormal = {
        ticket: '1002',
        estado: 'PENDIENTE',
        falla: 'SUMINISTRO',
        suministro: '555999',
        suministro_count: 1,
        suministro_reincidente: false,
        sla: { statusClass: 'sla-ok', label: 'En plazo' }
    };

    const normalIconHtml = popups.renderIncidentIcon(locNormal);
    assert.ok(!normalIconHtml.includes('is-suministro-reincidente'), 'No debe incluir clase de reincidente');
    assert.ok(!normalIconHtml.includes('marker-reinc-badge'), 'No debe incluir badge de reincidente');
    assert.ok(!normalIconHtml.includes('⚠️ S. REINCIDENTE'), 'No debe incluir alerta en tooltip');
});

test('mapPopups.renderIncidentPopup renderiza tarjeta de suministro reincidente e historial', () => {
    const popups = require(path.join(root, 'assets', 'js', 'templates', 'mapPopups.js'));

    const locWithHistory = {
        ticket: '2001',
        odm: 'ODM-2001',
        estado: 'PENDIENTE',
        empresa: 'LIZMAN',
        falla: 'SUMINISTRO',
        sed: 'SED-01',
        suministro: '777888',
        suministro_count: 2,
        suministro_ventana_dias: 2,
        suministro_reincidente: true,
        suministro_historial: [
            {
                t: '1980',
                f: '03/11 14:20',
                falla: 'SUMINISTRO',
                fr: 'CONEXION BT',
                nota: 'Cambio de conector en acometida aérea',
                tec: 'Juan Perez / LIZMAN'
            }
        ],
        lat: -12.05,
        lon: -77.04,
        sla: { statusClass: 'sla-warning', elapsed: '2.5', maxHours: '4.0', label: 'En riesgo' }
    };

    const popupHtml = popups.renderIncidentPopup(locWithHistory);
    assert.ok(popupHtml.includes('popup-reincidente-card'), 'Debe renderizar la tarjeta popup-reincidente-card');
    assert.ok(popupHtml.includes('Suministro Reincidente'), 'Debe tener título de Suministro Reincidente');
    assert.ok(popupHtml.includes('2 fallas'), 'Debe mostrar el conteo de fallas');
    assert.ok(popupHtml.includes('2D'), 'Debe indicar la ventana de días');
    assert.ok(popupHtml.includes('1980'), 'Debe mostrar el ticket anterior');
    assert.ok(popupHtml.includes('03/11 14:20'), 'Debe mostrar la fecha del cierre');
    assert.ok(popupHtml.includes('CONEXION BT'), 'Debe mostrar la Falla Real anterior');
    assert.ok(popupHtml.includes('Cambio de conector'), 'Debe mostrar la nota de cierre previa');
    assert.ok(popupHtml.includes('Juan Perez'), 'Debe mostrar el técnico o empresa');
});

test('mapPopups.renderIncidentPopup sanitiza contenido malicioso en notas del historial', () => {
    const popups = require(path.join(root, 'assets', 'js', 'templates', 'mapPopups.js'));

    const locXss = {
        ticket: '2002',
        suministro: '999111',
        suministro_count: 2,
        suministro_reincidente: true,
        suministro_historial: [
            {
                t: '<img src=x onerror=alert(1)>',
                f: '04/11 10:00',
                falla: 'SUMINISTRO',
                fr: '<b>TEST</b>',
                nota: '<script>malicious()</script>Se ajustó bornera',
                tec: 'Tech & "Partner"'
            }
        ]
    };

    const popupHtml = popups.renderIncidentPopup(locXss);
    assert.ok(!popupHtml.includes('<script>malicious()</script>'), 'Debe neutralizar script tags');
    assert.ok(!popupHtml.includes('<img src=x'), 'Debe neutralizar img tags maliciosos');
    assert.ok(popupHtml.includes('&lt;script&gt;malicious()&lt;/script&gt;Se ajustó bornera') || popupHtml.includes('Se ajustó bornera'));
    assert.ok(popupHtml.includes('Tech &amp; &quot;Partner&quot;') || popupHtml.includes('Tech &amp;'));
});

test('mapPopups.renderIncidentPopup utiliza fallback desde globalThis.ejecutadosRecords si historial viene vacío', () => {
    const popups = require(path.join(root, 'assets', 'js', 'templates', 'mapPopups.js'));

    globalThis.ejecutadosRecords = [
        {
            ticket: '99991',
            suministro: '777000',
            fecha: '02/11 08:30',
            falla: 'SUMINISTRO',
            falla_real: 'BORNERA QUEMADA',
            nota: 'Se reemplazó bornera y reconectó servicio',
            tecnico: 'Carlos Vega / COBRA'
        }
    ];

    const locFallback = {
        ticket: '99992',
        suministro: '777000',
        suministro_count: 2,
        suministro_reincidente: true,
        suministro_historial: [] // vacío, debe poblarse con fallback
    };

    const popupHtml = popups.renderIncidentPopup(locFallback);
    assert.ok(popupHtml.includes('popup-reincidente-card'), 'Debe renderizar la tarjeta popup-reincidente-card');
    assert.ok(popupHtml.includes('99991'), 'Debe incluir el ticket de ejecutadosRecords');
    assert.ok(popupHtml.includes('BORNERA QUEMADA'), 'Debe incluir la falla real del ejecutado');
    assert.ok(popupHtml.includes('Carlos Vega'), 'Debe incluir el técnico del ejecutado');

    delete globalThis.ejecutadosRecords;
});

test('index.html renombra filtro único a 👤 S. Reincidentes tanto en barra como en modal', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

    // Debe existir 👤 S. Reincidentes en la barra del mapa
    assert.ok(html.includes('id="chkReincSuminMap"'), 'Debe existir chkReincSuminMap');
    assert.ok(html.includes('👤 S. Reincidentes'), 'Debe contener la etiqueta 👤 S. Reincidentes');
    assert.ok(!html.includes('<span>👤 Sum. ≥2</span>'), 'No debe quedar la etiqueta anterior 👤 Sum. ≥2 en la barra');

    // Debe existir en el modal
    assert.ok(html.includes('id="chkReincSuminModal"'), 'Debe existir chkReincSuminModal');
    assert.ok(!html.includes('<span>👤 Sum. ≥2 Fallas (7D)</span>'), 'No debe quedar la etiqueta anterior en el modal');

    // No debe haber filtros duplicados de suministros reincidentes
    const matchesMap = (html.match(/id="chkReincSuminMap"/g) || []).length;
    const matchesModal = (html.match(/id="chkReincSuminModal"/g) || []).length;
    assert.equal(matchesMap, 1, 'Debe haber exactamente 1 control en barra de mapa');
    assert.equal(matchesModal, 1, 'Debe haber exactamente 1 control en modal');
});

test('archivos CSS contienen estilos para .is-suministro-reincidente y .marker-reinc-badge', () => {
    const css1 = fs.readFileSync(path.join(root, 'assets', 'css', '10-map.css'), 'utf8');
    const css2 = fs.readFileSync(path.join(root, 'assets', 'css', '20-map-leaflet.css'), 'utf8');
    assert.ok(css1.includes('.is-suministro-reincidente') || css2.includes('.is-suministro-reincidente'), 'Debe incluir regla para .is-suministro-reincidente');
    assert.ok(css1.includes('.marker-reinc-badge') || css2.includes('.marker-reinc-badge'), 'Debe incluir regla para .marker-reinc-badge');
    assert.ok(css1.includes('.popup-reincidente-card') || css2.includes('.popup-reincidente-card'), 'Debe incluir regla para .popup-reincidente-card');
});
