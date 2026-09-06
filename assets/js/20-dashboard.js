        // === 4 GRÁFICOS & KPIS TD OMS ESTILO PLUZ ===
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
            const chkCritModal = document.getElementById("chkCriticaModal");
            const onlyCritModal = chkCritModal ? chkCritModal.checked : false;

            return tdOmsRecords.filter(r => {
                const numLlamadas = parseInt(r.llamadas || 0, 10) || 0;
                const matchLlamadas = !only7Llamadas || numLlamadas >= 7;
                const matchSed = !onlyReincSed || (r.sed_reincidente || r.sed_count > 2);
                const matchSum = !onlyReincSum || (r.suministro_count >= 2);
                const matchCrit = !onlyCritModal || r.es_sed_critica;
                return (
                    selIntervalos.includes(r.intervalo) &&
                    selEmps.includes(r.empresa) &&
                    selFallas.includes(r.falla) &&
                    selStates.includes(r.estado) &&
                    matchLlamadas &&
                    matchSed &&
                    matchSum &&
                    matchCrit
                );
            });
        }

        function updateKpiCards(records) {
            const total = records.length;
            const enEjecucion = records.filter(r => r.estado.toLowerCase().includes("ejecuc")).length;
            const pendientes = records.filter(r => r.estado.toLowerCase().includes("pendient")).length;

            document.getElementById("kpiTotalInc").innerText = total;
            document.getElementById("kpiEnEjecucion").innerText = enEjecucion;
            document.getElementById("kpiEjecucionPct").innerText = total ? `${(enEjecucion / total * 100).toFixed(1)}% del total` : "0%";
            document.getElementById("kpiPendientes").innerText = pendientes;
            document.getElementById("kpiPendientesPct").innerText = total ? `${(pendientes / total * 100).toFixed(1)}% del total` : "0%";

            const countsByEmpresa = {};
            records.forEach(r => { countsByEmpresa[r.empresa] = (countsByEmpresa[r.empresa] || 0) + 1; });
            let topEmp = "-", topCount = 0;
            Object.entries(countsByEmpresa).forEach(([emp, count]) => {
                if (count > topCount) { topCount = count; topEmp = emp; }
            });
            document.getElementById("kpiTopEmpresa").innerText = topEmp;
            document.getElementById("kpiTopEmpresaCount").innerText = `${topCount} tickets`;
        }

        function renderModernCharts(records) {
            const target = document.getElementById("tdOmsCharts");
            // Paleta de Colores Pluz Oficial: Azul Royal, Amarillo Dorado, Verde Energía, Rojo Emergencia, Púrpura
            const palette = ['#3c5a9f', '#fbc140', '#6cab5e', '#ef4444', '#8b5cf6'];

            const chartDefs = [
                ['Tickets por EE.CC', 'empresa', true],
                ['Tickets por Tipo de Falla', 'falla', true],
                ['Tickets por Intervalo', 'intervalo', false],
                ['Tickets por Día', 'dia', false]
            ];

            target.innerHTML = chartDefs.map(([title, field, isHorizontal]) => {
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
                const W = 500, H = 260;
                let svgContent = '';

                if (isHorizontal) {
                    const leftMargin = 120, topMargin = 20, bottomMargin = 30, rightMargin = 20;
                    const plotW = W - leftMargin - rightMargin;
                    const plotH = H - topMargin - bottomMargin;
                    const groupH = plotH / Math.max(categories.length, 1);
                    const barH = Math.max(3, Math.min(18, (groupH * 0.75) / Math.max(series.length, 1)));

                    categories.forEach((cat, cIdx) => {
                        const y0 = topMargin + cIdx * groupH + (groupH - barH * series.length) / 2;
                        series.forEach((s, sIdx) => {
                            const val = s.values[cIdx] || 0;
                            const barW = (val / maxVal) * plotW;
                            const y = y0 + sIdx * barH;
                            const color = palette[sIdx % palette.length];

                            if (val > 0) {
                                svgContent += `<rect x="${leftMargin}" y="${y}" width="${Math.max(2, barW)}" height="${barH - 1}" fill="${color}" rx="3" ry="3"><title>${escapeHtml(s.name)}: ${val}</title></rect>`;
                                svgContent += `<text x="${leftMargin + barW + 5}" y="${y + barH - 3}" font-size="9" font-weight="600" fill="#334155">${val}</text>`;
                            }
                        });
                        const label = escapeHtml(String(cat));
                        svgContent += `<text x="${leftMargin - 8}" y="${y0 + (groupH*0.4)}" text-anchor="end" font-size="10" font-weight="600" fill="#475569">${label.length > 16 ? label.substring(0,14)+'…' : label}</text>`;
                    });
                } else {
                    const leftMargin = 40, topMargin = 20, bottomMargin = 50, rightMargin = 15;
                    const plotW = W - leftMargin - rightMargin;
                    const plotH = H - topMargin - bottomMargin;
                    const groupW = plotW / Math.max(categories.length, 1);
                    const barW = Math.max(3, Math.min(22, (groupW * 0.75) / Math.max(series.length, 1)));

                    for (let tick = 0; tick <= 4; tick++) {
                        const val = Math.round(maxVal * tick / 4);
                        const y = topMargin + plotH - (plotH * tick / 4);
                        svgContent += `<line x1="${leftMargin}" y1="${y}" x2="${W - rightMargin}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3 3"/><text x="${leftMargin - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#94a3b8">${val}</text>`;
                    }

                    categories.forEach((cat, cIdx) => {
                        const x0 = leftMargin + cIdx * groupW + (groupW - barW * series.length) / 2;
                        series.forEach((s, sIdx) => {
                            const val = s.values[cIdx] || 0;
                            const barH = (val / maxVal) * plotH;
                            const x = x0 + sIdx * barW;
                            const y = topMargin + plotH - barH;
                            const color = palette[sIdx % palette.length];

                            if (val > 0) {
                                svgContent += `<rect x="${x}" y="${y}" width="${Math.max(2, barW - 1)}" height="${barH}" fill="${color}" rx="3" ry="3"><title>${escapeHtml(s.name)}: ${val}</title></rect>`;
                                svgContent += `<text x="${x + barW/2}" y="${Math.max(topMargin + 8, y - 3)}" text-anchor="middle" font-size="8" font-weight="700" fill="#334155">${val}</text>`;
                            }
                        });
                        const label = escapeHtml(String(cat));
                        svgContent += `<text x="${leftMargin + cIdx * groupW + groupW/2}" y="${topMargin + plotH + 15}" text-anchor="middle" font-size="10" font-weight="600" fill="#475569">${label}</text>`;
                    });
                }

                const legendHtml = series.map((s, idx) => `
                    <div class="chart-legend-item">
                        <span class="legend-color" style="background:${palette[idx % palette.length]}"></span>
                        <span>${escapeHtml(s.name)}</span>
                    </div>
                `).join('');

                return `
                    <section class="chart-card">
                        <h3>${escapeHtml(title)}</h3>
                        <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:230px; overflow:visible;">${svgContent}</svg>
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

            if (!tableBody) return;

            let filtered = records;
            if (query) {
                filtered = records.filter(r =>
                    String(r.ticket || '').toLowerCase().includes(query) ||
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
                    String(r.hora_inicio || r.fecha_inicio || '').toLowerCase().includes(query)
                );
            }

            if (currentSortCol) {
                const mult = currentSortDir === 'desc' ? -1 : 1;
                filtered = [...filtered].sort((a, b) => {
                    let valA = a[currentSortCol];
                    let valB = b[currentSortCol];

                    if (currentSortCol === 'hora_inicio') {
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
                tableBody.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 20px; color: #64748b;">No hay casos pendientes que coincidan con la búsqueda.</td></tr>`;
                return;
            }

            tableBody.innerHTML = filtered.map((r, idx) => {
                let stateClass = "otros";
                const stLower = String(r.estado || '').toLowerCase();
                if (stLower.includes("ejecuc")) stateClass = "ejecucion";
                else if (stLower.includes("pendient")) stateClass = "pendiente";

                const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
                const horaIni = r.hora_inicio || r.fecha_inicio || 'N/A';
                const latVal = r.latitud !== undefined && r.latitud !== null ? r.latitud : (r.lat !== undefined ? r.lat : 'N/A');
                const lonVal = r.longitud !== undefined && r.longitud !== null ? r.longitud : (r.lon !== undefined ? r.lon : 'N/A');

                let rawOdm = String(r.odm || '').trim();
                let odmCellHtml = (!rawOdm || rawOdm === 'N/A' || rawOdm === 'Sin dato' || rawOdm === '0' || rawOdm === '0.0') ? '' : escapeHtml(rawOdm);

                return `
                    <tr style="background: ${bg}; border-bottom: 1px solid #e2e8f0; transition: background 0.15s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='${bg}'">
                        <td style="padding: 7px 10px; font-weight: 700; color: var(--pluz-blue, #375ab2); white-space: nowrap;">${escapeHtml(r.ticket)}</td>
                        <td style="padding: 7px 10px; white-space: nowrap;"><span class="status-badge ${stateClass}">${escapeHtml(r.estado)}</span></td>
                        <td style="padding: 7px 10px; white-space: nowrap;">${escapeHtml(r.empresa)}</td>
                        <td style="padding: 7px 10px; white-space: nowrap;">${escapeHtml(r.falla)}</td>
                        <td style="padding: 7px 10px; white-space: nowrap;">${escapeHtml(r.intervalo)}</td>
                        <td style="padding: 7px 10px; white-space: nowrap;">${escapeHtml(r.dia)}</td>
                        <td style="padding: 7px 10px; white-space: nowrap;">${escapeHtml(r.sed)}${r.es_sed_critica ? ' <span style="font-size:9.5px; font-weight:700; color:#b45309; background:#fef3c7; border:1px solid #fcd34d; padding:1px 5px; border-radius:4px;" title="SED Crítica (Compensación)">🚨 CRÍTICA</span>' : ''}</td>
                        <td style="padding: 7px 10px; font-weight: 600; color: #475569; white-space: nowrap;">${escapeHtml(r.alimentador || 'N/A')}</td>
                        <td style="padding: 7px 10px; text-align: center; white-space: nowrap;">${escapeHtml(r.afectacion)}</td>
                        <td style="padding: 7px 10px; text-align: center; white-space: nowrap;">${escapeHtml(r.llamadas)}</td>
                        <td style="padding: 7px 10px; white-space: nowrap;">${odmCellHtml}</td>
                        <td style="padding: 7px 10px; white-space: nowrap;">${escapeHtml(horaIni)}</td>
                        <td style="padding: 7px 10px; font-family: monospace; white-space: nowrap;">${escapeHtml(latVal)}</td>
                        <td style="padding: 7px 10px; font-family: monospace; white-space: nowrap;">${escapeHtml(lonVal)}</td>
                    </tr>
                `;
            }).join("");
        }

        function refreshDashboard() {
            const records = getFilteredTdOms();
            updateKpiCards(records);
            renderModernCharts(records);
            renderTdOmsTable(records);
        }

        const tblFilterInput = document.getElementById("inputFilterTable");
        if (tblFilterInput) {
            tblFilterInput.addEventListener("input", () => {
                renderTdOmsTable(getFilteredTdOms());
            });
        }

        const chkModal7 = document.getElementById("chk7LlamadasModal");
        if (chkModal7) chkModal7.addEventListener("change", refreshDashboard);
        const chkModalSed = document.getElementById("chkReincSedModal");
        if (chkModalSed) chkModalSed.addEventListener("change", refreshDashboard);
        const chkModalSum = document.getElementById("chkReincSuminModal");
        if (chkModalSum) chkModalSum.addEventListener("change", refreshDashboard);
        const chkModalCrit = document.getElementById("chkCriticaModal");
        if (chkModalCrit) chkModalCrit.addEventListener("change", refreshDashboard);

        document.getElementById("btnResetFilters").addEventListener("click", () => {
            const chk7Mod = document.getElementById("chk7LlamadasModal");
            if (chk7Mod) chk7Mod.checked = false;
            const chkSedMod = document.getElementById("chkReincSedModal");
            if (chkSedMod) chkSedMod.checked = false;
            const chkSumMod = document.getElementById("chkReincSuminModal");
            if (chkSumMod) chkSumMod.checked = false;
            const chkCritMod = document.getElementById("chkCriticaModal");
            if (chkCritMod) chkCritMod.checked = false;

            if (tdCtrlIntervalo) tdCtrlIntervalo.reset();
            if (tdCtrlEmpresa) tdCtrlEmpresa.reset();
            if (tdCtrlFalla) tdCtrlFalla.reset();
            if (tdCtrlEstado) tdCtrlEstado.reset();
            refreshDashboard();
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

            if (assignedContractor !== "*") {
                const targetEmp = assignedContractor.trim().toUpperCase();
                dataset = (dataset || []).filter(item => {
                    const emp = getProp(item, 'Contratista', 'Empresa', 'CONTRATISTA', 'empresa', 'Pto.tbjo.responsable').toUpperCase();
                    return emp !== 'N/A' && (emp.includes(targetEmp) || targetEmp.includes(emp));
                });
            }

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

        document.getElementById('btn-download-base').addEventListener('click', () => {
            downloadExcel(rawData, 'base_pendientes');
        });

        const btnEjecutados = document.getElementById('btn-download-ejecutados');
        if (btnEjecutados) {
            btnEjecutados.addEventListener('click', async () => {
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
                                        downloadExcel(parsed.data, 'base_ejecutados');
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
            });
        }
