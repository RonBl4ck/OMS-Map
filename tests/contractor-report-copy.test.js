const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Cargar el módulo contractor-report
const scriptContent = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', '25-contractor-report.js'), 'utf8');

// Ejecutar en contexto simulado de Node para obtener las funciones exportadas
const context = {
    window: {},
    document: {},
    navigator: {}
};
const fn = new Function('window', 'document', 'navigator', scriptContent + '\nreturn window.ContractorReport;');
const ContractorReport = fn(context.window, context.document, context.navigator);

test('buildContractorSummaryData calcula correctamente reparaciones, reclamos y estados de SLA', () => {
    const mockRecords = [
        // Reparaciones (Red / CNX)
        { ticket: '1001', empresa: 'DOMINION', falla: 'RED AEREA', duracion: 14, estado: 'Pendiente', prioridad: 'NORMAL', sla: { pct: 150 } },
        { ticket: '1002', empresa: 'DOMINION', falla: 'CNX SUBTERRANEA', duracion: 9, estado: 'Pendiente', prioridad: 'NORMAL', sla: { pct: 110 } },
        { ticket: '1003', empresa: 'DOMINION', falla: 'RED SUBTERRANEA', duracion: 25, estado: 'En Ejecución', prioridad: 'RIESGO', sla: { pct: 200 } },
        { ticket: '1004', empresa: 'DOMINION', falla: 'POSTE', duracion: 6, estado: 'Pendiente', prioridad: 'NORMAL', sla: { pct: 75 } },
        
        // Reclamos (Suministro / Medidor)
        { ticket: '2001', empresa: 'DOMINION', falla: 'SUMINISTRO', duracion: 5, estado: 'Pendiente', prioridad: 'NORMAL', sla: { pct: 120 } },
        { ticket: '2002', empresa: 'DOMINION', falla: 'SUMINISTRO', duracion: 2, estado: 'En Ejecución', prioridad: 'NORMAL', sla: { pct: 50 } },
        
        // Registro de otra empresa (debe ignorarse si no coincide o aislarse)
        { ticket: '3001', empresa: 'LARI', falla: 'SUMINISTRO', duracion: 1, estado: 'Pendiente', prioridad: 'NORMAL', sla: { pct: 25 } }
    ];

    const refDate = new Date('2026-10-12T12:38:00');
    const summary = ContractorReport.buildContractorSummaryData('DOMINION', mockRecords.filter(r => r.empresa === 'DOMINION'), refDate);

    assert.equal(summary.contractor, 'DOMINION');
    assert.equal(summary.total, 6);
    assert.equal(summary.reparaciones, 4); // RED AEREA, CNX SUBT, RED SUBT, POSTE
    assert.equal(summary.reclamos, 2);     // 2 SUMINISTRO
    assert.equal(summary.mas24h, 1);        // ticket 1003 tiene 25h
    assert.equal(summary.enRiesgo, 2);      // ticket 1003 (prioridad RIESGO) + ticket 1004 (sla pct 75%)
    assert.equal(summary.oaFueraPlazo, 2);  // RED AEREA (14h > 12h), RED SUBTERRANEA (25h > 12h)
    assert.equal(summary.cnxFueraPlazo, 1); // CNX SUBTERRANEA (9h > 8h)
    assert.equal(summary.reclamosFueraPlazo, 1); // SUMINISTRO (5h > 4h)
});

test('buildContractorSummaryText formatea el mensaje idéntico a la plantilla requerida', () => {
    const summaryData = {
        contractor: 'DOMINION',
        saludo: 'Buenas tardes',
        fechaStr: '12/10/2026 12:38',
        reparaciones: 43,
        reclamos: 24,
        mas24h: 8,
        enRiesgo: 3,
        oaFueraPlazo: 13,
        cnxFueraPlazo: 6,
        reclamosFueraPlazo: 0
    };

    const text = ContractorReport.buildContractorSummaryText(summaryData);
    assert.match(text, /Estimados\s+Buenas tardes\s+DOMINION/);
    assert.match(text, /Reporte de Pendientes\s+12\/10\/2026 12:38/);
    assert.match(text, /· Reparaciones:\s*43/);
    assert.match(text, /· Reclamos:\s*24/);
    assert.match(text, /TICKETS \+24 HRS:\s*8/);
    assert.match(text, /TICKETS EN RIESGO:\s*3/);
    assert.match(text, /· OA FUERA DE PLAZO \(>12 hrs\):\s*13/);
    assert.match(text, /· CNX FUERA DE PLAZO \(>8 hrs\):\s*6/);
    assert.match(text, /· RECLAMOS FUERA DE PLAZO \(>4 hrs\):\s*0/);
});

test('HTML y Dashboard integran los 3 botones pequeños de reporte por contratista', () => {
    const htmlContent = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
    const dashboardJs = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', '20-dashboard.js'), 'utf8');
    const reportJs = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', '25-contractor-report.js'), 'utf8');

    assert.match(htmlContent, /id="btnCopyContractorReport"/);
    assert.match(htmlContent, /id="btnCopyContractorCharts"/);
    assert.match(htmlContent, /id="btnCopyContractorText"/);
    assert.match(htmlContent, /assets\/js\/25-contractor-report\.js/);
    assert.match(dashboardJs, /btnCopyContractorCharts/);
    assert.match(dashboardJs, /updateCopyContractorButtonState/);
    assert.match(reportJs, /onlyCharts/);
    assert.match(reportJs, /mode === 'charts'/);
});

test('los botones de reporte por contratista se muestran y operan exclusivamente para el perfil PLUZ (admin)', () => {
    const authJs = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', '60-auth.js'), 'utf8');
    const dashboardJs = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'js', '20-dashboard.js'), 'utf8');

    assert.match(authJs, /contractorReportBtnsContainer[\s\S]*?isAdmin\s*\?\s*'inline-flex'\s*:\s*'none'/);
    assert.match(dashboardJs, /contractorReportBtnsContainer/);
    assert.match(dashboardJs, /if\s*\(!isPluz\)\s*return/);
});
