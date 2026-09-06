        const techKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const techTodayKey = () => { const value = new Date(); return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`; };
        const techDateValue = value => {
            if (!value) return null;
            if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
            const str = String(value).trim();
            if (!str) return null;
            const matchIso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
            if (matchIso) {
                return new Date(+matchIso[1], +matchIso[2] - 1, +matchIso[3], +(matchIso[4] || 0), +(matchIso[5] || 0), +(matchIso[6] || 0));
            }
            const matchLat = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
            if (matchLat) {
                return new Date(+matchLat[3], +matchLat[2] - 1, +matchLat[1], +(matchLat[4] || 0), +(matchLat[5] || 0), +(matchLat[6] || 0));
            }
            const fallback = new Date(str);
            return Number.isNaN(fallback.getTime()) ? null : fallback;
        };
        const techDurationLabel = seconds => { const safe = Math.max(0, Math.floor(seconds || 0)); return `${Math.floor(safe / 3600)}h ${String(Math.floor((safe % 3600) / 60)).padStart(2, '0')}m`; };
        const techSecondsSinceLast = row => {
            const last = techDateValue(row['Último trabajo']);
            if (!last) return 0;
            const selected = String(row['día'] || '');
            const today = new Date();
            const todayKey = techTodayKey();
            const reference = selected === todayKey ? today : new Date(`${selected}T18:00:00`);
            return Math.max(0, (reference.getTime() - last.getTime()) / 1000);
        };
        const TECH_FILTER_FIELDS = {'día':'techDate', Empresa:'techCompany', 'Tecnico visible':'techName', Skill:'techSkill', 'Zona / SET':'techZone', 'Estado de orden':'techState'};
        const TECH_FILTER_LABELS = {techDate:'Fecha', techCompany:'Todas las empresas', techName:'Todos los técnicos', techSkill:'Todos los skills', techZone:'Todas las zonas / SET', techState:'Todos los estados'};
        let currentTechSortCol = 'dia';
        let currentTechSortDir = 'desc';
        function techAllowedRecords() {
            const contractor = sessionStorage.getItem('oms_assigned_contractor') || '*';
            return tecnicosRecords.filter(row => contractor === '*' || techKey(row.Empresa) === techKey(contractor));
        }
        function techFilterValues() {
            return Object.fromEntries(Object.values(TECH_FILTER_FIELDS).map(id => [id, document.getElementById(id)?.value || '']));
        }
        function techMatchesFilters(row, values, excludedId = '') {
            return Object.entries(TECH_FILTER_FIELDS).every(([field, id]) => {
                const selected = values[id];
                return id === excludedId || !selected || String(row[field] || '') === selected;
            });
        }
        function setTechSelectOptions(id, values, selected) {
            const select = document.getElementById(id); if (!select) return false;
            const unique = [...new Set(values.filter(Boolean).map(String))].sort((a,b) => id === 'techDate' ? b.localeCompare(a) : a.localeCompare(b, 'es', {numeric:true}));
            const isDate = id === 'techDate';
            const options = (isDate ? '' : `<option value="">${TECH_FILTER_LABELS[id]}</option>`) + unique.map(value => `<option value="${escapeHtml(value)}">${isDate ? 'Fecha: ' : ''}${escapeHtml(value)}</option>`).join('');
            select.innerHTML = options || `<option value="">${isDate ? 'Sin fechas disponibles' : TECH_FILTER_LABELS[id]}</option>`;
            let next = unique.includes(selected) ? selected : '';
            if (isDate && !next && unique.length) next = unique.includes(techTodayKey()) ? techTodayKey() : unique[0];
            select.value = next;
            return next !== selected;
        }
        function refreshTechFilterOptions() {
            // Dos pasadas limpian cualquier selección incompatible y actualizan todos los desplegables entre sí.
            for (let pass = 0; pass < 2; pass++) {
                const values = techFilterValues();
                Object.entries(TECH_FILTER_FIELDS).forEach(([field, id]) => {
                    const candidates = techAllowedRecords().filter(row => techMatchesFilters(row, values, id));
                    setTechSelectOptions(id, candidates.map(row => row[field]), values[id]);
                });
            }
        }
        function initializeTechFilters() {
            Object.values(TECH_FILTER_FIELDS).forEach(id => { const select = document.getElementById(id); if (select) select.value = ''; });
            refreshTechFilterOptions();
        }
        function techSortValue(row, key) {
            const values = {dia: row['día'], tecnico: row['Tecnico visible'], skill: row.Skill, empresa: row.Empresa, zona: row['Zona / SET'], estado: row['Estado de orden'], primer: techDateValue(row['Primer trabajo'])?.getTime() || 0, ultimo: techDateValue(row['Último trabajo'])?.getTime() || 0, trabajos: Number(row['Cantidad de trabajos']) || 0, tiempo: techSecondsSinceLast(row), alerta: techSecondsSinceLast(row) > 4 * 3600 ? 1 : 0};
            return values[key] ?? '';
        }
        function updateTechSortHeaderIcons() {
            document.querySelectorAll('[data-tech-sort]').forEach(header => {
                const key = header.dataset.techSort, label = header.dataset.label;
                header.innerHTML = `${escapeHtml(label)} <span style="opacity:${key === currentTechSortCol ? '1' : '.35'}">${key === currentTechSortCol ? (currentTechSortDir === 'asc' ? '▲' : '▼') : '↕'}</span>`;
            });
        }
        function sortTecnicosTable(key) {
            if (currentTechSortCol === key) currentTechSortDir = currentTechSortDir === 'asc' ? 'desc' : 'asc';
            else { currentTechSortCol = key; currentTechSortDir = 'asc'; }
            renderTecnicos();
        }
        function getVisibleTechRecords() {
            const query = String(document.getElementById('inputFilterTecnicos')?.value || '').trim().toLowerCase();
            const filters = techFilterValues();
            return techAllowedRecords().filter(row => {
                if (query && !Object.values(row).join(' ').toLowerCase().includes(query)) return false;
                return techMatchesFilters(row, filters);
            });
        }
        function techChartScope() {
            const filters = techFilterValues();
            if (filters.techCompany && filters.techSkill) return { field:'Tecnico visible', label:'técnico', title:'Cierres por técnico', subtitle:`${filters.techCompany} · ${filters.techSkill}` };
            if (filters.techCompany) return { field:'Skill', label:'skill', title:'Cierres por skill', subtitle:filters.techCompany };
            return { field:'Empresa', label:'empresa', title:'Cierres por empresa', subtitle:filters.techSkill ? `Skill: ${filters.techSkill}` : 'Vista general' };
        }
        function renderTechCharts(records) {
            const target = document.getElementById('techCharts');
            if (!target) return;
            const scope = techChartScope();
            if (!records.length) {
                target.innerHTML = `<section class="tech-chart-card" style="grid-column:1 / -1"><h3 class="tech-chart-title">${escapeHtml(scope.title)}</h3><p class="tech-chart-subtitle">No hay registros para los filtros seleccionados.</p></section>`;
                return;
            }
            const grouped = new Map();
            records.forEach(row => {
                const label = String(row[scope.field] || `Sin ${scope.label}`);
                grouped.set(label, (grouped.get(label) || 0) + (Number(row['Cantidad de trabajos']) || 0));
            });
            const rows = [...grouped.entries()].map(([label, value]) => ({label, value})).sort((a,b) => b.value - a.value || a.label.localeCompare(b.label, 'es'));
            const average = rows.reduce((sum, row) => sum + row.value, 0) / rows.length;
            const maxValue = Math.max(1, ...rows.map(row => row.value), average);
            const width = 680, left = 172, right = 40, top = 25, rowHeight = 25, height = Math.max(210, top + rows.length * rowHeight + 24), plotWidth = width - left - right;
            const avgX = left + (average / maxValue) * plotWidth;
            const bars = rows.map((row, index) => {
                const y = top + index * rowHeight + 4, barWidth = Math.max(1, (row.value / maxValue) * plotWidth);
                const label = row.label.length > 25 ? `${row.label.slice(0, 24)}…` : row.label;
                const color = row.value < average ? '#fbc140' : '#6cab5e';
                return `<text x="${left - 9}" y="${y + 12}" text-anchor="end" font-size="11" font-weight="600" fill="#334155">${escapeHtml(label)}</text><rect x="${left}" y="${y}" width="${barWidth}" height="15" rx="4" fill="${color}"><title>${escapeHtml(row.label)}: ${row.value} cierres</title></rect><text x="${Math.min(width - right + 3, left + barWidth + 6)}" y="${y + 12}" font-size="10" font-weight="700" fill="#334155">${row.value}</text>`;
            }).join('');
            const stateJobs = needle => records.filter(row => String(row['Estado de orden'] || '').toLowerCase().includes(needle)).reduce((sum,row) => sum + (Number(row['Cantidad de trabajos']) || 0), 0);
            const totalJobs = records.reduce((sum,row) => sum + (Number(row['Cantidad de trabajos']) || 0), 0);
            const closed = stateJobs('cerrado'), restored = stateJobs('restaurado'), other = Math.max(0, totalJobs - closed - restored);
            const outcomes = [{label:'Cerrados', value:closed, color:'#6cab5e'}, {label:'Restaurados', value:restored, color:'#3c5a9f'}, ...(other ? [{label:'Otros estados', value:other, color:'#94a3b8'}] : [])];
            const outcomeHtml = outcomes.map(item => {
                const pct = totalJobs ? (item.value / totalJobs * 100).toFixed(1) : '0.0';
                return `<div style="border-left:4px solid ${item.color};background:#f8fafc;border-radius:7px;padding:10px 11px"><div style="font-size:11px;font-weight:800;color:#475569">${item.label}</div><div style="font-size:23px;font-weight:800;color:#0f172a;margin-top:2px">${item.value}</div><div style="font-size:11px;color:#64748b">${pct}% de trabajos</div></div>`;
            }).join('');
            target.innerHTML = `
                <section class="tech-chart-card">
                    <h3 class="tech-chart-title">${escapeHtml(scope.title)} <span class="tech-average-legend"><i></i>Promedio: ${average.toFixed(1)}</span></h3>
                    <p class="tech-chart-subtitle">${escapeHtml(scope.subtitle)} · ${rows.length} ${scope.label}${rows.length === 1 ? '' : 's'} · barras ámbar bajo el promedio</p>
                    <div class="tech-chart-scroll"><svg viewBox="0 0 ${width} ${height}" style="display:block;width:100%;min-width:560px;height:${height}px" role="img" aria-label="${escapeHtml(scope.title)}"><line x1="${avgX}" y1="${top - 8}" x2="${avgX}" y2="${height - 14}" stroke="#fbc140" stroke-width="2" stroke-dasharray="5 4"/>${bars}</svg></div>
                </section>
                <section class="tech-chart-card">
                    <h3 class="tech-chart-title">Embudo operativo</h3>
                    <p class="tech-chart-subtitle">${escapeHtml(scope.subtitle)} · distribución de los trabajos por resultado de cierre</p>
                    <div style="background:var(--pluz-blue);color:#fff;border-radius:8px;padding:14px 15px;margin:12px 0 10px"><div style="font-size:11px;font-weight:700;opacity:.88;text-transform:uppercase">Trabajos registrados</div><div style="font-size:31px;font-weight:800;line-height:1.1">${totalJobs}</div></div>
                    <div style="height:14px;width:0;border-left:12px solid transparent;border-right:12px solid transparent;border-top:14px solid var(--pluz-blue);margin:-10px auto 10px"></div>
                    <div style="display:grid;gap:8px">${outcomeHtml}</div>
                </section>`;
        }
        let currentActiveTechRow = null;
        let currentActiveTechTickets = [];

        function parseTechTickets(row) {
            if (!row) return [];
            let raw = row.Tickets_Detalle || row.tickets || row.tickets_json || [];
            if (typeof raw === 'string') {
                try {
                    raw = JSON.parse(raw);
                } catch (e) {
                    raw = [];
                }
            }
            return Array.isArray(raw) ? raw : [];
        }

        function openTechDetailByIndex(index) {
            const records = getVisibleTechRecords();
            records.sort((a, b) => {
                const valueA = techSortValue(a, currentTechSortCol), valueB = techSortValue(b, currentTechSortCol);
                const numberA = Number(valueA), numberB = Number(valueB);
                const result = Number.isFinite(numberA) && Number.isFinite(numberB) && String(valueA).trim() !== '' && String(valueB).trim() !== '' ? numberA - numberB : String(valueA).localeCompare(String(valueB), 'es', {numeric:true, sensitivity:'base'});
                return result * (currentTechSortDir === 'asc' ? 1 : -1);
            });
            const row = records[index];
            if (!row) return;
            openTechDetailModal(row);
        }

        function openTechDetailModal(row) {
            currentActiveTechRow = row;
            currentActiveTechTickets = parseTechTickets(row);

            // Título e Insignias del Encabezado
            const nameEl = document.getElementById('techDetailName');
            const empEl = document.getElementById('techDetailBadgeEmpresa');
            const skillEl = document.getElementById('techDetailBadgeSkill');
            const zonaEl = document.getElementById('techDetailBadgeZona');
            const fechaEl = document.getElementById('techDetailBadgeFecha');

            if (nameEl) nameEl.innerText = row['Tecnico visible'] || 'Técnico';
            if (empEl) empEl.innerText = row.Empresa || 'Sin empresa';
            if (skillEl) skillEl.innerText = row.Skill || 'Sin skill';
            if (zonaEl) zonaEl.innerText = row['Zona / SET'] || 'Zona / SET';
            if (fechaEl) fechaEl.innerText = row['día'] || '--';

            // Cálculo y Visualización de KPIs de la Jornada
            const totalJobs = Number(row['Cantidad de trabajos']) || currentActiveTechTickets.length;
            const firstDate = techDateValue(row['Primer trabajo']);
            const lastDate = techDateValue(row['Último trabajo']);
            const hourFmt = d => d ? d.toLocaleTimeString('es-PE', {hour:'2-digit', minute:'2-digit'}) : '--';

            const kpiJobs = document.getElementById('techDetailKpiJobs');
            const kpiFirst = document.getElementById('techDetailKpiFirst');
            const kpiLast = document.getElementById('techDetailKpiLast');
            const kpiSpan = document.getElementById('techDetailKpiSpan');
            const kpiPace = document.getElementById('techDetailKpiPace');

            if (kpiJobs) kpiJobs.innerText = totalJobs;
            if (kpiFirst) kpiFirst.innerText = hourFmt(firstDate);
            if (kpiLast) kpiLast.innerText = hourFmt(lastDate);

            if (firstDate && lastDate && lastDate >= firstDate) {
                const spanSecs = (lastDate.getTime() - firstDate.getTime()) / 1000;
                if (kpiSpan) kpiSpan.innerText = techDurationLabel(spanSecs);
                const paceSecs = totalJobs > 1 ? spanSecs / (totalJobs - 1) : 0;
                if (kpiPace) kpiPace.innerText = paceSecs > 0 ? techDurationLabel(paceSecs) : '--';
            } else {
                if (kpiSpan) kpiSpan.innerText = '--';
                if (kpiPace) kpiPace.innerText = '--';
            }

            // Renderizar Cronología y Tabla de Tickets
            renderTechDetailTimeline(currentActiveTechTickets, firstDate, lastDate);

            const inputFilter = document.getElementById('inputFilterTechDetail');
            if (inputFilter) inputFilter.value = '';
            renderTechDetailTable();

            // Abrir Modal
            const overlay = document.getElementById('techDetailModalOverlay');
            if (overlay) overlay.style.display = 'flex';
        }

        function closeTechDetailModal() {
            const overlay = document.getElementById('techDetailModalOverlay');
            if (overlay) overlay.style.display = 'none';
        }

        function renderTechDetailTimeline(tickets, firstDate, lastDate) {
            const track = document.getElementById('techTimelineTrack');
            const legend = document.getElementById('techTimelineLegend');
            if (!track) return;

            if (!tickets || tickets.length === 0) {
                track.innerHTML = '<div style="color: #64748b; font-size: 12px; padding: 8px;">No hay desglose de tickets en este registro (se actualizará en el siguiente ciclo).</div>';
                if (legend) legend.innerText = '';
                return;
            }

            if (legend) {
                legend.innerText = `${tickets.length} trabajos registrados · Pasa el mouse para ver notas`;
            }

            const sorted = [...tickets].sort((a, b) => {
                const dateA = techDateValue(a.fin || a.inicio)?.getTime() || 0;
                const dateB = techDateValue(b.fin || b.inicio)?.getTime() || 0;
                return dateA - dateB;
            });

            let html = '';
            let prevDate = null;

            sorted.forEach((item, idx) => {
                const itemDate = techDateValue(item.fin || item.inicio);
                const timeStr = itemDate ? itemDate.toLocaleTimeString('es-PE', {hour:'2-digit', minute:'2-digit'}) : (item.fin || item.inicio || '--');

                // Intervalo con el trabajo anterior
                if (prevDate && itemDate) {
                    const gapSecs = (itemDate.getTime() - prevDate.getTime()) / 1000;
                    if (gapSecs > 0) {
                        const isAlert = gapSecs > 4 * 3600;
                        const isWarning = gapSecs > 2.5 * 3600;
                        const gapClass = isAlert ? 'tech-timeline-gap gap-alert' : 'tech-timeline-gap';
                        const icon = isAlert ? '⚠️ ' : (isWarning ? '⏳ ' : '⏱️ ');
                        html += `<div class="${gapClass}" title="Intervalo de inactividad: ${techDurationLabel(gapSecs)}">${icon}${techDurationLabel(gapSecs)}</div>`;
                    }
                }

                html += `
                    <div class="tech-timeline-item" title="Ticket: ${escapeHtml(item.ticket)} | ODM: ${escapeHtml(item.odm || 'S/N')} | ${escapeHtml(item.tipo || '')} | ${escapeHtml(item.distrito || '')}">
                        <div style="font-weight: 800; color: var(--pluz-blue); display: flex; align-items: center; gap: 4px;">
                            <span>#${idx + 1}</span> <span>${escapeHtml(timeStr)}</span>
                        </div>
                        <div style="font-weight: 600; color: #0f172a; font-size: 11px;">
                            T: ${escapeHtml(item.ticket || '--')}
                        </div>
                        <div style="color: #64748b; font-size: 9.5px; max-width: 110px; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(item.sed || item.distrito || 'SED/Distrito')}
                        </div>
                    </div>
                `;

                prevDate = itemDate;
            });

            track.innerHTML = html;
        }

        function renderTechDetailTable() {
            const body = document.getElementById('techDetailTableBody');
            const count = document.getElementById('techDetailTableCount');
            const input = document.getElementById('inputFilterTechDetail');
            if (!body) return;

            const query = String(input ? input.value : '').trim().toLowerCase();
            let rows = currentActiveTechTickets.filter(item => {
                if (!query) return true;
                return Object.values(item).some(val => String(val || '').toLowerCase().includes(query));
            });

            if (count) count.innerText = rows.length;

            if (!rows.length) {
                body.innerHTML = `<tr><td colspan="11" style="padding: 18px; text-align: center; color: #64748b;">${currentActiveTechTickets.length ? 'No hay tickets que coincidan con la búsqueda.' : 'No hay detalle de tickets en este registro.'}</td></tr>`;
                return;
            }

            body.innerHTML = rows.map((item, idx) => {
                const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
                const st = String(item.estado || '').toLowerCase();
                const stateColor = st.includes('cerrad') ? '#047857' : (st.includes('restaur') ? '#2563eb' : '#475569');
                return `
                    <tr style="background: ${bg};">
                        <td style="font-weight: 700; color: #64748b;">${idx + 1}</td>
                        <td style="font-weight: 700; color: var(--pluz-blue); white-space: nowrap;">${escapeHtml(item.ticket || '--')}</td>
                        <td style="white-space: nowrap; font-weight: 600; color: #334155;">${escapeHtml(item.odm || '--')}</td>
                        <td style="white-space: nowrap;"><span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px;">${escapeHtml(item.tipo || 'Sin tipo')}</span></td>
                        <td style="white-space: nowrap; font-weight: 600; color: #0f766e;">${escapeHtml(item.sed || '--')}</td>
                        <td style="white-space: nowrap;">${escapeHtml(item.distrito || '--')}</td>
                        <td style="white-space: nowrap; font-size: 10.5px;">${escapeHtml(item.inicio || '--')}</td>
                        <td style="white-space: nowrap; font-size: 10.5px; font-weight: 600;">${escapeHtml(item.fin || '--')}</td>
                        <td style="white-space: nowrap; font-weight: 700; color: #0f172a;">${escapeHtml(item.duracion || '--')}</td>
                        <td style="white-space: nowrap;"><span style="color: ${stateColor}; font-weight: 700;">${escapeHtml(item.estado || '--')}</span></td>
                        <td style="min-width: 200px; color: #475569; font-size: 10.5px; line-height: 1.3;">${escapeHtml(item.nota || '')}</td>
                    </tr>
                `;
            }).join('');
        }

        function renderTecnicos() {
            const body = document.getElementById('tecnicosTableBody');
            const records = getVisibleTechRecords();
            records.sort((a, b) => {
                const valueA = techSortValue(a, currentTechSortCol), valueB = techSortValue(b, currentTechSortCol);
                const numberA = Number(valueA), numberB = Number(valueB);
                const result = Number.isFinite(numberA) && Number.isFinite(numberB) && String(valueA).trim() !== '' && String(valueB).trim() !== '' ? numberA - numberB : String(valueA).localeCompare(String(valueB), 'es', {numeric:true, sensitivity:'base'});
                return result * (currentTechSortDir === 'asc' ? 1 : -1);
            });
            const durations = records.map(techSecondsSinceLast);
            const alerts = durations.filter(seconds => seconds > 4 * 3600).length;
            document.getElementById('techKpiActive').innerText = new Set(records.map(row => row['Tecnico visible'])).size;
            document.getElementById('techKpiJobs').innerText = records.reduce((sum,row) => sum + (Number(row['Cantidad de trabajos']) || 0), 0);
            document.getElementById('techKpiAlerts').innerText = alerts;
            document.getElementById('techKpiAverage').innerText = durations.length ? techDurationLabel(durations.reduce((a,b)=>a+b,0)/durations.length) : '--';
            renderTechCharts(records);
            updateTechSortHeaderIcons();
            body.innerHTML = records.length ? records.map((row, idx) => {
                const seconds = techSecondsSinceLast(row); const alert = seconds > 4 * 3600;
                const first = techDateValue(row['Primer trabajo']); const last = techDateValue(row['Último trabajo']);
                const hour = value => value ? value.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}) : '--';
                return `<tr class="tech-row-clickable" onclick="openTechDetailByIndex(${idx})" title="🔍 Clic para ver los tickets cerrados y cronología de ${escapeHtml(row['Tecnico visible'])}"><td>${escapeHtml(row['día'])}</td><td><strong>${escapeHtml(row['Tecnico visible'])}</strong> <span style="font-size:10px;opacity:.65;">🔍</span></td><td>${escapeHtml(row.Skill)}</td><td>${escapeHtml(row.Empresa)}</td><td>${escapeHtml(row['Zona / SET'])}</td><td>${escapeHtml(row['Estado de orden'])}</td><td>${hour(first)}</td><td>${hour(last)}</td><td style="text-align:center;font-weight:700;">${escapeHtml(row['Cantidad de trabajos'])}</td><td>${techDurationLabel(seconds)}</td><td><span class="${alert?'tech-alert':'tech-ok'}">${alert?'Más de 4h':'Al día'}</span></td></tr>`;
            }).join('') : '<tr><td colspan="11" style="padding:18px;text-align:center">No hay registros para el filtro actual.</td></tr>';
        }

        async function loadTecnicos() {
            const status = document.getElementById('techStatus');
            if (tecnicosLoaded) return renderTecnicos();
            try {
                status.innerText = 'Cargando seguimiento técnico…';
                if (GOOGLE_SHEET_TECNICOS_URL) {
                    const separator = GOOGLE_SHEET_TECNICOS_URL.includes('?') ? '&' : '?';
                    const response = await fetch(GOOGLE_SHEET_TECNICOS_URL + separator + '_nocache=' + Date.now());
                    if (!response.ok) throw new Error('No se pudo leer la hoja publicada.');
                    tecnicosRecords = Papa.parse(await response.text(), {header:true, skipEmptyLines:true}).data || [];
                } else {
                    throw new Error('No existe URL publicada para SEGUIMIENTO_TECNICOS.');
                }
                tecnicosLoaded = true;
                initializeTechFilters();
                const updated = tecnicosRecords[0]?.FECHA_ACTUALIZACION_SISTEMA || '--';
                status.innerText = `${tecnicosRecords.length} registros · Actualizado: ${updated}`;
                renderTecnicos();
                if (!techRefreshTimer) techRefreshTimer = setInterval(renderTecnicos, 60000);
            } catch (error) {
                status.innerText = 'No se pudo cargar SEGUIMIENTO_TECNICOS desde Google Sheets.';
                console.error(error);
            }
        }
