const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '..', 'assets', 'js', 'components', 'pluz24hMatrix.js');
const Pluz24hMatrix = require(modulePath);

test('isOver24hInterval identifica correctamente intervalos >= 24h', () => {
    assert.equal(Pluz24hMatrix.isOver24hInterval('24-36h>'), true);
    assert.equal(Pluz24hMatrix.isOver24hInterval('36-48h>'), true);
    assert.equal(Pluz24hMatrix.isOver24hInterval('80h-∞>'), true);
    assert.equal(Pluz24hMatrix.isOver24hInterval('12-24h>'), false);
    assert.equal(Pluz24hMatrix.isOver24hInterval('0-2h'), false);
    assert.equal(Pluz24hMatrix.isOver24hInterval(''), false);
    assert.equal(Pluz24hMatrix.isOver24hInterval(null), false);
    assert.equal(Pluz24hMatrix.isOver24hInterval(undefined), false);
});

test('buildPluz24hSummary filtra >=24h, ordena intervalos, fallas, estados y pendingByCompany', () => {
    const records = [
        // Menores a 24h (deben excluirse)
        { ticket: 'T1', intervalo: '0-2h', falla: 'SUMINISTRO', estado_pluz: 'PENDIENTE', empresa: 'LARI' },
        { ticket: 'T2', intervalo: '12-24h>', falla: 'RED AEREA', estado_pluz: 'DERIVADO', empresa: 'COBRA' },

        // >= 24h en orden desordenado para probar ordenamiento
        { ticket: 'T3', intervalo: '80h-∞>', falla: 'POSTE', estado_pluz: 'PENDIENTE', empresa: 'LARI' },
        { ticket: 'T4', intervalo: '24-36h>', falla: 'RED AEREA', estado_pluz: 'en ejecucion', empresa: 'COBRA' },
        { ticket: 'T5', intervalo: '24-36h>', falla: 'CNX SUBTERRANEA', estado_pluz: 'PENDIENTE', empresa: 'LARI' },
        { ticket: 'T6', intervalo: '24-36h>', falla: 'RED AEREA', estado_pluz: 'DERIVADO', empresa: 'DOMINION' },
        { ticket: 'T7', intervalo: '36-48h>', falla: 'MEDIDOR', estado_pluz: '', empresa: 'COBRA' },
        { ticket: 'T8', intervalo: '36-48h>', falla: 'MEDIDOR', estado_pluz: 'PENDIENTE', empresa: 'LARI' },
        { ticket: 'T9', intervalo: '36-48h>', falla: 'ACOMETIDA', estado_pluz: 'PENDIENTE', empresa: 'COBRA' },
        { ticket: 'T10', intervalo: '80h-∞>', falla: 'POSTE', estado_pluz: 'PENDIENTE', empresa: '' }
    ];

    const summary = Pluz24hMatrix.buildPluz24hSummary(records);

    // Total de registros >= 24h: T3..T10 = 8
    assert.equal(summary.total, 8);
    // Total pendientes: T3, T5, T8, T9, T10 = 5
    assert.equal(summary.totalPending, 5);

    // Orden fijo de estados: DERIVADO, EN EJECUCION, PENDIENTE, luego alfabético (SIN REGISTRO)
    assert.deepEqual(summary.states, ['DERIVADO', 'EN EJECUCION', 'PENDIENTE', 'SIN REGISTRO']);

    // Orden numérico ascendente de intervalos: 24-36h>, 36-48h>, 80h-∞>
    assert.deepEqual(
        summary.intervals.map(i => i.interval),
        ['24-36h>', '36-48h>', '80h-∞>']
    );

    // Primer intervalo: 24-36h>
    const int24 = summary.intervals[0];
    assert.equal(int24.total, 3);
    assert.equal(int24.byState['DERIVADO'], 1);
    assert.equal(int24.byState['EN EJECUCION'], 1);
    assert.equal(int24.byState['PENDIENTE'], 1);
    assert.equal(int24.byState['SIN REGISTRO'], 0);

    // Fallas dentro de 24-36h> ordenadas alfabéticamente ('es')
    assert.deepEqual(
        int24.fallas.map(f => f.falla),
        ['CNX SUBTERRANEA', 'RED AEREA']
    );
    assert.equal(int24.fallas[0].total, 1);
    assert.equal(int24.fallas[0].byState['PENDIENTE'], 1);
    assert.equal(int24.fallas[1].total, 2);
    assert.equal(int24.fallas[1].byState['DERIVADO'], 1);
    assert.equal(int24.fallas[1].byState['EN EJECUCION'], 1);

    // pendingByCompany ordenado descendente por count y luego alfabético
    // LARI: 3 (T3, T5, T8), COBRA: 1 (T9), SIN EMPRESA: 1 (T10)
    assert.deepEqual(summary.pendingByCompany, [
        { empresa: 'LARI', count: 3 },
        { empresa: 'COBRA', count: 1 },
        { empresa: 'SIN EMPRESA', count: 1 }
    ]);
});

test('buildPluz24hSummary usa getTicketPluzStatus global si r.estado_pluz no está definido', () => {
    global.getTicketPluzStatus = (ticket) => (ticket === 'T99' ? '  en ejecucion  ' : 'SIN REGISTRO');
    try {
        const summary = Pluz24hMatrix.buildPluz24hSummary([
            { ticket: 'T99', intervalo: '24-36h>', falla: 'POSTE', empresa: 'LARI' }
        ]);
        assert.deepEqual(summary.states, ['EN EJECUCION']);
        assert.equal(summary.total, 1);
        assert.equal(summary.totalPending, 0);
    } finally {
        delete global.getTicketPluzStatus;
    }
});

test('formatPluz24hText formatea exactamente sin pendientes y con pendientes', () => {
    const emptySummary = { totalPending: 0, pendingByCompany: [] };
    assert.equal(
        Pluz24hMatrix.formatPluz24hText(emptySummary),
        'ESTADO DE TICKETS +24 HRS\nSIN TICKETS PENDIENTES'
    );

    const pendingSummary = {
        totalPending: 5,
        pendingByCompany: [
            { empresa: 'LARI', count: 3 },
            { empresa: 'COBRA', count: 2 }
        ]
    };
    assert.equal(
        Pluz24hMatrix.formatPluz24hText(pendingSummary),
        'ESTADO DE TICKETS +24 HRS\nTICKETS PENDIENTES:\n- LARI: 3\n- COBRA: 2'
    );
});
