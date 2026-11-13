        // Load modular utilities if available in Node / CommonJS
        if (typeof require === 'function') {
            try {
                if (typeof omsStore === 'undefined') {
                    const storeMod = require('./state/store.js');
                    if (storeMod && storeMod.omsStore) {
                        if (typeof globalThis !== 'undefined') globalThis.omsStore = storeMod.omsStore;
                    }
                }
                if (typeof DateUtils === 'undefined') {
                    const dateMod = require('./utils/dateUtils.js');
                    if (dateMod) {
                        if (typeof globalThis !== 'undefined') globalThis.DateUtils = dateMod.DateUtils || dateMod;
                    }
                }
                if (typeof DomUtils === 'undefined') {
                    const domMod = require('./utils/domUtils.js');
                    if (domMod) {
                        if (typeof globalThis !== 'undefined') globalThis.DomUtils = domMod.DomUtils || domMod;
                    }
                }
                if (typeof GeoUtils === 'undefined') {
                    const geoMod = require('./utils/geoUtils.js');
                    if (geoMod) {
                        if (typeof globalThis !== 'undefined') globalThis.GeoUtils = geoMod.GeoUtils || geoMod;
                    }
                }
            } catch (e) {
                // Standalone execution in VM context without require
            }
        }

        var GOOGLE_SHEET_CSV_URL = (typeof omsStore !== 'undefined') ? (omsStore.get('GOOGLE_SHEET_CSV_URL') || "") : "";
        var GOOGLE_SHEET_EJECUTADOS_URL = (typeof omsStore !== 'undefined') ? (omsStore.get('GOOGLE_SHEET_EJECUTADOS_URL') || "") : "";
        var GOOGLE_SHEET_LLAMADAS_URL = (typeof omsStore !== 'undefined') ? (omsStore.get('GOOGLE_SHEET_LLAMADAS_URL') || "") : "";
        var GOOGLE_SHEET_TECNICOS_URL = (typeof omsStore !== 'undefined') ? (omsStore.get('GOOGLE_SHEET_TECNICOS_URL') || "") : "";
        var GOOGLE_SHEET_SED_CRITICAS_URL = (typeof omsStore !== 'undefined') ? (omsStore.get('GOOGLE_SHEET_SED_CRITICAS_URL') || "") : "";
        var GOOGLE_SHEET_SUPERVISOR_URL = (typeof omsStore !== 'undefined') ? (omsStore.get('GOOGLE_SHEET_SUPERVISOR_URL') || "") : "";
        var supervisorRecordsMap = (typeof omsStore !== 'undefined' && omsStore.get('supervisorRecordsMap')) || new Map();
        var supervisorRecordsBySedMap = (typeof omsStore !== 'undefined' && omsStore.get('supervisorRecordsBySedMap')) || new Map();
        if (typeof window !== 'undefined') {
            window.supervisorRecordsMap = supervisorRecordsMap;
            window.supervisorRecordsBySedMap = supervisorRecordsBySedMap;
            window.getFaultIconSvg = getFaultIconSvg;
            window.getFaultIconHtml = getFaultIconHtml;
        }
        var sedCriticasSet = (typeof omsStore !== 'undefined' && omsStore.get('sedCriticasSet')) || new Set();
        var sedCriticasMap = (typeof omsStore !== 'undefined' && omsStore.get('sedCriticasMap')) || new Map();
        var mapLocations = (typeof omsStore !== 'undefined' && omsStore.get('mapLocations')) || [];
        var tdOmsRecords = (typeof omsStore !== 'undefined' && omsStore.get('tdOmsRecords')) || [];
        var rawData = (typeof omsStore !== 'undefined' && omsStore.get('rawData')) || [];
        var llamadasRecords = (typeof omsStore !== 'undefined' && omsStore.get('llamadasRecords')) || [];
        var llamadasLoaded = false;
        var tecnicosRecords = (typeof omsStore !== 'undefined' && omsStore.get('tecnicosRecords')) || [];
        var tecnicosLoaded = false;
        var techRefreshTimer = null;
        var ejecutadosRecords = (typeof omsStore !== 'undefined' && omsStore.get('ejecutadosRecords')) || [];
        if (typeof window !== 'undefined') window.ejecutadosRecords = ejecutadosRecords;

        var leafletMap = null;
        var markersGroup = null;
        const markerMap = (typeof omsStore !== 'undefined' && omsStore.get('markerMap')) || new Map();
        const MAP_CLUSTER_MAX_ZOOM = 14;

        const escapeHtml = (val) => (typeof DomUtils !== 'undefined' && typeof DomUtils.escapeHtml === 'function')
            ? DomUtils.escapeHtml(val)
            : String(val || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

        const OMS_STATUS_COLORS = (typeof DomUtils !== 'undefined' && DomUtils.OMS_STATUS_COLORS) || Object.freeze({
            pendiente: '#FBC13F',
            ejecucion: '#3B599F',
            ejecutado: '#6CAC5E',
            otros: '#C1CBD6'
        });

        function getOmsStatusClass(status) {
            if (typeof DomUtils !== 'undefined' && typeof DomUtils.getOmsStatusClass === 'function') {
                return DomUtils.getOmsStatusClass(status);
            }
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
            if (typeof DomUtils !== 'undefined' && typeof DomUtils.getOmsStatusColor === 'function') {
                return DomUtils.getOmsStatusColor(status);
            }
            return OMS_STATUS_COLORS[getOmsStatusClass(status)];
        }

        function isCurrentUserAdmin() {
            if (typeof sessionStorage === 'undefined') return false;
            return sessionStorage.getItem('oms_user_role') === 'admin';
        }

        function getSupervisorDataForTicket(ticket) {
            if (!ticket) return null;
            const key = String(ticket).trim().toLowerCase();
            return supervisorRecordsMap.get(key) || null;
        }

        function getSupervisorLogsForSed(sed) {
            if (!sed) return [];
            const key = String(sed).trim().toUpperCase();
            const list = supervisorRecordsBySedMap.get(key);
            return Array.isArray(list) ? list : [];
        }

        function cleanSupVal(val) {
            if (!val) return '';
            const s = String(val).trim();
            return (/^n\/?a$/i.test(s) || s === '--' || s === 'null' || s === 'undefined') ? '' : s;
        }

        function getTicketPluzStatus(ticket) {
            const sup = getSupervisorDataForTicket(ticket);
            if (!sup || !sup.latest) return 'SIN REGISTRO';
            const op = cleanSupVal(sup.latest.estadoOperativo || sup.latest.estado).toUpperCase();
            if (!op || op === 'QUANTICO' || op === 'CRITICO') return 'SIN REGISTRO';
            return op;
        }

        function syncRecordsPluzStatus() {
            const updateList = (list) => {
                if (!Array.isArray(list)) return;
                list.forEach(r => {
                    if (r && typeof r === 'object') {
                        r.estado_pluz = getTicketPluzStatus(r.ticket);
                    }
                });
            };
            updateList(tdOmsRecords);
            updateList(mapLocations);

            if (typeof window !== 'undefined') {
                if (window.mapCtrlEstadoPluz && Array.isArray(mapLocations)) {
                    const mapOpts = mapLocations.map(m => m.estado_pluz || getTicketPluzStatus(m.ticket));
                    if (typeof window.mapCtrlEstadoPluz.setBaseOptions === 'function') {
                        window.mapCtrlEstadoPluz.setBaseOptions(mapOpts);
                    }
                    if (typeof window.mapCtrlEstadoPluz.setOptions === 'function') {
                        window.mapCtrlEstadoPluz.setOptions(mapOpts);
                    }
                }
                if (window.tdCtrlEstadoPluz && Array.isArray(tdOmsRecords)) {
                    const tdOpts = tdOmsRecords.map(r => r.estado_pluz || getTicketPluzStatus(r.ticket));
                    if (typeof window.tdCtrlEstadoPluz.setBaseOptions === 'function') {
                        window.tdCtrlEstadoPluz.setBaseOptions(tdOpts);
                    }
                    if (typeof window.tdCtrlEstadoPluz.setOptions === 'function') {
                        window.tdCtrlEstadoPluz.setOptions(tdOpts);
                    }
                }
            }
        }

        function addSupervisorLogOptimistic(entry) {
            if (!entry || !entry.ticket) return;
            const key = String(entry.ticket).trim().toLowerCase();
            let data = supervisorRecordsMap.get(key);
            const clean = cleanSupVal;
            const normalizedEntry = {
                fecha: entry.fecha || '',
                ticket: String(entry.ticket).trim(),
                sed: clean(entry.sed),
                horaInicio: clean(entry.horaInicio || entry.hora_inicio),
                alimentador: clean(entry.alimentador),
                empresa: clean(entry.empresa),
                estadoOperativo: clean(entry.estadoOperativo || entry.estado),
                detalleOperativo: clean(entry.detalleOperativo || entry.detalle),
                jefeCuadrilla: clean(entry.jefeCuadrilla || entry.jc),
                finEstimado: clean(entry.finEstimado || entry.horaFinEstimada || entry.fechaFinEstimada),
                estadoCritico: clean(entry.estadoCritico),
                detalleCritico: clean(entry.detalleCritico),
                estado: clean(entry.estadoOperativo || entry.estado || entry.estadoCritico),
                detalle: clean(entry.detalleOperativo || entry.detalle || entry.detalleCritico),
                usuario: entry.usuario || 'PLUZ'
            };
            if (!data) {
                data = { latest: normalizedEntry, history: [normalizedEntry] };
                supervisorRecordsMap.set(key, data);
            } else {
                data.latest = normalizedEntry;
                if (!Array.isArray(data.history)) data.history = [];
                data.history.unshift(normalizedEntry);
            }

            if (normalizedEntry.sed) {
                const sKey = String(normalizedEntry.sed).trim().toUpperCase();
                let sedList = supervisorRecordsBySedMap.get(sKey);
                if (!sedList) {
                    sedList = [];
                    supervisorRecordsBySedMap.set(sKey, sedList);
                }
                sedList.unshift(normalizedEntry);
            }

            syncRecordsPluzStatus();

            if (typeof omsStore !== 'undefined') {
                omsStore.setState({ supervisorRecordsMap, supervisorRecordsBySedMap });
            }
        }
        if (typeof window !== 'undefined') {
            window.isCurrentUserAdmin = isCurrentUserAdmin;
            window.cleanSupVal = cleanSupVal;
            window.getSupervisorDataForTicket = getSupervisorDataForTicket;
            window.getSupervisorLogsForSed = getSupervisorLogsForSed;
            window.getTicketPluzStatus = getTicketPluzStatus;
            window.syncRecordsPluzStatus = syncRecordsPluzStatus;
            window.addSupervisorLogOptimistic = addSupervisorLogOptimistic;
            window.supervisorRecordsMap = supervisorRecordsMap;
            window.supervisorRecordsBySedMap = supervisorRecordsBySedMap;
            window.getFaultIconSvg = getFaultIconSvg;
            window.getFaultIconHtml = getFaultIconHtml;
        }

        function debounceUi(callback, wait = 120) {
            if (typeof DomUtils !== 'undefined' && typeof DomUtils.debounceUi === 'function') {
                return DomUtils.debounceUi(callback, wait);
            }
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

        var sedLayersList = (typeof omsStore !== 'undefined' && omsStore.get('sedLayersList')) || [];
        var _registeredSedLayerControls = [];

        function parseSedListInput(rawText) {
            if (Array.isArray(rawText)) {
                rawText = rawText.join(',');
            }
            if (!rawText || typeof rawText !== 'string') return [];
            const tokens = rawText.split(/[\r\n,;\t\s]+/);
            const seen = new Set();
            const result = [];
            const ignoredHeaders = new Set(['SED', 'SEDS', 'CODIGO', 'CODIGO_SED', 'COD_SED', 'SUBESTACION', 'N/A', 'NA', '-', '--', 'NULL', 'UNDEFINED']);
            tokens.forEach(token => {
                const cleaned = normalizeSedCode(token.replace(/["']/g, ''));
                if (!cleaned || ignoredHeaders.has(cleaned)) return;
                if (!seen.has(cleaned)) {
                    seen.add(cleaned);
                    result.push(cleaned);
                }
            });
            return result;
        }

        function buildSedMatchSet(sedsArray) {
            const set = new Set();
            (Array.isArray(sedsArray) ? sedsArray : []).forEach(s => {
                const raw = String(s || '').trim().toUpperCase();
                const norm = normalizeSedCode(s);
                const base = extractBaseSedCode(s);
                if (raw) set.add(raw);
                if (norm) set.add(norm);
                if (base) {
                    set.add(base);
                    const noLeadingZeros = base.replace(/^0+(?=[1-9A-Z])/, '');
                    if (noLeadingZeros) set.add(noLeadingZeros);
                }
            });
            return set;
        }

        function refreshSedLayerControls() {
            _registeredSedLayerControls.forEach(ctrl => {
                if (ctrl && typeof ctrl.refreshOptions === 'function') {
                    ctrl.refreshOptions();
                }
            });
        }

        function setSedLayersList(layers) {
            const rawList = Array.isArray(layers) ? layers : [];
            const normalized = [];
            const seenNames = new Set();
            rawList.forEach(item => {
                if (!item || typeof item !== 'object') return;
                const name = String(item.name || item.nombre || item.Nombre_Capa || '').trim().toUpperCase();
                if (!name) return;
                const seds = parseSedListInput(item.seds || item.SEDs || item.sedsText || '');
                if (seds.length === 0) return;
                const entry = {
                    name,
                    seds,
                    sedSet: buildSedMatchSet(seds),
                    updatedAt: String(item.updatedAt || item.fecha || item.Fecha_Actualizacion || '').trim(),
                    updatedBy: String(item.updatedBy || item.usuario || item.Usuario || 'PLUZ').trim()
                };
                if (seenNames.has(name)) {
                    const idx = normalized.findIndex(l => l.name === name);
                    if (idx !== -1) normalized[idx] = entry;
                } else {
                    seenNames.add(name);
                    normalized.push(entry);
                }
            });

            sedLayersList = normalized;
            if (typeof window !== 'undefined') {
                window.sedLayersList = sedLayersList;
            }
            if (typeof omsStore !== 'undefined' && typeof omsStore.setState === 'function') {
                omsStore.setState({ sedLayersList });
            }
            refreshSedLayerControls();
            return sedLayersList;
        }

        function getSedLayersList() {
            return Array.isArray(sedLayersList) ? sedLayersList : [];
        }

        function sedMatchesSet(sedVal, targetSet) {
            if (!sedVal || sedVal === 'N/A' || !targetSet || targetSet.size === 0) return false;
            const raw = String(sedVal).trim().toUpperCase();
            const norm = normalizeSedCode(sedVal);
            const base = extractBaseSedCode(sedVal);
            const noZeros = base ? base.replace(/^0+(?=[1-9A-Z])/, '') : '';
            return (raw && targetSet.has(raw)) ||
                   (norm && targetSet.has(norm)) ||
                   (base && targetSet.has(base)) ||
                   (noZeros && targetSet.has(noZeros));
        }

        function recordMatchesSedLayers(record, selectedLayerNames) {
            const selected = Array.isArray(selectedLayerNames) ? selectedLayerNames.filter(Boolean) : [];
            if (selected.length === 0) return true;
            if (!record || !record.sed || record.sed === 'N/A') return false;
            const layers = getSedLayersList();
            const selectedUpper = new Set(selected.map(n => String(n).trim().toUpperCase()));
            for (let i = 0; i < layers.length; i++) {
                const layer = layers[i];
                if (selectedUpper.has(layer.name)) {
                    const matchSet = layer.sedSet || buildSedMatchSet(layer.seds);
                    if (sedMatchesSet(record.sed, matchSet)) return true;
                }
            }
            return false;
        }

        function initSedLayerMultiSelect(containerId, titlePrefix, onChangeCallback) {
            if (typeof document === 'undefined') return null;
            const container = document.getElementById(containerId);
            if (!container) return null;
            container.innerHTML = "";
            container.className = "custom-multiselect";

            let selectedVals = new Set();

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

            menu.addEventListener("click", (e) => {
                e.stopPropagation();
            });

            function updateBtnLabel() {
                const layers = getSedLayersList();
                if (selectedVals.size === 0) {
                    btn.innerText = layers.length > 0 ? `🗂️ ${titlePrefix}: Todas` : `🗂️ ${titlePrefix}: (Crear)`;
                    btn.style.borderColor = "";
                    btn.style.background = "";
                    btn.style.color = "";
                } else if (selectedVals.size === 1) {
                    const selName = Array.from(selectedVals)[0];
                    const found = layers.find(l => l.name === selName);
                    const countInfo = found ? ` (${found.seds.length})` : '';
                    btn.innerText = `🗂️ ${titlePrefix}: ${selName}${countInfo}`;
                    btn.style.borderColor = "#0284c7";
                    btn.style.background = "#e0f2fe";
                    btn.style.color = "#0369a1";
                } else {
                    btn.innerText = `🗂️ ${titlePrefix}: ${selectedVals.size} activas`;
                    btn.style.borderColor = "#0284c7";
                    btn.style.background = "#e0f2fe";
                    btn.style.color = "#0369a1";
                }
            }

            const manageBtn = document.createElement("button");
            manageBtn.type = "button";
            manageBtn.style.cssText = "width:100%; text-align:left; background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd; border-radius:6px; padding:6px 8px; font-size:11.5px; font-weight:700; cursor:pointer; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between;";
            manageBtn.innerHTML = `<span>⚙️ Gestionar Capas SED...</span><span style="font-size:10px; background:#0284c7; color:#fff; padding:1px 5px; border-radius:4px;">+ Nueva</span>`;
            manageBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                menu.classList.remove("show");
                btn.setAttribute("aria-expanded", "false");
                if (typeof window !== 'undefined' && typeof window.openSedLayersModal === 'function') {
                    window.openSedLayersModal();
                }
            });
            menu.appendChild(manageBtn);

            const clearBtn = document.createElement("button");
            clearBtn.type = "button";
            clearBtn.style.cssText = "width:100%; text-align:left; background:#fff1f2; color:#be123c; border:1px solid #fecdd3; border-radius:6px; padding:4px 8px; font-size:11px; font-weight:700; cursor:pointer; margin-bottom:6px; display:none;";
            clearBtn.innerText = "✕ Quitar filtro de capa (Ver todas)";
            clearBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                selectedVals.clear();
                renderOptions();
                if (typeof onChangeCallback === 'function') onChangeCallback([]);
            });
            menu.appendChild(clearBtn);

            const divider = document.createElement("div");
            divider.className = "multiselect-divider";
            menu.appendChild(divider);

            const optionList = document.createElement("div");
            menu.appendChild(optionList);

            function renderOptions() {
                optionList.innerHTML = "";
                const layers = getSedLayersList();
                const validNames = new Set(layers.map(l => l.name));
                selectedVals = new Set([...selectedVals].filter(v => validNames.has(v)));
                clearBtn.style.display = selectedVals.size > 0 ? "block" : "none";

                if (layers.length === 0) {
                    const emptyMsg = document.createElement("div");
                    emptyMsg.style.cssText = "padding:8px 6px; font-size:11px; color:#64748b; text-align:center;";
                    emptyMsg.innerText = "No hay capas creadas. Haz clic en 'Gestionar Capas SED' para crear una (ej. DAN).";
                    optionList.appendChild(emptyMsg);
                    updateBtnLabel();
                    return;
                }

                layers.forEach(layer => {
                    const item = document.createElement("label");
                    item.className = "multiselect-item";
                    item.style.display = "flex";
                    item.style.justifyContent = "space-between";
                    item.style.alignItems = "center";
                    item.style.gap = "6px";

                    const leftSpan = document.createElement("span");
                    leftSpan.style.display = "inline-flex";
                    leftSpan.style.alignItems = "center";
                    leftSpan.style.gap = "6px";

                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.value = layer.name;
                    cb.checked = selectedVals.has(layer.name);
                    cb.addEventListener("change", () => {
                        if (cb.checked) selectedVals.add(layer.name);
                        else selectedVals.delete(layer.name);
                        clearBtn.style.display = selectedVals.size > 0 ? "block" : "none";
                        updateBtnLabel();
                        if (typeof onChangeCallback === 'function') {
                            onChangeCallback(Array.from(selectedVals));
                        }
                    });

                    const nameNode = document.createElement("span");
                    nameNode.style.fontWeight = "700";
                    nameNode.innerText = layer.name;

                    leftSpan.appendChild(cb);
                    leftSpan.appendChild(nameNode);

                    const badge = document.createElement("span");
                    badge.style.cssText = "font-size:10px; background:#e2e8f0; color:#334155; padding:1px 6px; border-radius:999px; font-weight:700;";
                    badge.innerText = `${layer.seds.length} SEDs`;

                    item.appendChild(leftSpan);
                    item.appendChild(badge);
                    optionList.appendChild(item);
                });

                updateBtnLabel();
            }

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

            const ctrl = {
                getSelected: () => Array.from(selectedVals),
                isAllSelected: () => selectedVals.size === 0,
                reset: () => {
                    selectedVals.clear();
                    renderOptions();
                },
                setSelected: (newSelectedVals, triggerChange = true) => {
                    const list = Array.isArray(newSelectedVals) ? newSelectedVals : (newSelectedVals ? [newSelectedVals] : []);
                    const validNames = new Set(getSedLayersList().map(l => l.name));
                    selectedVals = new Set(list.map(v => String(v).trim().toUpperCase()).filter(v => validNames.has(v)));
                    renderOptions();
                    if (triggerChange && typeof onChangeCallback === 'function') {
                        onChangeCallback(Array.from(selectedVals));
                    }
                },
                refreshOptions: () => {
                    renderOptions();
                }
            };

            _registeredSedLayerControls = _registeredSedLayerControls.filter(c => c._containerId !== containerId);
            ctrl._containerId = containerId;
            _registeredSedLayerControls.push(ctrl);

            return ctrl;
        }

        if (typeof window !== 'undefined') {
            window.sedLayersList = sedLayersList;
            window.parseSedListInput = parseSedListInput;
            window.buildSedMatchSet = buildSedMatchSet;
            window.setSedLayersList = setSedLayersList;
            window.getSedLayersList = getSedLayersList;
            window.sedMatchesSet = sedMatchesSet;
            window.recordMatchesSedLayers = recordMatchesSedLayers;
            window.initSedLayerMultiSelect = initSedLayerMultiSelect;
            window.refreshSedLayerControls = refreshSedLayerControls;
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

        var topCriticalSedsSet = (typeof omsStore !== 'undefined' && omsStore.get('topCriticalSedsSet')) || new Set();
        var topCriticalSedsList = (typeof omsStore !== 'undefined' && omsStore.get('topCriticalSedsList')) || [];

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
                if (typeof omsStore !== 'undefined') {
                    omsStore.setState({ topCriticalSedsList, topCriticalSedsSet });
                }
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

            if (typeof omsStore !== 'undefined') {
                omsStore.setState({ topCriticalSedsList, topCriticalSedsSet });
            }

            console.log(`🔥 [Top 4 SEDs Críticas]`, topCriticalSedsList.map((s, idx) => `#${idx+1}: ${s.sed} (Score: ${s.score}, Activos: ${s.activeCount}, 7D: ${s.fallas7d}, 30D: ${s.fallas30d})`));
        }

        function getProp(obj, ...keys) {
            if (typeof DomUtils !== 'undefined' && typeof DomUtils.getProp === 'function') {
                return DomUtils.getProp(obj, ...keys);
            }
            if (!obj) return 'N/A';
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                if (key !== undefined && key !== null) {
                    const val = obj[key];
                    if (val !== undefined && val !== null) {
                        const s = String(val).trim();
                        if (s !== '') return s;
                    }
                }
            }
            const objKeys = Object.keys(obj);
            for (let i = 0; i < keys.length; i++) {
                const target = keys[i];
                if (target === undefined || target === null) continue;
                const normTarget = target.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const foundKey = objKeys.find(k => k.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normTarget);
                if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null) {
                    const s = String(obj[foundKey]).trim();
                    if (s !== '') return s;
                }
            }
            return 'N/A';
        }

        function filterRecordsForAssignedContractor(records, assignedContractor) {
            const safeRecords = Array.isArray(records) ? records : [];
            if (assignedContractor === '*') return safeRecords.slice();
            const targetCompany = String(assignedContractor || '').trim().toUpperCase();
            if (!targetCompany) return [];
            const targetCompanies = targetCompany.split(',').map(s => s.trim()).filter(Boolean);
            return safeRecords.filter(item => {
                const company = getProp(item, 'Contratista', 'Empresa', 'CONTRATISTA', 'empresa', 'Pto.tbjo.responsable').toUpperCase();
                return company !== 'N/A' && targetCompanies.some(target => company.includes(target) || target.includes(company));
            });
        }

        function matchesMultiSelection(value, selectedValues) {
            if (typeof DomUtils !== 'undefined' && typeof DomUtils.matchesMultiSelection === 'function') {
                return DomUtils.matchesMultiSelection(value, selectedValues);
            }
            const selected = Array.isArray(selectedValues) ? selectedValues : [];
            return selected.length === 0 || selected.includes(String(value || ''));
        }

        function getFacetedFilterValues(records, field, filterFields, selections, excludedId) {
            if (typeof DomUtils !== 'undefined' && typeof DomUtils.getFacetedFilterValues === 'function') {
                return DomUtils.getFacetedFilterValues(records, field, filterFields, selections, excludedId);
            }
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

        const SLA_CONFIG_HORAS = (typeof DateUtils !== 'undefined' && DateUtils.SLA_CONFIG_HORAS) || {
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
            "ORM": 12,
            "OBRA": 12,
            "FUSIBLE": 4,
            "POSTE": 8,
            "RIESGO": 2,
            "RIESGO DE VIDA": 2,
            "PELIGRO": 2,
            "DEFAULT": 4
        };

        function getEmoji(falla) {
            if (typeof DomUtils !== 'undefined' && typeof DomUtils.getEmoji === 'function') {
                return DomUtils.getEmoji(falla);
            }
            const f = String(falla || '').trim().toUpperCase();
            if (f.includes("RED SUBTERRANEA") || f.includes("RED SUBTERRÁNEA") || f.includes("CNX SUBTERRANEA") || f.includes("CNX SUBTERRÁNEA") || f.includes("SUBTERRANEA") || f.includes("SUBTERRÁNEA") || f.includes("ORM") || f.includes("OBRA")) return "⛏️";
            if (f.includes("RED AEREA") || f.includes("RED AÉREA") || f.includes("CNX AEREA") || f.includes("CNX AÉREA") || f.includes("LÍNEA AÉREA BT") || f.includes("LINEA AEREA BT")) return "⚡";
            if (f.includes("CNX SUBTERRANEA") || f.includes("CNX SUBTERRÁNEA")) return "🕳️";
            if (f.includes("SUMINISTRO")) return "🏠";
            if (f.includes("FUSIBLE")) return "🔌";
            if (f.includes("POSTE")) return "🪵";
            return "📍";
        }

        function getFaultIconSvg(fallaStr) {
            if (typeof DomUtils !== 'undefined' && typeof DomUtils.getFaultIconSvg === 'function') {
                return DomUtils.getFaultIconSvg(fallaStr);
            }
            const f = String(fallaStr || '').trim().toUpperCase();
            if (f.includes("RED SUBTERRANEA") || f.includes("RED SUBTERRÁNEA") || f.includes("CNX SUBTERRANEA") || f.includes("CNX SUBTERRÁNEA") || f.includes("SUBTERRANEA") || f.includes("SUBTERRÁNEA") || f.includes("ORM") || f.includes("OBRA")) {
                return "assets/icons/subterranea.svg?v=20260913-map-legend";
            }
            if (f.includes("RED AEREA") || f.includes("RED AÉREA") || f.includes("CNX AEREA") || f.includes("CNX AÉREA") || f.includes("LÍNEA AÉREA BT") || f.includes("LINEA AEREA BT")) {
                return "assets/icons/red_aerea.svg?v=20260913-map-legend";
            }
            if (f.includes("SUMINISTRO")) {
                return "assets/icons/suministro.svg?v=20260913-map-legend";
            }
            if (f.includes("FUSIBLE")) {
                return "assets/icons/fusible.svg?v=20260913-map-legend";
            }
            if (f.includes("POSTE")) {
                return "assets/icons/poste.svg?v=20260913-map-legend";
            }
            return null;
        }

        function getFaultIconHtml(falla) {
            if (typeof DomUtils !== 'undefined' && typeof DomUtils.getFaultIconHtml === 'function') {
                return DomUtils.getFaultIconHtml(falla);
            }
            const svgUrl = getFaultIconSvg(falla);
            if (svgUrl) {
                let alt = "Falla";
                if (svgUrl.includes("subterranea")) alt = "Subterránea / ORM";
                else if (svgUrl.includes("red_aerea")) alt = "Red Aérea";
                else if (svgUrl.includes("suministro")) alt = "Suministro";
                else if (svgUrl.includes("fusible")) alt = "Fusible";
                else if (svgUrl.includes("poste")) alt = "Poste";
                return `<img src="${svgUrl}" alt="${alt}" class="fault-icon-img">`;
            }
            return `<span class="fault-icon-emoji">${getEmoji(falla)}</span>`;
        }

        function parseDateFlexible(val) {
            if (typeof DateUtils !== 'undefined' && typeof DateUtils.parseDateFlexible === 'function') {
                return DateUtils.parseDateFlexible(val);
            }
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
            if (typeof DateUtils !== 'undefined' && typeof DateUtils.calculateTicketSla === 'function') {
                return DateUtils.calculateTicketSla(record);
            }
            if (!record) return null;
            let maxHours = 0;
            if (record.sla_max_horas !== undefined && record.sla_max_horas !== null && !isNaN(Number(record.sla_max_horas))) {
                maxHours = Number(record.sla_max_horas);
            } else {
                const falla = String(record.falla || '').toUpperCase();
                const prioridad = String(record.prioridad || '').toUpperCase();

                if (prioridad.includes("RIESGO") || prioridad.includes("VIDA") || prioridad.includes("PELIGRO")) {
                    maxHours = SLA_CONFIG_HORAS["RIESGO DE VIDA"];
                } else if (falla.includes("RED SUBTERRANEA") || falla.includes("RED SUBTERRÁNEA") || falla.includes("ORM") || falla.includes("OBRA")) {
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

            let status = 'ok';
            let statusClass = 'sla-ok';
            let label = 'Dentro de plazo';
            let badgeColor = '#16a34a';

            if (elapsed >= maxHours) {
                status = 'overdue';
                statusClass = 'sla-overdue';
                const overMins = Math.round((elapsed - maxHours) * 60);
                const overHoursText = overMins >= 60 ? `${Math.floor(overMins / 60)}h ${overMins % 60}m` : `${overMins}m`;
                label = `Fuera de plazo (+${overHoursText})`;
                badgeColor = '#dc2626';
            } else if (elapsed >= warnHours) {
                status = 'warning';
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
            if (typeof DateUtils !== 'undefined' && typeof DateUtils.sortIntervals === 'function') {
                return DateUtils.sortIntervals(a, b);
            }
            const parseNum = (str) => {
                const match = String(str).match(/\d+/);
                return match ? parseInt(match[0], 10) : 999;
            };
            const numA = parseNum(a);
            const numB = parseNum(b);
            if (numA !== numB) return numA - numB;
            return String(a).localeCompare(String(b), 'es');
        }

        
        // Función para ordenar días cronológicamente (soporta '30-oct', '01-nov', 'DD/MM', ISO)
        const SPANISH_MONTHS_MAP = (typeof DateUtils !== 'undefined' && DateUtils.SPANISH_MONTHS_MAP) || {
            ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
            jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11
        };

        function parseDiaValue(diaStr) {
            if (typeof DateUtils !== 'undefined' && typeof DateUtils.parseDiaValue === 'function') {
                return DateUtils.parseDiaValue(diaStr);
            }
            if (!diaStr) return null;
            const str = String(diaStr).trim().toLowerCase();

            // Formato DD-mmm o DD/mmm (ej: 01-nov, 30-oct, 1-nov)
            const matchTxt = str.match(/^(\d{1,2})[-\/\s]([a-záéíóúñ]{3,})(?:[-\/\s](\d{2,4}))?$/i);
            if (matchTxt) {
                const day = parseInt(matchTxt[1], 10);
                const monthRaw = matchTxt[2].substring(0, 3).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const month = SPANISH_MONTHS_MAP[monthRaw];
                if (month !== undefined) {
                    const year = matchTxt[3] ? parseInt(matchTxt[3].length === 2 ? ('20' + matchTxt[3]) : matchTxt[3], 10) : 2000;
                    return year * 10000 + (month + 1) * 100 + day;
                }
            }

            // Formato DD/MM/AAAA o DD-MM-AAAA o DD/MM
            const matchNum = str.match(/^(\d{1,2})[-\/](\d{1,2})(?:[-\/](\d{2,4}))?$/);
            if (matchNum) {
                const day = parseInt(matchNum[1], 10);
                const month = parseInt(matchNum[2], 10);
                const year = matchNum[3] ? parseInt(matchNum[3].length === 2 ? ('20' + matchNum[3]) : matchNum[3], 10) : 2000;
                return year * 10000 + month * 100 + day;
            }

            // Formato ISO AAAA-MM-DD
            const matchIso = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
            if (matchIso) {
                return parseInt(matchIso[1], 10) * 10000 + parseInt(matchIso[2], 10) * 100 + parseInt(matchIso[3], 10);
            }

            return null;
        }

        function sortDias(a, b, recordsRef) {
            if (typeof DateUtils !== 'undefined' && typeof DateUtils.sortDias === 'function') {
                return DateUtils.sortDias(a, b, recordsRef);
            }
            if (Array.isArray(recordsRef) && recordsRef.length > 0) {
                if (!recordsRef._diaTimestampMap) {
                    const map = new Map();
                    for (const r of recordsRef) {
                        if (r && r.dia && !map.has(r.dia)) {
                            const ts = (typeof parseTdOmsDate === 'function')
                                ? parseTdOmsDate(r.hora_inicio || r.fecha_inicio)
                                : null;
                            if (ts !== null) map.set(r.dia, ts);
                        }
                    }
                    recordsRef._diaTimestampMap = map;
                }
                const tsA = recordsRef._diaTimestampMap.get(a);
                const tsB = recordsRef._diaTimestampMap.get(b);
                if (tsA !== undefined && tsB !== undefined && tsA !== tsB) {
                    return tsA - tsB;
                }
            }

            const scoreA = parseDiaValue(a);
            const scoreB = parseDiaValue(b);
            if (scoreA !== null && scoreB !== null && scoreA !== scoreB) {
                return scoreA - scoreB;
            }
            if (scoreA !== null) return -1;
            if (scoreB !== null) return 1;

            return String(a).localeCompare(String(b), 'es');
        }

        // === COMPONENTE MULTI-SELECT CHECKBOX ===
        function initMultiSelect(containerId, titlePrefix, valuesList, onChangeCallback, labelFormatter = value => value) {
            if (typeof DomUtils !== 'undefined' && typeof DomUtils.initMultiSelect === 'function') {
                return DomUtils.initMultiSelect(containerId, titlePrefix, valuesList, onChangeCallback, labelFormatter);
            }
            const container = document.getElementById(containerId);
            if (!container) return null;
            container.innerHTML = "";
            container.className = "custom-multiselect";

            const isDiaFilter = titlePrefix === "Día" || titlePrefix === "Dia";
            const sortFn = (titlePrefix === "Intervalo") ? sortIntervals 
                         : (isDiaFilter ? sortDias 
                         : (a, b) => String(a).localeCompare(String(b), 'es'));
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

        if (typeof document !== 'undefined') {
            document.addEventListener("click", () => {
                document.querySelectorAll(".multiselect-dropdown-menu.show").forEach(m => {
                    m.classList.remove("show");
                    document.querySelector(`[aria-controls="${m.id}"]`)?.setAttribute("aria-expanded", "false");
                });
            });
        }

        // Notificaciones Flotantes y Navegación Inteligente al Mapa
        function showAppNotification(message, type = 'info', duration = 4000) {
            if (typeof DomUtils !== 'undefined' && typeof DomUtils.showAppNotification === 'function') {
                return DomUtils.showAppNotification(message, type, duration);
            }
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

            // 3. Colocar el ticket en el buscador y fijar modo ticket
            const inputTicket = document.getElementById("inputTicket");
            if (inputTicket) inputTicket.value = match.ticket || ticketOrOdm;
            const searchTypeMap = document.getElementById("searchTypeMap");
            if (searchTypeMap) searchTypeMap.value = "ticket";

            // 4. Enfocar el ticket directamente (sin ocultar los demás marcadores)
            if (typeof focusTicketInMap === 'function') {
                focusTicketInMap(match.ticket || ticketOrOdm, false);
            } else if (leafletMap) {
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
