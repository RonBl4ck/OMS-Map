        // === 4 GRÁFICOS & KPIS TD OMS ESTILO PLUZ ===
        let tdFilterDia = null;

        function getFilteredTdOms() {
            const selIntervalos = tdCtrlIntervalo ? tdCtrlIntervalo.getSelected() : [];
            const selEmps = tdCtrlEmpresa ? tdCtrlEmpresa.getSelected() : [];
            const selFallas = tdCtrlFalla ? tdCtrlFalla.getSelected() : [];
            const selStates = tdCtrlEstado ? tdCtrlEstado.getSelected() : [];
            const chk7Modal = document.getElementById("chk7LlamadasModal");
            const only7Llamadas = chk7Modal ? chk7Modal.checked : false;
            const chkSedModal = document.getElementById("chkReincSedModal");
            const onlyReincSed = chkSedModal ? chkSedModal.checked : false;
            const chkSumModal = document.getElementById("chkReincSuminModal");
            const onlyReincSum = chkSumModal ? chkSumModal.checked : false;
            const isAdmin = typeof isCurrentUserAdmin === 'function' ? isCurrentUserAdmin() : (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('oms_user_role') === 'admin');
            const chkCritModal = document.getElementById("chkCriticaModal");
            const onlyCritModal = isAdmin && chkCritModal ? chkCritModal.checked : false;
            const chkQuantCrit = document.getElementById("checkFilterQuanticoCritico");
            const onlyQuanticoCritico = isAdmin && chkQuantCrit ? chkQuantCrit.checked : false;

            return tdOmsRecords.filter(r => {
                const numLlamadas = parseInt(r.llamadas || 0, 10) || 0;
                const matchLlamadas = !only7Llamadas || numLlamadas >= 7;
                const matchSed = !onlyReincSed || (r.sed_reincidente || r.sed_count > 2);
                const matchSum = !onlyReincSum || (r.suministro_count >= 2);
                const matchCrit = !onlyCritModal || r.es_top_critica;
                const matchDia = !tdFilterDia || r.dia === tdFilterDia;

                let matchQuanticoCritico = true;
                if (onlyQuanticoCritico) {
                    const sup = typeof getSupervisorDataForTicket === 'function' ? getSupervisorDataForTicket(r.ticket) : null;
                    const cState = (sup && sup.latest) ? String(sup.latest.estadoCritico || sup.latest.estado || '').toUpperCase() : '';
                    matchQuanticoCritico = cState.includes('QUANT') || cState.includes('CRIT') || cState.includes('VENCID');
                }

                return (
                    matchesMultiSelection(r.intervalo, selIntervalos) &&
                    matchesMultiSelection(r.empresa, selEmps) &&
                    matchesMultiSelection(r.falla, selFallas) &&
                    matchesMultiSelection(r.estado, selStates) &&
                    matchLlamadas &&
                    matchSed &&
                    matchSum &&
                    matchCrit &&
                    matchDia &&
                    matchQuanticoCritico
                );
            });
        }

        function handleChartBarClick(field, categoryValue, stateValue) {
            const isCtrlEmpresa = (field === 'empresa');
            const isCtrlFalla = (field === 'falla');
            const isCtrlIntervalo = (field === 'intervalo');
            const isDia = (field === 'dia');

            // Verificar si esta combinación exacta ya está activa
            const currStates = tdCtrlEstado ? tdCtrlEstado.getSelected() : [];
            const isStateActive = currStates.length === 1 && currStates[0] === stateValue;

            let isCategoryActive = false;
            if (isCtrlEmpresa && tdCtrlEmpresa) {
                const sel = tdCtrlEmpresa.getSelected();
                isCategoryActive = sel.length === 1 && sel[0] === categoryValue;
            } else if (isCtrlFalla && tdCtrlFalla) {
                const sel = tdCtrlFalla.getSelected();
                isCategoryActive = sel.length === 1 && sel[0] === categoryValue;
            } else if (isCtrlIntervalo && tdCtrlIntervalo) {
                const sel = tdCtrlIntervalo.getSelected();
                isCategoryActive = sel.length === 1 && sel[0] === categoryValue;
            } else if (isDia) {
                isCategoryActive = (tdFilterDia === categoryValue);
            }

            if (isCategoryActive && isStateActive) {
                // Toggle off: Si ya está seleccionado, limpiar filtros para restaurar todos los registros
                if (tdCtrlIntervalo) tdCtrlIntervalo.reset();
                if (tdCtrlEmpresa) tdCtrlEmpresa.reset();
                if (tdCtrlFalla) tdCtrlFalla.reset();
                if (tdCtrlEstado) tdCtrlEstado.reset();
                tdFilterDia = null;
            } else {
                // Opción B: Aplicar filtro combinado de Categoría + Estado
                if (tdCtrlIntervalo) tdCtrlIntervalo.reset();
                if (tdCtrlEmpresa) tdCtrlEmpresa.reset();
                if (tdCtrlFalla) tdCtrlFalla.reset();
                tdFilterDia = null;

                if (isCtrlEmpresa && tdCtrlEmpresa) {
                    tdCtrlEmpresa.setSelected([categoryValue], false);
                } else if (isCtrlFalla && tdCtrlFalla) {
                    tdCtrlFalla.setSelected([categoryValue], false);
                } else if (isCtrlIntervalo && tdCtrlIntervalo) {
                    tdCtrlIntervalo.setSelected([categoryValue], false);
                } else if (isDia) {
                    tdFilterDia = categoryValue;
                }

                if (tdCtrlEstado && stateValue) {
                    tdCtrlEstado.setSelected([stateValue], false);
                }
            }

            if (typeof applyDashboardFilters === 'function') {
                applyDashboardFilters();
            } else {
                refreshDashboard();
            }
        }

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

        function updateKpiCards(records) {
            const summary = summarizeDeadlineStatus(records);
            const pct = value => summary.total ? `${(value / summary.total * 100).toFixed(1)}% del total` : '0% del total';

            document.getElementById("kpiTotalInc").innerText = summary.total;
            document.getElementById("kpiWithinDeadline").innerText = summary.within;
            document.getElementById("kpiWithinDeadlinePct").innerText = pct(summary.within);
            document.getElementById("kpiDeadlineWarning").innerText = summary.warning;
            document.getElementById("kpiDeadlineWarningPct").innerText = pct(summary.warning);
            document.getElementById("kpiDeadlineOverdue").innerText = summary.overdue;
            document.getElementById("kpiDeadlineOverduePct").innerText = pct(summary.overdue);
        }

        function renderModernCharts(records) {
            const target = document.getElementById("tdOmsCharts");
            if (!target) return;

            const chartDefs = [
                ['Carga por contratista', 'empresa', true, 'Distribución de incidencias por empresa ejecutora'],
                ['Composición por tipo de falla', 'falla', true, 'Volumen operativo según naturaleza de la incidencia'],
                ['Antigüedad de los casos', 'intervalo', false, 'Distribución según intervalo transcurrido'],
                ['Evolución diaria', 'dia', false, 'Comportamiento de incidencias en el periodo visible']
            ];

            target.innerHTML = chartDefs.map(([title, field, isHorizontal, description]) => {
                const sortFn = (field === 'intervalo') ? sortIntervals : (a,b) => String(a).localeCompare(String(b), 'es');
                const categories = [...new Set(records.map(r => r[field]))].sort(sortFn);
                if (!categories.length) {
                    return `<section class="chart-card"><h3>${escapeHtml(title)}</h3><p style="color:#64748b; font-size:12px;">Sin registros para los filtros seleccionados.</p></section>`;
                }

                const allStates = [...new Set(records.map(r => r.estado))].sort((a,b) => String(a).localeCompare(String(b), 'es'));
                const series = allStates.map(st => ({
                    name: st,
                    values: categories.map(cat => records.filter(r => r[field] === cat && r.estado === st).length)
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
                            const color = getOmsStatusColor(s.name);

                            if (val > 0) {
                                svgContent += `<rect class="chart-bar-interactive" data-field="${escapeHtml(field)}" data-value="${escapeHtml(String(cat))}" data-state="${escapeHtml(s.name)}" x="${leftMargin}" y="${y}" width="${Math.max(2, barW)}" height="${barH - 1}" fill="${color}" rx="3" ry="3" tabindex="0" role="button" aria-label="${escapeHtml(cat)}, ${escapeHtml(s.name)}: ${val} casos. Clic para filtrar."><title>${escapeHtml(cat)} - ${escapeHtml(s.name)}: ${val} casos (Clic para filtrar)</title></rect>`;
                                svgContent += `<text x="${leftMargin + barW + 5}" y="${y + barH - 2}" font-size="12" font-weight="800" fill="#0f172a">${val}</text>`;
                            }
                        });
                        const label = escapeHtml(String(cat));
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
                            const color = getOmsStatusColor(s.name);

                            if (val > 0) {
                                svgContent += `<rect class="chart-bar-interactive" data-field="${escapeHtml(field)}" data-value="${escapeHtml(String(cat))}" data-state="${escapeHtml(s.name)}" x="${x}" y="${y}" width="${Math.max(2, barW - 1)}" height="${barH}" fill="${color}" rx="3" ry="3" tabindex="0" role="button" aria-label="${escapeHtml(cat)}, ${escapeHtml(s.name)}: ${val} casos. Clic para filtrar."><title>${escapeHtml(cat)} - ${escapeHtml(s.name)}: ${val} casos (Clic para filtrar)</title></rect>`;
                                svgContent += `<text x="${x + barW/2}" y="${Math.max(topMargin + 11, y - 4)}" text-anchor="middle" font-size="12" font-weight="800" fill="#0f172a">${val}</text>`;
                            }
                        });
                        const label = escapeHtml(String(cat));
                        svgContent += `<text x="${leftMargin + cIdx * groupW + groupW/2}" y="${topMargin + plotH + 19}" text-anchor="middle" font-size="${catFontSize}" font-weight="800" fill="#1e293b">${label}</text>`;
                    });
                }

                const legendHtml = series.map((s, idx) => `
                    <div class="chart-legend-item">
                        <span class="legend-color" style="background:${getOmsStatusColor(s.name)}"></span>
                        <span>${escapeHtml(s.name)}</span>
                    </div>
                `).join('');

                return `
                    <section class="chart-card">
                        <div class="chart-card__header">
                            <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>
                        </div>
                        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico: ${escapeHtml(title)}, ${records.length} casos" style="width:100%; height:250px; overflow:visible;">${svgContent}</svg>
                        <div class="chart-legend">${legendHtml}</div>
                    </section>
                `;
            }).join('');
        }

        let currentSortCol = null;
        let currentSortDir = 'asc';

        // Convierte fechas de la fuente (DD/MM/AAAA HH:MM:SS o AAAA-MM-DD HH:MM:SS)
        // a un valor cronológico, sin depender del orden lexicográfico del texto.
        function parseTdOmsDate(value) {
            if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();

            const text = String(value || '').trim();
            let match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?)?$/);
            if (match) {
                const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
                return new Date(year, Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)).getTime();
            }

            match = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?)?$/);
            if (match) {
                return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)).getTime();
            }

            const fallback = new Date(text).getTime();
            return Number.isNaN(fallback) ? null : fallback;
        }

        function formatShortDate(value) {
            if (!value || value === 'N/A' || value === 'Sin dato') return 'N/A';
            const text = String(value).trim();
            let match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
            if (match) {
                const d = match[1].padStart(2, '0');
                const m = match[2].padStart(2, '0');
                if (match[4] !== undefined) {
                    const hh = match[4].padStart(2, '0');
                    const mm = match[5] || '00';
                    return `${d}/${m} ${hh}:${mm}`;
                }
                return `${d}/${m}`;
            }
            match = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
            if (match) {
                const d = match[3].padStart(2, '0');
                const m = match[2].padStart(2, '0');
                if (match[4] !== undefined) {
                    const hh = match[4].padStart(2, '0');
                    const mm = match[5] || '00';
                    return `${d}/${m} ${hh}:${mm}`;
                }
                return `${d}/${m}`;
            }
            return text;
        }

        function sortTdOmsTable(key) {
            if (currentSortCol === key) {
                currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortCol = key;
                currentSortDir = 'asc';
            }
            renderTdOmsTable(getFilteredTdOms());
        }

        function updateTableSortHeaderIcons() {
            const tableHeaders = document.querySelectorAll("#tdOmsTable th[data-sort]");
            tableHeaders.forEach(th => {
                const key = th.getAttribute("data-sort");
                const label = th.getAttribute("data-label");
                if (key === currentSortCol) {
                    const icon = currentSortDir === 'asc' ? ' ▲' : ' ▼';
                    th.innerHTML = `${label} <span style="color: #38bdf8; font-weight: bold;">${icon}</span>`;
                } else {
                    th.innerHTML = `${label} <span style="opacity: 0.3; font-size: 9px;">↕</span>`;
                }
            });
        }

        function renderTdOmsTable(records) {
            const tableBody = document.getElementById("tdOmsTableBody");
            const countEl = document.getElementById("tableCasesCount");
            const filterInput = document.getElementById("inputFilterTable");
            const query = filterInput ? filterInput.value.trim().toLowerCase() : "";
            const isPluz = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin();

            const thSupOp = document.getElementById("thSupervisorOperativoCol");
            const thSupCrit = document.getElementById("thSupervisorCriticoCol");
            const lblFilterQC = document.getElementById("lblFilterQuanticoCritico");

            if (thSupOp) thSupOp.style.display = isPluz ? "" : "none";
            if (thSupCrit) thSupCrit.style.display = isPluz ? "" : "none";
            if (lblFilterQC) lblFilterQC.style.display = isPluz ? "inline-flex" : "none";

            if (!tableBody) return;

            let filtered = records;
            if (query) {
                filtered = records.filter(r => {
                    const baseMatch = String(r.ticket || '').toLowerCase().includes(query) ||
                        String(r.estado || '').toLowerCase().includes(query) ||
                        String(r.empresa || '').toLowerCase().includes(query) ||
                        String(r.falla || '').toLowerCase().includes(query) ||
                        String(r.intervalo || '').toLowerCase().includes(query) ||
                        String(r.dia || '').toLowerCase().includes(query) ||
                        String(r.sed || '').toLowerCase().includes(query) ||
                        String(r.alimentador || '').toLowerCase().includes(query) ||
                        String(r.afectacion || '').toLowerCase().includes(query) ||
                        String(r.llamadas || '').toLowerCase().includes(query) ||
                        String(r.odm || '').toLowerCase().includes(query) ||
                        String(r.hora_inicio || r.fecha_inicio || '').toLowerCase().includes(query);
                    if (baseMatch) return true;
                    if (isPluz && typeof getSupervisorDataForTicket === 'function') {
                        const sup = getSupervisorDataForTicket(r.ticket);
                        if (sup && sup.latest) {
                            return String(sup.latest.estadoOperativo || sup.latest.estado || '').toLowerCase().includes(query) ||
                                   String(sup.latest.detalleOperativo || sup.latest.detalle || '').toLowerCase().includes(query) ||
                                   String(sup.latest.estadoCritico || '').toLowerCase().includes(query) ||
                                   String(sup.latest.detalleCritico || '').toLowerCase().includes(query);
                        }
                    }
                    return false;
                });
            }

            if (currentSortCol) {
                const mult = currentSortDir === 'desc' ? -1 : 1;
                filtered = [...filtered].sort((a, b) => {
                    let valA = a[currentSortCol];
                    let valB = b[currentSortCol];

                    if (currentSortCol === 'supervisorOperativo' || currentSortCol === 'supervisor') {
                        const supA = typeof getSupervisorDataForTicket === 'function' ? getSupervisorDataForTicket(a.ticket) : null;
                        const supB = typeof getSupervisorDataForTicket === 'function' ? getSupervisorDataForTicket(b.ticket) : null;
                        valA = (supA && supA.latest) ? (supA.latest.estadoOperativo || supA.latest.estado || '') : '';
                        valB = (supB && supB.latest) ? (supB.latest.estadoOperativo || supB.latest.estado || '') : '';
                    } else if (currentSortCol === 'supervisorCritico') {
                        const supA = typeof getSupervisorDataForTicket === 'function' ? getSupervisorDataForTicket(a.ticket) : null;
                        const supB = typeof getSupervisorDataForTicket === 'function' ? getSupervisorDataForTicket(b.ticket) : null;
                        valA = (supA && supA.latest) ? (supA.latest.estadoCritico || '') : '';
                        valB = (supB && supB.latest) ? (supB.latest.estadoCritico || '') : '';
                    } else if (currentSortCol === 'hora_inicio') {
                        valA = a.hora_inicio || a.fecha_inicio || '';
                        valB = b.hora_inicio || b.fecha_inicio || '';

                        const dateA = parseTdOmsDate(valA);
                        const dateB = parseTdOmsDate(valB);
                        if (dateA !== null && dateB !== null) return (dateA - dateB) * mult;
                        if (dateA !== null) return -1 * mult;
                        if (dateB !== null) return 1 * mult;
                    } else if (currentSortCol === 'latitud') {
                        valA = a.latitud !== undefined && a.latitud !== null ? a.latitud : (a.lat !== undefined ? a.lat : '');
                        valB = b.latitud !== undefined && b.latitud !== null ? b.latitud : (b.lat !== undefined ? b.lat : '');
                    } else if (currentSortCol === 'longitud') {
                        valA = a.longitud !== undefined && a.longitud !== null ? a.longitud : (a.lon !== undefined ? a.lon : '');
                        valB = b.longitud !== undefined && b.longitud !== null ? b.longitud : (b.lon !== undefined ? b.lon : '');
                    }

                    if (valA === undefined || valA === null) valA = '';
                    if (valB === undefined || valB === null) valB = '';

                    const numA = Number(valA);
                    const numB = Number(valB);
                    if (!isNaN(numA) && !isNaN(numB) && String(valA).trim() !== '' && String(valB).trim() !== '') {
                        return (numA - numB) * mult;
                    }

                    return String(valA).localeCompare(String(valB), 'es', { numeric: true, sensitivity: 'base' }) * mult;
                });
            }

            updateTableSortHeaderIcons();

            if (countEl) countEl.innerText = filtered.length;

            if (filtered.length === 0) {
                const emptyMsg = query ? "No hay casos pendientes que coincidan con la búsqueda." : "No hay casos pendientes.";
                const colSpanCount = isPluz ? 13 : 11;
                tableBody.innerHTML = `<tr><td colspan="${colSpanCount}" style="text-align: center; padding: 20px; color: #64748b;">${emptyMsg}</td></tr>`;
                return;
            }

            tableBody.innerHTML = filtered.map((r, idx) => {
                const stateClass = getOmsStatusClass(r.estado);

                const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
                const horaIni = r.hora_inicio || r.fecha_inicio || 'N/A';
                const horaIniShort = formatShortDate(horaIni);
                const latVal = r.latitud !== undefined && r.latitud !== null ? r.latitud : (r.lat !== undefined ? r.lat : 'N/A');
                const lonVal = r.longitud !== undefined && r.longitud !== null ? r.longitud : (r.lon !== undefined ? r.lon : 'N/A');

                let rawOdm = String(r.odm || '').trim();
                let odmCellHtml = (!rawOdm || rawOdm === 'N/A' || rawOdm === 'Sin dato' || rawOdm === '0' || rawOdm === '0.0') ? '' : escapeHtml(rawOdm);

                let supOperativoTdHtml = '';
                let supCriticoTdHtml = '';
                if (isPluz) {
                    const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(r.ticket) : null;
                    if (supData && supData.latest) {
                        const supLatest = supData.latest;
                        const countHist = (supData.history && Array.isArray(supData.history)) ? supData.history.length : 1;
                        
                        // 1. Columna Estado (PLUZ)
                        const opEstado = supLatest.estadoOperativo || supLatest.estado || 'PENDIENTE';
                        const opDetalle = supLatest.detalleOperativo || supLatest.detalle || '';
                        const opJc = supLatest.jefeCuadrilla || '';
                        const opBadgeClass = (typeof getSupervisorBadgeClass === 'function') ? getSupervisorBadgeClass(opEstado) : 'sup-status-generic';
                        const opSnippet = opDetalle ? escapeHtml(opDetalle.length > 40 ? opDetalle.slice(0, 37) + '...' : opDetalle) : '';

                        supOperativoTdHtml = `
                            <td data-label="Estado (PLUZ)" style="padding: 6px 10px; min-width: 140px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 2px;">
                                    <span class="sup-status-badge ${opBadgeClass}">${escapeHtml(opEstado)}</span>
                                    <button type="button" class="btn-sup-action" onclick="openSupervisorModal('${escapeHtml(r.ticket)}')" title="Historial (${countHist}) - Clic para actualizar" aria-label="Actualizar estado operativo">
                                        🔄
                                    </button>
                                </div>
                                ${opJc ? `<div style="font-size: 10px; font-weight: 700; color: #1e293b; line-height: 1.2;">JC: ${escapeHtml(opJc)}</div>` : ''}
                                ${opSnippet ? `<div style="font-size: 10px; color: #475569; font-style: italic; line-height: 1.2;" title="${escapeHtml(opDetalle)}">"${opSnippet}"</div>` : ''}
                            </td>
                        `;

                        // 2. Columna Criticidad
                        const critEstado = supLatest.estadoCritico || '';
                        const rawCritDetalle = String(supLatest.detalleCritico || '').trim();
                        const isNaCritDetalle = !rawCritDetalle || /^n\/?a$/i.test(rawCritDetalle) || rawCritDetalle === '-';
                        const critBadgeClass = (typeof getCriticoBadgeClass === 'function') ? getCriticoBadgeClass(critEstado) : 'sup-status-normal';
                        const critSnippet = !isNaCritDetalle ? escapeHtml(rawCritDetalle.length > 40 ? rawCritDetalle.slice(0, 37) + '...' : rawCritDetalle) : '';

                        supCriticoTdHtml = `
                            <td data-label="Criticidad (PLUZ)" style="padding: 6px 10px; min-width: 130px;">
                                ${critEstado ? `
                                    <div style="margin-bottom: 2px;">
                                        <span class="sup-status-badge ${critBadgeClass}">${escapeHtml(critEstado)}</span>
                                    </div>
                                    ${critSnippet ? `<div style="font-size: 10px; color: #831843; font-style: italic; line-height: 1.2;" title="${escapeHtml(rawCritDetalle)}">"${critSnippet}"</div>` : ''}
                                ` : `
                                    <span style="font-size: 10px; color: #94a3b8;">NORMAL</span>
                                `}
                            </td>
                        `;
                    } else {
                        supOperativoTdHtml = `
                            <td data-label="Estado (PLUZ)" style="padding: 6px 10px; white-space: nowrap;">
                                <button type="button" class="btn-sup-new" onclick="openSupervisorModal('${escapeHtml(r.ticket)}')" title="Registrar novedad de supervisión PLUZ">
                                    ➕ Registrar
                                </button>
                            </td>
                        `;
                        supCriticoTdHtml = `
                            <td data-label="Criticidad (PLUZ)" style="padding: 6px 10px; white-space: nowrap;">
                                <span style="font-size: 10px; color: #94a3b8;">--</span>
                            </td>
                        `;
                    }
                }

                return `
                    <tr style="background: ${bg}; border-bottom: 1px solid #e2e8f0;">
                        <td data-label="Ticket" style="padding: 7px 10px; white-space: nowrap;">
                            <div class="ticket-cell">
                                <span class="ticket-number">${escapeHtml(r.ticket)}</span>
                                <button type="button" class="btn-ticket-pin" onclick="navigateToTicketOnMap('${escapeHtml(r.ticket)}')" title="Localizar ticket #${escapeHtml(r.ticket)} en el mapa" aria-label="Localizar ticket #${escapeHtml(r.ticket)} en el mapa">📍</button>
                            </div>
                        </td>
                        <td data-label="ODM" style="padding: 7px 10px; white-space: nowrap;">${odmCellHtml}</td>
                        <td data-label="Hora de inicio" style="padding: 7px 10px; white-space: nowrap;" title="${escapeHtml(horaIni)}">${escapeHtml(horaIniShort)}</td>
                        <td data-label="SED" style="padding: 7px 10px; white-space: nowrap;">
                            ${r.es_sed_critica ? `<button type="button" class="sed-critical-link" onclick="if(typeof openCriticalSedPanel==='function') openCriticalSedPanel('${escapeHtml(r.sed)}')" title="Ver historial y análisis de la SED Crítica ${escapeHtml(r.sed)}">${escapeHtml(r.sed)}</button>` : escapeHtml(r.sed)}
                        </td>
                        <td data-label="Falla" style="padding: 7px 10px; white-space: nowrap;">${escapeHtml(r.falla)}</td>
                        <td data-label="Llamadas" style="padding: 7px 10px; text-align: center; white-space: nowrap;">${escapeHtml(r.llamadas)}</td>
                        <td data-label="Estado" style="padding: 7px 10px; white-space: nowrap;"><span class="status-badge ${stateClass}">${escapeHtml(r.estado)}</span></td>
                        <td data-label="Empresa" style="padding: 7px 10px; white-space: nowrap;">${escapeHtml(r.empresa)}</td>
                        <td data-label="Intervalo" style="padding: 7px 10px; white-space: nowrap;">${escapeHtml(r.intervalo)}</td>
                        <td data-label="Alimentador" style="padding: 7px 10px; font-weight: 600; color: #475569; white-space: nowrap;">${escapeHtml(r.alimentador || 'N/A')}</td>
                        <td data-label="Afectación" style="padding: 7px 10px; text-align: center; white-space: nowrap;">${escapeHtml(r.afectacion)}</td>
                        ${supOperativoTdHtml}
                        ${supCriticoTdHtml}
                    </tr>
                `;
            }).join("");
        }

        function getSelectedContractorForReport() {
            const selEmps = tdCtrlEmpresa ? tdCtrlEmpresa.getSelected() : [];
            if (selEmps && selEmps.length === 1 && selEmps[0] && selEmps[0] !== 'TODOS') {
                return selEmps[0];
            }
            const assigned = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem("oms_assigned_contractor") : null;
            if (assigned && assigned !== '*' && assigned !== 'TODOS') {
                return assigned;
            }
            return null;
        }

        function updateCopyContractorButtonState() {
            const container = document.getElementById("contractorReportBtnsContainer");
            const isPluz = typeof isCurrentUserAdmin === 'function' ? isCurrentUserAdmin() : (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('oms_user_role') === 'admin');

            if (container) {
                container.style.display = isPluz ? 'inline-flex' : 'none';
            }
            if (!isPluz) return;

            const btnFull = document.getElementById("btnCopyContractorReport");
            const lblFull = document.getElementById("lblCopyContractorReport");
            const btnCharts = document.getElementById("btnCopyContractorCharts");
            const btnTxt = document.getElementById("btnCopyContractorText");
            if (!btnFull) return;

            const contractor = getSelectedContractorForReport();
            if (contractor) {
                btnFull.disabled = false;
                btnFull.classList.remove("disabled");
                btnFull.classList.add("active");
                btnFull.title = `Copiar reporte completo (imagen con gráficos y texto) para ${contractor}`;
                if (lblFull) lblFull.textContent = `Reporte Completo [${contractor}]`;

                if (btnCharts) {
                    btnCharts.disabled = false;
                    btnCharts.classList.remove("disabled");
                    btnCharts.classList.add("active");
                    btnCharts.title = `Copiar solo imagen de gráficos para ${contractor}`;
                }

                if (btnTxt) {
                    btnTxt.disabled = false;
                    btnTxt.classList.remove("disabled");
                    btnTxt.classList.add("active");
                    btnTxt.title = `Copiar únicamente el texto para WhatsApp (${contractor})`;
                }
            } else {
                btnFull.disabled = true;
                btnFull.classList.add("disabled");
                btnFull.classList.remove("active");
                btnFull.title = "Selecciona una empresa contratista en el filtro para habilitar el reporte";
                if (lblFull) lblFull.textContent = "Reporte Completo";

                if (btnCharts) {
                    btnCharts.disabled = true;
                    btnCharts.classList.add("disabled");
                    btnCharts.classList.remove("active");
                    btnCharts.title = "Selecciona una empresa contratista en el filtro para habilitar el reporte";
                }

                if (btnTxt) {
                    btnTxt.disabled = true;
                    btnTxt.classList.add("disabled");
                    btnTxt.classList.remove("active");
                    btnTxt.title = "Selecciona una empresa contratista en el filtro para habilitar el reporte";
                }
            }
        }

        function refreshDashboard() {
            const records = getFilteredTdOms();
            updateKpiCards(records);
            renderModernCharts(records);
            renderTdOmsTable(records);
            updateCopyContractorButtonState();
        }

        const btnCopyReportEl = document.getElementById("btnCopyContractorReport");
        if (btnCopyReportEl) {
            btnCopyReportEl.addEventListener("click", async () => {
                const contractor = getSelectedContractorForReport();
                if (!contractor) {
                    alert("⚠️ Selecciona una empresa contratista para copiar su reporte.");
                    return;
                }
                const filteredRecords = getFilteredTdOms();
                const origText = btnCopyReportEl.innerHTML;
                try {
                    btnCopyReportEl.classList.add("loading");
                    btnCopyReportEl.innerHTML = `<span>⏳</span><span>Generando...</span>`;

                    if (window.ContractorReport && typeof window.ContractorReport.copyContractorReportToClipboard === 'function') {
                        await window.ContractorReport.copyContractorReportToClipboard(contractor, filteredRecords, 'full');
                        if (typeof showNotificationToast === 'function') {
                            showNotificationToast(`✅ Reporte completo de ${contractor} copiado al portapapeles`, '📸');
                        } else {
                            alert(`✅ Reporte completo de ${contractor} copiado al portapapeles.`);
                        }
                    } else {
                        throw new Error("Módulo ContractorReport no inicializado.");
                    }
                } catch (err) {
                    console.error("Error al copiar reporte:", err);
                    alert("❌ Error al copiar reporte: " + (err.message || err));
                } finally {
                    btnCopyReportEl.classList.remove("loading");
                    btnCopyReportEl.innerHTML = origText;
                    updateCopyContractorButtonState();
                }
            });
        }

        const btnCopyChartsEl = document.getElementById("btnCopyContractorCharts");
        if (btnCopyChartsEl) {
            btnCopyChartsEl.addEventListener("click", async () => {
                const contractor = getSelectedContractorForReport();
                if (!contractor) {
                    alert("⚠️ Selecciona una empresa contratista para copiar los gráficos.");
                    return;
                }
                const filteredRecords = getFilteredTdOms();
                const origText = btnCopyChartsEl.innerHTML;
                try {
                    btnCopyChartsEl.classList.add("loading");
                    btnCopyChartsEl.innerHTML = `<span>⏳</span><span>Generando...</span>`;

                    if (window.ContractorReport && typeof window.ContractorReport.copyContractorReportToClipboard === 'function') {
                        await window.ContractorReport.copyContractorReportToClipboard(contractor, filteredRecords, 'charts');
                        if (typeof showNotificationToast === 'function') {
                            showNotificationToast(`✅ Gráficos de ${contractor} copiados al portapapeles`, '📊');
                        } else {
                            alert(`✅ Gráficos de ${contractor} copiados al portapapeles.`);
                        }
                    } else {
                        throw new Error("Módulo ContractorReport no inicializado.");
                    }
                } catch (err) {
                    console.error("Error al copiar gráficos:", err);
                    alert("❌ Error al copiar gráficos: " + (err.message || err));
                } finally {
                    btnCopyChartsEl.classList.remove("loading");
                    btnCopyChartsEl.innerHTML = origText;
                    updateCopyContractorButtonState();
                }
            });
        }

        const btnCopyTxtEl = document.getElementById("btnCopyContractorText");
        if (btnCopyTxtEl) {
            btnCopyTxtEl.addEventListener("click", async () => {
                const contractor = getSelectedContractorForReport();
                if (!contractor) return;
                const filteredRecords = getFilteredTdOms();
                try {
                    if (window.ContractorReport && typeof window.ContractorReport.copyContractorReportToClipboard === 'function') {
                        await window.ContractorReport.copyContractorReportToClipboard(contractor, filteredRecords, 'text');
                        if (typeof showNotificationToast === 'function') {
                            showNotificationToast(`📝 Texto de ${contractor} copiado al portapapeles`, '📝');
                        } else {
                            alert(`📝 Texto de ${contractor} copiado al portapapeles.`);
                        }
                    }
                } catch (err) {
                    alert("❌ Error al copiar texto: " + (err.message || err));
                }
            });
        }

        const chartsContainerEl = document.getElementById("tdOmsCharts");
        if (chartsContainerEl) {
            chartsContainerEl.addEventListener("click", (e) => {
                const bar = e.target.closest(".chart-bar-interactive");
                if (!bar) return;
                const field = bar.getAttribute("data-field");
                const val = bar.getAttribute("data-value");
                const state = bar.getAttribute("data-state");
                if (field && val && state) {
                    handleChartBarClick(field, val, state);
                }
            });

            chartsContainerEl.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    const bar = e.target.closest(".chart-bar-interactive");
                    if (!bar) return;
                    e.preventDefault();
                    const field = bar.getAttribute("data-field");
                    const val = bar.getAttribute("data-value");
                    const state = bar.getAttribute("data-state");
                    if (field && val && state) {
                        handleChartBarClick(field, val, state);
                    }
                }
            });
        }

        const tblFilterInput = document.getElementById("inputFilterTable");
        if (tblFilterInput) {
            const deferDashboardFilter = typeof debounceUi === 'function' ? debounceUi : callback => callback;
            tblFilterInput.addEventListener("input", deferDashboardFilter(() => {
                renderTdOmsTable(getFilteredTdOms());
            }, 100));
        }

        const chkModal7 = document.getElementById("chk7LlamadasModal");
        if (chkModal7) chkModal7.addEventListener("change", refreshDashboard);
        const chkModalSed = document.getElementById("chkReincSedModal");
        if (chkModalSed) chkModalSed.addEventListener("change", refreshDashboard);
        const chkModalSum = document.getElementById("chkReincSuminModal");
        if (chkModalSum) chkModalSum.addEventListener("change", refreshDashboard);
        const chkModalCrit = document.getElementById("chkCriticaModal");
        if (chkModalCrit) chkModalCrit.addEventListener("change", refreshDashboard);
        const chkModalQuantCrit = document.getElementById("checkFilterQuanticoCritico");
        if (chkModalQuantCrit) chkModalQuantCrit.addEventListener("change", refreshDashboard);

        document.getElementById("btnResetFilters").addEventListener("click", () => {
            tdFilterDia = null;
            const chk7Mod = document.getElementById("chk7LlamadasModal");
            if (chk7Mod) chk7Mod.checked = false;
            const chkSedMod = document.getElementById("chkReincSedModal");
            if (chkSedMod) chkSedMod.checked = false;
            const chkSumMod = document.getElementById("chkReincSuminModal");
            if (chkSumMod) chkSumMod.checked = false;
            const chkCritMod = document.getElementById("chkCriticaModal");
            if (chkCritMod) chkCritMod.checked = false;
            const chkQCMod = document.getElementById("checkFilterQuanticoCritico");
            if (chkQCMod) chkQCMod.checked = false;

            if (tdCtrlIntervalo) tdCtrlIntervalo.reset();
            if (tdCtrlEmpresa) tdCtrlEmpresa.reset();
            if (tdCtrlFalla) tdCtrlFalla.reset();
            if (tdCtrlEstado) tdCtrlEstado.reset();
            if (typeof applyDashboardFilters === 'function') {
                applyDashboardFilters();
            } else {
                refreshDashboard();
            }
        });

        // SheetJS solo se carga cuando el usuario solicita una exportación Excel.
        let xlsxLoadPromise = null;
        function ensureXlsxLoaded() {
            if (typeof XLSX !== 'undefined') return Promise.resolve(true);
            if (xlsxLoadPromise) return xlsxLoadPromise;

            xlsxLoadPromise = new Promise(resolve => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
                script.async = true;
                script.onload = () => resolve(typeof XLSX !== 'undefined');
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            });
            return xlsxLoadPromise;
        }

        // Funciones de Descarga Excel (.xlsx)
        async function downloadExcel(dataset, prefix) {
            const assignedContractor = sessionStorage.getItem("oms_assigned_contractor");

            if (!assignedContractor) {
                alert("⚠️ No hay datos registrados para descargar para tu empresa asignada.");
                return;
            }

            dataset = filterRecordsForAssignedContractor(dataset, assignedContractor);

            if (!dataset || dataset.length === 0) {
                alert("⚠️ No hay datos registrados para descargar para tu empresa asignada.");
                return;
            }

            // Sanitización proactiva: no exportar columnas de celular/teléfono (datos personales)
            const SENSITIVE_KEYS = ['cel', 'cel 2', 'celular', 'telefono', 'teléfono', 'tel. llamante', 'teléfono de cliente'];
            const exportDataset = dataset.map(item => {
                const clean = { ...item };
                Object.keys(clean).forEach(k => {
                    if (SENSITIVE_KEYS.includes(k.trim().toLowerCase())) {
                        delete clean[k];
                    }
                });
                return clean;
            });

            try {
                const xlsxAvailable = await ensureXlsxLoaded();
                if (xlsxAvailable) {
                    const worksheet = XLSX.utils.json_to_sheet(exportDataset);
                    const keys = Object.keys(exportDataset[0] || {});
                    worksheet['!cols'] = keys.map(key => {
                        const maxLen = Math.max(
                            key.length,
                            ...exportDataset.slice(0, 100).map(row => String(row[key] || '').length)
                        );
                        return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
                    });
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, "Base_OMS");
                    const now = new Date().toISOString().slice(0, 10);
                    XLSX.writeFile(workbook, `${prefix}_oms_${now}.xlsx`);
                } else {
                    const csvStr = Papa.unparse(exportDataset);
                    const blob = new Blob(["\ufeff" + csvStr], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const now = new Date().toISOString().slice(0, 10);
                    a.href = url;
                    a.download = `${prefix}_oms_${now}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            } catch (err) {
                alert("❌ Error al generar archivo Excel: " + err);
            }
        }

        const downloadPendingBase = () => {
            downloadExcel(rawData, 'base_pendientes');
        };

        const exportFilteredTdOmsTable = () => {
            const currentFiltered = getFilteredTdOms();
            const filterInput = document.getElementById("inputFilterTable");
            const query = filterInput ? filterInput.value.trim().toLowerCase() : "";
            const isPluz = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin();

            let visibleRecords = currentFiltered;
            if (query) {
                visibleRecords = currentFiltered.filter(r => {
                    const baseMatch = String(r.ticket || '').toLowerCase().includes(query) ||
                        String(r.estado || '').toLowerCase().includes(query) ||
                        String(r.empresa || '').toLowerCase().includes(query) ||
                        String(r.falla || '').toLowerCase().includes(query) ||
                        String(r.intervalo || '').toLowerCase().includes(query) ||
                        String(r.dia || '').toLowerCase().includes(query) ||
                        String(r.sed || '').toLowerCase().includes(query) ||
                        String(r.alimentador || '').toLowerCase().includes(query) ||
                        String(r.afectacion || '').toLowerCase().includes(query) ||
                        String(r.llamadas || '').toLowerCase().includes(query) ||
                        String(r.odm || '').toLowerCase().includes(query) ||
                        String(r.hora_inicio || r.fecha_inicio || '').toLowerCase().includes(query);
                    if (baseMatch) return true;
                    if (isPluz && typeof getSupervisorDataForTicket === 'function') {
                        const sup = getSupervisorDataForTicket(r.ticket);
                        if (sup && sup.latest) {
                            return String(sup.latest.estadoOperativo || sup.latest.estado || '').toLowerCase().includes(query) ||
                                   String(sup.latest.detalleOperativo || sup.latest.detalle || '').toLowerCase().includes(query) ||
                                   String(sup.latest.estadoCritico || '').toLowerCase().includes(query) ||
                                   String(sup.latest.detalleCritico || '').toLowerCase().includes(query);
                        }
                    }
                    return false;
                });
            }

            if (!visibleRecords || visibleRecords.length === 0) {
                alert("⚠️ No hay registros visibles en la tabla para exportar.");
                return;
            }

            // Construir dataset enriquecido con las columnas de supervisión
            const exportData = visibleRecords.map(r => {
                const supData = (isPluz && typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(r.ticket) : null;
                const latest = supData ? supData.latest : null;
                const row = {
                    "Ticket": r.ticket || "",
                    "ODM": r.odm || "",
                    "Hora Inicio": r.hora_inicio || r.fecha_inicio || "",
                    "SED": r.sed || "",
                    "Falla": r.falla || "",
                    "Llamadas": r.llamadas !== undefined ? r.llamadas : "",
                    "Estado": r.estado || "",
                    "Empresa": r.empresa || "",
                    "Intervalo": r.intervalo || "",
                    "Alimentador": r.alimentador || "",
                    "Afectación": r.afectacion !== undefined ? r.afectacion : ""
                };

                if (isPluz) {
                    row["Estado Operativo (PLUZ)"] = latest ? (latest.estadoOperativo || latest.estado || "") : "";
                    row["JC"] = latest ? (latest.jefeCuadrilla || "") : "";
                    row["Detalle Operativo (PLUZ)"] = latest ? (latest.detalleOperativo || latest.detalle || "") : "";
                    row["Criticidad (PLUZ)"] = latest ? (latest.estadoCritico || "") : "";
                    row["Detalle Criticidad (PLUZ)"] = latest ? (latest.detalleCritico || "") : "";
                }

                row["Día"] = r.dia || "";
                row["SED"] = r.sed || "";
                row["Alimentador"] = r.alimentador || "";
                row["Afectación"] = r.afectacion !== undefined ? r.afectacion : "";
                row["Llamadas"] = r.llamadas !== undefined ? r.llamadas : "";
                row["Latitud"] = r.latitud !== undefined && r.latitud !== null ? r.latitud : (r.lat || "");
                row["Longitud"] = r.longitud !== undefined && r.longitud !== null ? r.longitud : (r.lon || "");
                return row;
            });

            downloadExcel(exportData, 'indicadores_tabla_filtrada');
        };

        const downloadExecutedBase = async () => {
                let downloaded = false;

                // 1. Intentar descargar directamente desde Google Sheets (pestaña BASE_EJECUTADOS)
                if (GOOGLE_SHEET_EJECUTADOS_URL || GOOGLE_SHEET_CSV_URL) {
                    let targetUrl = GOOGLE_SHEET_EJECUTADOS_URL;
                    if (!targetUrl && GOOGLE_SHEET_CSV_URL) {
                        const match = GOOGLE_SHEET_CSV_URL.match(/\/d\/([a-zA-Z0-9-_]+)/);
                        if (match) {
                            targetUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&sheet=BASE_EJECUTADOS`;
                        }
                    }
                    if (targetUrl) {
                        try {
                            const fetchUrl = targetUrl + (targetUrl.includes('?') ? '&' : '?') + '_nocache=' + Date.now();
                            const res = await fetch(fetchUrl);
                            if (res.ok) {
                                const text = await res.text();
                                if (text && text.trim().length > 0 && !text.includes('<!DOCTYPE html>')) {
                                    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
                                    if (parsed.data && parsed.data.length > 0) {
                                        const assignedContractor = sessionStorage.getItem("oms_assigned_contractor") || "*";
                                        const filteredData = filterRecordsForAssignedContractor(parsed.data, assignedContractor);
                                        if (filteredData.length === 0) {
                                            alert('⚠️ No hay registros ejecutados para tu empresa en este período.');
                                            return;
                                        }
                                        downloadExcel(filteredData, 'base_ejecutados');
                                        downloaded = true;
                                    }
                                }
                            }
                        } catch (e) {}
                    }
                }

                if (!downloaded) {
                    alert('⚠️ No se pudo obtener la base de ejecutados desde Google Sheets. Intenta nuevamente cuando la hoja esté disponible.');
                }
        };

        ['btn-download-base', 'btn-mobile-download-base'].forEach(id => {
            document.getElementById(id)?.addEventListener('click', downloadPendingBase);
        });
        ['btn-download-ejecutados', 'btn-mobile-download-ejecutados'].forEach(id => {
            document.getElementById(id)?.addEventListener('click', downloadExecutedBase);
        });

        // ==========================================================================
        // GESTIÓN DE SUPERVISIÓN Y NOVEDADES PLUZ (Modal e Historial)
        // ==========================================================================
        let currentSupervisorTicket = null;

        function getSupervisorBadgeClass(status) {
            const s = String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (s.includes('camino')) return 'sup-status-en-camino';
            if (s.includes('sitio')) return 'sup-status-en-sitio';
            if (s.includes('ejecuc')) return 'sup-status-en-ejecucion';
            if (s.includes('pendient')) return 'sup-status-pendiente';
            if (s.includes('impedid')) return 'sup-status-impedido';
            if (s.includes('derivad')) return 'sup-status-derivado';
            if (s.includes('falla')) return 'sup-status-buscando-falla';
            if (s.includes('maniobra')) return 'sup-status-maniobras';
            if (s.includes('material')) return 'sup-status-materiales';
            if (s.includes('normaliz') || s.includes('resuelt') || s.includes('cerrad')) return 'sup-status-normalizado';
            return 'sup-status-generic';
        }

        function getCriticoBadgeClass(status) {
            const s = String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            if (s.includes('quant')) return 'sup-status-quantico';
            if (s.includes('vencid')) return 'sup-status-vencido';
            if (s.includes('crit')) return 'sup-status-critico';
            return 'sup-status-normal';
        }

        function openSupervisorModal(ticket) {
            if (typeof isCurrentUserAdmin === 'function' && !isCurrentUserAdmin()) return;
            const cleanTicket = String(ticket || '').trim();
            if (!cleanTicket) return;

            currentSupervisorTicket = cleanTicket;

            // Buscar datos del caso para encabezado
            const rec = (tdOmsRecords || []).find(r => String(r.ticket || '').trim().toLowerCase() === cleanTicket.toLowerCase()) ||
                        (mapLocations || []).find(l => String(l.ticket || '').trim().toLowerCase() === cleanTicket.toLowerCase()) || {};

            const modal = document.getElementById("supervisorModalOverlay");
            const tNum = document.getElementById("supModalTicketNum");
            const bEmp = document.getElementById("supModalBadgeEmpresa");
            const bEst = document.getElementById("supModalBadgeEstadoOms");
            const sSed = document.getElementById("supModalSed");
            const sAli = document.getElementById("supModalAlimentador");
            const sFal = document.getElementById("supModalFalla");
            
            const inJc = document.getElementById("supInputJefeCuadrilla");
            const inEstOp = document.getElementById("supInputEstadoOperativo");
            const inDetOp = document.getElementById("supInputDetalleOperativo");
            const inEstCrit = document.getElementById("supInputEstadoCritico");
            const inDetCrit = document.getElementById("supInputDetalleCritico");
            const feedback = document.getElementById("supSaveFeedback");

            if (tNum) tNum.textContent = cleanTicket;
            if (bEmp) bEmp.textContent = rec.empresa || 'N/A';
            if (bEst) bEst.textContent = rec.estado || 'PENDIENTE';
            if (sSed) sSed.textContent = rec.sed || 'N/A';
            if (sAli) sAli.textContent = rec.alimentador || 'N/A';
            if (sFal) sFal.textContent = rec.falla || 'Sin falla especificada';

            if (feedback) feedback.style.display = 'none';

            const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(cleanTicket) : null;
            const supLatest = supData ? supData.latest : null;

            // HERO CARD: Mostrar última novedad arriba si existe historial
            const heroEl = document.getElementById("supHeroLatestContainer");
            if (heroEl) {
                if (supLatest) {
                    const opEst = supLatest.estadoOperativo || supLatest.estado || 'PENDIENTE';
                    const critEst = supLatest.estadoCritico || '';
                    const opBadgeClass = getSupervisorBadgeClass(opEst);
                    const critBadgeClass = critEst ? getCriticoBadgeClass(critEst) : '';
                    const jcVal = supLatest.jefeCuadrilla || '';
                    const opDet = supLatest.detalleOperativo || supLatest.detalle || '';
                    const critDet = supLatest.detalleCritico || '';

                    let borderClass = 'is-en-ejecucion';
                    const critNorm = String(critEst).toLowerCase();
                    const opNorm = String(opEst).toLowerCase();
                    if (critNorm.includes('crit')) borderClass = 'has-critico';
                    else if (critNorm.includes('quant')) borderClass = 'has-quantico';
                    else if (critNorm.includes('vencid')) borderClass = 'has-vencido';
                    else if (opNorm.includes('impedid')) borderClass = 'has-impedido';

                    heroEl.innerHTML = `
                        <div class="sup-hero-card ${borderClass}">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px;">📌 Última Novedad:</span>
                                    <span class="sup-status-badge ${opBadgeClass}">⚙️ ${escapeHtml(opEst)}</span>
                                    ${critEst ? `<span class="sup-status-badge ${critBadgeClass}">${escapeHtml(critEst)}</span>` : ''}
                                </div>
                                <span style="font-size: 10px; color: #64748b; font-weight: 600;">🕒 ${escapeHtml(supLatest.fecha || '')} • por <b>${escapeHtml(supLatest.usuario || 'PLUZ')}</b></span>
                            </div>
                            ${jcVal ? `<div style="font-size: 11px; color: #0f172a; margin-bottom: 4px; font-weight: 700;">JC: <span style="font-weight: 600; color: #1e293b;">${escapeHtml(jcVal)}</span></div>` : ''}
                            ${opDet ? `<div style="font-size: 11px; color: #334155; line-height: 1.35; margin-bottom: 3px;"><b>Operativo:</b> ${escapeHtml(opDet)}</div>` : ''}
                            ${critDet && !/^n\/?a$/i.test(critDet) ? `<div style="font-size: 11px; color: #9d174d; line-height: 1.35;"><b>Criticidad:</b> ${escapeHtml(critDet)}</div>` : ''}
                        </div>
                    `;
                    heroEl.style.display = "block";
                } else {
                    heroEl.style.display = "none";
                }
            }

            // Heredar JC y estados seleccionados, pero dejar las notas limpias para la nueva novedad
            if (inJc) inJc.value = supLatest ? (supLatest.jefeCuadrilla || '') : '';
            if (inEstOp) inEstOp.value = supLatest ? (supLatest.estadoOperativo || supLatest.estado || 'PENDIENTE') : 'PENDIENTE';
            if (inDetOp) inDetOp.value = '';
            if (inEstCrit) inEstCrit.value = supLatest ? (supLatest.estadoCritico || '') : '';
            if (inDetCrit) inDetCrit.value = '';

            updateSupervisorOperativoChipSelection(inEstOp ? inEstOp.value : '');
            updateSupervisorCriticoChipSelection(inEstCrit ? inEstCrit.value : '');
            renderSupervisorTimeline(cleanTicket);

            if (modal) {
                modal.style.display = "flex";
                setTimeout(() => {
                    if (inDetOp) inDetOp.focus();
                }, 100);
            }
        }

        function closeSupervisorModal() {
            const modal = document.getElementById("supervisorModalOverlay");
            if (modal) modal.style.display = "none";
            currentSupervisorTicket = null;
        }

        function updateSupervisorOperativoChipSelection(selectedState) {
            const chips = document.querySelectorAll("#supQuickOperativoChips .sup-chip-btn");
            const clean = String(selectedState || '').trim().toUpperCase();
            chips.forEach(btn => {
                const val = String(btn.getAttribute("data-val") || '').trim().toUpperCase();
                if (val && clean === val) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            });
        }

        function updateSupervisorCriticoChipSelection(selectedState) {
            const chips = document.querySelectorAll("#supQuickCriticoChips .sup-chip-btn");
            const clean = String(selectedState || '').trim().toUpperCase();
            chips.forEach(btn => {
                const val = String(btn.getAttribute("data-val") || '').trim().toUpperCase();
                if (clean === val) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            });
        }

        function renderSupervisorTimeline(ticket) {
            const container = document.getElementById("supTimelineContainer");
            const countEl = document.getElementById("supTimelineCount");
            if (!container) return;

            const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(ticket) : null;
            const history = (supData && Array.isArray(supData.history)) ? supData.history : [];

            if (countEl) countEl.textContent = history.length;

            if (history.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 25px 12px; color: #94a3b8; font-size: 11px; background: #fff; border-radius: 6px; border: 1px dashed #cbd5e1;">
                        🛡️ Aún no hay registros de supervisión para el ticket #${escapeHtml(ticket)}.<br>
                        Selecciona un estado y escribe una novedad arriba para comenzar la bitácora.
                    </div>
                `;
                return;
            }

            container.innerHTML = history.map(entry => {
                const opEst = entry.estadoOperativo || entry.estado || 'PENDIENTE';
                const critEst = entry.estadoCritico || '';
                const opBadgeClass = getSupervisorBadgeClass(opEst);
                const critBadgeClass = critEst ? getCriticoBadgeClass(critEst) : '';

                let cardModifier = '';
                const opNorm = String(opEst).toLowerCase();
                const critNorm = String(critEst).toLowerCase();
                if (critNorm.includes('crit')) cardModifier = 'is-critico';
                else if (critNorm.includes('quant')) cardModifier = 'is-quantico';
                else if (critNorm.includes('vencid')) cardModifier = 'is-vencido';
                else if (opNorm.includes('impedid')) cardModifier = 'is-impedido';
                else if (opNorm.includes('derivad')) cardModifier = 'is-derivado';
                else if (opNorm.includes('ejecuc')) cardModifier = 'is-en-ejecucion';
                else if (opNorm.includes('camino')) cardModifier = 'is-en-camino';
                else if (opNorm.includes('normaliz')) cardModifier = 'is-normalizado';

                return `
                    <div class="sup-timeline-card ${cardModifier}">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span class="sup-status-badge ${opBadgeClass}">⚙️ ${escapeHtml(opEst)}</span>
                                ${critEst ? `<span class="sup-status-badge ${critBadgeClass}">⚡ ${escapeHtml(critEst)}</span>` : ''}
                            </div>
                            <span style="font-size: 10px; color: #64748b; font-weight: 600;">🕒 ${escapeHtml(entry.fecha || '')}</span>
                        </div>
                        ${entry.jefeCuadrilla ? `
                            <div style="font-size: 11px; color: #0f172a; margin-bottom: 3px; font-weight: 700;">
                                JC: <span style="font-weight: 600; color: #1e293b;">${escapeHtml(entry.jefeCuadrilla)}</span>
                            </div>
                        ` : ''}
                        ${(entry.detalleOperativo || entry.detalle) ? `
                            <div style="font-size: 11px; color: #1e293b; line-height: 1.35; margin-bottom: 4px;">
                                <b>Operativo:</b> ${escapeHtml(entry.detalleOperativo || entry.detalle)}
                            </div>
                        ` : ''}
                        ${entry.detalleCritico ? `
                            <div style="font-size: 11px; color: #9d174d; line-height: 1.35; margin-bottom: 4px;">
                                <b>Criticidad:</b> ${escapeHtml(entry.detalleCritico)}
                            </div>
                        ` : ''}
                        <div style="font-size: 9.5px; color: #94a3b8; text-align: right;">
                            Registrado por: <b>${escapeHtml(entry.usuario || 'PLUZ')}</b>
                        </div>
                    </div>
                `;
            }).join("");
        }

        async function saveSupervisorLog() {
            if (!currentSupervisorTicket) return;
            const inJc = document.getElementById("supInputJefeCuadrilla");
            const inEstOp = document.getElementById("supInputEstadoOperativo");
            const inDetOp = document.getElementById("supInputDetalleOperativo");
            const inEstCrit = document.getElementById("supInputEstadoCritico");
            const inDetCrit = document.getElementById("supInputDetalleCritico");
            const btnSave = document.getElementById("btnSaveSupervisorLog");
            const feedback = document.getElementById("supSaveFeedback");

            const jefeCuadrilla = inJc ? inJc.value.trim().toUpperCase() : "";
            const estadoOperativo = inEstOp ? inEstOp.value.trim().toUpperCase() : "";
            const detalleOperativo = inDetOp ? inDetOp.value.trim() : "";
            const estadoCritico = inEstCrit ? inEstCrit.value.trim().toUpperCase() : "";
            const detalleCritico = inDetCrit ? inDetCrit.value.trim() : "";

            if (!estadoOperativo && !estadoCritico && !jefeCuadrilla) {
                if (feedback) {
                    feedback.style.color = "#dc2626";
                    feedback.textContent = "⚠️ Debes ingresar al menos un estado operativo, JC o nivel de criticidad.";
                    feedback.style.display = "block";
                }
                return;
            }

            if (btnSave) {
                btnSave.disabled = true;
                btnSave.textContent = "⏳ Guardando...";
            }
            if (feedback) {
                feedback.style.color = "#0284c7";
                feedback.textContent = "Guardando actualización...";
                feedback.style.display = "block";
            }

            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const localTimestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

            // Extraer metadatos de contexto del ticket (SED, Hora de Inicio, Alimentador, Empresa)
            const targetRec = (typeof tdOmsRecords !== 'undefined' && Array.isArray(tdOmsRecords) ? tdOmsRecords.find(r => String(r.ticket || '').trim().toLowerCase() === currentSupervisorTicket.toLowerCase()) : null) ||
                              (typeof mapLocations !== 'undefined' && Array.isArray(mapLocations) ? mapLocations.find(l => String(l.ticket || '').trim().toLowerCase() === currentSupervisorTicket.toLowerCase()) : null) || {};

            const sedRaw = (targetRec.sed && targetRec.sed !== 'N/A' ? targetRec.sed : '') || (document.getElementById("supModalSed") ? document.getElementById("supModalSed").textContent.trim() : '');
            const cleanSedVal = (sedRaw === '--' || sedRaw === 'N/A') ? '' : sedRaw;

            const horaIniRaw = targetRec.hora_inicio || targetRec.fecha_inicio || '';
            const cleanHoraIniVal = (horaIniRaw === '--' || horaIniRaw === 'N/A') ? '' : horaIniRaw;

            const aliRaw = (targetRec.alimentador && targetRec.alimentador !== 'N/A' && targetRec.alimentador !== '--' ? targetRec.alimentador : '') || (document.getElementById("supModalAlimentador") ? document.getElementById("supModalAlimentador").textContent.trim() : '');
            const cleanAliVal = (aliRaw === '--' || aliRaw === 'N/A') ? '' : aliRaw;

            const empRaw = (targetRec.empresa && targetRec.empresa !== 'N/A' && targetRec.empresa !== '--' ? targetRec.empresa : '') || (document.getElementById("supModalBadgeEmpresa") ? document.getElementById("supModalBadgeEmpresa").textContent.trim() : '');
            const cleanEmpVal = (empRaw === '--' || empRaw === 'N/A') ? '' : empRaw;

            const optimisticEntry = {
                fecha: localTimestamp,
                ticket: currentSupervisorTicket,
                sed: cleanSedVal,
                horaInicio: cleanHoraIniVal,
                alimentador: cleanAliVal,
                empresa: cleanEmpVal,
                estadoOperativo: estadoOperativo,
                detalleOperativo: detalleOperativo,
                jefeCuadrilla: jefeCuadrilla,
                estadoCritico: estadoCritico,
                detalleCritico: detalleCritico,
                estado: estadoOperativo || estadoCritico,
                detalle: detalleOperativo || detalleCritico,
                usuario: 'PLUZ'
            };

            // 1. Actualización optimista inmediata en memoria
            if (typeof addSupervisorLogOptimistic === 'function') {
                addSupervisorLogOptimistic(optimisticEntry);
            }
            renderSupervisorTimeline(currentSupervisorTicket);
            renderTdOmsTable(getFilteredTdOms());
            if (typeof renderMapMarkers === 'function') {
                renderMapMarkers();
            }

            // Actualizar la Hero Card superior con el nuevo estado recién guardado
            const heroEl = document.getElementById("supHeroLatestContainer");
            if (heroEl) {
                const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(currentSupervisorTicket) : null;
                const supLatest = supData ? supData.latest : null;
                if (supLatest) {
                    const opEst = supLatest.estadoOperativo || supLatest.estado || 'PENDIENTE';
                    const critEst = supLatest.estadoCritico || '';
                    const opBadgeClass = getSupervisorBadgeClass(opEst);
                    const critBadgeClass = critEst ? getCriticoBadgeClass(critEst) : '';
                    const jcVal = supLatest.jefeCuadrilla || '';
                    const opDet = supLatest.detalleOperativo || supLatest.detalle || '';
                    const critDet = supLatest.detalleCritico || '';

                    let borderClass = 'is-en-ejecucion';
                    const critNorm = String(critEst).toLowerCase();
                    const opNorm = String(opEst).toLowerCase();
                    if (critNorm.includes('crit')) borderClass = 'has-critico';
                    else if (critNorm.includes('quant')) borderClass = 'has-quantico';
                    else if (critNorm.includes('vencid')) borderClass = 'has-vencido';
                    else if (opNorm.includes('impedid')) borderClass = 'has-impedido';

                    heroEl.innerHTML = `
                        <div class="sup-hero-card ${borderClass}">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px;">📌 Última Novedad:</span>
                                    <span class="sup-status-badge ${opBadgeClass}">⚙️ ${escapeHtml(opEst)}</span>
                                    ${critEst ? `<span class="sup-status-badge ${critBadgeClass}">${escapeHtml(critEst)}</span>` : ''}
                                </div>
                                <span style="font-size: 10px; color: #64748b; font-weight: 600;">🕒 ${escapeHtml(supLatest.fecha || '')} • por <b>${escapeHtml(supLatest.usuario || 'PLUZ')}</b></span>
                            </div>
                            ${jcVal ? `<div style="font-size: 11px; color: #0f172a; margin-bottom: 4px; font-weight: 700;">JC: <span style="font-weight: 600; color: #1e293b;">${escapeHtml(jcVal)}</span></div>` : ''}
                            ${opDet ? `<div style="font-size: 11px; color: #334155; line-height: 1.35; margin-bottom: 3px;"><b>Operativo:</b> ${escapeHtml(opDet)}</div>` : ''}
                            ${critDet && !/^n\/?a$/i.test(critDet) ? `<div style="font-size: 11px; color: #9d174d; line-height: 1.35;"><b>Criticidad:</b> ${escapeHtml(critDet)}</div>` : ''}
                        </div>
                    `;
                    heroEl.style.display = "block";
                }
            }

            // Limpiar inputs de notas tras guardar
            if (inDetOp) inDetOp.value = '';
            if (inDetCrit) inDetCrit.value = '';

            // 2. Persistencia en Backend / Google Sheets
            try {
                const userRole = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('oms_user_role') : 'admin';
                const resp = await fetch('/api/update-supervisor-status', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-role': userRole || 'admin'
                    },
                    body: JSON.stringify({
                        ticket: currentSupervisorTicket,
                        sed: cleanSedVal,
                        horaInicio: cleanHoraIniVal,
                        alimentador: cleanAliVal,
                        empresa: cleanEmpVal,
                        estadoOperativo: estadoOperativo,
                        detalleOperativo: detalleOperativo,
                        jefeCuadrilla: jefeCuadrilla,
                        estadoCritico: estadoCritico,
                        detalleCritico: detalleCritico,
                        role: userRole || 'admin'
                    })
                });

                const data = await resp.json();

                if (resp.ok && data.success) {
                    if (feedback) {
                        feedback.style.color = "#16a34a";
                        feedback.textContent = "✅ " + (data.message || "Guardado exitosamente.");
                        feedback.style.display = "block";
                    }
                    if (typeof showAppNotification === 'function') {
                        showAppNotification(`Novedad registrada para ticket #${currentSupervisorTicket}`, 'success');
                    }
                    setTimeout(() => {
                        closeSupervisorModal();
                    }, 1100);
                } else {
                    if (feedback) {
                        feedback.style.color = "#dc2626";
                        feedback.textContent = "⚠️ " + (data.message || "Error al sincronizar con Sheets.");
                        feedback.style.display = "block";
                    }
                }
            } catch (err) {
                console.error("Error guardando novedad de supervisión:", err);
                if (feedback) {
                    feedback.style.color = "#f59e0b";
                    feedback.textContent = "Guardado localmente (sin conexión a Sheets).";
                    feedback.style.display = "block";
                }
            } finally {
                if (btnSave) {
                    btnSave.disabled = false;
                    btnSave.textContent = "💾 Guardar Novedad";
                }
            }
        }

        function initSupervisorModalEvents() {
            if (typeof document === 'undefined') return;

            const btnClose = document.getElementById("btnCloseSupervisorModal");
            const modal = document.getElementById("supervisorModalOverlay");
            const btnSave = document.getElementById("btnSaveSupervisorLog");
            const inEstOp = document.getElementById("supInputEstadoOperativo");
            const inDetOp = document.getElementById("supInputDetalleOperativo");
            const inEstCrit = document.getElementById("supInputEstadoCritico");
            const inDetCrit = document.getElementById("supInputDetalleCritico");

            if (btnClose) {
                btnClose.onclick = closeSupervisorModal;
            }

            if (modal) {
                modal.onclick = (e) => {
                    if (e.target === modal) closeSupervisorModal();
                };
            }

            if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
                window.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
                        closeSupervisorModal();
                    }
                });
            }

            if (btnSave) {
                btnSave.onclick = saveSupervisorLog;
            }

            [inDetOp, inDetCrit].forEach(el => {
                if (el) {
                    el.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            saveSupervisorLog();
                        }
                    });
                }
            });

            // Delegación de chips de Estado Operativo
            const opChips = document.querySelectorAll("#supQuickOperativoChips .sup-chip-btn");
            opChips.forEach(btn => {
                btn.addEventListener('click', () => {
                    const val = btn.getAttribute("data-val") || "";
                    if (inEstOp) inEstOp.value = val;
                    updateSupervisorOperativoChipSelection(val);
                });
            });

            if (inEstOp) {
                inEstOp.addEventListener('input', () => {
                    updateSupervisorOperativoChipSelection(inEstOp.value);
                });
            }

            // Delegación de chips de Criticidad
            const critChips = document.querySelectorAll("#supQuickCriticoChips .sup-chip-btn");
            critChips.forEach(btn => {
                btn.addEventListener('click', () => {
                    const val = btn.getAttribute("data-val") || "";
                    if (inEstCrit) inEstCrit.value = val;
                    updateSupervisorCriticoChipSelection(val);
                });
            });

            if (inEstCrit) {
                inEstCrit.addEventListener('input', () => {
                    updateSupervisorCriticoChipSelection(inEstCrit.value);
                });
            }

            // Checkbox Filtro Quántico / Crítico en la barra de filtros superiores
            const chkQC = document.getElementById("checkFilterQuanticoCritico");
            if (chkQC) {
                chkQC.addEventListener('change', () => {
                    refreshDashboard();
                });
            }

            // Botón Exportar Tabla Filtrada
            const btnExpTable = document.getElementById("btnExportFilteredTable");
            if (btnExpTable) {
                btnExpTable.addEventListener('click', () => {
                    exportFilteredTdOmsTable();
                });
            }
        }

        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initSupervisorModalEvents);
            } else {
                initSupervisorModalEvents();
            }
        }

        if (typeof window !== 'undefined') {
            window.openSupervisorModal = openSupervisorModal;
            window.closeSupervisorModal = closeSupervisorModal;
            window.getSupervisorBadgeClass = getSupervisorBadgeClass;
            window.getCriticoBadgeClass = getCriticoBadgeClass;
            window.exportFilteredTdOmsTable = exportFilteredTdOmsTable;
        }
