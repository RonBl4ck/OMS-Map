/**
 * 25-contractor-report.js
 * Generador de Reporte Operativo por Contratista (Imagen HiDPI en Canvas + Texto Estructurado)
 * Diseñado para exportación y copiado directo al portapapeles (compatible con WhatsApp / Teams / Correo).
 */
(function (global) {
    'use strict';

    // Paleta oficial de colores OMS Pluz
    const COLOR_EJECUCION = '#0284c7'; // Azul cielo / ejecución
    const COLOR_PENDIENTE = '#ea580c'; // Naranja / pendiente
    const COLOR_FONDO_GRID = '#f8fafc';
    const COLOR_LINEA = '#e2e8f0';
    const COLOR_TEXTO_MAIN = '#0f172a';
    const COLOR_TEXTO_MUTED = '#64748b';

    /**
     * Determina el saludo según la hora del día.
     */
    function getSaludo(date) {
        const h = date.getHours();
        if (h < 12) return 'Buenos días';
        if (h < 19) return 'Buenas tardes';
        return 'Buenas noches';
    }

    /**
     * Formatea fecha y hora como DD/MM/AAAA HH:MM
     */
    function formatDateTime(date) {
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${d}/${m}/${y} ${hh}:${mm}`;
    }

    /**
     * Clasifica si una falla pertenece a "Reclamos" (usuario/suministro individual)
     * o a "Reparaciones" (red aérea, subterránea, conexiones de distribución).
     */
    function isReclamo(falla) {
        const f = String(falla || '').toUpperCase();
        return f.includes('SUMINISTRO') || f.includes('MEDIDOR') || f.includes('ACOMETIDA');
    }

    /**
     * Extrae horas de duración de forma numérica robusta
     */
    function extractHours(record) {
        if (record && record.duracion !== undefined && record.duracion !== null && record.duracion !== '') {
            const num = parseFloat(String(record.duracion).replace(',', '.'));
            if (!isNaN(num)) return num;
        }
        if (record && record.intervalo) {
            const match = String(record.intervalo).match(/(\d+)/);
            if (match) return parseInt(match[1], 10);
        }
        return 0;
    }

    /**
     * Construye las métricas operativas para el contratista especificado.
     */
    function buildContractorSummaryData(contractorName, records, referenceDate) {
        const refDate = referenceDate instanceof Date ? referenceDate : new Date();
        const contractorRecords = (records || []).filter(r => {
            if (!contractorName || contractorName === 'TODOS' || contractorName === '*') return true;
            return String(r.empresa || '').trim().toUpperCase() === String(contractorName).trim().toUpperCase();
        });

        let reparaciones = 0;
        let reclamos = 0;
        let mas24h = 0;
        let enRiesgo = 0;
        let oaFueraPlazo = 0;
        let cnxFueraPlazo = 0;
        let reclamosFueraPlazo = 0;
        let dentroPlazo = 0;
        let fueraPlazo = 0;

        contractorRecords.forEach(r => {
            const falla = String(r.falla || '').toUpperCase();
            const prioridad = String(r.prioridad || '').toUpperCase();
            const dur = extractHours(r);
            const pct = r.sla && r.sla.pct !== undefined ? Number(r.sla.pct) : 0;
            const isOverdue = pct >= 100;

            if (isOverdue) {
                fueraPlazo++;
            } else {
                dentroPlazo++;
            }

            // Reparaciones vs Reclamos
            if (isReclamo(falla)) {
                reclamos++;
            } else {
                reparaciones++;
            }

            // Duración mayor a 24 horas
            const is24plus = dur >= 24 || String(r.intervalo || '').includes('>24') || String(r.intervalo || '').includes('24-48');
            if (is24plus) {
                mas24h++;
            }

            // Tickets en riesgo: prioridad de riesgo o en rango de advertencia SLA (75% a 99%)
            const isRisk = prioridad.includes('RIESGO') || prioridad.includes('VIDA') || prioridad.includes('PELIGRO') || (pct >= 75 && pct < 100);
            if (isRisk) {
                enRiesgo++;
            }

            // Fuera de plazo por tipología
            if (falla.includes('SUMINISTRO') || falla.includes('FUSIBLE')) {
                // Reclamos SLA base 4h
                if (dur > 4 || isOverdue) reclamosFueraPlazo++;
            } else if (falla.includes('CNX')) {
                // CNX SLA base 8h
                if (dur > 8 || (isOverdue && !falla.includes('RED'))) cnxFueraPlazo++;
            } else {
                // Red / OA SLA base 12h o red general
                if (dur > 12 || isOverdue) oaFueraPlazo++;
            }
        });

        return {
            contractor: contractorName || 'CONTRATISTA',
            saludo: getSaludo(refDate),
            fechaStr: formatDateTime(refDate),
            total: contractorRecords.length,
            dentroPlazo,
            fueraPlazo,
            reparaciones,
            reclamos,
            mas24h,
            enRiesgo,
            oaFueraPlazo,
            cnxFueraPlazo,
            reclamosFueraPlazo
        };
    }

    /**
     * Construye el texto formateado idéntico a la plantilla operativa.
     */
    function buildContractorSummaryText(summaryData) {
        return [
            `Estimados   ${summaryData.saludo}       ${summaryData.contractor}`,
            `Reporte de Pendientes           ${summaryData.fechaStr}`,
            `  · Reparaciones: ${summaryData.reparaciones}`,
            `  · Reclamos: ${summaryData.reclamos}`,
            `TICKETS +24 HRS:   ${summaryData.mas24h}`,
            `TICKETS EN RIESGO: ${summaryData.enRiesgo}`,
            `  · OA FUERA DE PLAZO (>12 hrs): ${summaryData.oaFueraPlazo}`,
            `  · CNX FUERA DE PLAZO (>8 hrs): ${summaryData.cnxFueraPlazo}`,
            `  · RECLAMOS FUERA DE PLAZO (>4 hrs): ${summaryData.reclamosFueraPlazo}`
        ].join('\n');
    }

    /**
     * Dibuja un gráfico de barras verticales agrupado (En Ejecución vs Pendiente) sobre un contexto Canvas.
     */
    function drawVerticalGroupedBarChart(ctx, opts) {
        const { x, y, width, height, title, categories, seriesData } = opts;

        // Fondo del gráfico
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = COLOR_LINEA;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);

        // Título del gráfico en Azul Corporativo Pluz
        ctx.fillStyle = '#1d4ed8';
        ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(title, x + 12, y + 22);

        // Leyenda (pequeña en esquina superior derecha)
        const legendX = x + width - 146;
        ctx.fillStyle = COLOR_EJECUCION;
        ctx.fillRect(legendX, y + 12, 9, 9);
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.fillText('En Ejecución', legendX + 13, y + 20);

        ctx.fillStyle = COLOR_PENDIENTE;
        ctx.fillRect(legendX + 76, y + 12, 9, 9);
        ctx.fillStyle = '#475569';
        ctx.fillText('Pendiente', legendX + 89, y + 20);

        if (!categories || categories.length === 0) {
            ctx.fillStyle = COLOR_TEXTO_MUTED;
            ctx.font = 'italic 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Sin datos disponibles', x + width / 2, y + height / 2);
            return;
        }

        const plotX = x + 24;
        const plotY = y + 36;
        const plotW = width - 30;
        const plotH = height - 68;

        // Determinar valor máximo para la escala Y
        let maxVal = 1;
        categories.forEach((cat, idx) => {
            const ejec = (seriesData.ejecucion && seriesData.ejecucion[idx]) || 0;
            const pend = (seriesData.pendiente && seriesData.pendiente[idx]) || 0;
            if (ejec > maxVal) maxVal = ejec;
            if (pend > maxVal) maxVal = pend;
        });

        // Líneas guía horizontales
        const numTicks = 3;
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        for (let i = 0; i <= numTicks; i++) {
            const val = Math.round((maxVal * i) / numTicks);
            const gy = plotY + plotH - (plotH * i) / numTicks;
            ctx.beginPath();
            ctx.moveTo(plotX, gy);
            ctx.lineTo(plotX + plotW, gy);
            ctx.stroke();

            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 10px system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(String(val), plotX - 4, gy + 3);
        }

        // Dibujar barras agrupadas por categoría
        const numCats = categories.length;
        const catWidth = plotW / numCats;
        const barWidth = Math.max(4, Math.min(22, (catWidth * 0.74) / 2));

        categories.forEach((cat, idx) => {
            const centerX = plotX + idx * catWidth + catWidth / 2;
            const ejecVal = (seriesData.ejecucion && seriesData.ejecucion[idx]) || 0;
            const pendVal = (seriesData.pendiente && seriesData.pendiente[idx]) || 0;

            const xEjec = centerX - barWidth;
            const xPend = centerX;

            const hEjec = maxVal > 0 ? (ejecVal / maxVal) * plotH : 0;
            const hPend = maxVal > 0 ? (pendVal / maxVal) * plotH : 0;

            // Barra Ejecución
            if (ejecVal > 0) {
                ctx.fillStyle = COLOR_EJECUCION;
                ctx.fillRect(xEjec, plotY + plotH - hEjec, barWidth - 1, hEjec);
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 14px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(ejecVal), xEjec + barWidth / 2, Math.max(plotY + 13, plotY + plotH - hEjec - 4));
            }

            // Barra Pendiente
            if (pendVal > 0) {
                ctx.fillStyle = COLOR_PENDIENTE;
                ctx.fillRect(xPend, plotY + plotH - hPend, barWidth - 1, hPend);
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 14px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(pendVal), xPend + barWidth / 2, Math.max(plotY + 13, plotY + plotH - hPend - 4));
            }

            // Etiqueta del eje X
            ctx.save();
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            let label = String(cat);
            if (label === 'CNX SUBTERRANEA') label = 'CNX SUBT';
            else if (label === 'RED SUBTERRANEA') label = 'RED SUBT';
            else if (label === 'CNX AEREA') label = 'CNX AÉR';
            else if (label === 'RED AEREA') label = 'RED AÉR';
            else if (label === 'SUMINISTRO') label = 'SUMIN';
            else if (label.length > 11) label = label.substring(0, 10) + '…';
            ctx.fillText(label, centerX, plotY + plotH + 18);
            ctx.restore();
        });
    }

    /**
     * Dibuja y genera el canvas compuesto de alta resolución (2x scale para nitidez retina).
     * @param {Object} summaryData Métricas resumidas
     * @param {Array} records Registros filtrados
     * @param {Image|null} logoImg Imagen de logo cargada en memoria
     * @param {Object} options Opciones ({ onlyCharts: boolean })
     */
    function renderContractorReportCanvas(summaryData, records, logoImg, options = {}) {
        if (typeof document === 'undefined') return null;

        const onlyCharts = !!(options && options.onlyCharts);
        const W = 760;
        // Altura 836 para el reporte completo equilibrado o 618 para solo gráficos
        const H = onlyCharts ? 618 : 836;
        const scale = 2; // HiDPI Retina scale factor

        const canvas = document.createElement('canvas');
        canvas.width = W * scale;
        canvas.height = H * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.scale(scale, scale);

        // Fondo blanco total
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        // 1. CABECERA: Logo Pluz + Badges de KPI
        if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
            try {
                ctx.drawImage(logoImg, 24, 16, 110, 34);
            } catch (e) {
                drawFallbackLogo(ctx, 24, 16);
            }
        } else {
            drawFallbackLogo(ctx, 24, 16);
        }

        // Badges derecha en cabecera
        const badge1X = W - 230;
        const badge2X = W - 110;

        ctx.fillStyle = '#f0fdf4';
        ctx.strokeStyle = '#bbf7d0';
        ctx.lineWidth = 1;
        ctx.fillRect(badge1X, 16, 110, 32);
        ctx.strokeRect(badge1X, 16, 110, 32);
        ctx.fillStyle = '#166534';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Dentro de Plazo', badge1X + 55, 28);
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(String(summaryData.dentroPlazo), badge1X + 55, 43);

        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#cbd5e1';
        ctx.fillRect(badge2X, 16, 90, 32);
        ctx.strokeRect(badge2X, 16, 90, 32);
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.fillText('Total', badge2X + 45, 28);
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.fillText(String(summaryData.total), badge2X + 45, 43);

        // 2. CUADRÍCULA 2X2 DE GRÁFICOS
        const contractorRecords = (records || []).filter(r => {
            if (!summaryData.contractor || summaryData.contractor === 'TODOS') return true;
            return String(r.empresa || '').trim().toUpperCase() === String(summaryData.contractor).trim().toUpperCase();
        });

        const chartW = 356;
        const chartH = 265;
        const col1X = 16;
        const col2X = 388;
        const row1Y = 60;
        const row2Y = 337;

        // Preparar Datos Gráfico 1: Evolución Diaria
        const days = [...new Set(contractorRecords.map(r => r.dia || 'N/A'))].filter(Boolean).slice(-6);
        const dayEjec = days.map(d => contractorRecords.filter(r => r.dia === d && (r.estado || '').toLowerCase().includes('ejecuc')).length);
        const dayPend = days.map(d => contractorRecords.filter(r => r.dia === d && !(r.estado || '').toLowerCase().includes('ejecuc')).length);

        drawVerticalGroupedBarChart(ctx, {
            x: col1X,
            y: row1Y,
            width: chartW,
            height: chartH,
            title: 'Evolución diaria',
            categories: days,
            seriesData: { ejecucion: dayEjec, pendiente: dayPend }
        });

        // Preparar Datos Gráfico 2: Carga por Contratista
        const empName = summaryData.contractor;
        const empEjec = [contractorRecords.filter(r => (r.estado || '').toLowerCase().includes('ejecuc')).length];
        const empPend = [contractorRecords.filter(r => !(r.estado || '').toLowerCase().includes('ejecuc')).length];

        drawVerticalGroupedBarChart(ctx, {
            x: col2X,
            y: row1Y,
            width: chartW,
            height: chartH,
            title: 'Carga por contratista',
            categories: [empName],
            seriesData: { ejecucion: empEjec, pendiente: empPend }
        });

        // Preparar Datos Gráfico 3: Tipo de Falla
        const standardFaults = ['CNX AEREA', 'CNX SUBTERRANEA', 'RED AEREA', 'RED SUBTERRANEA', 'SUMINISTRO'];
        const faultCats = [...new Set(contractorRecords.map(r => String(r.falla || '').toUpperCase()))].filter(Boolean);
        const activeFaults = standardFaults.filter(f => faultCats.includes(f)).concat(faultCats.filter(f => !standardFaults.includes(f))).slice(0, 5);
        const faultEjec = activeFaults.map(f => contractorRecords.filter(r => String(r.falla || '').toUpperCase() === f && (r.estado || '').toLowerCase().includes('ejecuc')).length);
        const faultPend = activeFaults.map(f => contractorRecords.filter(r => String(r.falla || '').toUpperCase() === f && !(r.estado || '').toLowerCase().includes('ejecuc')).length);

        drawVerticalGroupedBarChart(ctx, {
            x: col1X,
            y: row2Y,
            width: chartW,
            height: chartH,
            title: 'Composición por tipo de falla',
            categories: activeFaults,
            seriesData: { ejecucion: faultEjec, pendiente: faultPend }
        });

        // Preparar Datos Gráfico 4: Antigüedad de los casos
        const standardIntervals = ['0-4h', '4-8h', '8-12h', '12-16h', '16-20h', '20-24h', '>24h'];
        const intEjec = standardIntervals.map(inv => contractorRecords.filter(r => matchIntervalLabel(r.intervalo, inv) && (r.estado || '').toLowerCase().includes('ejecuc')).length);
        const intPend = standardIntervals.map(inv => contractorRecords.filter(r => matchIntervalLabel(r.intervalo, inv) && !(r.estado || '').toLowerCase().includes('ejecuc')).length);

        drawVerticalGroupedBarChart(ctx, {
            x: col2X,
            y: row2Y,
            width: chartW,
            height: chartH,
            title: 'Antigüedad de los casos',
            categories: standardIntervals,
            seriesData: { ejecucion: intEjec, pendiente: intPend }
        });

        // Si solo se solicitaron gráficos, terminar aquí sin dibujar texto inferior
        if (onlyCharts) {
            return canvas;
        }

        // 3. SEPARADOR ELEGANTE
        const sepY = 616;
        ctx.strokeStyle = COLOR_LINEA;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(16, sepY);
        ctx.lineTo(W - 16, sepY);
        ctx.stroke();

        // 4. BLOQUE INFERIOR DE TEXTO RESUMEN (COMPACTO Y EJECUTIVO)
        const textStartY = 642;
        ctx.textAlign = 'left';

        // Línea 1: Estimados Buenas tardes [CONTRATISTA]
        ctx.fillStyle = '#0f172a';
        ctx.font = '700 16px system-ui, -apple-system, sans-serif';
        ctx.fillText(`Estimados   ${summaryData.saludo}`, 20, textStartY);
        ctx.fillText(summaryData.contractor, W / 2 + 50, textStartY);

        // Línea 2: Reporte de Pendientes [FECHA HORA]
        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#1e293b';
        ctx.fillText('Reporte de Pendientes', 20, textStartY + 24);
        ctx.font = '500 13px system-ui, -apple-system, sans-serif';
        ctx.fillText(summaryData.fechaStr, W / 2 + 50, textStartY + 24);

        // Línea 3: Reparaciones
        ctx.font = '500 12px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#1e293b';
        ctx.fillText(`·  Reparaciones: ${summaryData.reparaciones}`, 36, textStartY + 50);

        // Línea 4: Reclamos
        ctx.fillText(`·  Reclamos: ${summaryData.reclamos}`, 36, textStartY + 68);

        // Línea 5: TICKETS +24 HRS
        ctx.font = '700 13px system-ui, -apple-system, sans-serif';
        ctx.fillText('TICKETS +24 HRS:', 20, textStartY + 96);
        ctx.fillText(String(summaryData.mas24h), 220, textStartY + 96);

        // Línea 6: TICKETS EN RIESGO
        ctx.fillText('TICKETS EN RIESGO:', 20, textStartY + 116);
        ctx.fillText(String(summaryData.enRiesgo), 220, textStartY + 116);

        // Línea 7: OA FUERA DE PLAZO
        ctx.font = '600 12px system-ui, -apple-system, sans-serif';
        ctx.fillText(`·  OA FUERA DE PLAZO (>12 hrs): ${summaryData.oaFueraPlazo}`, 36, textStartY + 138);

        // Línea 8: CNX FUERA DE PLAZO
        ctx.fillText(`·  CNX FUERA DE PLAZO (>8 hrs): ${summaryData.cnxFueraPlazo}`, 36, textStartY + 156);

        // Línea 9: RECLAMOS FUERA DE PLAZO
        ctx.fillText(`·  RECLAMOS FUERA DE PLAZO (>4 hrs): ${summaryData.reclamosFueraPlazo}`, 36, textStartY + 174);

        return canvas;
    }

    /**
     * Auxiliar para dibujar fallback si no cargó la imagen del logo Pluz
     */
    function drawFallbackLogo(ctx, x, y) {
        ctx.save();
        ctx.fillStyle = '#0284c7';
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('PLUZ', x, y + 24);
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(x + 72, y + 14, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Mapea intervalo en texto flexible al catálogo estándar
     */
    function matchIntervalLabel(recordInterval, targetLabel) {
        const inv = String(recordInterval || '').toLowerCase().replace(/\s+/g, '');
        const target = String(targetLabel).toLowerCase().replace(/\s+/g, '');
        if (target === '>24h') return inv.includes('>24') || inv.includes('24-48') || inv.includes('>48') || inv.includes('+24');
        return inv.includes(target.replace('h', ''));
    }

    /**
     * Convierte un canvas a un Blob PNG mediante Promise.
     */
    function canvasToBlobAsync(canvas) {
        return new Promise((resolve, reject) => {
            if (!canvas || !canvas.toBlob) {
                reject(new Error('Canvas no soportado'));
                return;
            }
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('Fallo al generar Blob de imagen'));
            }, 'image/png', 0.98);
        });
    }

    /**
     * Carga el logo PLUZ.png en memoria si existe
     */
    function loadLogoImageAsync(src = 'PLUZ.png') {
        return new Promise(resolve => {
            if (typeof Image === 'undefined') {
                resolve(null);
                return;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    /**
     * Acción principal: Genera y copia al portapapeles la imagen y/o texto.
     * @param {string} contractorName Nombre del contratista seleccionado
     * @param {Array} records Registros filtrados de tdOmsRecords
     * @param {'full'|'both'|'charts'|'text'} mode Modalidad de copiado
     */
    async function copyContractorReportToClipboard(contractorName, records, mode = 'full') {
        if (!contractorName || contractorName === 'TODOS') {
            throw new Error('Selecciona una empresa contratista específica para copiar su reporte.');
        }

        const summaryData = buildContractorSummaryData(contractorName, records);
        const textSummary = buildContractorSummaryText(summaryData);

        // 1. Modalidad: Solo Texto
        if (mode === 'text') {
            if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(textSummary);
                return { mode: 'text', text: textSummary };
            }
            throw new Error('API de portapapeles de texto no disponible en el navegador.');
        }

        // Cargar logo y renderizar canvas según la modalidad
        const logoImg = await loadLogoImageAsync('PLUZ.png');
        const isOnlyCharts = (mode === 'charts');
        const canvas = renderContractorReportCanvas(summaryData, records, logoImg, { onlyCharts: isOnlyCharts });
        if (!canvas) {
            throw new Error('No fue posible renderizar el lienzo de reporte.');
        }

        const imageBlob = await canvasToBlobAsync(canvas);

        // 2. Modalidad: Solo Gráficos (imagen limpia de los gráficos y cabecera)
        if (mode === 'charts') {
            if (typeof ClipboardItem !== 'undefined' && navigator && navigator.clipboard && navigator.clipboard.write) {
                const item = new ClipboardItem({ 'image/png': imageBlob });
                await navigator.clipboard.write([item]);
                return { mode: 'charts', blob: imageBlob };
            } else {
                const url = URL.createObjectURL(imageBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `graficos_${contractorName.toLowerCase()}_${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                return { mode: 'fallback_download', blob: imageBlob };
            }
        }

        // 3. Modalidad: Reporte Completo (Imagen con gráficos y texto integrados)
        if (typeof ClipboardItem !== 'undefined' && navigator && navigator.clipboard && navigator.clipboard.write) {
            try {
                const clipboardData = {};
                clipboardData['image/png'] = imageBlob;
                clipboardData['text/plain'] = new Blob([textSummary], { type: 'text/plain' });
                const item = new ClipboardItem(clipboardData);
                await navigator.clipboard.write([item]);
                return { mode: 'full', blob: imageBlob, text: textSummary };
            } catch (err) {
                console.warn('Fallo al escribir ambos tipos en portapapeles, intentando solo imagen...', err);
                const itemOnlyImage = new ClipboardItem({ 'image/png': imageBlob });
                await navigator.clipboard.write([itemOnlyImage]);
                return { mode: 'image', blob: imageBlob, text: textSummary };
            }
        } else if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            // Fallback si ClipboardItem no está soportado: descargar imagen y copiar texto
            const url = URL.createObjectURL(imageBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reporte_${contractorName.toLowerCase()}_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            await navigator.clipboard.writeText(textSummary);
            return { mode: 'fallback_download', text: textSummary };
        } else {
            throw new Error('El navegador no permite acceso al portapapeles.');
        }
    }

    // Exportación pública en el objeto global
    const api = {
        buildContractorSummaryData,
        buildContractorSummaryText,
        renderContractorReportCanvas,
        copyContractorReportToClipboard,
        isReclamo,
        extractHours
    };

    if (typeof window !== 'undefined') {
        window.ContractorReport = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : this);
