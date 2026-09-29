        let GOOGLE_SHEET_CSV_URL = "";
        let GOOGLE_SHEET_EJECUTADOS_URL = "";
        let GOOGLE_SHEET_LLAMADAS_URL = "";
        let GOOGLE_SHEET_TECNICOS_URL = "";
        let GOOGLE_SHEET_SED_CRITICAS_URL = "";
        let sedCriticasSet = new Set();
        let sedCriticasMap = new Map();
        let mapLocations = [];
        let tdOmsRecords = [];
        let rawData = [];
        let llamadasRecords = [];
        let llamadasLoaded = false;
        let tecnicosRecords = [];
        let tecnicosLoaded = false;
        let techRefreshTimer = null;
        let ejecutadosRecords = [];
        if (typeof window !== 'undefined') window.ejecutadosRecords = ejecutadosRecords;

        let leafletMap = null;
        let markersGroup = null;
        const markerMap = new Map();
        const MAP_CLUSTER_MAX_ZOOM = 12;

        const escapeHtml = (val) => String(val || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
        const OMS_STATUS_COLORS = Object.freeze({
            pendiente: '#FBC13F',
            ejecucion: '#3B599F',
            ejecutado: '#6CAC5E',
            otros: '#C1CBD6'
        });

        function getOmsStatusClass(status) {
            const normalized = String(status || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase();
            if (normalized.includes('pendient')) return 'pendiente';
            if (normalized.includes('ejecuc')) return 'ejecucion';
            if (normalized.includes('ejecutad') || normalized.includes('finaliz') || normalized.includes('cerrad') || normalized.includes('restaur')) return 'ejecutado';
            return 'otros';
        }

        function getOmsStatusColor(status) {
            return OMS_STATUS_COLORS[getOmsStatusClass(status)];
        }

        function isCurrentUserAdmin() {
            if (typeof sessionStorage === 'undefined') return false;
            return sessionStorage.getItem('oms_user_role') === 'admin';
        }

        function debounceUi(callback, wait = 120) {
            let timer = null;
            return function debounced(...args) {
                clearTimeout(timer);
                timer = setTimeout(() => callback.apply(this, args), wait);
            };
        }

        function normalizeSedCode(val) {
            if (!val || val === 'N/A') return "";
            let s = String(val).trim().toUpperCase();
            s = s.replace(/^SED[\s\.\:\-_]*/i, "").trim();
            s = s.replace(/\s+/g, " ");
            return s;
        }

        function extractBaseSedCode(val) {
            if (!val || val === 'N/A') return "";
            let s = normalizeSedCode(val);
            if (s.includes('-')) {
                s = s.split('-')[0].trim();
            }
            return s;
        }

        function isExcludedFault(typeStr) {
            if (!typeStr || typeStr === 'N/A') return false;
            const s = String(typeStr).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return s.includes("SUMINISTRO") || 
                   s.includes("DOMICILIO") || 
                   s.includes("CNX") || 
                   s.includes("CONEXION") || 
                   s.includes("ACOMETIDA") ||
                   s.includes("MEDIDOR") ||
                   s.includes("BORNERA") ||
                   s.includes("SIN SERVICIO");
        }

        function normalizeLlaveCode(val) {
            if (!val || val === 'N/A' || val === 'None') return 'GENERAL';
            let s = String(val).trim().toUpperCase();
            if (s === 'MULTI_LLAVE' || s.includes('BARRA') || s.includes('GENERAL') || s.includes('TRAFO')) return 'MULTI_LLAVE';
            if (s.includes('/')) s = s.split('/').pop();
            if (s.includes(':')) s = s.split(':').pop();
            s = s.replace(/^(LLAVE|LL|CIRC|CIRCUITO|ALIMENTADOR|FU)[\s\.\:\-_]*/i, '').trim();
            s = s.replace(/\b0+([1-9][0-9]*[A-Z0-9]*)\b/g, '$1');
            s = s.replace(/[\s\-_]+/g, '');
            return s || 'GENERAL';
        }

        let topCriticalSedsSet = new Set();
        let topCriticalSedsList = [];

        function isSedCritica(sedVal) {
            if (!sedVal || sedVal === 'N/A') return false;
            const raw = String(sedVal).trim().toUpperCase();
            const norm = normalizeSedCode(sedVal);
            const base = extractBaseSedCode(sedVal);
            return (raw && sedCriticasSet.has(raw)) || 
                   (norm && sedCriticasSet.has(norm)) || 
                   (base && sedCriticasSet.has(base));
        }

        function isTopCriticalSed(sedVal) {
            if (!sedVal || sedVal === 'N/A') return false;
            const raw = String(sedVal).trim().toUpperCase();
            const norm = normalizeSedCode(sedVal);
            const base = extractBaseSedCode(sedVal);
            return (raw && topCriticalSedsSet.has(raw)) || 
                   (norm && topCriticalSedsSet.has(norm)) || 
                   (base && topCriticalSedsSet.has(base));
        }

        /**
         * Calcula el Scoring Ponderado de Severidad y selecciona las Top 4 SEDs Críticas.
         * Fórmula: Score = (Pendientes Activos * 50) + (Fallas 7D * 10) + (Fallas 30D * 3) + (Fallas 1A * 0.5) + (Barra General * 15)
         */
        function recalculateTopCriticalSeds() {
            topCriticalSedsSet.clear();
            topCriticalSedsList = [];

            // 1. Vía Rápida: Si el backend (DuckDB / Python) ya precalculó ES_TOP_4_CRITICA, usarlo directamente
            const precalculatedTop4 = [];
            for (const [key, meta] of sedCriticasMap.entries()) {
                const isTop4 = String(getProp(meta, 'ES_TOP_4_CRITICA', 'es_top_4_critica')).toUpperCase() === 'TRUE';
                if (isTop4) {
                    const norm = normalizeSedCode(key);
                    const base = extractBaseSedCode(key);
                    const score = parseFloat(getProp(meta, 'SCORE_SEVERIDAD', 'score_severidad')) || 0;
                    precalculatedTop4.push({
                        sed: norm || base || key,
                        score: score,
                        activeCount: parseInt(getProp(meta, 'ACTIVOS_COUNT', 'activos_count'), 10) || 0,
                        fallas7d: parseInt(getProp(meta, 'FALLAS_7D', 'fallas_7d'), 10) || 0,
                        fallas30d: parseInt(getProp(meta, 'FALLAS_30D', 'fallas_30d'), 10) || 0,
                        fallas1a: parseInt(getProp(meta, 'FALLAS_1A', 'fallas_1a'), 10) || 0,
                        meta: meta
                    });
                }
            }

            if (precalculatedTop4.length > 0) {
                precalculatedTop4.sort((a, b) => b.score - a.score);
                topCriticalSedsList = precalculatedTop4.slice(0, 4);
                topCriticalSedsList.forEach(item => {
                    const norm = normalizeSedCode(item.sed);
                    const base = extractBaseSedCode(item.sed);
                    if (norm) topCriticalSedsSet.add(norm);
                    if (base) topCriticalSedsSet.add(base);
                    topCriticalSedsSet.add(item.sed);
                });
                console.log(`🔥 [Top 4 SEDs Críticas (DuckDB Precalculado)]`, topCriticalSedsList.map((s, idx) => `#${idx+1}: ${s.sed} (Score: ${s.score}, Activos: ${s.activeCount}, 7D: ${s.fallas7d}, 30D: ${s.fallas30d})`));
                return;
            }

            // 2. Fallback dinámico si no vino precalculado del backend
            // Conteo de tickets pendientes activos por SED (SOLO fallas reales de RED, ignorando suministros/conexiones)
            const activeTicketCounts = new Map();
            (mapLocations || []).forEach(loc => {
                if (isExcludedFault(loc.falla)) return;
                const norm = normalizeSedCode(loc.sed);
                const base = extractBaseSedCode(loc.sed);
                const key = norm || base;
                if (key) {
                    activeTicketCounts.set(key, (activeTicketCounts.get(key) || 0) + 1);
                }
            });

            // Unificar únicamente SEDs que pertenezcan a sedCriticasMap o cumplan isSedCritica
            const candidateSeds = new Set();
            for (const key of sedCriticasMap.keys()) {
                candidateSeds.add(key);
            }
            for (const key of activeTicketCounts.keys()) {
                if (isSedCritica(key)) {
                    candidateSeds.add(key);
                }
            }

            const scoredList = [];

            candidateSeds.forEach(sedKey => {
                const norm = normalizeSedCode(sedKey);
                const base = extractBaseSedCode(sedKey);
                const meta = sedCriticasMap.get(norm) || sedCriticasMap.get(base) || sedCriticasMap.get(sedKey) || {};

                const activeCount = activeTicketCounts.get(norm) || activeTicketCounts.get(base) || activeTicketCounts.get(sedKey) || 0;
                const fallas7d = parseInt(getProp(meta, 'FALLAS_7D', 'fallas_7d'), 10) || 0;
                const fallas30d = parseInt(getProp(meta, 'FALLAS_30D', 'fallas_30d'), 10) || 0;
                const fallas1a = parseInt(getProp(meta, 'FALLAS_1A', 'fallas_1a'), 10) || 0;
                const barraCount = parseInt(getProp(meta, 'EVENTOS_BARRA', 'eventos_barra'), 10) || 0;
                const isCritMeta = getProp(meta, 'ES_CRITICA', 'es_critica').toUpperCase() === 'TRUE';

                // Solo calificar si es crítica o tiene reincidencia de red
                if (!isCritMeta && fallas7d < 2 && fallas30d < 2) return;

                // Fórmula de Scoring Ponderado
                const score = (activeCount * 50) + (fallas7d * 10) + (fallas30d * 3) + (fallas1a * 0.5) + (barraCount > 0 ? 15 : 0);

                scoredList.push({
                    sed: norm || base || sedKey,
                    score: score,
                    activeCount: activeCount,
                    fallas7d: fallas7d,
                    fallas30d: fallas30d,
                    fallas1a: fallas1a,
                    meta: meta
                });
            });

            // Ordenar de mayor a menor score (desempate por 7D, 30D, 1A)
            scoredList.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
                if (b.fallas7d !== a.fallas7d) return b.fallas7d - a.fallas7d;
                return b.fallas30d - a.fallas30d;
            });

            // Seleccionar estrictamente las Top 4
            topCriticalSedsList = scoredList.slice(0, 4);
            topCriticalSedsList.forEach(item => {
                const norm = normalizeSedCode(item.sed);
                const base = extractBaseSedCode(item.sed);
                if (norm) topCriticalSedsSet.add(norm);
                if (base) topCriticalSedsSet.add(base);
                topCriticalSedsSet.add(item.sed);
            });

            console.log(`🔥 [Top 4 SEDs Críticas]`, topCriticalSedsList.map((s, idx) => `#${idx+1}: ${s.sed} (Score: ${s.score}, Activos: ${s.activeCount}, 7D: ${s.fallas7d}, 30D: ${s.fallas30d})`));
        }

        function getProp(obj, ...keys) {
            if (!obj) return 'N/A';
            for (const key of keys) {
                if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
                    return String(obj[key]).trim();
                }
            }
            const objKeys = Object.keys(obj);
            for (const target of keys) {
                const normTarget = target.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const foundKey = objKeys.find(k => k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normTarget);
                if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null && String(obj[foundKey]).trim() !== '') {
                    return String(obj[foundKey]).trim();
                }
            }
            return 'N/A';
        }

        function filterRecordsForAssignedContractor(records, assignedContractor) {
            const safeRecords = Array.isArray(records) ? records : [];
            if (assignedContractor === '*') return safeRecords.slice();
            const targetCompany = String(assignedContractor || '').trim().toUpperCase();
            if (!targetCompany) return [];
            return safeRecords.filter(item => {
                const company = getProp(item, 'Contratista', 'Empresa', 'CONTRATISTA', 'empresa', 'Pto.tbjo.responsable').toUpperCase();
                return company !== 'N/A' && (company.includes(targetCompany) || targetCompany.includes(company));
            });
        }

        function matchesMultiSelection(value, selectedValues) {
            const selected = Array.isArray(selectedValues) ? selectedValues : [];
            return selected.length === 0 || selected.includes(String(value || ''));
        }

        function getFacetedFilterValues(records, field, filterFields, selections, excludedId) {
            const available = (records || []).filter(row => Object.entries(filterFields).every(([otherField, controlId]) => {
                return controlId === excludedId || matchesMultiSelection(row[otherField], selections[controlId] || []);
            })).map(row => String(row[field] || '')).filter(Boolean);
            return [...new Set(available)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
        }

        function setAppDataLoadState(state, message = '') {
            const status = document.getElementById('appDataStatus');
            const statusMessage = document.getElementById('appDataStatusMessage');
            const retryButton = document.getElementById('btnRetryDataLoad');
            const toolbar = document.getElementById('mapSearchToolbar');
            const isLoading = state === 'loading';
            const isReady = state === 'ready';

            if (status) {
                status.dataset.state = state;
                status.setAttribute('aria-busy', String(isLoading));
            }
  if (statusMessage) {
    statusMessage.innerText = message || (isLoading ? 'Cargando datos…' : (isReady ? 'Datos cargados' : 'No pudimos cargar los datos.'));
  }
            if (retryButton) retryButton.hidden = state !== 'error';
            if (toolbar) toolbar.setAttribute('aria-busy', String(isLoading));

            document.querySelectorAll('[data-requires-primary-data]').forEach(control => {
                control.disabled = !isReady;
            });
            if (isLoading) {
                document.querySelectorAll('[data-loading-kpi]').forEach(kpi => {
                    kpi.innerText = '—';
                });
            }
        }

        const SLA_CONFIG_HORAS = {
            "SUMINISTRO": 4,
            "RED AEREA": 8,
            "RED AÉREA": 8,
            "CNX AEREA": 8,
            "CNX AÉREA": 8,
            "LÍNEA AÉREA BT": 8,
            "LINEA AEREA BT": 8,
            "RED SUBTERRANEA": 12,
            "RED SUBTERRÁNEA": 12,
            "CNX SUBTERRANEA": 8,
            "CNX SUBTERRÁNEA": 8,
            "FUSIBLE": 4,
            "POSTE": 8,
            "RIESGO": 2,
            "RIESGO DE VIDA": 2,
            "PELIGRO": 2,
            "DEFAULT": 4
        };

        function getEmoji(falla) {
            const f = String(falla || '').trim().toUpperCase();
            if (f.includes("RED SUBTERRANEA") || f.includes("RED SUBTERRÁNEA")) return "🕳️";
            if (f.includes("RED AEREA") || f.includes("RED AÉREA") || f.includes("CNX AEREA") || f.includes("CNX AÉREA") || f.includes("LÍNEA AÉREA BT") || f.includes("LINEA AEREA BT")) return "⚡";
            if (f.includes("CNX SUBTERRANEA") || f.includes("CNX SUBTERRÁNEA")) return "🕳️";
            if (f.includes("SUMINISTRO")) return "🏠";
            if (f.includes("FUSIBLE")) return "🔌";
            if (f.includes("POSTE")) return "🪵";
            return "📍";
        }

        function getFaultIconHtml(falla) {
            const f = String(falla || '').trim().toUpperCase();
            if (f.includes("RED SUBTERRANEA") || f.includes("RED SUBTERRÁNEA") || f.includes("CNX SUBTERRANEA") || f.includes("CNX SUBTERRÁNEA")) {
                return `<img src="assets/icons/subterranea.svg" alt="Subterránea" class="fault-icon-img">`;
            }
            if (f.includes("RED AEREA") || f.includes("RED AÉREA") || f.includes("CNX AEREA") || f.includes("CNX AÉREA") || f.includes("LÍNEA AÉREA BT") || f.includes("LINEA AEREA BT")) {
                return `<img src="assets/icons/red_aerea.svg" alt="Red Aérea" class="fault-icon-img">`;
            }
            if (f.includes("SUMINISTRO")) {
                return `<img src="assets/icons/suministro.svg" alt="Suministro" class="fault-icon-img">`;
            }
            if (f.includes("FUSIBLE")) {
                return `<img src="assets/icons/fusible.svg" alt="Fusible" class="fault-icon-img">`;
            }
            if (f.includes("POSTE")) {
                return `<img src="assets/icons/poste.svg" alt="Poste" class="fault-icon-img">`;
            }
            return `<span class="fault-icon-emoji">${getEmoji(falla)}</span>`;
        }

        function parseDateFlexible(val) {
            if (!val || val === 'N/A') return null;
            const s = String(val).trim();
            const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
            if (dmy) {
                const day = parseInt(dmy[1], 10);
                const month = parseInt(dmy[2], 10) - 1;
                const year = parseInt(dmy[3], 10);
                const hour = parseInt(dmy[4] || 0, 10);
                const min = parseInt(dmy[5] || 0, 10);
                const sec = parseInt(dmy[6] || 0, 10);
                const dt = new Date(year, month, day, hour, min, sec);
                return isNaN(dt.getTime()) ? null : dt;
            }
            const dtIso = new Date(s.replace(' ', 'T'));
            if (!isNaN(dtIso.getTime())) return dtIso;
            return null;
        }

        function calculateTicketSla(record) {
            // 1. Determinar SLA máximo en horas (usar precalculado si viene de Python o resolver)
            let maxHours = 0;
            if (record.sla_max_horas !== undefined && record.sla_max_horas !== null && !isNaN(Number(record.sla_max_horas))) {
                maxHours = Number(record.sla_max_horas);
            } else {
                const falla = String(record.falla || '').toUpperCase();
                const prioridad = String(record.prioridad || '').toUpperCase();

                if (prioridad.includes("RIESGO") || prioridad.includes("VIDA") || prioridad.includes("PELIGRO")) {
                    maxHours = SLA_CONFIG_HORAS["RIESGO DE VIDA"];
                } else if (falla.includes("RED SUBTERRANEA") || falla.includes("RED SUBTERRÁNEA")) {
                    maxHours = SLA_CONFIG_HORAS["RED SUBTERRANEA"];
                } else if (falla.includes("CNX SUBTERRANEA") || falla.includes("CNX SUBTERRÁNEA")) {
                    maxHours = SLA_CONFIG_HORAS["CNX SUBTERRANEA"];
                } else if (falla.includes("RED AEREA") || falla.includes("RED AÉREA") || falla.includes("LÍNEA AÉREA BT") || falla.includes("LINEA AEREA BT")) {
                    maxHours = SLA_CONFIG_HORAS["RED AEREA"];
                } else if (falla.includes("CNX AEREA") || falla.includes("CNX AÉREA")) {
                    maxHours = SLA_CONFIG_HORAS["CNX AEREA"];
                } else if (falla.includes("SUMINISTRO")) {
                    maxHours = SLA_CONFIG_HORAS["SUMINISTRO"];
                } else if (falla.includes("FUSIBLE")) {
                    maxHours = SLA_CONFIG_HORAS["FUSIBLE"];
                } else if (falla.includes("POSTE")) {
                    maxHours = SLA_CONFIG_HORAS["POSTE"];
                } else {
                    maxHours = SLA_CONFIG_HORAS.DEFAULT;
                }
            }
            if (maxHours <= 0) maxHours = SLA_CONFIG_HORAS.DEFAULT;

            // 2. Determinar duración transcurrida (en horas) comparando en vivo contra Date.now()
            let elapsed = 0;
            let dateResolved = false;

            if (record.fecha_limite_sla && record.fecha_limite_sla !== 'N/A') {
                const limitDate = parseDateFlexible(record.fecha_limite_sla);
                if (limitDate) {
                    const remainingHours = (limitDate.getTime() - Date.now()) / (1000 * 60 * 60);
                    elapsed = Math.max(0, maxHours - remainingHours);
                    dateResolved = true;
                }
            }

            if (!dateResolved && record.fecha_inicio && record.fecha_inicio !== 'N/A') {
                const start = parseDateFlexible(record.fecha_inicio);
                if (start) {
                    elapsed = Math.max(0, (Date.now() - start.getTime()) / (1000 * 60 * 60));
                    dateResolved = true;
                }
            }

            if (!dateResolved && record.duracion !== undefined && record.duracion !== null && record.duracion !== 'N/A' && record.duracion !== '') {
                const dStr = String(record.duracion).replace(',', '.').trim();
                const dNum = parseFloat(dStr);
                if (!isNaN(dNum)) {
                    elapsed = Math.max(0, dNum);
                }
            }

            const pct = maxHours > 0 ? (elapsed / maxHours) : 0;
            const warnHours = maxHours * 0.75;
            const remainingHours = maxHours - elapsed;

            let status = 'ok'; // 🟢
            let statusClass = 'sla-ok';
            let label = 'Dentro de plazo';
            let badgeColor = '#16a34a';

            if (elapsed >= maxHours) {
                status = 'overdue'; // 🔴
                statusClass = 'sla-overdue';
                const overMins = Math.round((elapsed - maxHours) * 60);
                const overHoursText = overMins >= 60 ? `${Math.floor(overMins / 60)}h ${overMins % 60}m` : `${overMins}m`;
                label = `Fuera de plazo (+${overHoursText})`;
                badgeColor = '#dc2626';
            } else if (elapsed >= warnHours) {
                status = 'warning'; // 🟡
                statusClass = 'sla-warning';
                const remMins = Math.round(remainingHours * 60);
                const remHoursText = remMins >= 60 ? `${Math.floor(remMins / 60)}h ${remMins % 60}m` : `${remMins}m`;
                label = `A poco de vencer (restan ${remHoursText})`;
                badgeColor = '#f59e0b';
            } else {
                const remMins = Math.round(remainingHours * 60);
                const remHoursText = remMins >= 60 ? `${Math.floor(remMins / 60)}h ${remMins % 60}m` : `${remMins}m`;
                label = `Dentro de plazo (restan ${remHoursText})`;
            }

            return {
                status,
                statusClass,
                label,
                badgeColor,
                maxHours,
                warnHours,
                elapsed: Math.round(elapsed * 10) / 10,
                pct: Math.round(pct * 100),
                remainingHours
            };
        }

        // Función para ordenar intervalos de tiempo numéricamente
        function sortIntervals(a, b) {
            const parseNum = (str) => {
                const match = String(str).match(/\d+/);
                return match ? parseInt(match[0], 10) : 999;
            };
            const numA = parseNum(a);
            const numB = parseNum(b);
            if (numA !== numB) return numA - numB;
            return String(a).localeCompare(String(b), 'es');
        }

        // === COMPONENTE MULTI-SELECT CHECKBOX ===
        function initMultiSelect(containerId, titlePrefix, valuesList, onChangeCallback, labelFormatter = value => value) {
            const container = document.getElementById(containerId);
            if (!container) return null;
            container.innerHTML = "";
            container.className = "custom-multiselect";

            const sortFn = (titlePrefix === "Intervalo") ? sortIntervals : (a, b) => String(a).localeCompare(String(b), 'es');
            let initialOptions = [...new Set(valuesList)].filter(Boolean).sort(sortFn);
            let options = [...initialOptions];
            let selectedVals = new Set(options);
            let isAllSelectedState = true;

            const btn = document.createElement("button");
            btn.className = "multiselect-btn";
            btn.type = "button";
            btn.setAttribute("aria-haspopup", "true");
            btn.setAttribute("aria-expanded", "false");

            const menu = document.createElement("div");
            menu.className = "multiselect-dropdown-menu";
            menu.id = `${containerId}Menu`;
            menu.setAttribute("role", "group");
            menu.setAttribute("aria-label", `Opciones de ${titlePrefix}`);
            btn.setAttribute("aria-controls", menu.id);

            // Evitar que el menú se cierre al hacer clic dentro
            menu.addEventListener("click", (e) => {
                e.stopPropagation();
            });

            function updateBtnLabel() {
                if (options.length === 0) {
                    btn.innerText = `${titlePrefix}: (Sin datos)`;
                } else if (isAllSelectedState || selectedVals.size === options.length) {
                    btn.innerText = `${titlePrefix}: Todos (${options.length})`;
                } else if (selectedVals.size === 0) {
                    btn.innerText = `${titlePrefix}: 0 selec.`;
                } else if (selectedVals.size === 1) {
                    btn.innerText = `${titlePrefix}: ${labelFormatter(Array.from(selectedVals)[0])}`;
                } else {
                    btn.innerText = `${titlePrefix}: ${selectedVals.size} selec.`;
                }
            }

            const allItem = document.createElement("label");
            allItem.className = "multiselect-item";
            allItem.style.fontWeight = "bold";
            const allCb = document.createElement("input");
            allCb.type = "checkbox";
            allCb.checked = true;
            allItem.appendChild(allCb);
            allItem.appendChild(document.createTextNode("(Seleccionar todos)"));
            menu.appendChild(allItem);

            const divider = document.createElement("div");
            divider.className = "multiselect-divider";
            menu.appendChild(divider);

            const optionList = document.createElement("div");
            menu.appendChild(optionList);
            let optionCbs = [];

            function renderOptions() {
                optionList.innerHTML = "";
                optionCbs = options.map(val => {
                    const item = document.createElement("label");
                    item.className = "multiselect-item";
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.value = val;
                    cb.checked = selectedVals.has(val);
                    cb.addEventListener("change", () => {
                        if (cb.checked) {
                            selectedVals.add(val);
                        } else {
                            selectedVals.delete(val);
                        }
                        isAllSelectedState = options.length > 0 && selectedVals.size === options.length;
                        allCb.checked = isAllSelectedState;
                        updateBtnLabel();
                        onChangeCallback(Array.from(selectedVals));
                    });
                    item.appendChild(cb);
                    item.appendChild(document.createTextNode(labelFormatter(val)));
                    optionList.appendChild(item);
                    return cb;
                });
                allCb.checked = isAllSelectedState || (options.length > 0 && selectedVals.size === options.length);
                updateBtnLabel();
            }

            allCb.addEventListener("change", () => {
                const checkAll = allCb.checked;
                selectedVals.clear();
                isAllSelectedState = checkAll;
                optionCbs.forEach(cb => {
                    cb.checked = checkAll;
                    if (checkAll) selectedVals.add(cb.value);
                });
                updateBtnLabel();
                onChangeCallback(Array.from(selectedVals));
            });

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                document.querySelectorAll(".multiselect-dropdown-menu.show").forEach(m => {
                    if (m !== menu) m.classList.remove("show");
                });
                menu.classList.toggle("show");
                btn.setAttribute("aria-expanded", String(menu.classList.contains("show")));
            });

            menu.addEventListener("keydown", event => {
                if (event.key !== "Escape") return;
                menu.classList.remove("show");
                btn.setAttribute("aria-expanded", "false");
                btn.focus();
            });

            container.appendChild(btn);
            container.appendChild(menu);
            renderOptions();

            return {
                getSelected: () => Array.from(selectedVals),
                isAllSelected: () => isAllSelectedState || (options.length > 0 && selectedVals.size === options.length),
                reset: () => {
                    options = [...initialOptions];
                    selectedVals = new Set(options);
                    isAllSelectedState = true;
                    allCb.checked = true;
                    renderOptions();
                },
                setSelected: (newSelectedVals, triggerChange = true) => {
                    const list = Array.isArray(newSelectedVals) ? newSelectedVals : [newSelectedVals];
                    selectedVals = new Set(list.filter(v => options.includes(v)));
                    isAllSelectedState = options.length > 0 && selectedVals.size === options.length;
                    allCb.checked = isAllSelectedState;
                    optionCbs.forEach(cb => {
                        cb.checked = selectedVals.has(cb.value);
                    });
                    updateBtnLabel();
                    if (triggerChange && typeof onChangeCallback === 'function') {
                        onChangeCallback(Array.from(selectedVals));
                    }
                },
                setOptions: nextValues => {
                    const nextList = [...new Set(nextValues || [])].filter(Boolean).sort(sortFn);
                    options = nextList;
                    if (isAllSelectedState) {
                        selectedVals = new Set(options);
                    } else {
                        selectedVals = new Set([...selectedVals].filter(value => options.includes(value)));
                    }
                    renderOptions();
                },
                setBaseOptions: baseValues => {
                    initialOptions = [...new Set(baseValues || [])].filter(Boolean).sort(sortFn);
                }
            };
        }

        document.addEventListener("click", () => {
            document.querySelectorAll(".multiselect-dropdown-menu.show").forEach(m => {
                m.classList.remove("show");
                document.querySelector(`[aria-controls="${m.id}"]`)?.setAttribute("aria-expanded", "false");
            });
        });

        // Notificaciones Flotantes y Navegación Inteligente al Mapa
        function showAppNotification(message, type = 'info', duration = 4000) {
            let toast = document.getElementById('appNotificationToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'appNotificationToast';
                toast.className = 'app-notification-toast';
                document.body.appendChild(toast);
            }
            const icon = type === 'warning' ? '⚠️' : (type === 'success' ? '✅' : 'ℹ️');
            toast.innerHTML = `
                <span class="app-toast-icon">${icon}</span>
                <div class="app-toast-message">${escapeHtml(message)}</div>
                <button type="button" class="app-toast-close" onclick="this.parentElement.classList.remove('open')">✕</button>
            `;
            toast.classList.remove('open');
            requestAnimationFrame(() => {
                toast.classList.add('open');
            });
            if (window._appNotificationTimer) clearTimeout(window._appNotificationTimer);
            window._appNotificationTimer = setTimeout(() => {
                toast.classList.remove('open');
            }, duration);
        }

        function navigateToTicketOnMap(ticketOrOdm) {
            if (!ticketOrOdm) return;
            const query = String(ticketOrOdm).trim().toLowerCase();

            // Buscar coincidencia en los puntos cargados del mapa
            const match = (mapLocations || []).find(l => {
                const t = String(l.ticket || '').toLowerCase();
                const o = String(l.odm || '').toLowerCase();
                return t === query || o === query;
            });

            if (!match || typeof match.lat !== 'number' || typeof match.lon !== 'number') {
                showAppNotification(`El ticket #${ticketOrOdm} ya no está pendiente en el mapa en vivo (puede haber sido atendido o cerrado).`, 'warning');
                return;
            }

            // 1. Cerrar otros modales o paneles abiertos
            if (typeof closeTechDetailModal === 'function') closeTechDetailModal();
            if (typeof closeCallDetail === 'function') closeCallDetail();
            if (typeof closeCriticalSedPanel === 'function') closeCriticalSedPanel();

            // 2. Cambiar a la vista del mapa
            if (typeof showMapView === 'function') {
                showMapView();
            }

            // 3. Resetear temporalmente el buscador superior del mapa para asegurar visibilidad
            const inputTicket = document.getElementById("inputTicket");
            if (inputTicket) inputTicket.value = "";
            if (typeof filterMapMarkers === 'function') filterMapMarkers();

            // 4. Volar suavemente al punto en el mapa y abrir su popup
            if (leafletMap) {
                leafletMap.flyTo([match.lat, match.lon], 17, { animate: true, duration: 0.8 });
                setTimeout(() => {
                    const target = markerMap.get(String(match.ticket).toLowerCase()) ||
                                   markerMap.get(String(match.odm).toLowerCase()) ||
                                   markerMap.get(query);
                    if (target && target.marker) {
                        target.marker.openPopup();
                        if (target.marker._icon) {
                            target.marker._icon.classList.add('marker-highlight-pulse');
                            setTimeout(() => target.marker._icon?.classList.remove('marker-highlight-pulse'), 3000);
                        }
                    }
                }, 850);
            }
        }

