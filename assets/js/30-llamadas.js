        // Registro de llamadas (primera versión: visible solo al perfil PLUZ en la interfaz)
        function getLlamadaValue(row, ...fields) {
            const val = getProp(row, ...fields);
            return (val === 'N/A' || !val) ? '' : val;
        }

        function isValidCallEntityId(val) {
            if (!val) return false;
            const s = String(val).trim();
            return s !== '' && s !== '0' && s !== '0.0' && s !== 'N/A' && s !== '-' && s.toLowerCase() !== 'sin dato' && s.toLowerCase() !== 'sin odm';
        }

        let currentLlamadasSortCol = 'horaRegistro';
        let currentLlamadasSortDir = 'desc';
        let visibleLlamadasRecords = [];
        const CALLS_PAGE_SIZE = 200;
        let callsRenderLimit = CALLS_PAGE_SIZE;
        let callsRepeatCtrl = null;
        let callsStatusCtrl = null;
        const CALL_FILTER_FIELDS = { frequency: 'callsRepeatFilter', estado: 'callsStatusFilter' };

        function getCallGroupKey(row) {
            const ticket = String(row?.ticket || '').trim();
            if (isValidCallEntityId(ticket)) return `TICKET:${ticket}`;
            const odm = String(row?.odm || '').trim();
            if (isValidCallEntityId(odm)) return `ODM:${odm}`;
            const aviso = String(row?.aviso || '').trim();
            if (isValidCallEntityId(aviso)) return `AVISO:${aviso}`;
            const suministro = String(row?.suministro || '').trim();
            if (isValidCallEntityId(suministro)) return `SUMINISTRO:${suministro}`;
            return '';
        }

        function getCallCounts(records) {
            const counts = {};
            for (const row of (records || [])) {
                const key = getCallGroupKey(row);
                if (!key) continue;
                if (counts[key] !== undefined) continue;

                const pre = parseInt(row?.conteoLlamadas, 10);
                if (!isNaN(pre) && pre > 0) {
                    counts[key] = pre;
                }
            }

            // Para cualquier fila que no tenga Conteo_Llamadas precalculado, calcular ocurrencias reales
            const missing = (records || []).some(row => {
                const k = getCallGroupKey(row);
                return k && counts[k] === undefined;
            });

            if (missing) {
                const manual = (records || []).reduce((acc, row) => {
                    const key = getCallGroupKey(row);
                    if (key) acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {});
                for (const [k, v] of Object.entries(manual)) {
                    if (counts[k] === undefined) counts[k] = v;
                }
            }

            return counts;
        }
        function callPressure(count) {
            if (typeof count === 'string') {
                const s = count.toLowerCase();
                if (s.includes('alta')) return { key: 'critical', label: 'Alta presión' };
                if (s.includes('reiter')) return { key: 'repeated', label: 'Reiterado' };
                if (s.includes('nico') || s.includes('unico')) return { key: 'normal', label: 'Contacto único' };
            }
            if (Number(count) >= 7) return { key: 'critical', label: 'Alta presión' };
            if (Number(count) >= 2) return { key: 'repeated', label: 'Reiterado' };
            return { key: 'normal', label: 'Contacto único' };
        }
        function summarizeCallRecords(records) {
            const counts = Object.values(getCallCounts(records));
            return {
                totalCalls: (records || []).length,
                incidents: counts.length,
                repeated: counts.filter(count => count >= 2).length,
                critical: counts.filter(count => count >= 7).length
            };
        }
        function updateCallsSummary() {
            const summary = summarizeCallRecords(llamadasRecords);
            const values = { callsKpiTotal: summary.totalCalls, callsKpiIncidents: summary.incidents, callsKpiRepeated: summary.repeated, callsKpiCritical: summary.critical };
            Object.entries(values).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = value; });
        }
        function setCallsLoadState(state, message) {
            const panel = document.getElementById('llamadasModalOverlay');
            const body = document.getElementById('llamadasTableBody');
            const status = document.getElementById('llamadasStatus');
            panel?.setAttribute('aria-busy', String(state === 'loading'));
            if (status && message) status.textContent = message;
            if (!body) return;
            if (state === 'loading') body.innerHTML = '<tr class="calls-loading-row"><td colspan="10"><span></span><span></span><span></span><strong>Cargando llamadas…</strong></td></tr>';
            if (state === 'error') body.innerHTML = '<tr class="calls-error-row"><td colspan="10"><strong>No se pudo cargar el registro</strong><span>Verifica la conexión o la configuración de la fuente.</span></td></tr>';
        }
        function parseLlamadaDate(value) {
            const match = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
            return match ? new Date(+match[3], +match[2] - 1, +match[1], +(match[4] || 0), +(match[5] || 0), +(match[6] || 0)).getTime() : 0;
        }
        function sortLlamadasTable(key) {
            if (currentLlamadasSortCol === key) {
                currentLlamadasSortDir = currentLlamadasSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                currentLlamadasSortCol = key;
                currentLlamadasSortDir = 'asc';
            }
            callsRenderLimit = CALLS_PAGE_SIZE;
            renderLlamadasTable();
        }
        function updateLlamadasSortHeaderIcons() {
            document.querySelectorAll('th[data-call-sort]').forEach(header => {
                const key = header.dataset.callSort;
                const label = header.dataset.label;
                const icon = key === currentLlamadasSortCol ? (currentLlamadasSortDir === 'asc' ? ' ▲' : ' ▼') : ' <span style="opacity: .3; font-size: 9px;">↕</span>';
                header.innerHTML = `${label}${icon}`;
            });
        }
        function renderLlamadasTable() {
            const body = document.getElementById('llamadasTableBody'), count = document.getElementById('tableLlamadasCount'), input = document.getElementById('inputFilterLlamadas');
            if (!body) return;
            const query = String(input ? input.value : '').trim().toLowerCase();
            const repeatFilter = callsRepeatCtrl?.getSelected() || [];
            const statusFilter = callsStatusCtrl?.getSelected() || [];
            const callCounts = getCallCounts(llamadasRecords);
            let rows = llamadasRecords.filter(row => !query || Object.values(row).some(value => String(value || '').toLowerCase().includes(query)));
            rows = rows.filter(row => {
                const frequency = (row.conteoLlamadas && row.conteoLlamadas > 0) ? row.conteoLlamadas : (callCounts[getCallGroupKey(row)] || 1);
                const pressure = callPressure(row.presionLlamadas || frequency).key;
                const matchesFrequency = matchesMultiSelection(pressure, repeatFilter);
                const matchesStatus = matchesMultiSelection(row.estado, statusFilter);
                return matchesFrequency && matchesStatus;
            });
            if (currentLlamadasSortCol) {
                const multiplier = currentLlamadasSortDir === 'desc' ? -1 : 1;
                rows = [...rows].sort((a, b) => {
                    const valA = currentLlamadasSortCol === 'horaRegistro' ? parseLlamadaDate(a.horaRegistro) : a[currentLlamadasSortCol];
                    const valB = currentLlamadasSortCol === 'horaRegistro' ? parseLlamadaDate(b.horaRegistro) : b[currentLlamadasSortCol];
                    const numA = Number(valA), numB = Number(valB);
                    if (String(valA).trim() !== '' && String(valB).trim() !== '' && Number.isFinite(numA) && Number.isFinite(numB)) return (numA - numB) * multiplier;
                    return String(valA || '').localeCompare(String(valB || ''), 'es', { numeric: true, sensitivity: 'base' }) * multiplier;
                });
            }
            updateLlamadasSortHeaderIcons();
            updateCallsSummary();
            if (count) count.innerText = rows.length;
            visibleLlamadasRecords = rows;
            const renderedRows = rows.slice(0, callsRenderLimit);
            const loadMore = document.getElementById('callsLoadMore');
            if (loadMore) {
                loadMore.hidden = renderedRows.length >= rows.length;
                loadMore.textContent = `Mostrar más · ${renderedRows.length} de ${rows.length}`;
            }
            if (!rows.length) { body.innerHTML = '<tr class="calls-empty-row"><td colspan="10"><strong>Sin resultados</strong><span>Prueba con otra búsqueda o limpia los filtros.</span></td></tr>'; return; }
            body.innerHTML = renderedRows.map((row, index) => {
                const key = getCallGroupKey(row);
                const frequency = (row.conteoLlamadas && row.conteoLlamadas > 0) ? row.conteoLlamadas : (callCounts[key] || 1);
                const pressure = callPressure(row.presionLlamadas || frequency);
                const hasValidTicket = isValidCallEntityId(row.ticket);
                const hasValidOdm = isValidCallEntityId(row.odm);
                const odmDisplay = hasValidOdm ? row.odm : 'Sin ODM';

                return `<tr class="calls-row calls-row--${pressure.key}" tabindex="0" role="button" aria-label="Ver detalle de llamadas de ${hasValidTicket ? `Ticket ${escapeHtml(row.ticket)}` : `Aviso ${escapeHtml(row.aviso || 'sin dato')}`}" onclick="openCallDetail(${index})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCallDetail(${index});}">
                    <td data-label="Aviso"><strong>${escapeHtml(row.aviso || 'Sin dato')}</strong></td>
                    <td data-label="Ticket">${hasValidTicket ? `<div class="ticket-cell"><span class="ticket-number">${escapeHtml(row.ticket)}</span><button type="button" class="btn-ticket-pin" onclick="event.stopPropagation(); navigateToTicketOnMap('${escapeHtml(row.ticket)}')" title="Localizar ticket #${escapeHtml(row.ticket)} en el mapa" aria-label="Localizar ticket #${escapeHtml(row.ticket)} en el mapa">📍</button></div>` : 'Sin dato'}</td>
                    <td data-label="Suministro">${escapeHtml(row.suministro || 'Sin dato')}</td>
                    <td data-label="ODM"><strong>${escapeHtml(odmDisplay)}</strong><span class="call-pressure call-pressure--${pressure.key}">${frequency} ${frequency === 1 ? 'llamada' : 'llamadas'} · ${pressure.label}</span></td>
                    <td data-label="Nombre">${escapeHtml(row.nombre || 'Sin dato')}</td>
                    <td data-label="Hora de registro">${escapeHtml(row.horaRegistro || 'Sin dato')}</td>
                    <td data-label="Distrito">${escapeHtml(row.distrito || 'Sin dato')}</td>
                    <td data-label="Dirección">${escapeHtml(row.direccion || 'Sin dato')}</td>
                    <td data-label="Estado del aviso"><span class="call-state">${escapeHtml(row.estado || 'Sin dato')}</span></td>
                    <td data-label="Nota específica">${escapeHtml(row.nota || 'Sin nota registrada')}</td>
                </tr>`;
            }).join('');
        }
        function openCallDetail(index) {
            const row = visibleLlamadasRecords[index];
            const overlay = document.getElementById('callDetailOverlay');
            const body = document.getElementById('callDetailBody');
            const title = document.getElementById('callDetailTitle');
            if (!row || !overlay || !body) return;

            // 1. Agrupar y obtener TODAS las llamadas asociadas a este Ticket, ODM o Aviso
            const groupKey = getCallGroupKey(row);
            const ticketStr = isValidCallEntityId(row.ticket) ? String(row.ticket).trim() : '';
            const odmStr = isValidCallEntityId(row.odm) ? String(row.odm).trim() : '';
            const avisoStr = isValidCallEntityId(row.aviso) ? String(row.aviso).trim() : '';

            const relatedCalls = (llamadasRecords || []).filter(r => {
                if (groupKey && getCallGroupKey(r) === groupKey) return true;
                if (ticketStr && isValidCallEntityId(r.ticket) && String(r.ticket).trim() === ticketStr) return true;
                if (odmStr && isValidCallEntityId(r.odm) && String(r.odm).trim() === odmStr) return true;
                return false;
            });

            // Ordenar de más reciente a más antigua
            relatedCalls.sort((a, b) => (parseLlamadaDate(b.horaRegistro) || 0) - (parseLlamadaDate(a.horaRegistro) || 0));

            const totalCalls = row.conteoLlamadas || relatedCalls.length || 1;
            const pressure = callPressure(row.presionLlamadas || totalCalls);

            if (title) {
                if (ticketStr) {
                    title.textContent = `Ticket ${ticketStr}` + (odmStr ? ` · ODM ${odmStr}` : '');
                } else if (odmStr) {
                    title.textContent = `ODM ${odmStr}`;
                } else {
                    title.textContent = `Aviso ${row.aviso || 'sin dato'}`;
                }
            }

            // 2. Verificar si este caso existe activo en el mapa
            const mapMatch = (mapLocations || []).find(l => 
                (ticketStr && String(l.ticket || '').trim() === ticketStr) || 
                (odmStr && String(l.odm || '').trim() === odmStr)
            );

            // Botón de acción hacia el mapa
            let mapActionHtml = '';
            if (mapMatch) {
                mapActionHtml = `
                    <div style="margin-top: 10px;">
                        <button type="button" class="call-map-action-btn" onclick="navigateToTicketOnMap('${escapeHtml(ticketStr || odmStr)}')">
                            📍 Localizar en Mapa en Vivo (SED ${escapeHtml(mapMatch.sed || 'N/A')})
                        </button>
                    </div>
                `;
            } else {
                mapActionHtml = `
                    <div style="margin-top: 10px;">
                        <span class="call-map-status-pill">⏱️ Estado: ${escapeHtml(row.estado || 'Atendido')} (No activo en mapa actual)</span>
                    </div>
                `;
            }

            // Campos generales del caso
            const generalFields = [
                ['Ticket OMS', ticketStr || 'Sin dato'],
                ['ODM', odmStr || 'Sin ODM'],
                ['Aviso Principal', row.aviso || 'Sin dato'],
                ['Suministro', row.suministro || 'Sin dato'],
                ['Distrito', row.distrito || 'Sin dato'],
                ['Dirección', row.direccion || 'Sin dato'],
                ['Estado Actual', row.estado || 'Sin dato']
            ];

            // Renderizado de las llamadas cronológicas individuales
            const timelineHtml = relatedCalls.map((call, cIdx) => {
                const isCrit = totalCalls >= 7;
                const cardClass = isCrit ? 'call-timeline-card call-timeline-card--critical' : 'call-timeline-card';
                return `
                    <div class="${cardClass}">
                        <div class="call-timeline-card-header">
                            <span class="call-card-badge">Llamada #${totalCalls - cIdx} · Aviso ${escapeHtml(call.aviso || '--')}</span>
                            <span class="call-card-time">🕒 ${escapeHtml(call.horaRegistro || '--')}</span>
                        </div>
                        <div class="call-card-client">👤 ${escapeHtml(call.nombre || 'Cliente sin registrar')}</div>
                        <div class="call-card-subinfo">
                            <span>⚡ <b>Suministro:</b> ${escapeHtml(call.suministro || 'Sin dato')}</span>
                            <span>📋 <b>Estado:</b> ${escapeHtml(call.estado || 'Sin dato')}</span>
                        </div>
                        ${call.direccion ? `<div class="call-card-address">📍 ${escapeHtml(call.direccion)} ${call.distrito ? `(${escapeHtml(call.distrito)})` : ''}</div>` : ''}
                        ${call.nota ? `<div class="call-card-note">📝 "${escapeHtml(call.nota)}"</div>` : ''}
                    </div>
                `;
            }).join('');

            body.innerHTML = `
                <div class="call-detail-summary">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <span class="call-pressure call-pressure--${pressure.key}">${totalCalls} ${totalCalls === 1 ? 'llamada recibida' : 'llamadas recibidas'} · ${pressure.label}</span>
                        ${ticketStr ? `<span style="font-size: 11px; font-weight: 700; color: #64748b;">Ticket: ${escapeHtml(ticketStr)}</span>` : ''}
                    </div>
                    ${mapActionHtml}
                </div>
                <dl class="call-detail-grid">
                    ${generalFields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || 'Sin dato')}</dd></div>`).join('')}
                </dl>
                <section class="call-timeline-section">
                    <div class="call-timeline-title">
                        <span>📞 Historial de Llamadas</span>
                        <span class="call-timeline-count-badge">${totalCalls} ${totalCalls === 1 ? 'contacto' : 'contactos'}</span>
                    </div>
                    <div class="call-timeline-list">
                        ${timelineHtml}
                    </div>
                </section>
            `;

            // Animación fluida de apertura del drawer
            overlay.style.display = 'flex';
            overlay.setAttribute('aria-hidden', 'false');
            requestAnimationFrame(() => {
                overlay.classList.add('open');
            });
            document.getElementById('btnCloseCallDetail')?.focus();
        }

        function closeCallDetail() {
            const overlay = document.getElementById('callDetailOverlay');
            if (!overlay) return;
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
            setTimeout(() => {
                if (!overlay.classList.contains('open')) {
                    overlay.style.display = 'none';
                }
            }, 260);
        }
        function populateCallsStatusFilter() {
            const states = [...new Set(llamadasRecords.map(row => row.estado).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
            const frequencyLabels = { normal: 'Contacto único', repeated: '2 o más llamadas', critical: '7 o más llamadas' };
            callsRepeatCtrl = initMultiSelect("callsRepeatFilter", "Frecuencia", ['normal', 'repeated', 'critical'], applyCallsFilters, value => frequencyLabels[value] || value);
            callsStatusCtrl = initMultiSelect("callsStatusFilter", "Estado", states, applyCallsFilters);
        }
        function refreshCallsFacets() {
            const counts = getCallCounts(llamadasRecords);
            const rows = llamadasRecords.map(row => {
                const frequency = (row.conteoLlamadas && row.conteoLlamadas > 0) ? row.conteoLlamadas : (counts[getCallGroupKey(row)] || 1);
                return { ...row, frequency: callPressure(row.presionLlamadas || frequency).key };
            });
            const selections = {
                callsRepeatFilter: callsRepeatCtrl?.isAllSelected() ? [] : (callsRepeatCtrl?.getSelected() || []),
                callsStatusFilter: callsStatusCtrl?.isAllSelected() ? [] : (callsStatusCtrl?.getSelected() || [])
            };
            callsRepeatCtrl?.setOptions(getFacetedFilterValues(rows, 'frequency', CALL_FILTER_FIELDS, selections, 'callsRepeatFilter'));
            callsStatusCtrl?.setOptions(getFacetedFilterValues(rows, 'estado', CALL_FILTER_FIELDS, selections, 'callsStatusFilter'));
        }
        function applyCallsFilters() {
            callsRenderLimit = CALLS_PAGE_SIZE;
            refreshCallsFacets();
            renderLlamadasTable();
        }
        const STATUS_AVISO_MAP_JS = {
            '100': 'Creado',
            '110': 'Cerrado',
            '115': 'Cierre Forzoso',
            '120': 'Anulado',
            '125': 'Restaurado',
            '130': 'Escalado Activo',
            '135': 'Escalado Activo',
            '140': 'Escalado Activo',
            '145': 'Escalado Asignado',
            '150': 'Escalado en Desplazamiento',
            '160': 'Escalado en Ejecución',
            '165': 'Asignado',
            '170': 'En Desplazamiento',
            '175': 'En Ejecución',
            '200': 'Verificado CC',
            '205': 'Verificado UO',
            '210': 'Verificado CDS'
        };
        function formatEstadoAviso(val) {
            const clean = String(val || '').replace(/\.0$/, '').trim();
            return STATUS_AVISO_MAP_JS[clean] || (val ? String(val).trim() : 'Sin dato');
        }

        async function loadLlamadas() {
            const status = document.getElementById('llamadasStatus');
            if (llamadasLoaded) return;
            if (!GOOGLE_SHEET_LLAMADAS_URL) { setCallsLoadState('error', 'Pendiente de configurar la fuente de llamadas.'); return; }
            setCallsLoadState('loading', 'Cargando registro de llamadas…');
            try {
                const separator = GOOGLE_SHEET_LLAMADAS_URL.includes('?') ? '&' : '?';
                const response = await fetch(GOOGLE_SHEET_LLAMADAS_URL + separator + '_nocache=' + Date.now());
                if (!response.ok) throw new Error('No se pudo leer la hoja de llamadas.');
                const parsed = Papa.parse(await response.text(), { header: true, skipEmptyLines: true });
                llamadasRecords = (parsed.data || []).map(row => {
                    const rawConteo = getLlamadaValue(row, 'Conteo_Llamadas', 'conteo_llamadas', 'Conteo Llamadas', 'Conteo', 'Llamadas');
                    const parsedConteo = parseInt(rawConteo, 10);
                    const conteoLlamadas = (!isNaN(parsedConteo) && parsedConteo > 0) ? parsedConteo : null;
                    const presionLlamadas = getLlamadaValue(row, 'Presion_Llamadas', 'presion_llamadas', 'Presion Llamadas', 'Presion');

                    return {
                        aviso: getLlamadaValue(row, 'Aviso', 'AVISO'),
                        ticket: getLlamadaValue(row, 'Ticket', 'TICKET'),
                        suministro: getLlamadaValue(row, 'Suministro', 'SUMINISTRO', 'Cuenta', 'CUENTA'),
                        odm: getLlamadaValue(row, 'ODM', 'Odm', 'Orden', 'ORDEN'),
                        nombre: getLlamadaValue(row, 'Nombre', 'NOMBRE'),
                        horaRegistro: getLlamadaValue(row, 'Hora de registro', 'HORA DE REGISTRO', 'Hora Registro'),
                        distrito: getLlamadaValue(row, 'Distrito', 'DISTRITO'),
                        direccion: getLlamadaValue(row, 'Dirección', 'Direccion', 'DIRECCIÓN', 'DIRECCION'),
                        estado: formatEstadoAviso(getLlamadaValue(row, 'Estado del aviso', 'Estado Aviso', 'ESTADO DEL AVISO', 'Estado')),
                        nota: getLlamadaValue(row, 'Nota específica', 'Nota especifica', 'NOTA ESPECIFICA', 'Nota Específica', 'Nota', 'NOTA'),
                        conteoLlamadas: conteoLlamadas,
                        presionLlamadas: presionLlamadas
                    };
                }).sort((a, b) => parseLlamadaDate(b.horaRegistro) - parseLlamadaDate(a.horaRegistro));
                llamadasLoaded = true;
                populateCallsStatusFilter();
                if (status) status.innerText = `${llamadasRecords.length} registros cargados. Ordenados por hora de registro.`;
            } catch (error) {
                setCallsLoadState('error', 'No se pudo cargar BASE_LLAMADAS. Verifica su URL publicada y los encabezados.');
                console.error('Error cargando llamadas:', error);
                return;
            }
            document.getElementById('llamadasModalOverlay')?.setAttribute('aria-busy', 'false');
            renderLlamadasTable();
        }
