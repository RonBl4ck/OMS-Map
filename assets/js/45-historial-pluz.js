/**
 * assets/js/45-historial-pluz.js
 * Módulo de Historial y Auditoría de Supervisión PLUZ
 * Historial de Tickets Críticos, Quánticos, Operativos y Seguimiento por SED
 */

(function () {
    let currentFilterType = 'ALL'; // 'ALL', 'QUANTICO', 'CRITICO', 'VENCIDO', 'IMPEDIDO', 'EJECUCION'
    let currentSearchQuery = '';
    let currentFilterSed = '';
    let expandedTickets = new Set();
    let isAllExpanded = false;

    /**
     * Auto-enriquece en memoria los registros de supervisión con datos de OMS
     * (SED, Hora de Inicio, Alimentador, Empresa) para registros pasados que tenían celdas vacías.
     */
    function enrichSupervisorRecordsWithOmsData() {
        if (typeof supervisorRecordsMap === 'undefined' || !supervisorRecordsMap.size) return;

        const allSources = [
            ...(typeof tdOmsRecords !== 'undefined' && Array.isArray(tdOmsRecords) ? tdOmsRecords : []),
            ...(typeof ejecutadosRecords !== 'undefined' && Array.isArray(ejecutadosRecords) ? ejecutadosRecords : []),
            ...(typeof llamadasRecords !== 'undefined' && Array.isArray(llamadasRecords) ? llamadasRecords : [])
        ];

        if (!allSources.length) return;

        for (const [tKey, record] of supervisorRecordsMap.entries()) {
            if (!record) continue;
            const ticket = String(record.latest?.ticket || tKey).trim().toLowerCase();

            // Buscar coincidencia en OMS
            const match = allSources.find(s => {
                const st = String(s.ticket || s.Ticket || s.aviso || '').trim().toLowerCase();
                return st === ticket;
            });

            if (match) {
                const foundSed = match.sed || match.SED || match.SED_CANONICA || '';
                const foundHora = match.hora_inicio || match.fecha_inicio || match.horaRegistro || match.HoraRegistro || '';
                const foundAli = match.alimentador || match.Alimentador || match.ALIMENTADOR || '';
                const foundEmp = match.empresa || match.Empresa || match.Contratista || '';

                if (Array.isArray(record.history)) {
                    record.history.forEach(item => {
                        if ((!item.sed || item.sed === 'N/A') && foundSed) item.sed = foundSed;
                        if ((!item.horaInicio || item.horaInicio === 'N/A') && foundHora) item.horaInicio = foundHora;
                        if ((!item.alimentador || item.alimentador === 'N/A') && foundAli) item.alimentador = foundAli;
                        if ((!item.empresa || item.empresa === 'N/A') && foundEmp) item.empresa = foundEmp;
                    });
                }

                if (record.latest) {
                    if ((!record.latest.sed || record.latest.sed === 'N/A') && foundSed) record.latest.sed = foundSed;
                    if ((!record.latest.horaInicio || record.latest.horaInicio === 'N/A') && foundHora) record.latest.horaInicio = foundHora;
                    if ((!record.latest.alimentador || record.latest.alimentador === 'N/A') && foundAli) record.latest.alimentador = foundAli;
                    if ((!record.latest.empresa || record.latest.empresa === 'N/A') && foundEmp) record.latest.empresa = foundEmp;
                }

                // Indexar en supervisorRecordsBySedMap si faltaba
                if (foundSed && typeof supervisorRecordsBySedMap !== 'undefined') {
                    const sKey = String(foundSed).trim().toUpperCase();
                    let sList = supervisorRecordsBySedMap.get(sKey);
                    if (!sList) {
                        sList = [];
                        supervisorRecordsBySedMap.set(sKey, sList);
                    }
                    (record.history || []).forEach(h => {
                        if (!sList.includes(h)) sList.push(h);
                    });
                }
            }
        }
    }

    function isEntryQuantico(entry) {
        if (!entry) return false;
        const c = String(entry.estadoCritico || '').toUpperCase();
        const op = String(entry.estadoOperativo || entry.estado || '').toUpperCase();
        return c.includes('QUANT') || op.includes('QUANT');
    }

    function isEntryCritico(entry) {
        if (!entry) return false;
        const c = String(entry.estadoCritico || '').toUpperCase();
        const op = String(entry.estadoOperativo || entry.estado || '').toUpperCase();
        return c.includes('CRIT') || op.includes('CRIT');
    }

    function isTicketQuanticoOrCritico(data) {
        if (!data || !data.latest) return false;
        if (isEntryQuantico(data.latest) || isEntryCritico(data.latest)) return true;
        if (Array.isArray(data.history)) {
            return data.history.some(h => isEntryQuantico(h) || isEntryCritico(h));
        }
        return false;
    }

    /**
     * Devuelve la lista de tickets que son exclusivamente Quánticos o Críticos
     */
    function getSupervisorTicketsList() {
        enrichSupervisorRecordsWithOmsData();
        if (typeof supervisorRecordsMap === 'undefined') return [];

        const list = [];
        for (const [key, data] of supervisorRecordsMap.entries()) {
            if (data && data.latest && isTicketQuanticoOrCritico(data)) {
                list.push(data);
            }
        }

        // Ordenar por la fecha de la última novedad desc
        list.sort((a, b) => {
            const dateA = new Date(String(a.latest.fecha || '').replace(' ', 'T')).getTime() || 0;
            const dateB = new Date(String(b.latest.fecha || '').replace(' ', 'T')).getTime() || 0;
            return dateB - dateA;
        });

        return list;
    }

    /**
     * Renderiza la vista principal del Historial PLUZ
     */
    function renderHistorialPluz() {
        if (typeof isCurrentUserAdmin === 'function' && !isCurrentUserAdmin()) return;

        const allTickets = getSupervisorTicketsList();

        // 1. Calcular KPIs superiores (solo Quánticos y Críticos)
        let countTotal = allTickets.length;
        let countQuantico = 0;
        let countCritico = 0;
        const sedSet = new Set();

        allTickets.forEach(t => {
            const hasQuant = isEntryQuantico(t.latest) || (t.history || []).some(isEntryQuantico);
            const hasCrit = isEntryCritico(t.latest) || (t.history || []).some(isEntryCritico);

            if (hasQuant) countQuantico++;
            if (hasCrit) countCritico++;

            const sed = String(t.latest?.sed || '').trim().toUpperCase();
            if (sed && sed !== 'N/A' && sed !== 'SIN SED') sedSet.add(sed);
        });

        const elKpiTotal = document.getElementById('hpKpiTotalTickets');
        const elKpiSeds = document.getElementById('hpKpiTotalSeds');
        const elKpiQuant = document.getElementById('hpKpiTotalQuanticos');
        const elKpiCrit = document.getElementById('hpKpiTotalCriticos');

        if (elKpiTotal) elKpiTotal.textContent = countTotal;
        if (elKpiSeds) elKpiSeds.textContent = sedSet.size;
        if (elKpiQuant) elKpiQuant.textContent = countQuantico;
        if (elKpiCrit) elKpiCrit.textContent = countCritico;

        // Actualizar contadores en los chips
        const badgeAll = document.getElementById('hpBadgeCountAll');
        const badgeQuant = document.getElementById('hpBadgeCountQuantico');
        const badgeCrit = document.getElementById('hpBadgeCountCritico');

        if (badgeAll) badgeAll.textContent = countTotal;
        if (badgeQuant) badgeQuant.textContent = countQuantico;
        if (badgeCrit) badgeCrit.textContent = countCritico;

        // 2. Filtrar tickets según búsqueda, filtro de SED y chip activo (ALL, QUANTICO, CRITICO)
        const query = currentSearchQuery.trim().toLowerCase();
        const activeSed = currentFilterSed.trim().toUpperCase();

        const filtered = allTickets.filter(t => {
            const hasQuant = isEntryQuantico(t.latest) || (t.history || []).some(isEntryQuantico);
            const hasCrit = isEntryCritico(t.latest) || (t.history || []).some(isEntryCritico);

            // Filtro por Chip
            if (currentFilterType === 'QUANTICO' && !hasQuant) return false;
            if (currentFilterType === 'CRITICO' && !hasCrit) return false;

            // Filtro por SED activa
            if (activeSed) {
                const tSed = String(t.latest?.sed || '').trim().toUpperCase();
                const hasSedInHistory = (t.history || []).some(h => String(h.sed || '').trim().toUpperCase() === activeSed);
                if (tSed !== activeSed && !hasSedInHistory) return false;
            }

            // Filtro por Texto de Búsqueda
            if (query) {
                const latest = t.latest || {};
                const ticketStr = String(latest.ticket || '').toLowerCase();
                const sedStr = String(latest.sed || '').toLowerCase();
                const aliStr = String(latest.alimentador || '').toLowerCase();
                const empStr = String(latest.empresa || '').toLowerCase();
                const jcStr = String(latest.jefeCuadrilla || '').toLowerCase();
                const detOp = String(latest.detalleOperativo || '').toLowerCase();
                const detCrit = String(latest.detalleCritico || '').toLowerCase();

                // También buscar dentro de todo el historial del ticket
                const historyMatch = (t.history || []).some(h => {
                    return String(h.detalleOperativo || '').toLowerCase().includes(query) ||
                           String(h.detalleCritico || '').toLowerCase().includes(query) ||
                           String(h.jefeCuadrilla || '').toLowerCase().includes(query) ||
                           String(h.estadoOperativo || '').toLowerCase().includes(query);
                });

                const matchesDirect = ticketStr.includes(query) ||
                                      sedStr.includes(query) ||
                                      aliStr.includes(query) ||
                                      empStr.includes(query) ||
                                      jcStr.includes(query) ||
                                      detOp.includes(query) ||
                                      detCrit.includes(query);

                if (!matchesDirect && !historyMatch) return false;
            }

            return true;
        });

        // Actualizar indicador de filtro de SED activo
        const sedContainer = document.getElementById('hpActiveSedContainer');
        const sedText = document.getElementById('hpActiveSedText');
        if (sedContainer && sedText) {
            if (activeSed) {
                sedText.textContent = activeSed;
                sedContainer.style.display = 'inline-flex';
            } else {
                sedContainer.style.display = 'none';
            }
        }

        // Mostrar / ocultar botón de limpieza interna en el input de búsqueda
        const btnClearSearch = document.getElementById('btnClearSearchInput');
        if (btnClearSearch) {
            btnClearSearch.style.display = query ? 'inline-block' : 'none';
        }

        updateExpandAllButtonUi();

        // 3. Renderizar la lista
        const container = document.getElementById('historialPluzListContainer');
        const countHeader = document.getElementById('hpFilteredCount');
        if (countHeader) countHeader.textContent = filtered.length;

        if (!container) return;

        if (!filtered.length) {
            container.innerHTML = `
                <div style="text-align: center; padding: 48px 20px; color: #64748b; background: white; border-radius: 10px; border: 1px dashed #cbd5e1;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
                    <div style="font-size: 15px; font-weight: 700; color: #1e293b;">No se encontraron registros de supervisión</div>
                    <div style="font-size: 12px; margin-top: 4px; color: #64748b;">Prueba ajustando el texto de búsqueda o cambiando el filtro de criticidad o SED.</div>
                    ${(query || activeSed) ? `<button type="button" onclick="clearHistorialPluzSearch()" style="margin-top: 12px; background: #0284c7; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;">Restablecer filtros</button>` : ''}
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(t => {
            const latest = t.latest;
            const history = t.history || [latest];
            const cleanTicket = String(latest.ticket).trim();
            const isExpanded = expandedTickets.has(cleanTicket) || filtered.length <= 2;

            const opEst = latest.estadoOperativo || latest.estado || 'PENDIENTE';
            const critEst = latest.estadoCritico || '';
            const opBadgeClass = typeof getSupervisorBadgeClass === 'function' ? getSupervisorBadgeClass(opEst) : 'sup-status-normal';
            const critBadgeClass = critEst && typeof getCriticoBadgeClass === 'function' ? getCriticoBadgeClass(critEst) : '';

            const sedVal = latest.sed && latest.sed !== 'N/A' && latest.sed !== 'SIN SED' ? latest.sed : 'SIN SED';
            const horaIni = latest.horaInicio && latest.horaInicio !== 'N/A' ? latest.horaInicio : '--';
            const alimentador = latest.alimentador && latest.alimentador !== 'N/A' ? latest.alimentador : '--';
            const empresa = latest.empresa && latest.empresa !== 'N/A' ? latest.empresa : '--';
            const jcVal = latest.jefeCuadrilla || '';

            const critNorm = critEst.toLowerCase();
            const opNorm = opEst.toLowerCase();
            let cardModifierClass = 'is-normal';

            if (critNorm.includes('crit')) {
                cardModifierClass = 'is-critico';
            } else if (critNorm.includes('quant')) {
                cardModifierClass = 'is-quantico';
            } else if (critNorm.includes('vencid')) {
                cardModifierClass = 'is-vencido';
            } else if (opNorm.includes('imped')) {
                cardModifierClass = 'is-impedimento';
            } else if (opNorm.includes('ejecuc')) {
                cardModifierClass = 'is-ejecucion';
            }

            return `
                <div class="hp-ticket-card ${cardModifierClass}" id="hpCard_${cleanTicket}">
                    <!-- Cabecera de la tarjeta del ticket (clic para expandir/contraer con retroalimentación física) -->
                    <div class="hp-card-header" onclick="toggleHistorialPluzCard('${cleanTicket}')" role="button" aria-expanded="${isExpanded}">
                        <div class="hp-card-title-row">
                            <span class="hp-ticket-id">
                                🎫 #${cleanTicket}
                            </span>
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <span class="sup-status-badge ${opBadgeClass}">⚙️ ${escapeHtml(opEst)}</span>
                                ${critEst ? `<span class="sup-status-badge ${critBadgeClass}">${escapeHtml(critEst)}</span>` : ''}
                                <span class="hp-chevron">
                                    <span class="hp-chevron-text" id="hpChevron_${cleanTicket}" data-count="${history.length}">
                                        ${isExpanded ? '▲ Contraer' : `▼ Historial (${history.length})`}
                                    </span>
                                </span>
                            </div>
                        </div>

                        <div class="hp-card-meta-row">
                            ${sedVal !== 'SIN SED' ? `
                                <button type="button" class="hp-sed-pill" onclick="event.stopPropagation(); filterHistorialPluzBySed('${escapeHtml(sedVal)}')" title="Filtrar por esta SED">
                                    🏢 SED: ${escapeHtml(sedVal)}
                                </button>
                            ` : `<span style="font-size: 10.5px; color: #94a3b8; font-weight: 600;">(Sin SED)</span>`}
                            
                            <span>🕒 Inicio: <b>${escapeHtml(horaIni)}</b></span>
                            ${alimentador !== '--' ? `<span>⚡ Ali: <b>${escapeHtml(alimentador)}</b></span>` : ''}
                            ${empresa !== '--' ? `<span style="background: #f1f5f9; padding: 2px 7px; border-radius: 4px; font-weight: 700; color: #334155;">🏢 ${escapeHtml(empresa)}</span>` : ''}
                            ${jcVal ? `<span style="font-weight: 700; color: #1e293b; background: #e2e8f0; padding: 2px 7px; border-radius: 4px;">JC: ${escapeHtml(jcVal)}</span>` : ''}
                        </div>
                    </div>

                    <!-- Acordeón Fluido con CSS Grid (Emil Kowalski) -->
                    <div class="hp-card-collapse-wrapper ${isExpanded ? 'expanded' : ''}" id="hpCollapse_${cleanTicket}">
                        <div class="hp-card-collapse-inner">
                            <div class="hp-card-body-content">
                                <div class="hp-card-actions-bar">
                                    <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.4px;">
                                        📜 Línea de tiempo de actualizaciones (${history.length} registros)
                                    </div>
                                    <div style="display: flex; gap: 8px;">
                                        <button type="button" class="hp-btn-primary" onclick="event.stopPropagation(); openSupervisorModal('${cleanTicket}')">
                                            <span>➕</span>
                                            <span>Agregar Novedad</span>
                                        </button>
                                        <button type="button" class="hp-btn-ghost" onclick="event.stopPropagation(); locateTicketOnMap('${cleanTicket}')">
                                            <span>📍</span>
                                            <span>Ubicar en Mapa</span>
                                        </button>
                                    </div>
                                </div>

                                <div class="hp-timeline-list">
                                    ${history.map((h, hIdx) => {
                                        const hOp = h.estadoOperativo || h.estado || 'PENDIENTE';
                                        const hCrit = h.estadoCritico || '';
                                        const hOpClass = typeof getSupervisorBadgeClass === 'function' ? getSupervisorBadgeClass(hOp) : 'sup-status-normal';
                                        const hCritClass = hCrit && typeof getCriticoBadgeClass === 'function' ? getCriticoBadgeClass(hCrit) : '';
                                        const hJc = h.jefeCuadrilla || '';
                                        const hOpDet = h.detalleOperativo || h.detalle || '';
                                        const hCritDet = h.detalleCritico || '';

                                        return `
                                            <div class="hp-timeline-item">
                                                <div class="hp-timeline-bullet"></div>
                                                <div class="hp-timeline-box">
                                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                                                        <div style="display: flex; align-items: center; gap: 6px;">
                                                            <span class="sup-status-badge ${hOpClass}" style="font-size: 10px; padding: 2px 7px;">⚙️ ${escapeHtml(hOp)}</span>
                                                            ${hCrit ? `<span class="sup-status-badge ${hCritClass}" style="font-size: 10px; padding: 2px 7px;">${escapeHtml(hCrit)}</span>` : ''}
                                                            ${hJc ? `<span style="font-size: 10.5px; font-weight: 700; color: #1e293b;">JC: ${escapeHtml(hJc)}</span>` : ''}
                                                            ${h.finEstimado ? `<span style="font-size: 10px; font-weight: 700; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 1px 6px; border-radius: 4px;">⏱️ Fin Est: ${escapeHtml(h.finEstimado)}</span>` : ''}
                                                        </div>
                                                        <span style="font-size: 10.5px; color: #64748b; font-weight: 600;">
                                                            🕒 ${escapeHtml(h.fecha || '')} • por <b>${escapeHtml(h.usuario || 'PLUZ')}</b>
                                                        </span>
                                                    </div>
                                                    ${hOpDet ? `<div style="font-size: 11.5px; color: #1e293b; line-height: 1.45; margin-bottom: 4px;"><b>Operativo:</b> ${escapeHtml(hOpDet)}</div>` : ''}
                                                    ${hCritDet && !/^n\/?a$/i.test(hCritDet) ? `<div style="font-size: 11.5px; color: #9d174d; line-height: 1.45;"><b>Criticidad:</b> ${escapeHtml(hCritDet)}</div>` : ''}
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Alternar expansión de una tarjeta con animación fluida
     */
    function toggleHistorialPluzCard(ticket) {
        const clean = String(ticket).trim();
        const willExpand = !expandedTickets.has(clean);
        if (willExpand) {
            expandedTickets.add(clean);
        } else {
            expandedTickets.delete(clean);
        }
        const collapseEl = document.getElementById(`hpCollapse_${clean}`);
        const chevronEl = document.getElementById(`hpChevron_${clean}`);
        if (collapseEl) {
            collapseEl.classList.toggle('expanded', willExpand);
        }
        if (chevronEl) {
            const count = chevronEl.getAttribute('data-count') || '';
            chevronEl.textContent = willExpand ? '▲ Contraer' : `▼ Historial (${count})`;
        }
    }

    /**
     * Actualiza la interfaz del botón 'Expandir Todo / Contraer Todo'
     */
    function updateExpandAllButtonUi() {
        const label = document.getElementById('hpToggleAllLabel');
        const icon = document.getElementById('hpToggleAllIcon');
        if (label) label.textContent = isAllExpanded ? 'Contraer Todo' : 'Expandir Todo';
        if (icon) icon.textContent = isAllExpanded ? '▲' : '▼';
    }

    /**
     * Alternar expansión masiva de todas las tarjetas
     */
    function toggleExpandAllHistorialPluz() {
        isAllExpanded = !isAllExpanded;
        const allTickets = getSupervisorTicketsList();
        allTickets.forEach(t => {
            const clean = String(t.latest?.ticket || '').trim();
            if (!clean) return;
            if (isAllExpanded) {
                expandedTickets.add(clean);
            } else {
                expandedTickets.delete(clean);
            }
        });
        updateExpandAllButtonUi();
        document.querySelectorAll('.hp-card-collapse-wrapper').forEach(wrapper => {
            wrapper.classList.toggle('expanded', isAllExpanded);
        });
        document.querySelectorAll('.hp-chevron-text').forEach(span => {
            const count = span.getAttribute('data-count') || '';
            span.textContent = isAllExpanded ? '▲ Contraer' : `▼ Historial (${count})`;
        });
    }

    /**
     * Filtrar al hacer clic en una SED (con soporte para chip explícito)
     */
    function filterHistorialPluzBySed(sedCode) {
        currentFilterSed = String(sedCode || '').trim().toUpperCase();
        renderHistorialPluz();
    }

    /**
     * Quitar filtro de SED
     */
    function removeSedFilter() {
        currentFilterSed = '';
        renderHistorialPluz();
    }

    /**
     * Ubicar ticket en el mapa
     */
    function locateTicketOnMap(ticket) {
        if (typeof showMapView === 'function') {
            showMapView();
        }
        setTimeout(() => {
            if (typeof focusTicketInMap === 'function') {
                focusTicketInMap(ticket);
            }
        }, 150);
    }

    /**
     * Actualiza la selección visual de chips
     */
    function updateFilterChipsUi() {
        const chips = document.querySelectorAll('.hp-filter-chip');
        chips.forEach(btn => {
            const val = btn.getAttribute('data-val') || 'ALL';
            if (val === currentFilterType) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    /**
     * Limpiar búsqueda
     */
    function clearHistorialPluzSearch() {
        const input = document.getElementById('inputFilterHistorialPluz');
        if (input) input.value = '';
        currentSearchQuery = '';
        currentFilterSed = '';
        renderHistorialPluz();
    }

    /**
     * Abrir vista Historial PLUZ directamente enfocando un ticket o una SED
     */
    function openHistorialPluzForSed(sedCode) {
        if (typeof showHistorialPluzView === 'function') {
            showHistorialPluzView();
        }
        filterHistorialPluzBySed(sedCode);
    }

    function openHistorialPluzForTicket(ticket) {
        if (typeof showHistorialPluzView === 'function') {
            showHistorialPluzView();
        }
        const input = document.getElementById('inputFilterHistorialPluz');
        if (input) {
            input.value = ticket;
            currentSearchQuery = ticket;
        }
        currentFilterType = 'ALL';
        expandedTickets.add(String(ticket).trim());
        updateFilterChipsUi();
        renderHistorialPluz();
    }

    /**
     * Exportar todo el historial acumulado en CSV / Excel
     */
    function exportHistorialPluzToExcel() {
        const allTickets = getSupervisorTicketsList();
        if (!allTickets.length) {
            alert('No hay registros de supervisión para exportar.');
            return;
        }

        const rows = [];
        allTickets.forEach(t => {
            (t.history || []).forEach(h => {
                rows.push({
                    "Ticket": h.ticket || '',
                    "SED": h.sed || '',
                    "Hora_Inicio_OMS": h.horaInicio || '',
                    "Alimentador": h.alimentador || '',
                    "Empresa": h.empresa || '',
                    "Fecha_Novedad": h.fecha || '',
                    "Usuario": h.usuario || 'PLUZ',
                    "Estado_Operativo": h.estadoOperativo || h.estado || '',
                    "JC": h.jefeCuadrilla || '',
                    "Fin_Estimado": h.finEstimado || '',
                    "Detalle_Operativo": h.detalleOperativo || h.detalle || '',
                    "Estado_Critico": h.estadoCritico || '',
                    "Detalle_Critico": h.detalleCritico || ''
                });
            });
        });

        if (typeof downloadExcel === 'function') {
            downloadExcel(rows, `historial_supervision_pluz_${Date.now()}`);
        } else {
            // Fallback CSV simple
            const csvContent = "\uFEFF" + Papa.unparse(rows);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `historial_supervision_pluz_${Date.now()}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    }

    /**
     * Inicializar eventos del módulo
     */
    function initHistorialPluzEvents() {
        const input = document.getElementById('inputFilterHistorialPluz');
        if (input) {
            input.addEventListener('input', debounceUi(() => {
                currentSearchQuery = input.value;
                renderHistorialPluz();
            }, 120));
        }

        const btnClearSearch = document.getElementById('btnClearSearchInput');
        if (btnClearSearch) {
            btnClearSearch.addEventListener('click', () => {
                if (input) {
                    input.value = '';
                    input.focus();
                }
                currentSearchQuery = '';
                renderHistorialPluz();
            });
        }

        const btnRemoveSed = document.getElementById('btnRemoveSedFilter');
        if (btnRemoveSed) {
            btnRemoveSed.addEventListener('click', removeSedFilter);
        }

        const btnToggleAll = document.getElementById('btnToggleExpandAllHistorialPluz');
        if (btnToggleAll) {
            btnToggleAll.addEventListener('click', toggleExpandAllHistorialPluz);
        }

        const chips = document.querySelectorAll('.hp-filter-chip');
        chips.forEach(btn => {
            btn.addEventListener('click', () => {
                currentFilterType = btn.getAttribute('data-val') || 'ALL';
                updateFilterChipsUi();
                renderHistorialPluz();
            });
        });

        const btnExport = document.getElementById('btnExportHistorialPluz');
        if (btnExport) {
            btnExport.addEventListener('click', exportHistorialPluzToExcel);
        }

        const btnClear = document.getElementById('btnClearHistorialPluz');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                clearHistorialPluzSearch();
                currentFilterType = 'ALL';
                currentFilterSed = '';
                updateFilterChipsUi();
            });
        }
    }

    // Exponer al scope global
    if (typeof window !== 'undefined') {
        window.renderHistorialPluz = renderHistorialPluz;
        window.openHistorialPluzForSed = openHistorialPluzForSed;
        window.openHistorialPluzForTicket = openHistorialPluzForTicket;
        window.toggleHistorialPluzCard = toggleHistorialPluzCard;
        window.toggleExpandAllHistorialPluz = toggleExpandAllHistorialPluz;
        window.filterHistorialPluzBySed = filterHistorialPluzBySed;
        window.removeSedFilter = removeSedFilter;
        window.locateTicketOnMap = locateTicketOnMap;
        window.clearHistorialPluzSearch = clearHistorialPluzSearch;
        window.enrichSupervisorRecordsWithOmsData = enrichSupervisorRecordsWithOmsData;
        window.initHistorialPluzEvents = initHistorialPluzEvents;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHistorialPluzEvents);
    } else {
        initHistorialPluzEvents();
    }
})();
