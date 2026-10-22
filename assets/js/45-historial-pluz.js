/**
 * assets/js/45-historial-pluz.js
 * Módulo de Historial y Auditoría de Supervisión PLUZ
 * Historial de Tickets Críticos, Quánticos, Operativos y Seguimiento por SED
 */

(function () {
    let currentFilterType = 'ALL'; // 'ALL', 'QUANTICO', 'CRITICO', 'VENCIDO', 'IMPEDIDO', 'EJECUCION'
    let currentSearchQuery = '';
    let expandedTickets = new Set();

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

    /**
     * Devuelve la lista de tickets únicos con sus historiales
     */
    function getSupervisorTicketsList() {
        enrichSupervisorRecordsWithOmsData();
        if (typeof supervisorRecordsMap === 'undefined') return [];

        const list = [];
        for (const [key, data] of supervisorRecordsMap.entries()) {
            if (data && data.latest) {
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

        // 1. Calcular KPIs superiores
        let countTotal = allTickets.length;
        let countQuantico = 0;
        let countCritico = 0;
        let countVencido = 0;
        let countImpedido = 0;
        let countEjecucion = 0;
        const sedSet = new Set();

        allTickets.forEach(t => {
            const latest = t.latest || {};
            const crit = String(latest.estadoCritico || '').toUpperCase();
            const op = String(latest.estadoOperativo || latest.estado || '').toUpperCase();
            const sed = String(latest.sed || '').trim().toUpperCase();
            if (sed && sed !== 'N/A' && sed !== 'SIN SED') sedSet.add(sed);

            if (crit.includes('QUANT')) countQuantico++;
            if (crit.includes('CRIT')) countCritico++;
            if (crit.includes('VENCID')) countVencido++;
            if (op.includes('IMPED')) countImpedido++;
            if (op.includes('EJECUC')) countEjecucion++;
        });

        const elKpiTotal = document.getElementById('hpKpiTotalTickets');
        const elKpiSeds = document.getElementById('hpKpiTotalSeds');
        const elKpiQuant = document.getElementById('hpKpiTotalQuanticos');
        const elKpiCrit = document.getElementById('hpKpiTotalCriticos');
        const elKpiImped = document.getElementById('hpKpiTotalImpedidos');

        if (elKpiTotal) elKpiTotal.textContent = countTotal;
        if (elKpiSeds) elKpiSeds.textContent = sedSet.size;
        if (elKpiQuant) elKpiQuant.textContent = countQuantico;
        if (elKpiCrit) elKpiCrit.textContent = countCritico;
        if (elKpiImped) elKpiImped.textContent = countImpedido;

        // Actualizar contadores en los chips
        const badgeAll = document.getElementById('hpBadgeCountAll');
        const badgeQuant = document.getElementById('hpBadgeCountQuantico');
        const badgeCrit = document.getElementById('hpBadgeCountCritico');
        const badgeVenc = document.getElementById('hpBadgeCountVencido');
        const badgeImp = document.getElementById('hpBadgeCountImpedido');
        const badgeEjec = document.getElementById('hpBadgeCountEjecucion');

        if (badgeAll) badgeAll.textContent = countTotal;
        if (badgeQuant) badgeQuant.textContent = countQuantico;
        if (badgeCrit) badgeCrit.textContent = countCritico;
        if (badgeVenc) badgeVenc.textContent = countVencido;
        if (badgeImp) badgeImp.textContent = countImpedido;
        if (badgeEjec) badgeEjec.textContent = countEjecucion;

        // 2. Filtrar tickets según búsqueda y chip activo
        const query = currentSearchQuery.trim().toLowerCase();

        const filtered = allTickets.filter(t => {
            const latest = t.latest || {};
            const crit = String(latest.estadoCritico || '').toUpperCase();
            const op = String(latest.estadoOperativo || latest.estado || '').toUpperCase();

            // Filtro por Chip
            if (currentFilterType === 'QUANTICO' && !crit.includes('QUANT')) return false;
            if (currentFilterType === 'CRITICO' && !crit.includes('CRIT')) return false;
            if (currentFilterType === 'VENCIDO' && !crit.includes('VENCID')) return false;
            if (currentFilterType === 'IMPEDIDO' && !op.includes('IMPED')) return false;
            if (currentFilterType === 'EJECUCION' && !op.includes('EJECUC')) return false;

            // Filtro por Texto de Búsqueda
            if (query) {
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

        // 3. Renderizar la lista
        const container = document.getElementById('historialPluzListContainer');
        const countHeader = document.getElementById('hpFilteredCount');
        if (countHeader) countHeader.textContent = filtered.length;

        if (!container) return;

        if (!filtered.length) {
            container.innerHTML = `
                <div style="text-align: center; padding: 48px 20px; color: #64748b; background: white; border-radius: 8px; border: 1px dashed #cbd5e1;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
                    <div style="font-size: 15px; font-weight: 700; color: #1e293b;">No se encontraron registros de supervisión</div>
                    <div style="font-size: 12px; margin-top: 4px;">Prueba ajustando el texto de búsqueda o cambiando el filtro de criticidad.</div>
                    ${query ? `<button type="button" onclick="clearHistorialPluzSearch()" style="margin-top: 12px; background: #0284c7; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;">Limpiar búsqueda</button>` : ''}
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(t => {
            const latest = t.latest;
            const history = t.history || [latest];
            const cleanTicket = String(latest.ticket).trim();
            const isExpanded = expandedTickets.has(cleanTicket) || filtered.length <= 3;

            const opEst = latest.estadoOperativo || latest.estado || 'PENDIENTE';
            const critEst = latest.estadoCritico || '';
            const opBadgeClass = typeof getSupervisorBadgeClass === 'function' ? getSupervisorBadgeClass(opEst) : 'sup-status-normal';
            const critBadgeClass = critEst && typeof getCriticoBadgeClass === 'function' ? getCriticoBadgeClass(critEst) : '';

            const sedVal = latest.sed && latest.sed !== 'N/A' && latest.sed !== 'SIN SED' ? latest.sed : 'SIN SED';
            const horaIni = latest.horaInicio && latest.horaInicio !== 'N/A' ? latest.horaInicio : '--';
            const alimentador = latest.alimentador && latest.alimentador !== 'N/A' ? latest.alimentador : '--';
            const empresa = latest.empresa && latest.empresa !== 'N/A' ? latest.empresa : '--';
            const jcVal = latest.jefeCuadrilla || '';

            let cardBorderColor = '#cbd5e1';
            let cardBgGlow = '#ffffff';
            const critNorm = critEst.toLowerCase();
            const opNorm = opEst.toLowerCase();

            if (critNorm.includes('crit')) {
                cardBorderColor = '#ef4444';
                cardBgGlow = '#fef2f2';
            } else if (critNorm.includes('quant')) {
                cardBorderColor = '#ec4899';
                cardBgGlow = '#fdf2f8';
            } else if (critNorm.includes('vencid')) {
                cardBorderColor = '#f97316';
                cardBgGlow = '#fff7ed';
            } else if (opNorm.includes('imped')) {
                cardBorderColor = '#ea580c';
                cardBgGlow = '#fff7ed';
            } else if (opNorm.includes('ejecuc')) {
                cardBorderColor = '#3b82f6';
                cardBgGlow = '#eff6ff';
            }

            return `
                <div class="hp-ticket-card" id="hpCard_${cleanTicket}" style="background: ${cardBgGlow}; border: 1.5px solid ${cardBorderColor}; border-radius: 10px; margin-bottom: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.04); overflow: hidden; transition: all 0.2s;">
                    <!-- Cabecera de la tarjeta del ticket (clic para expandir/contraer) -->
                    <div style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; user-select: none;" onclick="toggleHistorialPluzCard('${cleanTicket}')">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <span style="font-size: 15px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                                🎫 #${cleanTicket}
                            </span>
                            ${sedVal !== 'SIN SED' ? `
                                <button type="button" class="hp-sed-pill" onclick="event.stopPropagation(); filterHistorialPluzBySed('${escapeHtml(sedVal)}')" title="Clic para filtrar todos los tickets de esta SED" style="background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 800; cursor: pointer;">
                                    🏢 SED: ${escapeHtml(sedVal)}
                                </button>
                            ` : `<span style="font-size: 10px; color: #94a3b8; font-weight: 600;">(Sin SED)</span>`}
                            
                            <span style="font-size: 11px; color: #475569; display: flex; align-items: center; gap: 4px;">
                                🕒 Inicio: <b>${escapeHtml(horaIni)}</b>
                            </span>
                            ${alimentador !== '--' ? `<span style="font-size: 11px; color: #64748b;">⚡ Ali: <b>${escapeHtml(alimentador)}</b></span>` : ''}
                            ${empresa !== '--' ? `<span style="font-size: 10.5px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 700; color: #334155;">🏢 ${escapeHtml(empresa)}</span>` : ''}
                        </div>

                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span class="sup-status-badge ${opBadgeClass}">⚙️ ${escapeHtml(opEst)}</span>
                            ${critEst ? `<span class="sup-status-badge ${critBadgeClass}">${escapeHtml(critEst)}</span>` : ''}
                            ${jcVal ? `<span style="font-size: 11px; font-weight: 700; color: #1e293b; background: #e2e8f0; padding: 2px 7px; border-radius: 4px;">JC: ${escapeHtml(jcVal)}</span>` : ''}
                            <span style="font-size: 11px; font-weight: 700; color: #0284c7; margin-left: 6px;">
                                ${isExpanded ? '▲ Contraer' : `▼ Historial (${history.length})`}
                            </span>
                        </div>
                    </div>

                    <!-- Cuerpo Expandido: Timeline Completo del Ticket -->
                    <div id="hpBody_${cleanTicket}" style="display: ${isExpanded ? 'block' : 'none'}; border-top: 1px solid #e2e8f0; background: #ffffff; padding: 14px 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 6px;">
                            <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.4px;">
                                📜 Línea de tiempo de actualizaciones (${history.length} registros)
                            </div>
                            <div style="display: flex; gap: 6px;">
                                <button type="button" onclick="event.stopPropagation(); openSupervisorModal('${cleanTicket}')" style="background: #0284c7; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                    ➕ Agregar Novedad
                                </button>
                                <button type="button" onclick="event.stopPropagation(); locateTicketOnMap('${cleanTicket}')" style="background: #047857; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                    📍 Ubicar en Mapa
                                </button>
                            </div>
                        </div>

                        <div class="hp-timeline-list" style="position: relative; padding-left: 20px; border-left: 2px solid #cbd5e1; margin-left: 10px;">
                            ${history.map((h, hIdx) => {
                                const hOp = h.estadoOperativo || h.estado || 'PENDIENTE';
                                const hCrit = h.estadoCritico || '';
                                const hOpClass = typeof getSupervisorBadgeClass === 'function' ? getSupervisorBadgeClass(hOp) : 'sup-status-normal';
                                const hCritClass = hCrit && typeof getCriticoBadgeClass === 'function' ? getCriticoBadgeClass(hCrit) : '';
                                const hJc = h.jefeCuadrilla || '';
                                const hOpDet = h.detalleOperativo || h.detalle || '';
                                const hCritDet = h.detalleCritico || '';

                                return `
                                    <div class="hp-timeline-item" style="position: relative; margin-bottom: 14px;">
                                        <div style="position: absolute; left: -27px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: ${hIdx === 0 ? 'var(--pluz-blue, #0284c7)' : '#94a3b8'}; border: 2px solid white; box-shadow: 0 0 0 1px #cbd5e1;"></div>
                                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 9px 12px;">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                                                <div style="display: flex; align-items: center; gap: 6px;">
                                                    <span class="sup-status-badge ${hOpClass}" style="font-size: 10px; padding: 2px 7px;">⚙️ ${escapeHtml(hOp)}</span>
                                                    ${hCrit ? `<span class="sup-status-badge ${hCritClass}" style="font-size: 10px; padding: 2px 7px;">${escapeHtml(hCrit)}</span>` : ''}
                                                    ${hJc ? `<span style="font-size: 10.5px; font-weight: 700; color: #1e293b;">JC: ${escapeHtml(hJc)}</span>` : ''}
                                                </div>
                                                <span style="font-size: 10.5px; color: #64748b; font-weight: 600;">
                                                    🕒 ${escapeHtml(h.fecha || '')} • por <b>${escapeHtml(h.usuario || 'PLUZ')}</b>
                                                </span>
                                            </div>
                                            ${hOpDet ? `<div style="font-size: 11.5px; color: #1e293b; line-height: 1.4; margin-bottom: 3px;"><b>Operativo:</b> ${escapeHtml(hOpDet)}</div>` : ''}
                                            ${hCritDet && !/^n\/?a$/i.test(hCritDet) ? `<div style="font-size: 11.5px; color: #9d174d; line-height: 1.4;"><b>Criticidad:</b> ${escapeHtml(hCritDet)}</div>` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Alternar expansión de una tarjeta
     */
    function toggleHistorialPluzCard(ticket) {
        if (expandedTickets.has(ticket)) {
            expandedTickets.delete(ticket);
        } else {
            expandedTickets.add(ticket);
        }
        const bodyEl = document.getElementById(`hpBody_${ticket}`);
        if (bodyEl) {
            bodyEl.style.display = expandedTickets.has(ticket) ? 'block' : 'none';
        }
    }

    /**
     * Filtrar al hacer clic en una SED
     */
    function filterHistorialPluzBySed(sedCode) {
        const input = document.getElementById('inputFilterHistorialPluz');
        if (input) {
            input.value = sedCode;
            currentSearchQuery = sedCode;
        }
        currentFilterType = 'ALL';
        updateFilterChipsUi();
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
        window.filterHistorialPluzBySed = filterHistorialPluzBySed;
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
