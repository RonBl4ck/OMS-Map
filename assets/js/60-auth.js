// ==========================================
// OMS Map - Auth, Caching & Data Loader
// ==========================================

const OMS_CACHE_TTL_MS = 5 * 60 * 1000;

// Utilidades de Caché con TTL en sessionStorage
function getSessionCache(key, ttlMs = OMS_CACHE_TTL_MS) {
    try {
        const storage = (typeof sessionStorage !== 'undefined') ? sessionStorage : (typeof window !== 'undefined' ? window.sessionStorage : null);
        if (!storage) return null;
        const raw = storage.getItem(key);
        if (!raw) return null;
        const item = JSON.parse(raw);
        if (!item || typeof item !== 'object' || typeof item.timestamp !== 'number') {
            return null;
        }
        if (typeof ttlMs === 'number' && ttlMs > 0) {
            if (Date.now() - item.timestamp > ttlMs) {
                storage.removeItem(key);
                return null;
            }
        }
        return item.data !== undefined ? item.data : null;
    } catch (e) {
        console.warn(`[Cache] Error al leer clave '${key}' de sessionStorage:`, e);
        return null;
    }
}

function setSessionCache(key, data) {
    try {
        const storage = (typeof sessionStorage !== 'undefined') ? sessionStorage : (typeof window !== 'undefined' ? window.sessionStorage : null);
        if (!storage) return;
        const payload = JSON.stringify({
            timestamp: Date.now(),
            data: data
        });
        storage.setItem(key, payload);
    } catch (e) {
        console.warn(`[Cache] Error o StorageQuota al guardar clave '${key}' en sessionStorage:`, e);
        try {
            const storage = (typeof sessionStorage !== 'undefined') ? sessionStorage : (typeof window !== 'undefined' ? window.sessionStorage : null);
            if (storage) {
                storage.removeItem(key);
            }
        } catch (_) {}
    }
}

// Fetch con AbortController nativo y timeout configurable
async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    try {
        const fetchFn = (typeof fetch === 'function') ? fetch : (typeof window !== 'undefined' ? window.fetch : globalThis.fetch);
        if (typeof fetchFn !== 'function') {
            throw new Error('fetch no está disponible en este entorno');
        }
        const { ...fetchOptions } = options;
        const response = await fetchFn(url, {
            ...fetchOptions,
            signal: controller.signal
        });
        return response;
    } catch (err) {
        if (timedOut || err.name === 'AbortError') {
            const timeoutError = new Error(`Timeout de red (${timeoutMs}ms) al consultar: ${url}`);
            timeoutError.name = 'TimeoutError';
            throw timeoutError;
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

// Global Ticket Index Map O(1)
if (typeof window !== 'undefined') {
    window.omsRecordsByTicketMap = window.omsRecordsByTicketMap || new Map();
} else if (typeof globalThis !== 'undefined') {
    globalThis.omsRecordsByTicketMap = globalThis.omsRecordsByTicketMap || new Map();
}

function rebuildOmsTicketIndex() {
    let targetMap = null;
    if (typeof window !== 'undefined') {
        if (!window.omsRecordsByTicketMap) {
            window.omsRecordsByTicketMap = new Map();
        }
        targetMap = window.omsRecordsByTicketMap;
    } else if (typeof globalThis !== 'undefined') {
        if (!globalThis.omsRecordsByTicketMap) {
            globalThis.omsRecordsByTicketMap = new Map();
        }
        targetMap = globalThis.omsRecordsByTicketMap;
    } else {
        targetMap = new Map();
    }

    targetMap.clear();

    const getPropVal = (obj, ...keys) => {
        if (!obj || typeof obj !== 'object') return null;
        for (const k of keys) {
            if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') {
                return obj[k];
            }
        }
        return null;
    };

    const getNormalizeFn = () => {
        if (typeof normalizeTicketId === 'function') return normalizeTicketId;
        if (typeof window !== 'undefined' && typeof window.normalizeTicketId === 'function') return window.normalizeTicketId;
        if (typeof globalThis !== 'undefined' && typeof globalThis.normalizeTicketId === 'function') return globalThis.normalizeTicketId;
        return null;
    };

    const normFn = getNormalizeFn();

    const indexKey = (val, rec) => {
        if (val === undefined || val === null) return;
        const rawStr = String(val).trim();
        if (!rawStr) return;

        if (!targetMap.has(rawStr)) {
            targetMap.set(rawStr, rec);
        }

        const lowerStr = rawStr.toLowerCase();
        if (!targetMap.has(lowerStr)) {
            targetMap.set(lowerStr, rec);
        }

        if (normFn) {
            try {
                const norm = normFn(rawStr);
                if (norm && !targetMap.has(norm)) {
                    targetMap.set(norm, rec);
                }
            } catch (_) {}
        }
    };

    const resolveList = (name) => {
        if (typeof window !== 'undefined' && Array.isArray(window[name])) return window[name];
        if (typeof globalThis !== 'undefined' && Array.isArray(globalThis[name])) return globalThis[name];
        try {
            if (name === 'tdOmsRecords' && typeof tdOmsRecords !== 'undefined' && Array.isArray(tdOmsRecords)) return tdOmsRecords;
            if (name === 'ejecutadosRecords' && typeof ejecutadosRecords !== 'undefined' && Array.isArray(ejecutadosRecords)) return ejecutadosRecords;
            if (name === 'llamadasRecords' && typeof llamadasRecords !== 'undefined' && Array.isArray(llamadasRecords)) return llamadasRecords;
        } catch (_) {}
        return [];
    };

    const sources = [
        resolveList('tdOmsRecords'),
        resolveList('ejecutadosRecords'),
        resolveList('llamadasRecords')
    ];

    sources.forEach(sourceList => {
        if (!Array.isArray(sourceList)) return;
        sourceList.forEach(rec => {
            if (!rec || typeof rec !== 'object') return;
            const ticketVal = getPropVal(rec, 'ticket', 'Ticket', 'TICKET', 'nro_ticket', 'Nro_Ticket');
            const casoVal = getPropVal(rec, 'caso', 'Caso', 'CASO');
            const nroCasoVal = getPropVal(rec, 'nro_caso', 'Nro_Caso', 'nroCaso', 'NroCaso', 'NRO_CASO');
            const incidenciaVal = getPropVal(rec, 'incidencia', 'Incidencia', 'INCIDENCIA', 'Numero de Incidencia');

            indexKey(ticketVal, rec);
            indexKey(casoVal, rec);
            indexKey(nroCasoVal, rec);
            indexKey(incidenciaVal, rec);
        });
    });

    return targetMap;
}

if (typeof window !== 'undefined') {
    window.OMS_CACHE_TTL_MS = OMS_CACHE_TTL_MS;
    window.getSessionCache = getSessionCache;
    window.setSessionCache = setSessionCache;
    window.fetchWithTimeout = fetchWithTimeout;
    window.rebuildOmsTicketIndex = rebuildOmsTicketIndex;
}

function updateUserBadge() {
    const userId = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem("oms_user_id") : null) || "Invitado";
    const contractor = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem("oms_assigned_contractor") : null) || "*";
    const isAdmin = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('oms_user_role') : null) === 'admin';
    const tabLlamadas = document.getElementById('tabLlamadas');
    if (tabLlamadas) tabLlamadas.style.display = isAdmin ? '' : 'none';
    const tabHistorialPluz = document.getElementById('tabHistorialPluz');
    if (tabHistorialPluz) tabHistorialPluz.style.display = isAdmin ? '' : 'none';
    const tabSeguimientoDia = document.getElementById('tabSeguimientoDia');
    if (tabSeguimientoDia) tabSeguimientoDia.style.display = isAdmin ? '' : 'none';
    const btnOpenHistorialPluzFromTdOms = document.getElementById('btnOpenHistorialPluzFromTdOms');
    if (btnOpenHistorialPluzFromTdOms) btnOpenHistorialPluzFromTdOms.style.display = isAdmin ? 'inline-flex' : 'none';
    const btnOpenBulkPluzEnEjecucion = document.getElementById('btnOpenBulkPluzEnEjecucion');
    if (btnOpenBulkPluzEnEjecucion) btnOpenBulkPluzEnEjecucion.style.display = isAdmin ? 'inline-flex' : 'none';
    const btnSubnavOpenBulkPluz = document.getElementById('btnSubnavOpenBulkPluz');
    if (btnSubnavOpenBulkPluz) btnSubnavOpenBulkPluz.style.display = isAdmin ? 'inline-flex' : 'none';
    const lblCriticaMap = document.getElementById("lblCriticaMap");
    if (lblCriticaMap) lblCriticaMap.style.display = isAdmin ? 'inline-flex' : 'none';
    const lblCriticaModal = document.getElementById("lblCriticaModal");
    if (lblCriticaModal) lblCriticaModal.style.display = isAdmin ? 'inline-flex' : 'none';
    const lblFilterQC = document.getElementById("lblFilterQuanticoCritico");
    if (lblFilterQC) lblFilterQC.style.display = isAdmin ? 'inline-flex' : 'none';
    const reportBtns = document.getElementById("contractorReportBtnsContainer");
    if (reportBtns) reportBtns.style.display = isAdmin ? 'inline-flex' : 'none';
    const navUserName = document.getElementById("navUserName");
    if (navUserName) {
        const contractorLabel = contractor === "*" ? "Admin" : contractor.split(',').join(' + ');
        navUserName.innerText = `👤 ${userId} (${contractorLabel})`;
    }

    const btnOpenConfig = document.getElementById("btnOpenConfig");
    if (btnOpenConfig) {
        btnOpenConfig.style.display = isAdmin ? 'inline-flex' : 'none';
        btnOpenConfig.onclick = () => {
            const pinModal = document.getElementById("configPinModalOverlay");
            const pinInput = document.getElementById("configPinInput");
            const pinErrMsg = document.getElementById("configPinErrMsg");
            if (pinErrMsg) pinErrMsg.style.display = "none";
            if (pinInput) pinInput.value = "";
            if (pinModal) pinModal.style.display = "flex";
            if (pinInput) pinInput.focus();
        };
    }

    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) {
        btnLogout.onclick = () => {
            sessionStorage.clear();
            location.reload();
        };
    }
}

// Carga de Datos optimizada con Caché TTL y Descarga en Paralelo
async function loadData() {
    if (typeof setAppDataLoadState === 'function') setAppDataLoadState('loading');
    const userRole = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('oms_user_role') : null) || 'contractor';
    const isAdmin = userRole === 'admin';
    try {
        // 1. Revisar si config-data está en caché (TTL 15 min), evitando invocar Serverless si es reciente
        let cfg = getSessionCache('oms_config_data_' + userRole, 15 * 60 * 1000);
        if (!cfg) {
            try {
                const token = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('oms_auth_token') : null) || '';
                const cfgResp = await fetchWithTimeout(`/api/config-data?role=${encodeURIComponent(userRole)}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }, 12000);
                if (cfgResp && cfgResp.ok) {
                    cfg = await cfgResp.json();
                    setSessionCache('oms_config_data_' + userRole, cfg);
                }
            } catch(e) {
                console.warn("No se pudo cargar config remota vía /api/config-data:", e);
            }
        }

        if (!cfg) {
            try {
                const localResp = await fetchWithTimeout('config.json', {}, 12000);
                if (localResp && localResp.ok) cfg = await localResp.json();
            } catch(e) {
                console.warn("No se pudo cargar config local:", e);
            }
        }

        if (cfg) {
            if (cfg.sheets_url) GOOGLE_SHEET_CSV_URL = cfg.sheets_url;
            if (cfg.sheets_url_ejecutados) GOOGLE_SHEET_EJECUTADOS_URL = cfg.sheets_url_ejecutados;
            GOOGLE_SHEET_LLAMADAS_URL = (isAdmin && cfg.sheets_url_llamadas) ? cfg.sheets_url_llamadas : "";
            if (cfg.sheets_url_tecnicos) GOOGLE_SHEET_TECNICOS_URL = cfg.sheets_url_tecnicos;
            GOOGLE_SHEET_SED_CRITICAS_URL = (isAdmin && cfg.sheets_url_sed_criticas) ? cfg.sheets_url_sed_criticas : "";
            GOOGLE_SHEET_SUPERVISOR_URL = (isAdmin && cfg.sheets_url_supervisor) ? cfg.sheets_url_supervisor : "";
            if (cfg.carto_api_key) {
                if (typeof sessionStorage !== 'undefined') sessionStorage.setItem("oms_carto_key", cfg.carto_api_key);
                if (typeof applyBaseLayers === 'function') applyBaseLayers(cfg.carto_api_key);
            }
        }
    } catch (e) {
        console.warn("No se pudo configurar URLs remotas:", e);
    }

    try {
        // 2. Descarga en paralelo de SEDS_CRITICAS y SEGUIMIENTO_SUPERVISOR con Promise.allSettled
        const sedsCriticasPromise = (async () => {
            if (isAdmin && GOOGLE_SHEET_SED_CRITICAS_URL) {
                let csvText = getSessionCache('oms_seds_criticas_csv', OMS_CACHE_TTL_MS);
                if (!csvText) {
                    let critUrl = GOOGLE_SHEET_SED_CRITICAS_URL;
                    if (critUrl.includes('docs.google.com/spreadsheets') && !critUrl.includes('gviz/tq') && !critUrl.includes('/pub')) {
                        const match = critUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
                        if (match) {
                            critUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&sheet=SEDS_CRITICAS`;
                        }
                    }
                    if (critUrl.includes('docs.google.com')) {
                        critUrl += (critUrl.includes('?') ? '&' : '?') + '_nocache=' + Date.now();
                    }

                    try {
                        const resp = await fetchWithTimeout(critUrl, {}, 12000);
                        if (resp && resp.ok) {
                            csvText = await resp.text();
                            setSessionCache('oms_seds_criticas_csv', csvText);
                        }
                    } catch (e) {
                        console.warn("⚠️ fetchWithTimeout falló para SEDS_CRITICAS:", e);
                    }
                }

                if (csvText) {
                    await new Promise((resolve) => {
                        Papa.parse(csvText, {
                            header: true,
                            skipEmptyLines: true,
                            complete: function(results) {
                                if (typeof sedCriticasSet !== 'undefined' && sedCriticasSet.clear) sedCriticasSet.clear();
                                if (typeof sedCriticasMap !== 'undefined' && sedCriticasMap.clear) sedCriticasMap.clear();
                                (results.data || []).forEach(row => {
                                    const sedVal = typeof getProp === 'function'
                                        ? getProp(row, 'SED', 'sed', 'Sed', 'CODIGO_SED', 'Codigo_SED', 'COD_SED')
                                        : (row.SED || row.sed || row.COD_SED);
                                    const norm = typeof normalizeSedCode === 'function' ? normalizeSedCode(sedVal) : String(sedVal || '').trim().toUpperCase();
                                    const isTop4 = String(typeof getProp === 'function'
                                        ? getProp(row, 'ES_TOP_4_CRITICA', 'es_top_4_critica')
                                        : row.ES_TOP_4_CRITICA).trim().toUpperCase() === 'TRUE';
                                    if (norm) {
                                        if (typeof sedCriticasMap !== 'undefined') sedCriticasMap.set(norm, row);
                                        if (isTop4 && typeof sedCriticasSet !== 'undefined') {
                                            sedCriticasSet.add(norm);
                                        }
                                    }
                                });
                                console.log(`🚨 [SEDs Críticas Top 4] ${typeof sedCriticasSet !== 'undefined' ? sedCriticasSet.size : 0} SEDs Top 4 Críticas cargadas.`);
                                resolve();
                            },
                            error: function(err) {
                                console.warn("⚠️ No se pudo procesar SED_CRITICAS:", err);
                                resolve();
                            }
                        });
                    });
                }
            } else {
                if (typeof sedCriticasSet !== 'undefined' && sedCriticasSet.clear) sedCriticasSet.clear();
                if (typeof sedCriticasMap !== 'undefined' && sedCriticasMap.clear) sedCriticasMap.clear();
            }
        })();

        const supervisorPromise = (async () => {
            if (isAdmin && GOOGLE_SHEET_SUPERVISOR_URL) {
                let supUrl = GOOGLE_SHEET_SUPERVISOR_URL;
                if (supUrl.includes('docs.google.com/spreadsheets') && !supUrl.includes('gviz/tq') && !supUrl.includes('/pub')) {
                    const match = supUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
                    if (match) {
                        supUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&sheet=SEGUIMIENTO_SUPERVISOR`;
                    }
                }
                if (supUrl.includes('docs.google.com')) {
                    supUrl += (supUrl.includes('?') ? '&' : '?') + '_nocache=' + Date.now();
                }

                let supCsv = null;
                try {
                    const resp = await fetchWithTimeout(supUrl, {}, 12000);
                    if (resp && resp.ok) {
                        supCsv = await resp.text();
                    }
                } catch (e) {
                    console.warn("⚠️ fetchWithTimeout falló para SEGUIMIENTO_SUPERVISOR:", e);
                }

                if (supCsv) {
                    await new Promise((resolve) => {
                        Papa.parse(supCsv, {
                            header: true,
                            skipEmptyLines: true,
                            complete: function(results) {
                                if (typeof supervisorRecordsMap !== 'undefined' && supervisorRecordsMap.clear) {
                                    supervisorRecordsMap.clear();
                                }
                                if (typeof supervisorRecordsBySedMap !== 'undefined' && supervisorRecordsBySedMap.clear) {
                                    supervisorRecordsBySedMap.clear();
                                }
                                const rows = results.data || [];
                                rows.forEach(r => {
                                    const ticketVal = typeof getProp === 'function' ? getProp(r, 'Ticket', 'ticket', 'TICKET', 'nro_ticket') : (r.Ticket || r.ticket);
                                    const tKey = String(ticketVal || '').trim().toLowerCase();
                                    if (!tKey) return;

                                    const cleanProp = (...keys) => {
                                        const raw = typeof getProp === 'function' ? getProp(r, ...keys) : r[keys[0]];
                                        if (!raw) return '';
                                        const s = String(raw).trim();
                                        return (/^n\/?a$/i.test(s) || s === '--' || s === 'null' || s === 'undefined') ? '' : s;
                                    };

                                    const sedVal = cleanProp('SED', 'sed', 'Sed', 'Subestacion', 'subestacion');
                                    const horaIniVal = cleanProp('Hora_Inicio', 'hora_inicio', 'Hora Inicio', 'Fecha_Inicio', 'fecha_inicio', 'HoraInicio');
                                    const alimentadorVal = cleanProp('Alimentador', 'alimentador', 'ALIMENTADOR');
                                    const empresaVal = cleanProp('Empresa', 'empresa', 'Contratista', 'contratista');

                                    const estadoOperativo = cleanProp('Estado_Operativo', 'estado_operativo', 'Estado_Supervisor', 'estado_supervisor', 'Estado', 'estado');
                                    const detalleOperativo = cleanProp('Detalle_Operativo', 'detalle_operativo', 'Detalle', 'detalle', 'Observaciones', 'observaciones', 'novedad');
                                    const jefeCuadrilla = cleanProp('Jefe_Cuadrilla', 'jefe_cuadrilla', 'JC', 'jc', 'JefeCuadrilla');
                                    const finEstimado = cleanProp('Fin_Estimado ', 'fin_estimado ', 'Fin_Estimado', 'fin_estimado', 'FinEstimado', 'Hora_Fin_Estimada', 'hora_fin_estimada', 'Fecha_Fin_Estimada', 'fecha_fin_estimada', 'Hora_Limite', 'hora_limite', 'Hora Fin', 'hora_fin');
                                    const estadoCritico = cleanProp('Estado_Critico', 'estado_critico', 'Criticidad', 'criticidad');
                                    const detalleCritico = cleanProp('Detalle_Critico', 'detalle_critico');

                                    let resolvedOperativo = estadoOperativo;
                                    let resolvedCritico = estadoCritico;
                                    let resolvedDetalleOp = detalleOperativo;
                                    let resolvedDetalleCrit = detalleCritico;

                                    if (!resolvedCritico && (resolvedOperativo.toUpperCase() === 'QUANTICO' || resolvedOperativo.toUpperCase() === 'CRITICO')) {
                                        resolvedCritico = resolvedOperativo.toUpperCase();
                                        resolvedDetalleCrit = resolvedDetalleOp;
                                        resolvedOperativo = '';
                                        resolvedDetalleOp = '';
                                    }

                                    const entry = {
                                        fecha: cleanProp('Fecha_Hora', 'fecha_hora', 'Fecha', 'fecha', 'Timestamp', 'timestamp'),
                                        ticket: String(ticketVal).trim(),
                                        sed: sedVal,
                                        horaInicio: horaIniVal,
                                        alimentador: alimentadorVal,
                                        empresa: empresaVal,
                                        estadoOperativo: resolvedOperativo,
                                        detalleOperativo: resolvedDetalleOp,
                                        jefeCuadrilla: jefeCuadrilla,
                                        finEstimado: finEstimado,
                                        estadoCritico: resolvedCritico,
                                        detalleCritico: resolvedDetalleCrit,
                                        estado: resolvedOperativo || resolvedCritico,
                                        detalle: resolvedDetalleOp || resolvedDetalleCrit,
                                        usuario: cleanProp('Usuario', 'usuario', 'perfil') || 'PLUZ'
                                    };

                                    if (typeof supervisorRecordsMap !== 'undefined') {
                                        let record = supervisorRecordsMap.get(tKey);
                                        if (!record) {
                                            record = { latest: entry, history: [entry] };
                                            supervisorRecordsMap.set(tKey, record);
                                        } else {
                                            record.latest = entry;
                                            record.history.unshift(entry);
                                        }
                                    }

                                    if (entry.sed && typeof supervisorRecordsBySedMap !== 'undefined') {
                                        const sKey = entry.sed.toUpperCase();
                                        let sList = supervisorRecordsBySedMap.get(sKey);
                                        if (!sList) {
                                            sList = [];
                                            supervisorRecordsBySedMap.set(sKey, sList);
                                        }
                                        sList.push(entry);
                                    }
                                });
                                console.log(`🛡️ [Supervisión PLUZ] ${typeof supervisorRecordsMap !== 'undefined' ? supervisorRecordsMap.size : 0} tickets con novedades cargados.`);
                                resolve();
                            },
                            error: function(err) {
                                console.warn("⚠️ No se pudo cargar SEGUIMIENTO_SUPERVISOR:", err);
                                resolve();
                            }
                        });
                    });
                }
            } else {
                if (typeof supervisorRecordsMap !== 'undefined' && supervisorRecordsMap.clear) {
                    supervisorRecordsMap.clear();
                }
                if (typeof supervisorRecordsBySedMap !== 'undefined' && supervisorRecordsBySedMap.clear) {
                    supervisorRecordsBySedMap.clear();
                }
            }
        })();

        await Promise.allSettled([sedsCriticasPromise, supervisorPromise]);

        // 3. Carga de Ejecutados (para alimentar el historial de 7 días y análisis, segmentado por contratista)
        if (GOOGLE_SHEET_EJECUTADOS_URL) {
            let execUrl = GOOGLE_SHEET_EJECUTADOS_URL;
            if (execUrl.includes('docs.google.com')) {
                execUrl += (execUrl.includes('?') ? '&' : '?') + '_nocache=' + Date.now();
            }
            Papa.parse(execUrl, {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    const assignedContractor = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem("oms_assigned_contractor") : null) || "*";
                    const filtered = typeof filterRecordsForAssignedContractor === 'function'
                        ? filterRecordsForAssignedContractor(results.data || [], assignedContractor)
                        : (results.data || []);
                    if (typeof window !== 'undefined') {
                        window.ejecutadosRecords = filtered;
                    } else if (typeof globalThis !== 'undefined') {
                        globalThis.ejecutadosRecords = filtered;
                    }
                    console.log(`📋 [Ejecutados 7D] ${filtered.length} registros cargados.`);
                    if (typeof omsStore !== 'undefined' && typeof omsStore.setState === 'function') {
                        omsStore.setState({ ejecutadosRecords: filtered });
                    }
                    if (typeof window !== 'undefined' && typeof window.renderSeguimientoDia === 'function') {
                        if (typeof document !== 'undefined' && document.body && document.body.dataset.primaryView === 'productivity') {
                            window.renderSeguimientoDia();
                        }
                    }
                    if (typeof window !== 'undefined' && typeof window.rebuildOmsTicketIndex === 'function') {
                        window.rebuildOmsTicketIndex();
                    } else if (typeof rebuildOmsTicketIndex === 'function') {
                        rebuildOmsTicketIndex();
                    }
                },
                error: function(err) {
                    console.warn("⚠️ No se pudo cargar BASE_EJECUTADOS en segundo plano:", err);
                }
            });
        }

        // 4. Carga de Pendientes (BASE_PENDIENTES)
        let csvUrl = GOOGLE_SHEET_CSV_URL;
        if (csvUrl && csvUrl.includes('docs.google.com/spreadsheets') && !csvUrl.includes('gviz/tq') && !csvUrl.includes('/pub')) {
            const match = csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (match) {
                csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&sheet=BASE_PENDIENTES`;
            }
        }

        let finalFetchUrl = csvUrl;
        if (finalFetchUrl && finalFetchUrl.includes('docs.google.com')) {
            finalFetchUrl += (finalFetchUrl.includes('?') ? '&' : '?') + '_nocache=' + Date.now();
        }

        if (!finalFetchUrl) throw new Error('Fuente de casos no configurada');

        await new Promise((resolve, reject) => {
            Papa.parse(finalFetchUrl, {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    try {
                        if (typeof processRawData === 'function') {
                            processRawData(results.data || []);
                        }
                        if (typeof enrichSupervisorRecordsWithOmsData === 'function') {
                            enrichSupervisorRecordsWithOmsData();
                        }
                        // Reconstrucción del índice O(1) de tickets OMS
                        if (typeof window !== 'undefined' && typeof window.rebuildOmsTicketIndex === 'function') {
                            window.rebuildOmsTicketIndex();
                        } else if (typeof rebuildOmsTicketIndex === 'function') {
                            rebuildOmsTicketIndex();
                        }
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                },
                error: reject
            });
        });
        if (typeof setAppDataLoadState === 'function') setAppDataLoadState('ready');

    } catch (err) {
        console.error("Error cargando datos:", err);
        if (typeof setAppDataLoadState === 'function') setAppDataLoadState('error', 'No pudimos cargar los datos.');
    }
}

// Proceso de Login y autenticación
async function handleLogin(selectedUser, passVal) {
    const response = await fetchWithTimeout('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: selectedUser, password: passVal })
    }, 12000);

    const data = await response.json();

    if (response.ok && data.success) {
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem("oms_auth_token", "authenticated");
            sessionStorage.setItem("oms_user_id", data.user);
            sessionStorage.setItem("oms_assigned_contractor", data.contractor);
            sessionStorage.setItem("oms_user_role", data.role);
        }
        if (data.config && data.role) {
            setSessionCache('oms_config_data_' + data.role, data.config);
        }
        if (data.cartoApiKey) {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem("oms_carto_key", data.cartoApiKey);
            }
            if (typeof applyBaseLayers === 'function') {
                applyBaseLayers(data.cartoApiKey);
            }
        }
    }
    return { response, data };
}

function checkAuthentication() {
    const authOverlay = document.getElementById("authModalOverlay");
    const userInput = document.getElementById("authUserInput");
    const passInput = document.getElementById("authPasswordInput");
    const btnLogin = document.getElementById("btnAuthLogin");
    const errMsg = document.getElementById("authErrMsg");

    if (sessionStorage.getItem("oms_auth_token") === "authenticated") {
        if (authOverlay) authOverlay.style.display = "none";
        updateUserBadge();
        if (typeof initMap === 'function') initMap();
        loadData();
        return;
    }

    if (authOverlay) authOverlay.style.display = "flex";

    async function validateLogin() {
        const selectedUser = userInput ? userInput.value : "PLUZ";
        const passVal = passInput ? passInput.value.trim() : "";

        if (!passVal) {
            if (errMsg) {
                errMsg.innerText = "❌ Ingresa una contraseña";
                errMsg.style.display = "block";
            }
            return;
        }

        if (btnLogin) {
            btnLogin.innerText = "⏳ Validando...";
            btnLogin.disabled = true;
        }

        try {
            const { response, data } = await handleLogin(selectedUser, passVal);

            if (response.ok && data.success) {
                if (authOverlay) authOverlay.style.display = "none";
                updateUserBadge();
                if (typeof initMap === 'function') initMap();
                loadData();
            } else {
                if (errMsg) {
                    errMsg.innerText = "❌ " + (data.message || "Usuario o contraseña incorrectos");
                    errMsg.style.display = "block";
                }
                if (passInput) {
                    passInput.value = "";
                    passInput.focus();
                }
            }
        } catch (err) {
            console.error("Error al autenticar:", err);
            if (errMsg) {
                errMsg.innerText = "❌ Error de conexión al servidor";
                errMsg.style.display = "block";
            }
        } finally {
            if (btnLogin) {
                btnLogin.innerText = "Ingresar";
                btnLogin.disabled = false;
            }
        }
    }

    const authForm = document.getElementById("authLoginForm");
    if (authForm) {
        authForm.onsubmit = (e) => {
            e.preventDefault();
            validateLogin();
        };
    }
    if (btnLogin) {
        btnLogin.onclick = (e) => {
            e.preventDefault();
            validateLogin();
        };
    }
    if (passInput) {
        passInput.focus();
        passInput.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                validateLogin();
            }
        };
    }
}

if (typeof window !== 'undefined') {
    window.handleLogin = handleLogin;
    window.checkAuthentication = checkAuthentication;
    window.updateUserBadge = updateUserBadge;
    window.loadData = loadData;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        OMS_CACHE_TTL_MS,
        getSessionCache,
        setSessionCache,
        fetchWithTimeout,
        rebuildOmsTicketIndex,
        get omsRecordsByTicketMap() {
            return (typeof window !== 'undefined' && window.omsRecordsByTicketMap)
                || (typeof globalThis !== 'undefined' && globalThis.omsRecordsByTicketMap)
                || null;
        },
        handleLogin,
        loadData,
        checkAuthentication,
        updateUserBadge
    };
}
