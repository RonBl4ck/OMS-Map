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

        let leafletMap = null;
        let markersGroup = null;
        const markerMap = new Map();
        const MAP_CLUSTER_MAX_ZOOM = 12;

        const escapeHtml = (val) => String(val || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
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

        function isSedCritica(sedVal) {
            if (!sedVal || sedVal === 'N/A') return false;
            const raw = String(sedVal).trim().toUpperCase();
            const norm = normalizeSedCode(sedVal);
            return (raw && sedCriticasSet.has(raw)) || (norm && sedCriticasSet.has(norm));
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

        function calculateTicketSla(record) {
            const falla = String(record.falla || '').toUpperCase();
            const prioridad = String(record.prioridad || '').toUpperCase();

            // 1. Determinar SLA máximo en horas
            let maxHours = SLA_CONFIG_HORAS.DEFAULT;
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
            }

            // 2. Determinar duración transcurrida (en horas)
            let elapsed = 0;
            if (record.duracion !== undefined && record.duracion !== null && record.duracion !== 'N/A' && record.duracion !== '') {
                const dStr = String(record.duracion).replace(',', '.').trim();
                const dNum = parseFloat(dStr);
                if (!isNaN(dNum)) elapsed = dNum;
            } else if (record.fecha_inicio && record.fecha_inicio !== 'N/A') {
                const start = new Date(record.fecha_inicio);
                if (!isNaN(start.getTime())) {
                    elapsed = Math.max(0, (Date.now() - start.getTime()) / (1000 * 60 * 60));
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
            let options = [...new Set(valuesList)].filter(Boolean).sort(sortFn);
            let selectedVals = new Set(options);

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
                if (selectedVals.size === options.length) {
                    btn.innerText = `${titlePrefix}: Todos (${options.length})`;
                } else if (selectedVals.size === 0) {
                    btn.innerText = `${titlePrefix}: Todos (${options.length})`;
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
                        if (cb.checked) selectedVals.add(val);
                        else selectedVals.delete(val);
                        allCb.checked = options.length > 0 && selectedVals.size === options.length;
                        updateBtnLabel();
                        onChangeCallback(Array.from(selectedVals));
                    });
                    item.appendChild(cb);
                    item.appendChild(document.createTextNode(labelFormatter(val)));
                    optionList.appendChild(item);
                    return cb;
                });
                allCb.checked = options.length > 0 && selectedVals.size === options.length;
                updateBtnLabel();
            }

            allCb.addEventListener("change", () => {
                const checkAll = allCb.checked;
                selectedVals.clear();
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
                isAllSelected: () => selectedVals.size === 0 || selectedVals.size === options.length,
                reset: () => {
                    selectedVals = new Set(options);
                    allCb.checked = true;
                    optionCbs.forEach(cb => cb.checked = true);
                    updateBtnLabel();
                },
                setOptions: nextValues => {
                    const wasAllSelected = selectedVals.size === options.length;
                    options = [...new Set(nextValues || [])].filter(Boolean).sort(sortFn);
                    selectedVals = wasAllSelected
                        ? new Set(options)
                        : new Set([...selectedVals].filter(value => options.includes(value)));
                    renderOptions();
                }
            };
        }

        document.addEventListener("click", () => {
            document.querySelectorAll(".multiselect-dropdown-menu.show").forEach(m => {
                m.classList.remove("show");
                document.querySelector(`[aria-controls="${m.id}"]`)?.setAttribute("aria-expanded", "false");
            });
        });
