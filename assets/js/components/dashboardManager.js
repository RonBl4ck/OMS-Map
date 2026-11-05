/**
 * Dashboard Manager - Componente de Tabla TD-OMS, Filtros Facetados y Exportación
 * Renderizado de tabla responsiva con ordenamiento multi-tipo, sincronización facetada
 * y exportación a Excel / CSV con protección de datos sensibles.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.DashboardManager = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.DashboardManager = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {

    let currentSortCol = null;
    let currentSortDir = 'asc';

    /**
     * Convierte fechas de la fuente a un timestamp numérico para ordenamiento cronológico
     */
    function parseTdOmsDate(value) {
        if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (!value || typeof value !== 'string') return null;

        const clean = value.trim();
        if (!clean) return null;

        const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (dmyMatch) {
            const day = parseInt(dmyMatch[1], 10);
            const month = parseInt(dmyMatch[2], 10) - 1;
            const year = parseInt(dmyMatch[3], 10);
            const hours = parseInt(dmyMatch[4] || '0', 10);
            const minutes = parseInt(dmyMatch[5] || '0', 10);
            const seconds = parseInt(dmyMatch[6] || '0', 10);
            const d = new Date(year, month, day, hours, minutes, seconds);
            return Number.isNaN(d.getTime()) ? null : d.getTime();
        }

        const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (ymdMatch) {
            const year = parseInt(ymdMatch[1], 10);
            const month = parseInt(ymdMatch[2], 10) - 1;
            const day = parseInt(ymdMatch[3], 10);
            const hours = parseInt(ymdMatch[4] || '0', 10);
            const minutes = parseInt(ymdMatch[5] || '0', 10);
            const seconds = parseInt(ymdMatch[6] || '0', 10);
            const d = new Date(year, month, day, hours, minutes, seconds);
            return Number.isNaN(d.getTime()) ? null : d.getTime();
        }

        const fallback = new Date(clean.replace(' ', 'T'));
        return Number.isNaN(fallback.getTime()) ? null : fallback.getTime();
    }

    /**
     * Formatea fecha/hora para visualización corta
     */
    function formatShortDate(value) {
        if (!value) return '';
        const s = String(value).trim();
        if (!s) return '';
        const match = s.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?[T\s]+(\d{1,2}:\d{2})/);
        if (match) {
            const d = match[1].padStart(2, '0');
            const m = match[2].padStart(2, '0');
            const t = match[3];
            return `${d}/${m} ${t}`;
        }
        const timeOnly = s.match(/^(\d{1,2}:\d{2})/);
        if (timeOnly) return timeOnly[1];
        return s.length > 16 ? s.slice(0, 16) : s;
    }

    /**
     * Formatea fecha ISO o similar para el input datetime-local
     */
    function formatForDateTimeLocal(val) {
        if (!val) return '';
        const s = String(val).trim();
        if (s.includes('T')) return s.slice(0, 16);
        if (s.includes(' ') && s.length >= 16) return s.replace(' ', 'T').slice(0, 16);
        return s;
    }

    /**
     * Determina si la última novedad de supervisión de un registro ha sobrepasado su hora de fin estimada
     */
    function isSupervisorLogOverdue(record) {
        if (!record) return false;
        const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(record.ticket) : null;
        if (!supData || !supData.latest || !supData.latest.finEstimado) return false;

        const opState = String(supData.latest.estadoOperativo || supData.latest.estado || '').toUpperCase();
        if (opState.includes('NORMALIZ') || opState.includes('CERRAD') || opState.includes('RESUELT') || opState.includes('CAMPO')) {
            return false;
        }

        const finTimestamp = parseTdOmsDate(supData.latest.finEstimado);
        if (!finTimestamp) return false;

        return Date.now() > finTimestamp;
    }

    /**
     * Obtiene información detallada sobre el estado del Fin Estimado para alertas visuales
     */
    function getSupervisorFinEstimadoInfo(record) {
        if (!record) return null;
        const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(record.ticket) : null;
        if (!supData || !supData.latest || !supData.latest.finEstimado) return null;

        const finStr = String(supData.latest.finEstimado).trim();
        const finTimestamp = parseTdOmsDate(finStr);
        if (!finTimestamp) return null;

        const opState = String(supData.latest.estadoOperativo || supData.latest.estado || '').toUpperCase();
        const isDone = opState.includes('NORMALIZ') || opState.includes('CERRAD') || opState.includes('RESUELT') || opState.includes('CAMPO');

        const now = Date.now();
        const diffMs = now - finTimestamp;
        const isOverdue = !isDone && (diffMs > 0);

        let timeLabel = '';
        if (isOverdue) {
            const mins = Math.floor(diffMs / 60000);
            if (mins < 60) {
                timeLabel = `${mins}m`;
            } else {
                const hrs = Math.floor(mins / 60);
                const remMins = mins % 60;
                timeLabel = remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
            }
        }

        const shortTime = formatShortDate(finStr);
        return {
            finEstimado: finStr,
            isOverdue,
            isDone,
            timeLabel,
            shortTime,
            fullLabel: shortTime || finStr
        };
    }

    /**
     * Ordena la tabla TD-OMS según la columna solicitada
     */
    function sortTdOmsTable(key) {
        if (currentSortCol === key) {
            currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortCol = key;
            currentSortDir = 'asc';
        }
        if (typeof getFilteredTdOms === 'function') {
            renderTdOmsTable(getFilteredTdOms());
        }
    }

    /**
     * Actualiza los iconos de flecha en los encabezados de columna de la tabla
     */
    function updateTableSortHeaderIcons() {
        if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
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

    /**
     * Renderiza la tabla TD-OMS completa
     */
    function renderTdOmsTable(records) {
        if (typeof document === 'undefined') return;
        const tableBody = document.getElementById("tdOmsTableBody");
        const countEl = document.getElementById("tableCasesCount");
        const filterInput = document.getElementById("inputFilterTable");
        const query = filterInput ? filterInput.value.trim().toLowerCase() : "";
        const isPluz = typeof isCurrentUserAdmin === 'function' && isCurrentUserAdmin();

        const thSupOp = document.getElementById("thSupervisorOperativoCol");
        const thSupCrit = document.getElementById("thSupervisorCriticoCol");
        const lblFilterQC = document.getElementById("lblFilterQuanticoCritico");
        const lblFilterOverdue = document.getElementById("lblFilterOverdue");

        if (thSupOp) thSupOp.style.display = isPluz ? "" : "none";
        if (thSupCrit) thSupCrit.style.display = isPluz ? "" : "none";
        if (lblFilterQC) lblFilterQC.style.display = isPluz ? "inline-flex" : "none";
        if (lblFilterOverdue) lblFilterOverdue.style.display = isPluz ? "inline-flex" : "none";

        if (!tableBody) return;

        let filtered = records || [];
        if (query) {
            filtered = (records || []).filter(r => {
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

        const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]));
        const getStatusClass = (typeof getOmsStatusClass === 'function') ? getOmsStatusClass : (s => (typeof DomUtils !== 'undefined' && DomUtils.getOmsStatusClass) ? DomUtils.getOmsStatusClass(s) : 'otros');
        const getBadgeClass = (typeof getSupervisorBadgeClass === 'function') ? getSupervisorBadgeClass : (typeof SupervisorService !== 'undefined' ? SupervisorService.getSupervisorBadgeClass : () => 'sup-status-generic');
        const getCritBadge = (typeof getCriticoBadgeClass === 'function') ? getCriticoBadgeClass : (typeof SupervisorService !== 'undefined' ? SupervisorService.getCriticoBadgeClass : () => 'sup-status-normal');

        tableBody.innerHTML = filtered.map((r, idx) => {
            const stateClass = getStatusClass(r.estado);

            const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
            const overdueInfo = (isPluz && typeof getSupervisorFinEstimadoInfo === 'function') ? getSupervisorFinEstimadoInfo(r) : null;
            const isOverdue = !!(overdueInfo && overdueInfo.isOverdue);
            const rowBg = isOverdue ? "#fffbeb" : bg;
            const rowBorderLeft = isOverdue ? "border-left: 4px solid #f59e0b;" : "";
            const rowClass = isOverdue ? "row-sup-overdue" : "";
            const horaIni = r.hora_inicio || r.fecha_inicio || 'N/A';
            const horaIniShort = formatShortDate(horaIni);

            let rawOdm = String(r.odm || '').trim();
            let odmCellHtml = (!rawOdm || rawOdm === 'N/A' || rawOdm === 'Sin dato' || rawOdm === '0' || rawOdm === '0.0') ? '' : esc(rawOdm);

            let supOperativoTdHtml = '';
            let supCriticoTdHtml = '';
            if (isPluz) {
                const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(r.ticket) : null;
                if (supData && supData.latest) {
                    const supLatest = supData.latest;
                    const countHist = (supData.history && Array.isArray(supData.history)) ? supData.history.length : 1;
                    
                    const opEstado = supLatest.estadoOperativo || supLatest.estado || 'PENDIENTE';
                    const opDetalle = supLatest.detalleOperativo || supLatest.detalle || '';
                    const opJc = supLatest.jefeCuadrilla || '';
                    const opBadgeClass = getBadgeClass(opEstado);
                    const opSnippet = opDetalle ? esc(opDetalle.length > 40 ? opDetalle.slice(0, 37) + '...' : opDetalle) : '';

                    supOperativoTdHtml = `
                        <td data-label="Estado (PLUZ)" style="padding: 6px 10px; min-width: 140px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 2px;">
                                <span class="sup-status-badge ${opBadgeClass}">${esc(opEstado)}</span>
                                <button type="button" class="btn-sup-action" onclick="openSupervisorModal('${esc(r.ticket)}')" title="Historial (${countHist}) - Clic para actualizar" aria-label="Actualizar estado operativo">
                                    🔄
                                </button>
                            </div>
                            ${opJc ? `<div style="font-size: 10px; font-weight: 700; color: #1e293b; line-height: 1.2;">JC: ${esc(opJc)}</div>` : ''}
                            ${overdueInfo ? (
                                overdueInfo.isOverdue ? `
                                    <div class="sup-eta-tag overdue" style="margin-top: 3px;" title="Fin estimado: ${esc(overdueInfo.fullLabel)} (vencido hace ${esc(overdueInfo.timeLabel)})">
                                        <span>⚠️</span>
                                        <span>VENCIDO (${esc(overdueInfo.timeLabel)})</span>
                                    </div>
                                ` : (!overdueInfo.isDone ? `
                                    <div class="sup-eta-tag pending" style="margin-top: 3px;" title="Fin estimado: ${esc(overdueInfo.fullLabel)}">
                                        <span>⏱️</span>
                                        <span>Fin: ${esc(overdueInfo.shortTime)}</span>
                                    </div>
                                ` : '')
                            ) : ''}
                            ${opSnippet ? `<div style="font-size: 10px; color: #475569; font-style: italic; line-height: 1.2;" title="${esc(opDetalle)}">"${opSnippet}"</div>` : ''}
                        </td>
                    `;

                    const critEstado = supLatest.estadoCritico || '';
                    const rawCritDetalle = String(supLatest.detalleCritico || '').trim();
                    const isNaCritDetalle = !rawCritDetalle || /^n\/?a$/i.test(rawCritDetalle) || rawCritDetalle === '-';
                    const critBadgeClass = getCritBadge(critEstado);
                    const critSnippet = !isNaCritDetalle ? esc(rawCritDetalle.length > 40 ? rawCritDetalle.slice(0, 37) + '...' : rawCritDetalle) : '';

                    supCriticoTdHtml = `
                        <td data-label="Criticidad (PLUZ)" style="padding: 6px 10px; min-width: 130px;">
                            ${critEstado ? `
                                <div style="margin-bottom: 2px;">
                                    <span class="sup-status-badge ${critBadgeClass}">${esc(critEstado)}</span>
                                </div>
                                ${critSnippet ? `<div style="font-size: 10px; color: #831843; font-style: italic; line-height: 1.2;" title="${esc(rawCritDetalle)}">"${critSnippet}"</div>` : ''}
                            ` : `
                                <span style="font-size: 10px; color: #94a3b8;">NORMAL</span>
                            `}
                        </td>
                    `;
                } else {
                    supOperativoTdHtml = `
                        <td data-label="Estado (PLUZ)" style="padding: 6px 10px; white-space: nowrap;">
                            <button type="button" class="btn-sup-new" onclick="openSupervisorModal('${esc(r.ticket)}')" title="Registrar novedad de supervisión PLUZ">
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
                <tr class="${rowClass}" style="background: ${rowBg}; border-bottom: 1px solid #e2e8f0; ${rowBorderLeft}">
                    <td data-label="Ticket" style="padding: 7px 10px; white-space: nowrap;">
                        <div class="ticket-cell">
                            <span class="ticket-number">${esc(r.ticket)}</span>
                            <button type="button" class="btn-ticket-pin" onclick="navigateToTicketOnMap('${esc(r.ticket)}')" title="Localizar ticket #${esc(r.ticket)} en el mapa" aria-label="Localizar ticket #${esc(r.ticket)} en el mapa">📍</button>
                            ${(isPluz && (r.suministro_reincidente || (r.suministro_count >= 2))) ? `
                                <button type="button" class="btn-ticket-reinc" onclick="event.stopPropagation(); openSuministroHistoryModal('${esc(r.ticket)}')" title="⚠️ Suministro Reincidente: ${esc(r.suministro_count)} fallas (${esc(r.suministro_ventana_dias || 7)}D). Clic para ver historial de notas">⚠️ x${esc(r.suministro_count)}</button>
                            ` : ''}
                        </div>
                    </td>
                    <td data-label="ODM" style="padding: 7px 10px; white-space: nowrap;">${odmCellHtml}</td>
                    <td data-label="Hora de inicio" style="padding: 7px 10px; white-space: nowrap;" title="${esc(horaIni)}">${esc(horaIniShort)}</td>
                    <td data-label="SED" style="padding: 7px 10px; white-space: nowrap;">
                        ${r.es_sed_critica ? `<button type="button" class="sed-critical-link" onclick="if(typeof openCriticalSedPanel==='function') openCriticalSedPanel('${esc(r.sed)}')" title="Ver historial y análisis de la SED Crítica ${esc(r.sed)}">${esc(r.sed)}</button>` : esc(r.sed)}
                    </td>
                    <td data-label="Falla" style="padding: 7px 10px; white-space: nowrap;">${esc(r.falla)}</td>
                    <td data-label="Llamadas" style="padding: 7px 10px; text-align: center; white-space: nowrap;">${esc(r.llamadas)}</td>
                    <td data-label="Estado" style="padding: 7px 10px; white-space: nowrap;"><span class="status-badge ${stateClass}">${esc(r.estado)}</span></td>
                    <td data-label="Empresa" style="padding: 7px 10px; white-space: nowrap;">${esc(r.empresa)}</td>
                    <td data-label="Intervalo" style="padding: 7px 10px; white-space: nowrap;">${esc(r.intervalo)}</td>
                    <td data-label="Alimentador" style="padding: 7px 10px; font-weight: 600; color: #475569; white-space: nowrap;">${esc(r.alimentador || 'N/A')}</td>
                    <td data-label="Afectación" style="padding: 7px 10px; text-align: center; white-space: nowrap;">${esc(r.afectacion)}</td>
                    ${supOperativoTdHtml}
                    ${supCriticoTdHtml}
                </tr>
            `;
        }).join("");
    }

    /**
     * Refresca los controles facetados de TD-OMS
     */
    function refreshTdFacets(records, controls) {
        if (!records || !controls) return;
        const TD_FILTER_FIELDS = {
            dia: 'dia',
            intervalo: 'intervalo',
            empresa: 'empresa',
            falla: 'falla',
            estado: 'estado'
        };

        if (typeof refreshFacetedControls === 'function') {
            refreshFacetedControls(records, TD_FILTER_FIELDS, controls);
        } else if (typeof DomUtils !== 'undefined' && typeof DomUtils.getFacetedFilterValues === 'function') {
            const selections = {};
            Object.keys(controls).forEach(key => {
                const ctrl = controls[key];
                selections[key] = ctrl && typeof ctrl.getSelected === 'function' ? ctrl.getSelected() : [];
            });
            Object.keys(controls).forEach(key => {
                const ctrl = controls[key];
                if (ctrl && typeof ctrl.updateOptions === 'function') {
                    const field = TD_FILTER_FIELDS[key] || key;
                    const facetedValues = DomUtils.getFacetedFilterValues(records, field, TD_FILTER_FIELDS, selections, key);
                    ctrl.updateOptions(facetedValues);
                }
            });
        }
    }

    /**
     * Aplica los filtros facetados de TD-OMS y refresca la vista
     */
    function applyTdFilters() {
        const controls = {
            tdMultiDia: (typeof tdCtrlDia !== 'undefined') ? tdCtrlDia : null,
            tdMultiIntervalo: (typeof tdCtrlIntervalo !== 'undefined') ? tdCtrlIntervalo : null,
            tdMultiEmpresa: (typeof tdCtrlEmpresa !== 'undefined') ? tdCtrlEmpresa : null,
            tdMultiFalla: (typeof tdCtrlFalla !== 'undefined') ? tdCtrlFalla : null,
            tdMultiEstado: (typeof tdCtrlEstado !== 'undefined') ? tdCtrlEstado : null
        };
        const records = (typeof tdOmsRecords !== 'undefined' && Array.isArray(tdOmsRecords)) ? tdOmsRecords : [];
        refreshTdFacets(records, controls);
        if (typeof refreshDashboard === 'function') {
            refreshDashboard();
        }
    }

    // Lazy load SheetJS
    let xlsxLoadPromise = null;
    function ensureXlsxLoaded() {
        if (typeof XLSX !== 'undefined') return Promise.resolve(true);
        if (xlsxLoadPromise) return xlsxLoadPromise;

        xlsxLoadPromise = new Promise(resolve => {
            if (typeof document === 'undefined') return resolve(false);
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            script.async = true;
            script.onload = () => resolve(typeof XLSX !== 'undefined');
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
        return xlsxLoadPromise;
    }

    /**
     * Descarga dataset en formato Excel (.xlsx) o CSV como respaldo
     */
    async function downloadExcel(dataset, prefix) {
        const assignedContractor = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem("oms_assigned_contractor") : null;

        if (!assignedContractor) {
            if (typeof alert === 'function') alert("⚠️ No hay datos registrados para descargar para tu empresa asignada.");
            return;
        }

        const filterForContractor = (typeof filterRecordsForAssignedContractor === 'function')
            ? filterRecordsForAssignedContractor
            : (ds, c) => (!c || c === '*') ? ds : (ds || []).filter(r => String(r.empresa || '').toUpperCase() === c.toUpperCase());

        dataset = filterForContractor(dataset, assignedContractor);

        if (!dataset || dataset.length === 0) {
            if (typeof alert === 'function') alert("⚠️ No hay datos registrados para descargar para tu empresa asignada.");
            return;
        }

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
            if (xlsxAvailable && typeof XLSX !== 'undefined') {
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
            } else if (typeof Papa !== 'undefined') {
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
            if (typeof alert === 'function') alert("❌ Error al generar archivo Excel: " + err);
        }
    }

    const downloadPendingBase = () => {
        const raw = (typeof rawData !== 'undefined') ? rawData : [];
        downloadExcel(raw, 'base_pendientes');
    };

    /**
     * Exporta la base de tickets ejecutados reutilizando datos en memoria
     */
    const downloadExecutedBase = async () => {
        let downloaded = false;
        const filterForContractor = (typeof filterRecordsForAssignedContractor === 'function')
            ? filterRecordsForAssignedContractor
            : (ds, c) => (!c || c === '*') ? ds : (ds || []).filter(r => String(r.empresa || '').toUpperCase() === c.toUpperCase());

        if (typeof window !== 'undefined' && Array.isArray(window.ejecutadosRecords) && window.ejecutadosRecords.length > 0) {
            const assignedContractor = typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem("oms_assigned_contractor") || "*") : "*";
            const filteredData = filterForContractor(window.ejecutadosRecords, assignedContractor);
            if (filteredData.length === 0) {
                if (typeof alert === 'function') alert('⚠️ No hay registros ejecutados para tu empresa en este período.');
                return;
            }
            downloadExcel(filteredData, 'base_ejecutados');
            return;
        }

        const sheetExecUrl = (typeof GOOGLE_SHEET_EJECUTADOS_URL !== 'undefined') ? GOOGLE_SHEET_EJECUTADOS_URL : "";
        const sheetCsvUrl = (typeof GOOGLE_SHEET_CSV_URL !== 'undefined') ? GOOGLE_SHEET_CSV_URL : "";

        if (sheetExecUrl || sheetCsvUrl) {
            let targetUrl = sheetExecUrl;
            if (!targetUrl && sheetCsvUrl) {
                const match = sheetCsvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
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
                            const parsed = (typeof Papa !== 'undefined') ? Papa.parse(text, { header: true, skipEmptyLines: true }) : { data: [] };
                            if (parsed.data && parsed.data.length > 0) {
                                const assignedContractor = typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem("oms_assigned_contractor") || "*") : "*";
                                const filteredData = filterForContractor(parsed.data, assignedContractor);
                                if (filteredData.length === 0) {
                                    if (typeof alert === 'function') alert('⚠️ No hay registros ejecutados para tu empresa en este período.');
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
            if (typeof alert === 'function') alert('⚠️ No se pudo obtener la base de ejecutados desde Google Sheets. Intenta nuevamente cuando la hoja esté disponible.');
        }
    };

    /**
     * Exporta la tabla TD-OMS filtrada enriquecida con columnas de supervisión
     */
    const exportFilteredTdOmsTable = () => {
        const currentFiltered = (typeof getFilteredTdOms === 'function') ? getFilteredTdOms() : [];
        const filterInput = typeof document !== 'undefined' ? document.getElementById("inputFilterTable") : null;
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
            if (typeof alert === 'function') alert("⚠️ No hay registros visibles en la tabla para exportar.");
            return;
        }

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
                row["Fin Estimado (PLUZ)"] = latest ? (latest.finEstimado || "") : "";
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

    return {
        parseTdOmsDate,
        formatShortDate,
        formatForDateTimeLocal,
        isSupervisorLogOverdue,
        getSupervisorFinEstimadoInfo,
        sortTdOmsTable,
        updateTableSortHeaderIcons,
        renderTdOmsTable,
        refreshTdFacets,
        applyTdFilters,
        ensureXlsxLoaded,
        downloadExcel,
        downloadPendingBase,
        downloadExecutedBase,
        exportFilteredTdOmsTable
    };
}));
