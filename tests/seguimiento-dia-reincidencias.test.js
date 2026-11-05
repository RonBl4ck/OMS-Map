const test = require('node:test');
const assert = require('node:assert/strict');

// Importar módulo de seguimiento diario
const SeguimientoDia = require('../assets/js/22-seguimiento-dia.js');

test('isNetworkLevelFaultForSed: excluye fallas de cliente, conexión, acometida y suministro individual', () => {
    const { isNetworkLevelFaultForSed } = SeguimientoDia;
    assert.equal(typeof isNetworkLevelFaultForSed, 'function', 'isNetworkLevelFaultForSed debe ser una función');

    // Casos de exclusión por Falla Real
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'SUMINISTRO' }), false, 'Debe excluir SUMINISTRO');
    assert.equal(isNetworkLevelFaultForSed({ 'Falla Real': 'CONEXION BT' }), false, 'Debe excluir CONEXION BT');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'ACOMETIDA' }), false, 'Debe excluir ACOMETIDA');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'MEDIDOR' }), false, 'Debe excluir MEDIDOR');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'BORNERA' }), false, 'Debe excluir BORNERA');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'DOMICILIO' }), false, 'Debe excluir DOMICILIO');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'CLIENTE INTERIOR' }), false, 'Debe excluir CLIENTE INTERIOR');

    // Casos de exclusión por Falla OMS / Tipo de falla
    assert.equal(isNetworkLevelFaultForSed({ falla: 'SIN SERVICIO', alcance: 'SUMINISTRO', afectacion: 1 }), false, 'Debe excluir alcance SUMINISTRO con 1 afectado');
    assert.equal(isNetworkLevelFaultForSed({ falla: 'CNX AEREA', Clientes_Afectados: 1 }), false, 'Debe excluir CNX');
    assert.equal(isNetworkLevelFaultForSed({ alcance: 'SUMINISTRO', afectacion: 1 }), false, 'Debe excluir alcance SUMINISTRO <= 1');

    // Null / Undefined
    assert.equal(isNetworkLevelFaultForSed(null), false, 'Null debe retornar false');
    assert.equal(isNetworkLevelFaultForSed({}), false, 'Objeto vacío sin datos de red debe retornar false');
});

test('isNetworkLevelFaultForSed: acepta fallas a nivel de red (FUSIBLE a más)', () => {
    const { isNetworkLevelFaultForSed } = SeguimientoDia;

    // Falla Real a nivel de red
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'FUSIBLE' }), true, 'Debe incluir FUSIBLE');
    assert.equal(isNetworkLevelFaultForSed({ 'Falla Real': 'RED-SUBTERRANEA' }), true, 'Debe incluir RED-SUBTERRANEA');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'RED-AEREA' }), true, 'Debe incluir RED-AEREA');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'LLAVE' }), true, 'Debe incluir LLAVE');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'TRAFO' }), true, 'Debe incluir TRAFO');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'DAM' }), true, 'Debe incluir DAM');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'POSTE' }), true, 'Debe incluir POSTE');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'SUBESTACION' }), true, 'Debe incluir SUBESTACION');
    assert.equal(isNetworkLevelFaultForSed({ falla_real: 'CONDUCTOR CORTADO' }), true, 'Debe incluir CONDUCTOR');

    // Falla masiva por alcance o afectación
    assert.equal(isNetworkLevelFaultForSed({ alcance: 'SED', afectacion: 50 }), true, 'Alcance SED masivo debe ser red');
    assert.equal(isNetworkLevelFaultForSed({ falla: 'RED AEREA', alcance: 'SED' }), true, 'Falla RED AEREA debe ser red');
    assert.equal(isNetworkLevelFaultForSed({ afectacion: 12 }), true, 'Afectación > 1 clientes debe ser red');
});

test('computeLocalRecurrentSeds: filtra tickets con isNetworkLevelFaultForSed y genera fallasRealesBreakdown', () => {
    const { computeLocalRecurrentSeds } = SeguimientoDia;
    assert.equal(typeof computeLocalRecurrentSeds, 'function');

    const pendientes = [
        // SED-100: 1 de red (FUSIBLE) y 1 de cliente (SUMINISTRO)
        { ticket: 'TK-1', sed: 'SED-100', falla_real: 'FUSIBLE', distrito: 'COMAS', Contratista: 'LARI' },
        { ticket: 'TK-2', sed: 'SED-100', falla_real: 'SUMINISTRO', distrito: 'COMAS', Contratista: 'LARI' },
        // SED-200: solo fallas de cliente (no debe figurar)
        { ticket: 'TK-3', sed: 'SED-200', falla_real: 'CONEXION BT', distrito: 'SAN MARTIN', Contratista: 'LARI' }
    ];

    const ejecutados = [
        // SED-100: 2 de red adicionales (1 FUSIBLE, 1 RED-AEREA)
        { ticket: 'TK-4', sed: 'SED-100', falla_real: 'FUSIBLE', distrito: 'COMAS', Contratista: 'LARI' },
        { ticket: 'TK-5', sed: 'SED-100', falla_real: 'RED-AEREA', distrito: 'COMAS', Contratista: 'LARI' },
        // SED-300: 1 de red (RED-SUBTERRANEA)
        { ticket: 'TK-6', sed: 'SED-300', falla_real: 'RED-SUBTERRANEA', distrito: 'OLIVOS', Contratista: 'LARI' }
    ];

    const result = computeLocalRecurrentSeds(pendientes, ejecutados, { contractor: 'ALL' });

    // SED-200 no debe estar porque su única falla fue de cliente
    const sed200 = result.find(s => s.sed === 'SED-200');
    assert.equal(sed200, undefined, 'SED-200 con solo fallas de cliente debe ser excluida');

    // SED-100 debe tener 3 fallas de red (2 FUSIBLE + 1 RED-AEREA), ignorando el SUMINISTRO
    const sed100 = result.find(s => s.sed === 'SED-100');
    assert.ok(sed100, 'SED-100 debe estar presente');
    assert.equal(sed100.total7D, 3, 'SED-100 debe computar exactamente 3 fallas de red');
    assert.equal(sed100.pendientesActivos, 1, 'SED-100 debe tener 1 pendiente activo de red');
    assert.ok(sed100.fallasRealesBreakdown, 'SED-100 debe contener fallasRealesBreakdown');
    assert.ok(sed100.fallasRealesBreakdown.includes('FUSIBLE: 2'), 'Breakdown debe incluir FUSIBLE: 2');
    assert.ok(sed100.fallasRealesBreakdown.includes('RED-AEREA: 1'), 'Breakdown debe incluir RED-AEREA: 1');

    // SED-300
    const sed300 = result.find(s => s.sed === 'SED-300');
    assert.ok(sed300);
    assert.equal(sed300.total7D, 1);
    assert.ok(sed300.fallasRealesBreakdown.includes('RED-SUBTERRANEA: 1'));
});

test('computeLocalRecurrentSuministros: agrupa por suministro y almacena closures con Falla Real y notas', () => {
    const { computeLocalRecurrentSuministros } = SeguimientoDia;
    assert.equal(typeof computeLocalRecurrentSuministros, 'function');

    const pendientes = [
        {
            ticket: 'TK-P1',
            suministro: 'SUM-777',
            sed: 'SED-99',
            distrito: 'CALLAO',
            falla: 'SUMINISTRO SIN SERVICIO',
            'Falla Real': 'FUSIBLE',
            Contratista: 'COBRA'
        }
    ];

    const ejecutados = [
        {
            ticket: 'TK-E1',
            suministro: 'SUM-777',
            sed: 'SED-99',
            distrito: 'CALLAO',
            falla: 'SUMINISTRO SIN LUZ',
            'Falla Real': 'CONEXION BT',
            'Nota específica': 'Se reparó borne quemado en acometida',
            'Hora de restauración': '02/11/2026 14:30:00',
            Técnico: 'JUAN PEREZ',
            Contratista: 'COBRA'
        },
        {
            ticket: 'TK-E2',
            suministro: 'SUM-777',
            sed: 'SED-99',
            distrito: 'CALLAO',
            falla: 'SIN SERVICIO',
            'Falla Real': 'FUSIBLE',
            'Nota específica': 'Cambio de fusible aéreo 20A',
            'Hora de restauración': '01/11/2026 10:15:00',
            Técnico: 'CARLOS LOPEZ',
            Contratista: 'COBRA'
        }
    ];

    const result = computeLocalRecurrentSuministros(pendientes, ejecutados, { contractor: 'ALL' });
    const item = result.find(s => s.suministro === 'SUM-777');

    assert.ok(item, 'SUM-777 debe ser encontrado');
    assert.equal(item.total7D, 3, 'Total 7D debe ser 3 (1 pendiente + 2 ejecutados)');
    assert.equal(item.pendientesActivos, 1, 'Pendientes activos debe ser 1');
    assert.ok(Array.isArray(item.closures), 'closures debe ser un arreglo');
    assert.equal(item.closures.length, 2, 'Debe haber 2 cierres previos en closures');

    const c1 = item.closures.find(c => c.ticket === 'TK-E1');
    assert.ok(c1, 'Debe encontrarse el cierre TK-E1');
    assert.equal(c1.tecnico, 'JUAN PEREZ');
    assert.equal(c1.falla, 'SUMINISTRO SIN LUZ');
    assert.equal(c1.falla_real, 'CNX-AEREA');
    assert.equal(c1.nota, 'Se reparó borne quemado en acometida');

    const c2 = item.closures.find(c => c.ticket === 'TK-E2');
    assert.ok(c2, 'Debe encontrarse el cierre TK-E2');
    assert.equal(c2.tecnico, 'CARLOS LOPEZ');
    assert.equal(c2.falla_real, 'FUSIBLE');
    assert.equal(c2.nota, 'Cambio de fusible aéreo 20A');

    // Falla Real predominante o más reciente expuesta en item
    assert.ok(item.fallaReal || item.falla_real, 'item debe exponer fallaReal');
});

test('renderTableRow: genera fila de suministro con Falla Real y acordeón de cierres anteriores', () => {
    const { renderTableRow } = SeguimientoDia;
    assert.equal(typeof renderTableRow, 'function');

    const item = {
        suministro: 'SUM-12345',
        sed: 'SED-888',
        distrito: 'VENTANILLA',
        fallaReal: 'FUSIBLE',
        total7D: 2,
        pendientesActivos: 1,
        closures: [
            {
                ticket: 'TK-PREV-1',
                fecha: '02/11/2026 15:30:00',
                tecnico: 'PEDRO GOMEZ',
                falla: 'SUMINISTRO SIN SERVICIO',
                falla_real: 'FUSIBLE',
                nota: 'Cambio de fusible 25A en bornera de acometida aérea'
            }
        ]
    };

    const html = renderTableRow(item, true);
    assert.ok(html.includes('SUM-12345'), 'Debe incluir el código del suministro');
    assert.ok(html.includes('SED-888'), 'Debe incluir la SED');
    assert.ok(html.includes('VENTANILLA'), 'Debe incluir el distrito');
    assert.ok(html.includes('FUSIBLE'), 'Debe incluir la Falla Real');
    assert.ok(html.includes('segdia-btn-toggle-closures'), 'Debe tener el botón desplegable de cierres');
    assert.ok(html.includes('closures-row-SUM-12345'), 'Debe contener la sub-fila de acordeón');
    assert.ok(html.includes('TK-PREV-1'), 'El acordeón debe contener el ticket anterior');
    assert.ok(html.includes('PEDRO GOMEZ'), 'El acordeón debe incluir al técnico');
    assert.ok(html.includes('Cambio de fusible 25A en bornera de acometida aérea'), 'El acordeón debe incluir la nota completa');
});

test('renderTableRow: genera fila de SED con badge de desglose de Fallas Reales', () => {
    const { renderTableRow } = SeguimientoDia;

    const item = {
        sed: 'SED-444',
        distrito: 'PUENTE PIEDRA',
        alimentador: 'ALIM-01',
        total7D: 4,
        pendientesActivos: 2,
        fallasRealesBreakdown: 'FUSIBLE: 3, RED-AEREA: 1'
    };

    const html = renderTableRow(item, false);
    assert.ok(html.includes('SED-444'), 'Debe incluir el código de SED');
    assert.ok(html.includes('PUENTE PIEDRA'), 'Debe incluir el distrito');
    assert.ok(html.includes('ALIM-01'), 'Debe incluir el alimentador');
    assert.ok(html.includes('FUSIBLE: 3, RED-AEREA: 1'), 'Debe incluir el badge con el desglose de fallas reales');
});

test('normalizeFaultCategory: estandariza categorías unificando espacios y guiones', () => {
    const { normalizeFaultCategory } = SeguimientoDia;

    assert.equal(normalizeFaultCategory('CNX AEREA'), 'CNX-AEREA');
    assert.equal(normalizeFaultCategory('CNX-AEREA'), 'CNX-AEREA');
    assert.equal(normalizeFaultCategory('CNX SUBTERRANEA'), 'CNX-SUBTERRANEA');
    assert.equal(normalizeFaultCategory('CNX-SUBTERRANEA'), 'CNX-SUBTERRANEA');
    assert.equal(normalizeFaultCategory('RED AEREA'), 'RED-AEREA');
    assert.equal(normalizeFaultCategory('RED-AEREA'), 'RED-AEREA');
    assert.equal(normalizeFaultCategory('RED SUBTERRANEA'), 'RED-SUBTERRANEA');
    assert.equal(normalizeFaultCategory('RED-SUBTERRANEA'), 'RED-SUBTERRANEA');
    assert.equal(normalizeFaultCategory('TODO NORMAL EN TOMA'), 'DOMICILIO');

    // Casos específicos del dropdown de objetos técnicos
    assert.equal(normalizeFaultCategory('A'), '', 'Debe descartar inicial o letra A');
    assert.equal(normalizeFaultCategory('ACOMETIDA'), 'CNX-AEREA');
    assert.equal(normalizeFaultCategory('ACOMETIDA-AÉREA'), 'CNX-AEREA');
    assert.equal(normalizeFaultCategory('ACOMETIDA-SUBTERRÁNEA'), 'CNX-SUBTERRANEA');
    assert.equal(normalizeFaultCategory('BANCO-DE-MEDIDORES'), 'CNX-AEREA');
    assert.equal(normalizeFaultCategory('BORNES'), 'CNX-AEREA');
    assert.equal(normalizeFaultCategory('CONECTOR'), 'CNX-AEREA');
    assert.equal(normalizeFaultCategory('CABLE'), 'RED-AEREA');
    assert.equal(normalizeFaultCategory('CABLE-ALUMINIO'), 'RED-AEREA');
    assert.equal(normalizeFaultCategory('CABLE-AUTOSOPORTADO'), 'RED-AEREA');
    assert.equal(normalizeFaultCategory('CABLE-COMUNICACION'), 'RED-AEREA');
    assert.equal(normalizeFaultCategory('CABLE-DE-COMUNICACIÓN---PASANTE'), 'RED-AEREA');
    assert.equal(normalizeFaultCategory('CABLE-NKY'), 'RED-SUBTERRANEA');
    assert.equal(normalizeFaultCategory('CABLE-NYY'), 'RED-SUBTERRANEA');
    assert.equal(normalizeFaultCategory('CABLE-UNIPOLAR-COBRE'), 'RED-SUBTERRANEA');
    assert.equal(normalizeFaultCategory('SUMINISTRO SP'), 'DOMICILIO');
});

test('renderTableRow: genera fila de SED con acordeón desplegable de cierres anteriores', () => {
    const { renderTableRow } = SeguimientoDia;

    const item = {
        sed: '04584A',
        distrito: 'COMAS',
        alimentador: 'AL-05',
        total7D: 3,
        pendientesActivos: 1,
        fallasRealesBreakdown: 'FUSIBLE: 2',
        closures: [
            {
                ticket: '2600210011',
                fecha: '03/11 15:40',
                tecnico: 'PEDRO QUISPE / LARI',
                llave: '04584A-03SP',
                falla: 'FUSIBLE',
                falla_real: 'FUSIBLE',
                nota: 'Se encontró portafusible sulfatado y fusible de 80A abierto en fase T'
            }
        ]
    };

    const html = renderTableRow(item, false);
    assert.ok(html.includes('04584A'), 'Debe incluir el código de SED');
    assert.ok(html.includes('segdia-btn-toggle-closures'), 'Debe incluir botón para desplegar cierres');
    assert.ok(html.includes('closures-row-sed-04584A'), 'Debe incluir la fila de detalle del acordeón de SED');
    assert.ok(html.includes('2600210011'), 'Debe incluir el ticket anterior');
    assert.ok(html.includes('PEDRO QUISPE'), 'Debe incluir al técnico anterior');
    assert.ok(html.includes('04584A-03SP'), 'Debe incluir la llave o alimentador');
    assert.ok(html.includes('portafusible sulfatado'), 'Debe incluir la nota específica anterior');
});

