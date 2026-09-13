        // Registro de llamadas (primera versión: visible solo al perfil PLUZ en la interfaz)
        function getLlamadaValue(row, ...fields) {
            const val = getProp(row, ...fields);
            return (val === 'N/A' || !val) ? '' : val;
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
            const odm = String(row?.odm || '').trim();
            if (odm) return `ODM:${odm}`;
            const ticket = String(row?.ticket || '').trim();
            if (ticket) return `TICKET:${ticket}`;
            const aviso = String(row?.aviso || row?.suministro || '').trim();
            return aviso ? `AVISO:${aviso}` : '';
        }
        function getCallCounts(records) {
            return (records || []).reduce((counts, row) => {
                const key = getCallGroupKey(row);
                if (key) counts[key] = (counts[key] || 0) + 1;
                return counts;
            }, {});
        }
        function callPressure(count) {
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
                const pressure = callPressure(callCounts[getCallGroupKey(row)] || 1).key;
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
                const frequency = callCounts[getCallGroupKey(row)] || 1;
                const pressure = callPressure(frequency);
                return `<tr class="calls-row calls-row--${pressure.key}" tabindex="0" role="button" aria-label="Ver detalle de llamadas de la ODM ${escapeHtml(row.odm || 'sin dato')}" onclick="openCallDetail(${index})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCallDetail(${index});}">
                    <td data-label="Aviso"><strong>${escapeHtml(row.aviso || 'Sin dato')}</strong></td>
                    <td data-label="Ticket">${escapeHtml(row.ticket || 'Sin dato')}</td><td data-label="Suministro">${escapeHtml(row.suministro || 'Sin dato')}</td><td data-label="ODM"><strong>${escapeHtml(row.odm || 'Sin ODM')}</strong><span class="call-pressure call-pressure--${pressure.key}">${frequency} ${frequency === 1 ? 'llamada' : 'llamadas'} · ${pressure.label}</span></td><td data-label="Nombre">${escapeHtml(row.nombre || 'Sin dato')}</td><td data-label="Hora de registro">${escapeHtml(row.horaRegistro || 'Sin dato')}</td><td data-label="Distrito">${escapeHtml(row.distrito || 'Sin dato')}</td><td data-label="Dirección">${escapeHtml(row.direccion || 'Sin dato')}</td><td data-label="Estado del aviso"><span class="call-state">${escapeHtml(row.estado || 'Sin dato')}</span></td><td data-label="Nota específica">${escapeHtml(row.nota || 'Sin nota registrada')}</td></tr>`;
            }).join('');
        }
        function openCallDetail(index) {
            const row = visibleLlamadasRecords[index];
            const overlay = document.getElementById('callDetailOverlay');
            const body = document.getElementById('callDetailBody');
            const title = document.getElementById('callDetailTitle');
            if (!row || !overlay || !body) return;
            const frequency = getCallCounts(llamadasRecords)[getCallGroupKey(row)] || 1;
            const pressure = callPressure(frequency);
            if (title) title.textContent = row.odm ? `ODM ${row.odm}` : (row.ticket ? `Ticket ${row.ticket}` : `Aviso ${row.aviso || 'sin dato'}`);
            const fields = [['Aviso', row.aviso], ['Ticket', row.ticket], ['Suministro', row.suministro], ['ODM', row.odm], ['Cliente', row.nombre], ['Registro', row.horaRegistro], ['Distrito', row.distrito], ['Dirección', row.direccion], ['Estado', row.estado]];
            body.innerHTML = `<div class="call-detail-summary"><span class="call-pressure call-pressure--${pressure.key}">${frequency} ${frequency === 1 ? 'llamada asociada' : 'llamadas asociadas'} · ${pressure.label}</span></div><dl class="call-detail-grid">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || 'Sin dato')}</dd></div>`).join('')}</dl><section class="call-detail-note"><h4>Nota específica</h4><p>${escapeHtml(row.nota || 'Sin nota registrada')}</p></section>`;
            overlay.style.display = 'flex';
            overlay.setAttribute('aria-hidden', 'false');
            document.getElementById('btnCloseCallDetail')?.focus();
        }
        function closeCallDetail() {
            const overlay = document.getElementById('callDetailOverlay');
            if (!overlay) return;
            overlay.style.display = 'none';
            overlay.setAttribute('aria-hidden', 'true');
        }
        function populateCallsStatusFilter() {
            const states = [...new Set(llamadasRecords.map(row => row.estado).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
            const frequencyLabels = { normal: 'Contacto único', repeated: '2 o más llamadas', critical: '7 o más llamadas' };
            callsRepeatCtrl = initMultiSelect("callsRepeatFilter", "Frecuencia", ['normal', 'repeated', 'critical'], applyCallsFilters, value => frequencyLabels[value] || value);
            callsStatusCtrl = initMultiSelect("callsStatusFilter", "Estado", states, applyCallsFilters);
        }
        function refreshCallsFacets() {
            const counts = getCallCounts(llamadasRecords);
            const rows = llamadasRecords.map(row => ({ ...row, frequency: callPressure(counts[getCallGroupKey(row)] || 1).key }));
            const selections = {
                callsRepeatFilter: callsRepeatCtrl?.getSelected() || [],
                callsStatusFilter: callsStatusCtrl?.getSelected() || []
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
                llamadasRecords = (parsed.data || []).map(row => ({
                    aviso: getLlamadaValue(row, 'Aviso', 'AVISO'),
                    ticket: getLlamadaValue(row, 'Ticket', 'TICKET'),
                    suministro: getLlamadaValue(row, 'Suministro', 'SUMINISTRO', 'Cuenta', 'CUENTA'),
                    odm: getLlamadaValue(row, 'ODM', 'Odm', 'Orden', 'ORDEN'),
                    nombre: getLlamadaValue(row, 'Nombre', 'NOMBRE'),
                    horaRegistro: getLlamadaValue(row, 'Hora de registro', 'HORA DE REGISTRO', 'Hora Registro'),
                    distrito: getLlamadaValue(row, 'Distrito', 'DISTRITO'),
                    direccion: getLlamadaValue(row, 'Dirección', 'Direccion', 'DIRECCIÓN', 'DIRECCION'),
                    estado: formatEstadoAviso(getLlamadaValue(row, 'Estado del aviso', 'Estado Aviso', 'ESTADO DEL AVISO', 'Estado')),
                    nota: getLlamadaValue(row, 'Nota específica', 'Nota especifica', 'NOTA ESPECIFICA', 'Nota Específica', 'Nota', 'NOTA')
                })).sort((a, b) => parseLlamadaDate(b.horaRegistro) - parseLlamadaDate(a.horaRegistro));
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
