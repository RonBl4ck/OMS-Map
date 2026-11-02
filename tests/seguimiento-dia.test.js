const test = require('node:test');
const assert = require('node:assert/strict');
const SeguimientoDiaService = require('../assets/js/services/seguimientoDiaService.js');

test('parseDateTime: parsea fechas en múltiples formatos válidos', () => {
    // Formato DD/MM/YYYY HH:mm:ss
    const p1 = SeguimientoDiaService.parseDateTime('02/11/2026 13:54:47');
    assert.ok(p1, 'Debe parsear 02/11/2026 13:54:47');
    assert.equal(p1.dateStr, '2/11/2026');
    assert.equal(p1.hour, 13);
    assert.ok(p1.timestamp > 0);

    // Formato D/M/YYYY HH:mm:ss sin ceros iniciales
    const p2 = SeguimientoDiaService.parseDateTime('2/11/2026 10:38:50');
    assert.ok(p2, 'Debe parsear 2/11/2026 10:38:50');
    assert.equal(p2.dateStr, '2/11/2026');
    assert.equal(p2.hour, 10);

    // Formato YYYY-MM-DD HH:mm:ss
    const p3 = SeguimientoDiaService.parseDateTime('2026-11-02 13:54:47');
    assert.ok(p3, 'Debe parsear 2026-11-02 13:54:47');
    assert.equal(p3.dateStr, '2/11/2026');
    assert.equal(p3.hour, 13);

    // Formato ISO con T
    const pIso = SeguimientoDiaService.parseDateTime('2026-11-02T08:15:00');
    assert.ok(pIso);
    assert.equal(pIso.dateStr, '2/11/2026');
    assert.equal(pIso.hour, 8);

    // Solo fecha sin hora
    const p4 = SeguimientoDiaService.parseDateTime('02/11/2026');
    assert.ok(p4);
    assert.equal(p4.dateStr, '2/11/2026');
    assert.equal(p4.hour, 0);

    const p5 = SeguimientoDiaService.parseDateTime('2026-11-02');
    assert.ok(p5);
    assert.equal(p5.dateStr, '2/11/2026');
    assert.equal(p5.hour, 0);

    // Formato 12 horas AM/PM
    const pPm = SeguimientoDiaService.parseDateTime('02/11/2026 02:30:00 PM');
    assert.ok(pPm);
    assert.equal(pPm.hour, 14);

    const pAm = SeguimientoDiaService.parseDateTime('02/11/2026 12:10:00 AM');
    assert.ok(pAm);
    assert.equal(pAm.hour, 0);

    const pNoon = SeguimientoDiaService.parseDateTime('02/11/2026 12:10:00 PM');
    assert.ok(pNoon);
    assert.equal(pNoon.hour, 12);

    // Instancia de Date
    const dObj = new Date(2026, 10, 2, 16, 45, 0);
    const pDate = SeguimientoDiaService.parseDateTime(dObj);
    assert.ok(pDate);
    assert.equal(pDate.dateStr, '2/11/2026');
    assert.equal(pDate.hour, 16);
});

test('parseDateTime: rechaza entradas inválidas', () => {
    assert.equal(SeguimientoDiaService.parseDateTime(null), null);
    assert.equal(SeguimientoDiaService.parseDateTime(undefined), null);
    assert.equal(SeguimientoDiaService.parseDateTime(''), null);
    assert.equal(SeguimientoDiaService.parseDateTime('invalido'), null);
    // Fecha imposible (31 de febrero)
    assert.equal(SeguimientoDiaService.parseDateTime('31/02/2026 12:00:00'), null);
    // Mes fuera de rango
    assert.equal(SeguimientoDiaService.parseDateTime('15/13/2026'), null);
    // Hora fuera de rango
    assert.equal(SeguimientoDiaService.parseDateTime('02/11/2026 25:00:00'), null);
});

test('normalizeDate: normaliza a formato D/M/YYYY', () => {
    assert.equal(SeguimientoDiaService.normalizeDate('02/11/2026 13:54:47'), '2/11/2026');
    assert.equal(SeguimientoDiaService.normalizeDate('2/11/2026'), '2/11/2026');
    assert.equal(SeguimientoDiaService.normalizeDate('2026-11-02 10:00:00'), '2/11/2026');
    assert.equal(SeguimientoDiaService.normalizeDate('05/04/2026'), '5/4/2026');
    assert.equal(SeguimientoDiaService.normalizeDate('invalid'), null);
});

test('getAvailableDays: retorna fechas únicas ordenadas descendentemente', () => {
    const pendientes = [
        { 'Hora de inicio': '02/11/2026 09:00:00' },
        { 'Hora de inicio': '01/11/2026 14:00:00' },
        { 'Hora de inicio': '30/10/2026 08:00:00' }
    ];
    const ejecutados = [
        { 'Hora de restauración': '02/11/2026 11:00:00', 'Hora de inicio': '02/11/2026 09:30:00' },
        { 'Hora de restauración': '31/10/2026 16:00:00', 'Hora de inicio': '31/10/2026 12:00:00' },
        { 'Hora de restauración': '28/10/2026 18:00:00' }
    ];

    const days = SeguimientoDiaService.getAvailableDays(ejecutados, pendientes);
    assert.ok(Array.isArray(days));
    assert.deepEqual(days, ['2/11/2026', '1/11/2026', '31/10/2026', '30/10/2026', '28/10/2026']);
});

test('getAvailableDays: respeta límite de días disponibles', () => {
    const records = [
        { 'Hora de inicio': '01/11/2026 10:00:00' },
        { 'Hora de inicio': '02/11/2026 10:00:00' },
        { 'Hora de inicio': '03/11/2026 10:00:00' },
        { 'Hora de inicio': '04/11/2026 10:00:00' }
    ];
    const top2 = SeguimientoDiaService.getAvailableDays([], records, 2);
    assert.equal(top2.length, 2);
    assert.deepEqual(top2, ['4/11/2026', '3/11/2026']);
});

test('calculateDailyProductivity: balance de ingresos, cierres intradía y backlog', () => {
    const pendientes = [
        // Ticket 1: Entró hoy (2/11/2026) a las 08:30 y sigue pendiente
        {
            ticket: 'INC-001',
            'Hora de inicio': '02/11/2026 08:30:00',
            Contratista: 'LARI',
            'Tipo de Equipo probable de falla': 'Acometida'
        },
        // Ticket 2: Entró ayer (1/11/2026) y sigue pendiente (no debe sumar a ingresos de hoy)
        {
            ticket: 'INC-002',
            'Hora de inicio': '01/11/2026 16:00:00',
            Contratista: 'LARI',
            'Tipo de Equipo probable de falla': 'Acometida'
        }
    ];

    const ejecutados = [
        // Ticket 3: Entró hoy a las 09:00 y se cerró hoy a las 11:30 (Intradía, TTR = 2.5h)
        {
            ticket: 'INC-003',
            'Hora de inicio': '02/11/2026 09:00:00',
            'Hora de restauración': '02/11/2026 11:30:00',
            Contratista: 'LARI',
            'Tipo de Equipo probable de falla': 'Acometida'
        },
        // Ticket 4: Entró ayer 1/11/2026 22:00 y se cerró hoy a las 02:00 (Backlog, TTR = 4.0h)
        {
            ticket: 'INC-004',
            'Hora de inicio': '01/11/2026 22:00:00',
            'Hora de restauración': '02/11/2026 02:00:00',
            Contratista: 'LARI',
            'Tipo de Equipo probable de falla': 'Acometida'
        },
        // Ticket 5: Entró hoy a las 15:00 pero se cerrará mañana (Ingreso de hoy, no cierre de hoy)
        {
            ticket: 'INC-005',
            'Hora de inicio': '02/11/2026 15:00:00',
            'Hora de restauración': '03/11/2026 09:00:00',
            Contratista: 'LARI',
            'Tipo de Equipo probable de falla': 'Acometida'
        },
        // Ticket 6: Entró y se cerró ayer 1/11/2026 (No debe afectar hoy)
        {
            ticket: 'INC-006',
            'Hora de inicio': '01/11/2026 10:00:00',
            'Hora de restauración': '01/11/2026 12:00:00',
            Contratista: 'LARI',
            'Tipo de Equipo probable de falla': 'Acometida'
        }
    ];

    const stats = SeguimientoDiaService.calculateDailyProductivity(pendientes, ejecutados, {
        date: '02/11/2026',
        contractor: '*',
        workType: '*'
    });

    // Ingresos: INC-001 (08:30), INC-003 (09:00), INC-005 (15:00) => 3
    assert.equal(stats.ingresosTotal, 3, 'Ingresos totales debe ser 3');

    // Cierres totales: INC-003 (11:30), INC-004 (02:00) => 2
    assert.equal(stats.cierresTotal, 2, 'Cierres totales debe ser 2');

    // Cierres Intradía: INC-003 => 1
    assert.equal(stats.cierresIntradia, 1, 'Cierres intradía debe ser 1');

    // Cierres Backlog: INC-004 => 1
    assert.equal(stats.cierresBacklog, 1, 'Cierres backlog debe ser 1');

    // Pendientes del día: INC-001 => 1
    assert.equal(stats.pendientesDelDia, 1, 'Pendientes del día debe ser 1');

    // Balance neto: cierresTotal - ingresosTotal = 2 - 3 = -1
    assert.equal(stats.balanceNeto, -1, 'Balance neto debe ser -1');

    // TTR promedio: (2.5 + 4.0) / 2 = 3.25 => 3.3 horas
    assert.equal(stats.ttrPromedioHoras, 3.3, 'TTR promedio debe ser 3.3 horas');
});

test('calculateDailyProductivity: filtros por contratista y workType', () => {
    const pendientes = [
        {
            ticket: 'INC-LARI',
            'Hora de inicio': '02/11/2026 10:00:00',
            Empresa: 'LARI',
            Skill: 'Acometida'
        },
        {
            ticket: 'INC-CAM',
            'Hora de inicio': '02/11/2026 10:00:00',
            Empresa: 'CAM',
            Skill: 'Acometida'
        },
        {
            ticket: 'INC-LARI-MT',
            'Hora de inicio': '02/11/2026 10:00:00',
            Empresa: 'LARI',
            Skill: 'Media Tensión'
        }
    ];

    // Filtrar por contratista LARI
    const statsLari = SeguimientoDiaService.calculateDailyProductivity(pendientes, [], {
        date: '2/11/2026',
        contractor: 'LARI',
        workType: '*'
    });
    assert.equal(statsLari.ingresosTotal, 2);

    // Filtrar por contratista CAM
    const statsCam = SeguimientoDiaService.calculateDailyProductivity(pendientes, [], {
        date: '2/11/2026',
        contractor: 'CAM',
        workType: '*'
    });
    assert.equal(statsCam.ingresosTotal, 1);

    // Filtrar por Skill / WorkType 'Media Tensión'
    const statsMT = SeguimientoDiaService.calculateDailyProductivity(pendientes, [], {
        date: '2/11/2026',
        contractor: '*',
        workType: 'Media Tensión'
    });
    assert.equal(statsMT.ingresosTotal, 1);

    // Filtro combinado LARI + Acometida
    const statsCombo = SeguimientoDiaService.calculateDailyProductivity(pendientes, [], {
        date: '2/11/2026',
        contractor: 'LARI',
        workType: 'Acometida'
    });
    assert.equal(statsCombo.ingresosTotal, 1);
});

test('calculateDailyProductivity: distribución horaria completa 0..23', () => {
    const pendientes = [
        { 'Hora de inicio': '02/11/2026 00:15:00' },
        { 'Hora de inicio': '02/11/2026 14:20:00' },
        { 'Hora de inicio': '02/11/2026 14:45:00' },
        { 'Hora de inicio': '02/11/2026 23:59:00' }
    ];
    const ejecutados = [
        {
            'Hora de inicio': '02/11/2026 08:00:00',
            'Hora de restauración': '02/11/2026 10:15:00'
        },
        {
            'Hora de inicio': '01/11/2026 18:00:00',
            'Hora de restauración': '02/11/2026 10:45:00'
        }
    ];

    const stats = SeguimientoDiaService.calculateDailyProductivity(pendientes, ejecutados, {
        date: '2/11/2026'
    });

    assert.equal(stats.hourlyDistribution.length, 24);

    // Hora 00: 1 ingreso
    assert.equal(stats.hourlyDistribution[0].ingresos, 1);
    assert.equal(stats.hourlyDistribution[0].cierres, 0);

    // Hora 08: 1 ingreso (del ejecutado)
    assert.equal(stats.hourlyDistribution[8].ingresos, 1);

    // Hora 10: 2 cierres
    assert.equal(stats.hourlyDistribution[10].cierres, 2);

    // Hora 14: 2 ingresos
    assert.equal(stats.hourlyDistribution[14].ingresos, 2);

    // Hora 23: 1 ingreso
    assert.equal(stats.hourlyDistribution[23].ingresos, 1);

    // Suma total de ingresos y cierres en el arreglo coincide
    const totalIngresosDist = stats.hourlyDistribution.reduce((acc, h) => acc + h.ingresos, 0);
    const totalCierresDist = stats.hourlyDistribution.reduce((acc, h) => acc + h.cierres, 0);
    assert.equal(totalIngresosDist, stats.ingresosTotal);
    assert.equal(totalCierresDist, stats.cierresTotal);
});

test('getRecurrentSeds7D: agrupa, filtra por 7 días y ordena priorizando pendientes activos', () => {
    const pendientes = [
        // SED-A: 2 pendientes activos
        {
            SED: 'SED-A',
            ticket: 'T-A1',
            Distrito: 'COMAS',
            Alimentador: 'ALIM-01',
            'Hora de inicio': '02/11/2026 10:00:00'
        },
        {
            SED: 'SED-A',
            ticket: 'T-A2',
            Distrito: 'COMAS',
            Alimentador: 'ALIM-01',
            'Hora de inicio': '02/11/2026 11:00:00'
        },
        // SED-B: 1 pendiente activo
        {
            SED: 'SED-B',
            ticket: 'T-B1',
            Distrito: 'LOS OLIVOS',
            Alimentador: 'ALIM-02',
            'Hora de inicio': '01/11/2026 12:00:00'
        }
    ];

    const ejecutados = [
        // SED-A: 1 cierre hace 2 días (dentro de los 7 días)
        {
            SED: 'SED-A',
            ticket: 'T-A3',
            Distrito: 'COMAS',
            Alimentador: 'ALIM-01',
            'Hora de restauración': '31/10/2026 15:00:00'
        },
        // SED-C: 0 pendientes activos, pero 5 cierres en los últimos 7 días
        {
            SED: 'SED-C',
            ticket: 'T-C1',
            Distrito: 'SAN MARTIN',
            Alimentador: 'ALIM-03',
            'Hora de restauración': '02/11/2026 09:00:00'
        },
        {
            SED: 'SED-C',
            ticket: 'T-C2',
            Distrito: 'SAN MARTIN',
            Alimentador: 'ALIM-03',
            'Hora de restauración': '01/11/2026 09:00:00'
        },
        {
            SED: 'SED-C',
            ticket: 'T-C3',
            Distrito: 'SAN MARTIN',
            Alimentador: 'ALIM-03',
            'Hora de restauración': '30/10/2026 09:00:00'
        },
        {
            SED: 'SED-C',
            ticket: 'T-C4',
            Distrito: 'SAN MARTIN',
            Alimentador: 'ALIM-03',
            'Hora de restauración': '29/10/2026 09:00:00'
        },
        {
            SED: 'SED-C',
            ticket: 'T-C5',
            Distrito: 'SAN MARTIN',
            Alimentador: 'ALIM-03',
            'Hora de restauración': '28/10/2026 09:00:00'
        },
        // SED-D: 1 cierre hace 20 días (fuera de la ventana de 7 días, NO debe aparecer)
        {
            SED: 'SED-D',
            ticket: 'T-D1',
            Distrito: 'CALLAO',
            Alimentador: 'ALIM-04',
            'Hora de restauración': '10/10/2026 12:00:00'
        }
    ];

    const recurrents = SeguimientoDiaService.getRecurrentSeds7D(pendientes, ejecutados, {
        date: '02/11/2026'
    });

    // SED-D no debe aparecer porque su cierre fue hace más de 7 días y tiene 0 pendientes
    assert.equal(recurrents.some(s => s.sed === 'SED-D'), false, 'SED-D no debe aparecer');

    // Total de SEDs en resultado: SED-A, SED-B, SED-C
    assert.equal(recurrents.length, 3);

    // Criterio de orden:
    // 1° SEDs con pendientesActivos > 0 ordenadas por total7D descendente:
    //    - SED-A tiene pendientesActivos = 2, total7D = 3 (2 pendientes + 1 cerrado)
    //    - SED-B tiene pendientesActivos = 1, total7D = 1 (1 pendiente + 0 cerrados)
    // 2° SEDs con pendientesActivos == 0 ordenadas por total7D descendente:
    //    - SED-C tiene pendientesActivos = 0, total7D = 5
    assert.equal(recurrents[0].sed, 'SED-A', 'SED-A debe ir primero por tener pendientes activos y total 3');
    assert.equal(recurrents[0].pendientesActivos, 2);
    assert.equal(recurrents[0].cerrados7D, 1);
    assert.equal(recurrents[0].total7D, 3);
    assert.equal(recurrents[0].distrito, 'COMAS');
    assert.equal(recurrents[0].alimentador, 'ALIM-01');
    assert.deepEqual(recurrents[0].tickets.sort(), ['T-A1', 'T-A2', 'T-A3'].sort());

    assert.equal(recurrents[1].sed, 'SED-B', 'SED-B debe ir segundo por tener pendientesActivos > 0');
    assert.equal(recurrents[1].pendientesActivos, 1);
    assert.equal(recurrents[1].total7D, 1);

    assert.equal(recurrents[2].sed, 'SED-C', 'SED-C va después al tener 0 pendientes activos');
    assert.equal(recurrents[2].pendientesActivos, 0);
    assert.equal(recurrents[2].cerrados7D, 5);
    assert.equal(recurrents[2].total7D, 5);
});
