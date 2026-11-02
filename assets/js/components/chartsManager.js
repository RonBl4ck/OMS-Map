/**
 * Charts Manager - Componente de Gráficos e Indicadores OMS
 * Gráficos SVG interactivos optimizados en O(n), reportes gráficos en Canvas 2D,
 * y resumen de KPIs operacionales (SLA / Plazos).
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.ChartsManager = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.ChartsManager = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {

    /**
     * Resume el estado de cumplimiento de plazos / SLA de los registros sin solapamiento
     */
    function summarizeDeadlineStatus(records) {
        return (records || []).reduce((summary, record) => {
            const pct = Number(record?.sla?.pct);
            summary.total += 1;
            if (pct >= 100) summary.overdue += 1;
            else if (pct >= 75) summary.warning += 1;
            else summary.within += 1;
            return summary;
        }, { total: 0, within: 0, warning: 0, overdue: 0 });
    }

    /**
     * Actualiza las tarjetas superiores de KPI en el dashboard
     */
    function updateKpiCards(records) {
        if (typeof document === 'undefined') return;
        const summary = summarizeDeadlineStatus(records);
        const pct = value => summary.total ? `${(value / summary.total * 100).toFixed(1)}% del total` : '0% del total';

        const setTxt = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.innerText = txt;
        };

        setTxt("kpiTotalInc", summary.total);
        setTxt("kpiWithinDeadline", summary.within);
        setTxt("kpiWithinDeadlinePct", pct(summary.within));
        setTxt("kpiDeadlineWarning", summary.warning);
        setTxt("kpiDeadlineWarningPct", pct(summary.warning));
        setTxt("kpiDeadlineOverdue", summary.overdue);
        setTxt("kpiDeadlineOverduePct", pct(summary.overdue));
    }

    /**
     * Maneja el clic sobre una barra de estado individual dentro de un gráfico SVG
     */
    function handleChartBarClick(field, categoryValue, stateValue) {
        const isCtrlEmpresa = (field === 'empresa');
        const isCtrlFalla = (field === 'falla');
        const isCtrlIntervalo = (field === 'intervalo');
        const isDia = (field === 'dia');

        const tdCtrlEst = (typeof tdCtrlEstado !== 'undefined') ? tdCtrlEstado : null;
        const tdCtrlEmp = (typeof tdCtrlEmpresa !== 'undefined') ? tdCtrlEmpresa : null;
        const tdCtrlFal = (typeof tdCtrlFalla !== 'undefined') ? tdCtrlFalla : null;
        const tdCtrlInt = (typeof tdCtrlIntervalo !== 'undefined') ? tdCtrlIntervalo : null;
        const tdCtrlD = (typeof tdCtrlDia !== 'undefined') ? tdCtrlDia : null;

        const currStates = tdCtrlEst ? tdCtrlEst.getSelected() : [];
        const isStateActive = currStates.length === 1 && currStates[0] === stateValue;

        let isCategoryActive = false;
        if (isCtrlEmpresa && tdCtrlEmp) {
            const sel = tdCtrlEmp.getSelected();
            isCategoryActive = sel.length === 1 && sel[0] === categoryValue;
        } else if (isCtrlFalla && tdCtrlFal) {
            const sel = tdCtrlFal.getSelected();
            isCategoryActive = sel.length === 1 && sel[0] === categoryValue;
        } else if (isCtrlIntervalo && tdCtrlInt) {
            const sel = tdCtrlInt.getSelected();
            isCategoryActive = sel.length === 1 && sel[0] === categoryValue;
        } else if (isDia) {
            isCategoryActive = (typeof tdFilterDia !== 'undefined' && tdFilterDia === categoryValue);
        }

        if (isCategoryActive && isStateActive) {
            // Toggle off: limpiar filtros para restaurar todos los registros
            if (tdCtrlInt) tdCtrlInt.reset();
            if (tdCtrlEmp) tdCtrlEmp.reset();
            if (tdCtrlFal) tdCtrlFal.reset();
            if (tdCtrlEst) tdCtrlEst.reset();
            if (typeof tdFilterDia !== 'undefined') {
                if (typeof globalThis !== 'undefined') globalThis.tdFilterDia = null;
                if (typeof window !== 'undefined') window.tdFilterDia = null;
            }
            if (tdCtrlD) tdCtrlD.reset();
        } else {
            // Opción B: Aplicar filtro combinado de Categoría + Estado
            if (tdCtrlInt) tdCtrlInt.reset();
            if (tdCtrlEmp) tdCtrlEmp.reset();
            if (tdCtrlFal) tdCtrlFal.reset();
            if (typeof tdFilterDia !== 'undefined') {
                if (typeof globalThis !== 'undefined') globalThis.tdFilterDia = null;
                if (typeof window !== 'undefined') window.tdFilterDia = null;
            }

            if (isCtrlEmpresa && tdCtrlEmp) {
                tdCtrlEmp.setSelected([categoryValue], false);
            } else if (isCtrlFalla && tdCtrlFal) {
                tdCtrlFal.setSelected([categoryValue], false);
            } else if (isCtrlIntervalo && tdCtrlInt) {
                tdCtrlInt.setSelected([categoryValue], false);
            } else if (isDia) {
                if (typeof globalThis !== 'undefined') globalThis.tdFilterDia = categoryValue;
                if (typeof window !== 'undefined') window.tdFilterDia = categoryValue;
                if (tdCtrlD) tdCtrlD.setSelected([categoryValue], false);
            }

            if (tdCtrlEst) {
                tdCtrlEst.setSelected([stateValue], false);
            }
        }

        if (typeof applyDashboardFilters === 'function') {
            applyDashboardFilters();
        } else if (typeof refreshDashboard === 'function') {
            refreshDashboard();
        }
    }

    /**
     * Renderiza los 4 gráficos interactivos SVG principales con complejidad O(n)
     */
    function renderModernCharts(records) {
        if (typeof document === 'undefined') return;
        const target = document.getElementById("tdOmsCharts");
        if (!target) return;

        const chartDefs = [
            ['Carga por contratista', 'empresa', true, 'Distribución de incidencias por empresa ejecutora'],
            ['Composición por tipo de falla', 'falla', true, 'Volumen operativo según naturaleza de la incidencia'],
            ['Antigüedad de los casos', 'intervalo', false, 'Distribución según intervalo transcurrido'],
            ['Evolución diaria', 'dia', false, 'Comportamiento de incidencias en el periodo visible']
        ];

        const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]));
        const getStatusColor = (typeof getOmsStatusColor === 'function') ? getOmsStatusColor : (s => (typeof DomUtils !== 'undefined' && DomUtils.getOmsStatusColor) ? DomUtils.getOmsStatusColor(s) : '#3B599F');

        target.innerHTML = chartDefs.map(([title, field, isHorizontal, description]) => {
            const sortFn = (field === 'intervalo')
                ? ((typeof sortIntervals === 'function') ? sortIntervals : (a, b) => String(a).localeCompare(String(b), 'es'))
                : (field === 'dia'
                    ? ((a, b) => (typeof sortDias === 'function') ? sortDias(a, b, records) : String(a).localeCompare(String(b), 'es'))
                    : (a, b) => String(a).localeCompare(String(b), 'es'));

            const categories = [...new Set(records.map(r => r[field]))].sort(sortFn);
            if (!categories.length) {
                return `<section class="chart-card"><h3>${esc(title)}</h3><p style="color:#64748b; font-size:12px;">Sin registros para los filtros seleccionados.</p></section>`;
            }

            const allStates = [...new Set(records.map(r => r.estado))].sort((a,b) => String(a).localeCompare(String(b), 'es'));
            const matrixCounts = {};
            allStates.forEach(st => { matrixCounts[st] = {}; categories.forEach(cat => { matrixCounts[st][cat] = 0; }); });
            records.forEach(r => {
                const st = r.estado;
                const cat = r[field];
                if (matrixCounts[st] && matrixCounts[st][cat] !== undefined) {
                    matrixCounts[st][cat]++;
                }
            });
            const series = allStates.map(st => ({
                name: st,
                values: categories.map(cat => matrixCounts[st][cat] || 0)
            }));

            const maxVal = Math.max(1, ...series.flatMap(s => s.values));
            const isIntervalo = (field === 'intervalo');
            const isVerticalMany = !isHorizontal && (isIntervalo || categories.length > 6);
            const W = isVerticalMany ? 580 : 500;
            const H = 260;
            let svgContent = '';

            if (isHorizontal) {
                const leftMargin = 110, topMargin = 14, bottomMargin = 16, rightMargin = 26;
                const plotW = W - leftMargin - rightMargin;
                const plotH = H - topMargin - bottomMargin;
                const groupH = plotH / Math.max(categories.length, 1);
                const barH = Math.max(4, Math.min(20, (groupH * 0.8) / Math.max(series.length, 1)));

                categories.forEach((cat, cIdx) => {
                    const y0 = topMargin + cIdx * groupH + (groupH - barH * series.length) / 2;
                    series.forEach((s, sIdx) => {
                        const val = s.values[cIdx] || 0;
                        const barW = (val / maxVal) * plotW;
                        const y = y0 + sIdx * barH;
                        const color = getStatusColor(s.name);

                        if (val > 0) {
                            svgContent += `<rect class="chart-bar-interactive" data-field="${esc(field)}" data-value="${esc(String(cat))}" data-state="${esc(s.name)}" x="${leftMargin}" y="${y}" width="${Math.max(2, barW)}" height="${barH - 1}" fill="${color}" rx="3" ry="3" tabindex="0" role="button" aria-label="${esc(cat)}, ${esc(s.name)}: ${val} casos. Clic para filtrar."><title>${esc(cat)} - ${esc(s.name)}: ${val} casos (Clic para filtrar)</title></rect>`;
                            svgContent += `<text x="${leftMargin + barW + 5}" y="${y + barH - 2}" font-size="12" font-weight="800" fill="#0f172a">${val}</text>`;
                        }
                    });
                    const label = esc(String(cat));
                    svgContent += `<text x="${leftMargin - 6}" y="${y0 + (groupH*0.45)}" text-anchor="end" font-size="13" font-weight="800" fill="#1e293b">${label.length > 15 ? label.substring(0,13)+'…' : label}</text>`;
                });
            } else {
                const leftMargin = isIntervalo ? 20 : 26;
                const rightMargin = isIntervalo ? 4 : 8;
                const topMargin = 14, bottomMargin = 38;
                const plotW = W - leftMargin - rightMargin;
                const plotH = H - topMargin - bottomMargin;
                const groupW = plotW / Math.max(categories.length, 1);
                const barW = Math.max(4, Math.min(24, (groupW * 0.8) / Math.max(series.length, 1)));
                const catFontSize = (categories.length > 6 || isIntervalo) ? 11 : 13;

                for (let tick = 0; tick <= 4; tick++) {
                    const val = Math.round(maxVal * tick / 4);
                    const y = topMargin + plotH - (plotH * tick / 4);
                    svgContent += `<line x1="${leftMargin}" y1="${y}" x2="${W - rightMargin}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3 3"/><text x="${leftMargin - 4}" y="${y + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#64748b">${val}</text>`;
                }

                categories.forEach((cat, cIdx) => {
                    const x0 = leftMargin + cIdx * groupW + (groupW - barW * series.length) / 2;
                    series.forEach((s, sIdx) => {
                        const val = s.values[cIdx] || 0;
                        const barH = (val / maxVal) * plotH;
                        const x = x0 + sIdx * barW;
                        const y = topMargin + plotH - barH;
                        const color = getStatusColor(s.name);

                        if (val > 0) {
                            svgContent += `<rect class="chart-bar-interactive" data-field="${esc(field)}" data-value="${esc(String(cat))}" data-state="${esc(s.name)}" x="${x}" y="${y}" width="${Math.max(2, barW - 1)}" height="${barH}" fill="${color}" rx="3" ry="3" tabindex="0" role="button" aria-label="${esc(cat)}, ${esc(s.name)}: ${val} casos. Clic para filtrar."><title>${esc(cat)} - ${esc(s.name)}: ${val} casos (Clic para filtrar)</title></rect>`;
                            svgContent += `<text x="${x + barW/2}" y="${Math.max(topMargin + 11, y - 4)}" text-anchor="middle" font-size="12" font-weight="800" fill="#0f172a">${val}</text>`;
                        }
                    });
                    const label = esc(String(cat));
                    svgContent += `<text x="${leftMargin + cIdx * groupW + groupW/2}" y="${topMargin + plotH + 19}" text-anchor="middle" font-size="${catFontSize}" font-weight="800" fill="#1e293b">${label}</text>`;
                });
            }

            const legendHtml = series.map((s) => `
                <div class="chart-legend-item">
                    <span class="legend-color" style="background:${getStatusColor(s.name)}"></span>
                    <span>${esc(s.name)}</span>
                </div>
            `).join('');

            return `
                <section class="chart-card">
                    <div class="chart-card__header">
                        <div><h3>${esc(title)}</h3><p>${esc(description)}</p></div>
                    </div>
                    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico: ${esc(title)}, ${records.length} casos" style="width:100%; height:250px; overflow:visible;">${svgContent}</svg>
                    <div class="chart-legend">${legendHtml}</div>
                </section>
            `;
        }).join('');
    }

    /**
     * Dibuja un gráfico de barras verticales agrupado sobre Canvas 2D
     */
    function drawVerticalGroupedBarChart(ctx, opts) {
        if (typeof window !== 'undefined' && window.ContractorReport && typeof window.ContractorReport.drawVerticalGroupedBarChart === 'function') {
            return window.ContractorReport.drawVerticalGroupedBarChart(ctx, opts);
        }

        const COLOR_EJECUCION = '#0284c7';
        const COLOR_PENDIENTE = '#ea580c';
        const COLOR_LINEA = '#e2e8f0';
        const COLOR_TEXTO_MUTED = '#64748b';

        const { x, y, width, height, title, categories, seriesData } = opts;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = COLOR_LINEA;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);

        ctx.fillStyle = '#1d4ed8';
        ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(title, x + 12, y + 22);

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

        let maxVal = 1;
        categories.forEach((cat, idx) => {
            const ejec = (seriesData.ejecucion && seriesData.ejecucion[idx]) || 0;
            const pend = (seriesData.pendiente && seriesData.pendiente[idx]) || 0;
            if (ejec > maxVal) maxVal = ejec;
            if (pend > maxVal) maxVal = pend;
        });

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

        const numGroups = categories.length;
        const groupW = plotW / Math.max(numGroups, 1);
        const barW = Math.max(4, Math.min(22, (groupW * 0.72) / 2));
        const catFontSize = numGroups > 5 ? '9px' : '10px';

        categories.forEach((cat, idx) => {
            const ejecVal = (seriesData.ejecucion && seriesData.ejecucion[idx]) || 0;
            const pendVal = (seriesData.pendiente && seriesData.pendiente[idx]) || 0;

            const groupCenterX = plotX + (idx + 0.5) * groupW;
            const bar1X = groupCenterX - barW - 1;
            const bar2X = groupCenterX + 1;

            if (ejecVal > 0) {
                const barH = (ejecVal / maxVal) * plotH;
                const barY = plotY + plotH - barH;
                ctx.fillStyle = COLOR_EJECUCION;
                ctx.fillRect(bar1X, barY, barW, barH);
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 10px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(ejecVal), bar1X + barW / 2, barY - 3);
            }

            if (pendVal > 0) {
                const barH = (pendVal / maxVal) * plotH;
                const barY = plotY + plotH - barH;
                ctx.fillStyle = COLOR_PENDIENTE;
                ctx.fillRect(bar2X, barY, barW, barH);
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 10px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(pendVal), bar2X + barW / 2, barY - 3);
            }

            ctx.fillStyle = '#1e293b';
            ctx.font = `bold ${catFontSize} system-ui, sans-serif`;
            ctx.textAlign = 'center';
            const catLabel = String(cat);
            const truncatedCat = catLabel.length > 11 ? catLabel.slice(0, 9) + '…' : catLabel;
            ctx.fillText(truncatedCat, groupCenterX, plotY + plotH + 16);
        });
    }

    /**
     * Renderiza el lienzo de reporte de contratista completo en Canvas 2D
     */
    function renderContractorReportCanvas(summaryData, records, logoImg, options = {}) {
        if (typeof window !== 'undefined' && window.ContractorReport && typeof window.ContractorReport.renderContractorReportCanvas === 'function') {
            return window.ContractorReport.renderContractorReportCanvas(summaryData, records, logoImg, options);
        }
        if (typeof document === 'undefined') return null;

        const onlyCharts = !!(options && options.onlyCharts);
        const W = 760;
        const H = onlyCharts ? 618 : 836;
        const scale = 2;

        const canvas = document.createElement('canvas');
        canvas.width = W * scale;
        canvas.height = H * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.scale(scale, scale);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        return canvas;
    }

    return {
        summarizeDeadlineStatus,
        updateKpiCards,
        handleChartBarClick,
        renderModernCharts,
        drawVerticalGroupedBarChart,
        renderContractorReportCanvas
    };
}));
