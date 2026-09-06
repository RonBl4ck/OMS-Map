        // Registro de llamadas (primera versión: visible solo al perfil PLUZ en la interfaz)
        function getLlamadaValue(row, ...fields) {
            const val = getProp(row, ...fields);
            return (val === 'N/A' || !val) ? '' : val;
        }
        let currentLlamadasSortCol = 'horaRegistro';
        let currentLlamadasSortDir = 'desc';
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
            let rows = llamadasRecords.filter(row => !query || Object.values(row).some(value => String(value || '').toLowerCase().includes(query)));
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
            if (count) count.innerText = rows.length;
            if (!rows.length) { body.innerHTML = '<tr><td colspan="10" style="padding: 22px; text-align: center; color: #64748b;">No hay llamadas que coincidan con la búsqueda.</td></tr>'; return; }
            body.innerHTML = rows.map((row, index) => {
                const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
                return `<tr style="background:${bg}; border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 10px; font-weight: 700; color: var(--pluz-blue); white-space: nowrap;">${escapeHtml(row.aviso || 'Sin dato')}</td><td style="padding: 8px 10px; white-space: nowrap;">${escapeHtml(row.ticket || 'Sin dato')}</td><td style="padding: 8px 10px; font-weight: 600; color: #0f766e; white-space: nowrap;">${escapeHtml(row.suministro || 'Sin dato')}</td><td style="padding: 8px 10px; font-weight: 600; color: #334155; white-space: nowrap;">${escapeHtml(row.odm || '')}</td><td style="padding: 8px 10px; min-width: 180px;">${escapeHtml(row.nombre || 'Sin dato')}</td><td style="padding: 8px 10px; white-space: nowrap;">${escapeHtml(row.horaRegistro || 'Sin dato')}</td><td style="padding: 8px 10px; white-space: nowrap;">${escapeHtml(row.distrito || 'Sin dato')}</td><td style="padding: 8px 10px; min-width: 220px;">${escapeHtml(row.direccion || 'Sin dato')}</td><td style="padding: 8px 10px; white-space: nowrap;">${escapeHtml(row.estado || 'Sin dato')}</td><td style="padding: 8px 10px; min-width: 240px; color: #334155; font-size: 11px; line-height: 1.35;">${escapeHtml(row.nota || '')}</td></tr>`;
            }).join('');
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
            if (!GOOGLE_SHEET_LLAMADAS_URL) { if (status) status.innerText = 'Pendiente de configurar la URL publicada de BASE_LLAMADAS.'; renderLlamadasTable(); return; }
            if (status) status.innerText = 'Cargando registro de llamadas…';
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
                if (status) status.innerText = `${llamadasRecords.length} registros cargados. Ordenados por hora de registro.`;
            } catch (error) { if (status) status.innerText = 'No se pudo cargar BASE_LLAMADAS. Verifica su URL publicada y los encabezados.'; console.error('Error cargando llamadas:', error); }
            renderLlamadasTable();
        }
