/**
 * Módulo de Panel Lateral Interactivo y Análisis Inteligente de SEDs Críticas
 * OMS Map - Pluz Energía
 */

let criticalSedChartInstance = null;
let currentCriticalSedData = null;
let currentActiveRange = '1Y'; // '1Y', '6M', '3M', '1M', '7D'
let currentActiveFaultType = 'ALL_RED'; // 'ALL_RED', 'RED-SUBTERRANEA', 'RED-AEREA', 'FUSIBLE', 'LLAVE', etc.
let currentActiveKey = 'ALL'; // 'ALL', '1SP', '2SP', 'MULTI_LLAVE', etc.
let currentSearchQuery = '';
let isCriticalPanelExpanded = false;

/**
 * Parsea fechas de múltiples formatos (ISO, DD/MM/YYYY, etc.)
 */
function parseJsDateSafe(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (!s || s === 'N/A') return null;

    // 1. Formato ISO / YYYY-MM-DD
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) {
        const d = new Date(s.replace(' ', 'T'));
        if (!isNaN(d.getTime())) return d;
    }

    // 2. Formato peruano DD/MM/YYYY o D/M/YYYY
    if (s.includes('/')) {
        const parts = s.split(' ');
        const dateParts = parts[0].split('/');
        if (dateParts.length === 3) {
            const day = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            let year = parseInt(dateParts[2], 10);
            if (year < 100) year += 2000;
            let hours = 0, mins = 0, secs = 0;
            if (parts[1]) {
                const timeParts = parts[1].split(':');
                hours = parseInt(timeParts[0] || 0, 10);
                mins = parseInt(timeParts[1] || 0, 10);
                secs = parseInt(timeParts[2] || 0, 10);
            }
            const d = new Date(year, month, day, hours, mins, secs);
            if (!isNaN(d.getTime())) return d;
        }
    }

    const fallback = new Date(s);
    return isNaN(fallback.getTime()) ? null : fallback;
}

function toDateKeyYmd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function toDateKeyYm(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

/**
 * Inicializa el contenedor del Panel Lateral en el DOM si no existe.
 */
function ensureCriticalPanelDom() {
    if (document.getElementById('criticalSedDrawer')) return;

    const drawerHtml = `
        <div id="criticalSedDrawerOverlay" class="critical-drawer-overlay" onclick="closeCriticalSedPanel()"></div>
        <div id="criticalSedDrawer" class="critical-drawer" aria-hidden="true">
            <!-- Header -->
            <div class="critical-drawer-header">
                <div class="critical-drawer-title-box">
                    <div class="critical-header-badge">🚨 SED CRÍTICA REINCIDENTE</div>
                    <h2 id="criticalSedTitle" class="critical-drawer-title">SED-00000</h2>
                    <p id="criticalSedSubtitle" class="critical-drawer-subtitle">Alimentador: N/A | Total Fallas: 0</p>
                </div>
                <div class="critical-header-actions">
                    <button id="criticalLocateMapBtn" class="critical-header-btn" onclick="focusCriticalSedOnMap()" title="Ubicar y centrar en el Mapa">📍 Ver en Mapa</button>
                    <button id="criticalExpandBtn" class="critical-drawer-expand-btn" onclick="toggleCriticalPanelExpand()" title="Expandir vista amplia (F)">
                        <svg class="icon-expand-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    </button>
                    <button class="critical-drawer-close" onclick="closeCriticalSedPanel()" title="Cerrar panel (Esc)">✕</button>
                </div>
            </div>

            <!-- Body -->
            <div class="critical-drawer-body">
                <!-- Bloque Superior Adaptativo (2 columnas en modo expandido) -->
                <div class="critical-drawer-grid-top">
                    <!-- Columna Izquierda: Filtros y Gráfico -->
                    <div class="critical-col-chart">
                        <!-- Filtros Interactivos -->
                        <div class="critical-filters-container">
                            <div class="critical-range-selector">
                                <label class="critical-filter-label">Rango Temporal:</label>
                                <div class="critical-range-pills" id="criticalRangePills">
                                    <button class="range-pill active" data-range="1Y" onclick="setCriticalRange('1Y')">1 Año</button>
                                    <button class="range-pill" data-range="6M" onclick="setCriticalRange('6M')">6 Meses</button>
                                    <button class="range-pill" data-range="3M" onclick="setCriticalRange('3M')">3 Meses</button>
                                    <button class="range-pill" data-range="1M" onclick="setCriticalRange('1M')">1 Mes</button>
                                    <button class="range-pill" data-range="7D" onclick="setCriticalRange('7D')">7 Días</button>
                                </div>
                            </div>

                            <div class="critical-type-selector">
                                <label class="critical-filter-label" for="criticalFaultTypeSelect">Tipo de Falla:</label>
                                <select id="criticalFaultTypeSelect" class="critical-select" onchange="onCriticalFaultTypeChange(this.value)">
                                    <option value="ALL_RED">⚡ Todas las fallas de Red/SED</option>
                                    <option value="RED-SUBTERRANEA">🕳️ RED-SUBTERRANEA</option>
                                    <option value="RED-AEREA">⚡ RED-AEREA</option>
                                    <option value="FUSIBLE">🔌 FUSIBLE</option>
                                    <option value="LLAVE">🔒 LLAVE / INTERRUPTOR</option>
                                    <option value="DAM">⚠️ DAM</option>
                                    <option value="POSTE">🪵 POSTE</option>
                                </select>
                            </div>
                        </div>

                        <!-- Gráfico Chart.js -->
                        <div class="critical-chart-section" style="margin-top: 14px;">
                            <div class="critical-chart-header">
                                <h4 class="critical-section-title">📊 Historial de Eventos por Llave</h4>
                                <span id="criticalChartSummaryBadge" class="critical-count-badge">0 eventos</span>
                            </div>
                            <div class="critical-chart-wrapper">
                                <canvas id="criticalSedChartCanvas"></canvas>
                            </div>
                            <div class="critical-chart-legend-custom" id="criticalChartLegendCustom">
                                <!-- Generado dinámicamente según las llaves -->
                            </div>
                        </div>
                    </div>

                    <!-- Columna Derecha: Diagnóstico y Llaves -->
                    <div class="critical-col-keys">
                        <!-- Tarjeta de Análisis Inteligente -->
                        <div class="critical-insights-section">
                            <h4 class="critical-section-title">🧠 Diagnóstico & Análisis Inteligente</h4>
                            <div class="critical-insights-grid" id="criticalInsightsGrid">
                                <!-- Generado dinámicamente -->
                            </div>
                        </div>

                        <!-- Detalle de Llaves Interactivo -->
                        <div class="critical-keys-section" style="margin-top: 14px;">
                            <div class="critical-keys-header">
                                <h4 class="critical-section-title">🔑 Desglose por Llaves / Circuitos</h4>
                                <button id="criticalKeysResetBtn" class="critical-keys-reset-btn" onclick="setCriticalKeyFilter('ALL')" style="display:none;" title="Restablecer y ver todas las llaves">⚡ Ver Todas</button>
                            </div>
                            <div id="criticalKeysList" class="critical-keys-list">
                                <!-- Generado dinámicamente -->
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tabla de Historial Completo a Ancho Completo -->
                <div class="critical-events-section">
                    <div class="critical-events-header">
                        <div class="critical-events-title-box">
                            <h4 class="critical-section-title">🕒 Historial de Intervenciones</h4>
                            <div id="criticalKeyFilterTag" class="critical-filter-tag" style="display: none;" onclick="setCriticalKeyFilter('ALL')" title="Clic para quitar este filtro">
                                <span>Filtro Llave: <strong id="criticalActiveKeyName">ALL</strong></span>
                                <span class="filter-tag-close">✕</span>
                            </div>
                        </div>
                        <div class="critical-table-search-box">
                            <span class="critical-search-icon">🔍</span>
                            <input type="text" id="criticalTableSearchInput" class="critical-table-search" placeholder="Buscar ticket, cuadrilla o falla..." oninput="onCriticalTableSearch(this.value)">
                        </div>
                    </div>
                    <div class="critical-table-wrapper">
                        <table class="critical-table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Ticket / ODM</th>
                                    <th>Llave</th>
                                    <th>Falla Real</th>
                                    <th>Detalle / Cuadrilla</th>
                                </tr>
                            </thead>
                            <tbody id="criticalEventsTableBody">
                                <!-- Filas dinámicas -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Toast de Notificación Inicial de SED Crítica -->
        <div id="criticalToastNotification" class="critical-toast-banner" style="display: none;">
            <div class="critical-toast-icon">🚨</div>
            <div class="critical-toast-content">
                <div class="critical-toast-title">Alerta de Guardia: SED Crítica Detectada</div>
                <div class="critical-toast-desc" id="criticalToastDesc">Hay subestaciones recurrentes con falla activa.</div>
            </div>
            <div class="critical-toast-actions">
                <button class="critical-toast-btn-action" id="criticalToastBtnAction">Ver en Mapa</button>
                <button class="critical-toast-btn-close" onclick="closeCriticalToast()">✕</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', drawerHtml);

    // Atajos de teclado: Escape y F
    document.addEventListener('keydown', (e) => {
        const drawer = document.getElementById('criticalSedDrawer');
        if (!drawer || !drawer.classList.contains('open')) return;

        // Si el usuario escribe en un campo de texto, ignorar 'f'
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
            if (e.key === 'Escape') e.target.blur();
            return;
        }

        if (e.key === 'Escape') {
            if (drawer.classList.contains('is-expanded')) {
                toggleCriticalPanelExpand();
            } else {
                closeCriticalSedPanel();
            }
        } else if (e.key === 'f' || e.key === 'F') {
            toggleCriticalPanelExpand();
        }
    });
}

/**
 * Abre el panel lateral y renderiza la data unificada de la SED solicitada.
 */
function openCriticalSedPanel(sedCode) {
    if (!sedCode) return;
    const isAdmin = typeof isCurrentUserAdmin === 'function' ? isCurrentUserAdmin() : (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('oms_user_role') === 'admin');
    if (!isAdmin) {
        console.warn("Acceso restringido a SEDs Críticas: Exclusivo para perfil PLUZ");
        return;
    }
    ensureCriticalPanelDom();

    const normSed = typeof normalizeSedCode === 'function' ? normalizeSedCode(sedCode) : String(sedCode).trim().toUpperCase();
    const baseSed = typeof extractBaseSedCode === 'function' ? extractBaseSedCode(sedCode) : normSed.split('-')[0].trim();
    const rawSed = String(sedCode).trim().toUpperCase();

    const sedMeta = sedCriticasMap.get(normSed) || 
                    sedCriticasMap.get(baseSed) || 
                    sedCriticasMap.get(rawSed) || {};

    // Obtener información adicional de mapLocations
    const matchingLoc = mapLocations.find(l => {
        const lNorm = typeof normalizeSedCode === 'function' ? normalizeSedCode(l.sed) : String(l.sed).trim().toUpperCase();
        const lBase = typeof extractBaseSedCode === 'function' ? extractBaseSedCode(l.sed) : lNorm.split('-')[0].trim();
        return lNorm === normSed || lBase === baseSed || lNorm === baseSed || lBase === normSed;
    }) || {};

    let rawEvents = [];
    const historialJsonStr = getProp(sedMeta, 'HISTORIAL_JSON', 'historial_json', 'eventos_json');
    if (historialJsonStr && historialJsonStr !== 'N/A') {
        try {
            rawEvents = typeof historialJsonStr === 'string' ? JSON.parse(historialJsonStr) : historialJsonStr;
        } catch (err) {
            console.warn("⚠️ Error parseando HISTORIAL_JSON:", err);
        }
    }

    const seenIds = new Set();
    const unifiedEvents = [];

    // Helper para excluir fallas de conexiones individuales / suministros
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

    // Helper canónico para unificar nombres de llaves (ej. '02SP' -> '2SP', 'LLAVE 01' -> '1')
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

    // Precedencia 1: DuckDB (Base Histórica Maestra)
    (rawEvents || []).forEach(e => {
        const id = String(e.id || '').trim();
        if (id && id !== 'None') seenIds.add(id);
        const canonLlave = normalizeLlaveCode(e.l);
        unifiedEvents.push({
            id: id,
            f: e.f,
            t: e.t,
            l: canonLlave,
            m: e.m || canonLlave === 'MULTI_LLAVE',
            src: e.src || 'DUCKDB',
            obs: e.obs || ''
        });
    });

    // Precedencia 2: Ejecutados Recientes (últimos 7 días en caliente)
    const allEjecutados = window.ejecutadosRecords || (typeof ejecutadosRecords !== 'undefined' ? ejecutadosRecords : []);
    allEjecutados.forEach(r => {
        const rSed = getProp(r, 'SED', 'sed', 'Sed', 'COD_SED', 'CODIGO_SED');
        const rNorm = typeof normalizeSedCode === 'function' ? normalizeSedCode(rSed) : '';
        const rBase = typeof extractBaseSedCode === 'function' ? extractBaseSedCode(rSed) : '';

        if (rNorm === normSed || rBase === baseSed || rNorm === baseSed || rBase === normSed) {
            // Falla real / Objeto técnico
            const falReal = getProp(r, 
                'Objeto Técnico', 'Objeto Tcnico', 'Objeto Tecnico', 
                'Tipo de Equipo probable de falla', 'Alcance', 
                'Falla Real', 'falla_real', 'Falla ODM2', 
                'Tipo de falla', 'falla', 'Falla'
            );

            // Filtrar y descartar reclamos de suministro / acometida individual
            if (isExcludedFault(falReal)) return;

            const ticketId = String(getProp(r, 'Ticket', 'ticket', 'ODM', 'odm', 'id', 'Numero de Incidencia') || '').trim();
            if (ticketId && seenIds.has(ticketId)) return;
            if (ticketId) seenIds.add(ticketId);

            const fIni = getProp(r, 'Hora de inicio', 'Fecha Iniciio', 'Fecha Inicio', 'Hora de restauracin', 'Hora de restauracion', 'Fecha_Creacion', 'Fecha inicio', 'Fecha', 'fecha');

            // Llave / Circuito
            const sedLlave = getProp(r, 'Sed-Llave', 'sed_llave', 'Llave', 'Circuito');
            const alimentadorBt = getProp(r, 'Alimentador BT', 'ALIMENTADOR BT', 'alimentador_bt');
            
            let rawLlaveSuffix = 'GENERAL';
            let multiLl = false;
            if (sedLlave && sedLlave !== 'N/A' && sedLlave.includes('-')) {
                const parts = sedLlave.split('-');
                rawLlaveSuffix = parts[1] ? parts[1].trim() : 'MULTI_LLAVE';
                multiLl = !parts[1] || parts[1].trim() === '';
            } else if (alimentadorBt && alimentadorBt !== 'N/A') {
                const parts = alimentadorBt.split('/');
                if (parts.length > 1) {
                    const lastPart = parts[parts.length - 1].replace(/[\]]/g, '').trim();
                    if (lastPart) rawLlaveSuffix = lastPart;
                }
            }

            const canonLlave = normalizeLlaveCode(rawLlaveSuffix);

            // Nota específica y personal técnico
            const nota = getProp(r, 'Nota específica', 'Nota especifica', 'Nota especfica', 'Observaciones', 'nota_especifica', 'Comentarios', 'Nota');
            const tecnico = getProp(r, 'Tecnico', 'Técnico', 'tecnico', 'TECNICO');
            const empresa = getProp(r, 'Empresa', 'empresa', 'EMPRESA', 'Contratista');

            let obs = '';
            if (nota && nota !== 'N/A') obs = nota;
            if (tecnico && tecnico !== 'N/A') {
                const empTag = (empresa && empresa !== 'N/A') ? ` - ${empresa}` : '';
                obs = obs ? `[${tecnico}${empTag}] ${obs}` : `[Técnico: ${tecnico}${empTag}]`;
            } else if (empresa && empresa !== 'N/A') {
                obs = obs ? `[${empresa}] ${obs}` : `[Empresa: ${empresa}]`;
            }

            unifiedEvents.push({
                id: ticketId,
                f: fIni || new Date().toISOString(),
                t: falReal && falReal !== 'N/A' ? falReal : 'RED SUBTERRANEA',
                l: canonLlave,
                m: multiLl || canonLlave === 'MULTI_LLAVE',
                src: 'EJECUTADO_7D',
                obs: obs || 'Intervención finalizada'
            });
        }
    });

    // Precedencia 3: Pendientes Actuales del Mapa
    (mapLocations || []).forEach(l => {
        const lNorm = typeof normalizeSedCode === 'function' ? normalizeSedCode(l.sed) : '';
        const lBase = typeof extractBaseSedCode === 'function' ? extractBaseSedCode(l.sed) : '';

        if (lNorm === normSed || lBase === baseSed || lNorm === baseSed || lBase === normSed) {
            if (isExcludedFault(l.falla)) return;

            const ticketId = String(l.ticket || l.odm || '').trim();
            if (ticketId && seenIds.has(ticketId)) return;
            if (ticketId) seenIds.add(ticketId);

            let rawLlaveSuffix = 'GENERAL';
            let multiLl = false;
            if (l.sed && l.sed.includes('-')) {
                const parts = l.sed.split('-');
                rawLlaveSuffix = parts[1] || 'MULTI_LLAVE';
                multiLl = !parts[1];
            }

            const canonLlave = normalizeLlaveCode(rawLlaveSuffix);

            unifiedEvents.push({
                id: ticketId,
                f: l.fecha_inicio || l.hora_inicio || new Date().toISOString(),
                t: l.falla || 'RED SUBTERRANEA',
                l: canonLlave,
                m: multiLl || canonLlave === 'MULTI_LLAVE',
                src: 'PENDIENTE',
                obs: `[PENDIENTE] ${l.direccion || ''} - ${l.distrito || ''}`
            });
        }
    });

    // Ordenar del más reciente al más antiguo
    unifiedEvents.sort((a, b) => {
        const da = parseJsDateSafe(a.f) || new Date(0);
        const db = parseJsDateSafe(b.f) || new Date(0);
        return db - da;
    });

    currentCriticalSedData = {
        sedCode: baseSed || normSed || String(sedCode).trim(),
        alimentador: getProp(matchingLoc, 'alimentador') || getProp(sedMeta, 'ALIMENTADOR', 'alimentador') || 'N/A',
        distrito: getProp(matchingLoc, 'distrito') || getProp(sedMeta, 'DISTRITO', 'distrito') || 'N/A',
        totalFallas1A: unifiedEvents.length,
        events: unifiedEvents
    };

    // Actualizar Encabezado
    document.getElementById('criticalSedTitle').innerText = `SED ${currentCriticalSedData.sedCode}`;
    document.getElementById('criticalSedSubtitle').innerText = `Alimentador: ${currentCriticalSedData.alimentador} | Distrito: ${currentCriticalSedData.distrito}`;

    // Resetear filtros
    currentActiveRange = '1Y';
    currentActiveFaultType = 'ALL_RED';
    currentActiveKey = 'ALL';
    currentSearchQuery = '';

    const searchInput = document.getElementById('criticalTableSearchInput');
    if (searchInput) searchInput.value = '';
    const resetKeyBtn = document.getElementById('criticalKeysResetBtn');
    if (resetKeyBtn) resetKeyBtn.style.display = 'none';
    const tag = document.getElementById('criticalKeyFilterTag');
    if (tag) tag.style.display = 'none';

    document.querySelectorAll('#criticalRangePills .range-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.range === '1Y');
    });
    const select = document.getElementById('criticalFaultTypeSelect');
    if (select) select.value = 'ALL_RED';

    // Renderizar vistas
    refreshCriticalPanelViews();

    // Mostrar Drawer
    const drawer = document.getElementById('criticalSedDrawer');
    const overlay = document.getElementById('criticalSedDrawerOverlay');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.classList.add('open');
}

/**
 * Cierra el panel lateral y restablece el modo expandido.
 */
function closeCriticalSedPanel() {
    const drawer = document.getElementById('criticalSedDrawer');
    const overlay = document.getElementById('criticalSedDrawerOverlay');
    if (drawer) {
        drawer.classList.remove('open');
        drawer.classList.remove('is-expanded');
        drawer.setAttribute('aria-hidden', 'true');
        isCriticalPanelExpanded = false;
        const btn = document.getElementById('criticalExpandBtn');
        if (btn) {
            btn.innerHTML = `<svg class="icon-expand-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`;
            btn.setAttribute('title', 'Expandir vista amplia (F)');
        }
    }
    if (overlay) {
        overlay.classList.remove('open');
    }
    if (criticalSedChartInstance) {
        criticalSedChartInstance.destroy();
        criticalSedChartInstance = null;
    }
}

/**
 * Cambia el rango temporal seleccionado.
 */
function setCriticalRange(range) {
    currentActiveRange = range;
    document.querySelectorAll('#criticalRangePills .range-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.range === range);
    });
    refreshCriticalPanelViews();
}

/**
 * Cambia el filtro de tipo de falla.
 */
function onCriticalFaultTypeChange(val) {
    currentActiveFaultType = val;
    refreshCriticalPanelViews();
}

/**
 * Alterna el filtro por Llave al hacer clic en una fila de llave.
 */
function toggleCriticalKeyFilter(key) {
    if (currentActiveKey === key) {
        currentActiveKey = 'ALL';
    } else {
        currentActiveKey = key;
    }
    updateCriticalKeyFilterUi();
    refreshCriticalPanelViews();
}

/**
 * Establece el filtro de Llave explícitamente (ej. 'ALL' para limpiar).
 */
function setCriticalKeyFilter(key) {
    currentActiveKey = key || 'ALL';
    updateCriticalKeyFilterUi();
    refreshCriticalPanelViews();
}

/**
 * Actualiza los indicadores visuales del filtro de Llave activo.
 */
function updateCriticalKeyFilterUi() {
    const tag = document.getElementById('criticalKeyFilterTag');
    const nameEl = document.getElementById('criticalActiveKeyName');
    const resetBtn = document.getElementById('criticalKeysResetBtn');

    if (currentActiveKey && currentActiveKey !== 'ALL') {
        const displayName = currentActiveKey === 'MULTI_LLAVE' ? 'Multi-Llave / Barra' : `Llave ${currentActiveKey}`;
        if (nameEl) nameEl.innerText = displayName;
        if (tag) tag.style.display = 'inline-flex';
        if (resetBtn) resetBtn.style.display = 'inline-block';
    } else {
        if (tag) tag.style.display = 'none';
        if (resetBtn) resetBtn.style.display = 'none';
    }
}

/**
 * Maneja la búsqueda en tiempo real dentro de la tabla.
 */
function onCriticalTableSearch(val) {
    currentSearchQuery = String(val || '').trim();
    const filteredEvents = getFilteredCriticalEvents();
    renderCriticalEventsTable(filteredEvents);
}

/**
 * Calcula la fecha de corte exacta desde las 00:00:00 para el rango activo.
 */
function getCriticalCutoffDate() {
    const now = new Date();
    const cutoff = new Date();
    if (currentActiveRange === '7D') {
        cutoff.setDate(now.getDate() - 7);
        cutoff.setHours(0, 0, 0, 0);
    } else if (currentActiveRange === '1M') {
        cutoff.setDate(now.getDate() - 30);
        cutoff.setHours(0, 0, 0, 0);
    } else if (currentActiveRange === '3M') {
        cutoff.setDate(now.getDate() - 90);
        cutoff.setHours(0, 0, 0, 0);
    } else if (currentActiveRange === '6M') {
        cutoff.setDate(now.getDate() - 180);
        cutoff.setHours(0, 0, 0, 0);
    } else {
        // 1Y
        cutoff.setDate(now.getDate() - 365);
        cutoff.setHours(0, 0, 0, 0);
    }
    return cutoff;
}

/**
 * Obtiene los eventos para el contexto global de llaves en el rango y tipo seleccionados.
 */
function getEventsForKeysContext() {
    if (!currentCriticalSedData || !Array.isArray(currentCriticalSedData.events)) return [];

    const cutoffDate = getCriticalCutoffDate();

    return currentCriticalSedData.events.filter(e => {
        const evDate = parseJsDateSafe(e.f);
        if (!evDate) return true;
        if (evDate < cutoffDate) return false;

        if (currentActiveFaultType !== 'ALL_RED') {
            const clean = (s) => String(s || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-_]/g, " ").trim();
            const cleanType = clean(e.t);
            const cleanFilter = clean(currentActiveFaultType);
            if (!cleanType.includes(cleanFilter) && !cleanFilter.includes(cleanType)) return false;
        }

        return true;
    });
}

/**
 * Filtra los eventos según el rango, tipo de falla, llave seleccionada y búsqueda.
 */
function getFilteredCriticalEvents() {
    const baseEvents = getEventsForKeysContext();

    return baseEvents.filter(e => {
        // Filtro por Llave activa
        if (currentActiveKey && currentActiveKey !== 'ALL') {
            if (currentActiveKey === 'MULTI_LLAVE') {
                if (!e.m && e.l !== 'MULTI_LLAVE') return false;
            } else {
                if (e.l !== currentActiveKey) return false;
            }
        }

        // Búsqueda en texto libre
        if (currentSearchQuery) {
            const q = currentSearchQuery.toLowerCase();
            const idStr = String(e.id || '').toLowerCase();
            const tStr = String(e.t || '').toLowerCase();
            const lStr = String(e.l || '').toLowerCase();
            const obsStr = String(e.obs || '').toLowerCase();
            if (!idStr.includes(q) && !tStr.includes(q) && !lStr.includes(q) && !obsStr.includes(q)) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Refresca todo el panel lateral: Gráfico, Insights, Llaves y Tabla.
 */
function refreshCriticalPanelViews() {
    const filteredEvents = getFilteredCriticalEvents();

    // Actualizar badge de conteo
    const badge = document.getElementById('criticalChartSummaryBadge');
    if (badge) {
        const keySuffix = (currentActiveKey && currentActiveKey !== 'ALL') ? ` (Llave: ${currentActiveKey})` : '';
        badge.innerText = `${filteredEvents.length} eventos en este rango${keySuffix}`;
    }

    renderCriticalChart(filteredEvents);
    renderCriticalInsights(filteredEvents);
    renderCriticalKeys(filteredEvents);
    renderCriticalEventsTable(filteredEvents);
}

/**
 * Renderiza el gráfico interactivo usando Chart.js adaptado a la granularidad del rango.
 */
function renderCriticalChart(events) {
    const canvas = document.getElementById('criticalSedChartCanvas');
    if (!canvas) return;

    if (criticalSedChartInstance) {
        criticalSedChartInstance.destroy();
        criticalSedChartInstance = null;
    }

    if (typeof Chart === 'undefined') {
        console.warn("Chart.js no está cargado.");
        return;
    }

    const bucketsMap = new Map();
    const now = new Date();

    if (currentActiveRange === '7D') {
        // 7 Días: por Día con keys YYYY-MM-DD
        const weekdayNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
        const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const dateKey = toDateKeyYmd(d);
            const displayLabel = `${weekdayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]}`;
            bucketsMap.set(dateKey, { label: displayLabel, ejecutados: 0, pendientes: 0 });
        }
    } else if (currentActiveRange === '1M') {
        // 1 Mes: por Días
        const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const dateKey = toDateKeyYmd(d);
            const displayLabel = `${d.getDate()} ${monthNames[d.getMonth()]}`;
            bucketsMap.set(dateKey, { label: displayLabel, ejecutados: 0, pendientes: 0 });
        }
    } else if (currentActiveRange === '3M' || currentActiveRange === '6M') {
        // Semanas
        const totalWeeks = currentActiveRange === '3M' ? 12 : 24;
        for (let i = totalWeeks - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - (i * 7));
            const dateKey = toDateKeyYmd(d);
            const displayLabel = `Sem ${d.getDate()}/${d.getMonth() + 1}`;
            bucketsMap.set(dateKey, { label: displayLabel, targetDate: d, ejecutados: 0, pendientes: 0 });
        }
    } else {
        // 1 Año: por Meses
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const dateKey = toDateKeyYm(d);
            const displayLabel = `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
            bucketsMap.set(dateKey, { label: displayLabel, ejecutados: 0, pendientes: 0 });
        }
    }

    // Clasificar eventos en los 2 estados operativos: Ejecutados vs Pendientes
    let totalEjecutados = 0;
    let totalPendientes = 0;

    events.forEach(e => {
        const evDate = parseJsDateSafe(e.f);
        if (!evDate) return;

        let matchKey = null;
        if (currentActiveRange === '7D' || currentActiveRange === '1M') {
            matchKey = toDateKeyYmd(evDate);
        } else if (currentActiveRange === '1Y') {
            matchKey = toDateKeyYm(evDate);
        } else {
            // 3M / 6M: asignar a la semana más cercana
            let closestKey = null;
            let minDiff = Infinity;
            bucketsMap.forEach((b, k) => {
                if (b.targetDate) {
                    const diff = Math.abs(evDate - b.targetDate);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestKey = k;
                    }
                }
            });
            matchKey = closestKey;
        }

        const isPend = String(e.src || '').toUpperCase().includes('PENDIENTE');
        if (isPend) totalPendientes++;
        else totalEjecutados++;

        if (bucketsMap.has(matchKey)) {
            const bucket = bucketsMap.get(matchKey);
            if (isPend) bucket.pendientes++;
            else bucket.ejecutados++;
        }
    });

    const labels = Array.from(bucketsMap.values()).map(b => b.label);
    const dataEjecutados = Array.from(bucketsMap.values()).map(b => b.ejecutados);
    const dataPendientes = Array.from(bucketsMap.values()).map(b => b.pendientes);

    const ctx = canvas.getContext('2d');

    criticalSedChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Resuelto / Ejecutado',
                    data: dataEjecutados,
                    backgroundColor: '#0284c7',
                    hoverBackgroundColor: '#0369a1',
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 14,
                    barPercentage: 0.55,
                    categoryPercentage: 0.7,
                    stack: 'stack0'
                },
                {
                    label: 'Pendiente Actual OMS',
                    data: dataPendientes,
                    backgroundColor: '#ef4444',
                    hoverBackgroundColor: '#dc2626',
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 14,
                    barPercentage: 0.55,
                    categoryPercentage: 0.7,
                    stack: 'stack0'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#f8fafc',
                    bodyColor: '#f8fafc',
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        footer: (tooltipItems) => {
                            let total = 0;
                            tooltipItems.forEach(item => { total += item.raw; });
                            return `Total en período: ${total} eventos`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { font: { size: 10, weight: '600' }, color: '#64748b', maxRotation: 45 }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { stepSize: 1, font: { size: 10 }, color: '#64748b', precision: 0 },
                    grid: { color: 'rgba(241, 245, 249, 0.8)' }
                }
            }
        }
    });

    // Actualizar Leyenda de los 2 colores
    const legendEl = document.getElementById('criticalChartLegendCustom');
    if (legendEl) {
        legendEl.innerHTML = `
            <span><i class="legend-dot" style="background:#0284c7;"></i> Resuelto / Ejecutado (${totalEjecutados})</span>
            <span><i class="legend-dot dot-pend" style="background:#ef4444;"></i> Pendiente Actual OMS (${totalPendientes})</span>
        `;
    }
}

/**
 * Recalcula y renderiza las tarjetas de diagnóstico inteligente.
 */
function renderCriticalInsights(events) {
    const grid = document.getElementById('criticalInsightsGrid');
    if (!grid) return;

    const total = events.length;
    if (total === 0) {
        grid.innerHTML = `<div class="insight-card full-width"><span class="insight-desc">No hay eventos de red registrados en este período y filtro seleccionado.</span></div>`;
        return;
    }

    const now = new Date();
    const cutoffDate = getCriticalCutoffDate();
    const spanMs = Math.max(1000, now.getTime() - cutoffDate.getTime());
    const t1End = new Date(cutoffDate.getTime() + spanMs / 3);
    const t2End = new Date(cutoffDate.getTime() + (2 * spanMs) / 3);

    // 1. Patrón Temporal (3 Tercios Cronológicos)
    let countT1 = 0, countT2 = 0, countT3 = 0;
    events.forEach(e => {
        const d = parseJsDateSafe(e.f);
        if (!d) return;
        if (d >= cutoffDate && d < t1End) countT1++;
        else if (d >= t1End && d < t2End) countT2++;
        else if (d >= t2End) countT3++;
    });

    let patronBadge = `<span class="insight-badge badge-estable">➡️ ESTABLE</span>`;
    let patronSub = `${countT1} / ${countT2} / ${countT3} por tercio`;

    if (total <= 2) {
        patronBadge = `<span class="insight-badge badge-estable">➡️ AISLADAS</span>`;
        patronSub = `${total} evento(s) en el período`;
    } else if (countT3 >= 2 && (countT3 >= total * 0.5 || countT3 > (countT1 + countT2) * 1.2)) {
        const pctReciente = Math.round((countT3 / total) * 100);
        patronBadge = `<span class="insight-badge badge-disparo">🚨 DISPARO RECIENTE</span>`;
        patronSub = `${countT3} fallas en tercio reciente (${pctReciente}%)`;
    } else if (countT1 >= 2 && countT3 === 0) {
        patronBadge = `<span class="insight-badge badge-reduccion">📉 EN RESOLUCIÓN</span>`;
        patronSub = `0 fallas en tercio reciente`;
    } else if (countT1 > 0 && countT2 > 0 && countT3 > 0) {
        patronBadge = `<span class="insight-badge badge-cronica">🔄 CRÓNICA / SOSTENIDA</span>`;
        patronSub = `Frecuencia regular en todo el período`;
    } else if (countT3 > countT1 * 1.4) {
        patronBadge = `<span class="insight-badge badge-aumento">📈 EN AUMENTO</span>`;
        patronSub = `Aceleración hacia el final`;
    } else if (countT3 < countT1 * 0.6) {
        patronBadge = `<span class="insight-badge badge-reduccion">📉 EN REDUCCIÓN</span>`;
        patronSub = `Menor actividad reciente`;
    }

    // 2. Cadencia / Frecuencia Promedio
    const sortedEvents = [...events].sort((a,b) => (parseJsDateSafe(a.f) || 0) - (parseJsDateSafe(b.f) || 0));
    let cadenciaText = "Falla aislada";
    if (total >= 2) {
        const first = parseJsDateSafe(sortedEvents[0].f) || new Date();
        const last = parseJsDateSafe(sortedEvents[sortedEvents.length - 1].f) || new Date();
        const diffDays = Math.max(1, (last - first) / (1000 * 60 * 60 * 24));
        const rate = (diffDays / total).toFixed(1);
        cadenciaText = `1 falla cada ~${rate} días`;
    } else {
        cadenciaText = `1 evento registrado`;
    }

    // 3. Foco Crítico de Infraestructura (Llave / Circuito)
    const keyMap = {};
    let multiLlaveCount = 0;
    events.forEach(e => {
        if (e.m || e.l === 'MULTI_LLAVE') multiLlaveCount++;
        else keyMap[e.l] = (keyMap[e.l] || 0) + 1;
    });

    let topKeyStr = "Múltiples / General";
    let topKeyPct = 0;
    if (Object.keys(keyMap).length > 0) {
        const entries = Object.entries(keyMap).sort((a,b) => b[1] - a[1]);
        const top = entries[0];
        topKeyPct = Math.round((top[1] / total) * 100);
        topKeyStr = `Llave ${top[0]} (${topKeyPct}% del total)`;
    } else if (multiLlaveCount > 0) {
        topKeyStr = `Barra General / Trafo (${Math.round((multiLlaveCount/total)*100)}%)`;
    }

    // 4. Conteo de Red y Desglose por Fuentes
    let cntDuck = 0, cnt7d = 0, cntPend = 0;
    events.forEach(e => {
        const src = String(e.src || '').toUpperCase();
        if (src.includes('PENDIENTE')) cntPend++;
        else if (src.includes('EJECUTADO')) cnt7d++;
        else cntDuck++;
    });

    grid.innerHTML = `
        <div class="insight-card">
            <div class="insight-icon">📈</div>
            <div class="insight-content">
                <div class="insight-title">Patrón Temporal</div>
                <div class="insight-value">${patronBadge}</div>
                <div style="font-size:10px; color:#64748b; margin-top:2px;">${escapeHtml(patronSub)}</div>
            </div>
        </div>

        <div class="insight-card">
            <div class="insight-icon">⏱️</div>
            <div class="insight-content">
                <div class="insight-title">Frecuencia Promedio</div>
                <div class="insight-value" title="${escapeHtml(cadenciaText)}">${escapeHtml(cadenciaText)}</div>
            </div>
        </div>

        <div class="insight-card">
            <div class="insight-icon">🎯</div>
            <div class="insight-content">
                <div class="insight-title">Llave Crítica</div>
                <div class="insight-value" title="${escapeHtml(topKeyStr)}">${escapeHtml(topKeyStr)}</div>
                <div style="font-size:10px; color:#64748b; margin-top:2px;">Mayor concentración</div>
            </div>
        </div>

        <div class="insight-card">
            <div class="insight-icon">📊</div>
            <div class="insight-content">
                <div class="insight-title">Total en Rango</div>
                <div class="insight-value">${total} fallas de red</div>
                <div style="font-size:10px; color:#64748b; margin-top:2px;">${cntDuck} Hist · ${cnt7d} Rec · ${cntPend} Act</div>
            </div>
        </div>
    `;
}

/**
 * Renderiza el listado interactivo con barras de progreso de llaves.
 */
function renderCriticalKeys(events) {
    const container = document.getElementById('criticalKeysList');
    if (!container) return;

    // Usar el contexto de todas las llaves en este rango para mostrar totales y porcentajes reales
    const contextEvents = getEventsForKeysContext();
    const total = contextEvents.length;

    if (total === 0) {
        container.innerHTML = `<div style="font-size:12px; color:#94a3b8; padding:8px;">Sin datos de llaves en este rango.</div>`;
        return;
    }

    const keyMap = {};
    let multiCount = 0;
    contextEvents.forEach(e => {
        if (e.m || e.l === 'MULTI_LLAVE') multiCount++;
        else keyMap[e.l] = (keyMap[e.l] || 0) + 1;
    });

    const items = [];
    if (multiCount > 0) {
        items.push({ key: 'MULTI_LLAVE', name: '⚡ Multi-Llave / Barra General', count: multiCount, isMulti: true });
    }
    Object.entries(keyMap).forEach(([k, cnt]) => {
        items.push({ key: k, name: `Llave ${k}`, count: cnt, isMulti: false });
    });

    items.sort((a, b) => b.count - a.count);

    const isFilterActive = currentActiveKey && currentActiveKey !== 'ALL';

    container.innerHTML = items.map(item => {
        const pct = Math.round((item.count / total) * 100);
        const isSelected = isFilterActive && currentActiveKey === item.key;
        const isDimmed = isFilterActive && currentActiveKey !== item.key;
        const rowClass = `critical-key-row ${isSelected ? 'is-selected' : ''} ${isDimmed ? 'is-dimmed' : ''}`;

        return `
            <div class="${rowClass}" onclick="toggleCriticalKeyFilter('${item.key}')" role="button" tabindex="0" title="Clic para filtrar por ${escapeHtml(item.name)}">
                <div class="key-info">
                    <span class="key-name">${item.name} ${isSelected ? '✓' : ''}</span>
                    <span class="key-count">${item.count} fallas (${pct}%)</span>
                </div>
                <div class="key-progress-bar">
                    <div class="key-progress-fill ${item.isMulti ? 'fill-multi' : ''}" style="width: ${pct}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Renderiza la tabla de auditoría con Ticket copiable y dot de origen.
 */
function renderCriticalEventsTable(events) {
    const tbody = document.getElementById('criticalEventsTableBody');
    if (!tbody) return;

    if (events.length === 0) {
        const filterHint = (currentActiveKey !== 'ALL' || currentSearchQuery) 
            ? 'No hay intervenciones que coincidan con la llave o búsqueda activa.' 
            : 'No hay intervenciones que coincidan con los filtros.';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:18px; color:#94a3b8; font-size:12px;">${escapeHtml(filterHint)}</td></tr>`;
        return;
    }

    const rowsHtml = events.slice(0, 50).map(e => {
        let dotClass = 'dot-duckdb';
        let srcTitle = 'Base Histórica Maestra (DuckDB)';
        if (String(e.src).includes('PENDIENTE')) {
            dotClass = 'dot-pend';
            srcTitle = 'Pendiente Activo en Curso (Hoy)';
        } else if (String(e.src).includes('EJECUTADO')) {
            dotClass = 'dot-7d';
            srcTitle = 'Ejecutado Reciente (Últimos 7 Días)';
        }

        const ticketVal = String(e.id || '').trim();
        const displayTicket = ticketVal && ticketVal !== 'None' ? ticketVal : 'S/N';
        const llStr = e.m || e.l === 'MULTI_LLAVE' 
            ? '<span style="color:#b45309; font-weight:700;">MULTI-LLAVE</span>' 
            : `<span style="font-weight:600;">${escapeHtml(e.l)}</span>`;

        return `
            <tr>
                <td style="font-weight:600; white-space:nowrap; color:#334155;">${escapeHtml(e.f)}</td>
                <td>
                    <div class="ticket-cell">
                        <span class="source-dot ${dotClass}" title="${srcTitle}"></span>
                        <button class="ticket-copy-btn" onclick="copyCriticalTicket('${escapeHtml(displayTicket)}', this)" title="Copiar número de ticket">
                            <span>${escapeHtml(displayTicket)}</span>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                    </div>
                </td>
                <td>${llStr}</td>
                <td><span class="falla-pill">${escapeHtml(e.t)}</span></td>
                <td style="font-size:11.5px; color:#475569;" title="${escapeHtml(e.obs)}">${escapeHtml(e.obs || 'Sin observaciones')}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rowsHtml;
}

/**
 * Copia el número de ticket al portapapeles y da feedback visual instantáneo.
 */
function copyCriticalTicket(ticket, btnEl) {
    if (!ticket || ticket === 'S/N') return;
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ticket).then(() => {
            if (btnEl) {
                btnEl.classList.add('copied');
                const origHtml = btnEl.innerHTML;
                btnEl.innerHTML = `<span>✓ Copiado</span>`;
                setTimeout(() => {
                    btnEl.classList.remove('copied');
                    btnEl.innerHTML = origHtml;
                }, 1400);
            }
        }).catch(err => {
            console.warn("No se pudo copiar ticket:", err);
        });
    }
}

/**
 * Conmuta entre la vista lateral compacta (580px) y el Dashboard Studio Expandido (96vw).
 */
function toggleCriticalPanelExpand() {
    const drawer = document.getElementById('criticalSedDrawer');
    if (!drawer) return;
    drawer.classList.toggle('is-expanded');
    isCriticalPanelExpanded = drawer.classList.contains('is-expanded');

    const btn = document.getElementById('criticalExpandBtn');
    if (btn) {
        btn.innerHTML = isCriticalPanelExpanded 
            ? `<svg class="icon-expand-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14L3 21"/></svg>`
            : `<svg class="icon-expand-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`;
        btn.setAttribute('title', isCriticalPanelExpanded ? 'Restaurar vista lateral (F)' : 'Expandir vista amplia (F)');
    }

    setTimeout(() => {
        if (criticalSedChartInstance) {
            criticalSedChartInstance.resize();
        }
    }, 280);
}

/**
 * Centra y hace zoom a la SED crítica en el mapa principal.
 */
function focusCriticalSedOnMap() {
    if (!currentCriticalSedData || !currentCriticalSedData.sedCode) return;
    const sedCode = currentCriticalSedData.sedCode;
    const normSed = typeof normalizeSedCode === 'function' ? normalizeSedCode(sedCode) : sedCode;
    const baseSed = typeof extractBaseSedCode === 'function' ? extractBaseSedCode(sedCode) : sedCode;

    // 1. Cerrar el panel lateral para despejar la vista completa del mapa
    closeCriticalSedPanel();

    // 2. Conmutar a la vista Mapa si estamos en Indicadores, Seguimiento o Llamadas
    if (typeof showMapView === 'function') {
        showMapView();
    } else if (typeof selectPrimaryView === 'function') {
        selectPrimaryView('map');
    }

    const targetMap = (typeof leafletMap !== 'undefined' && leafletMap) ? leafletMap : (window.leafletMap || null);
    if (!targetMap) {
        console.warn("Instancia de leafletMap no disponible.");
        return;
    }

    // 3. Buscar si hay una ubicación activa en mapLocations
    const loc = (mapLocations || []).find(l => {
        const lNorm = typeof normalizeSedCode === 'function' ? normalizeSedCode(l.sed) : '';
        const lBase = typeof extractBaseSedCode === 'function' ? extractBaseSedCode(l.sed) : '';
        return lNorm === normSed || lBase === baseSed || lNorm === baseSed || lBase === normSed;
    });

    if (loc && (loc.lat || loc.lon || loc.marker)) {
        const lat = loc.lat || (loc.marker && loc.marker.getLatLng().lat);
        const lon = loc.lon || (loc.marker && loc.marker.getLatLng().lng);

        if (lat && lon) {
            targetMap.flyTo([lat, lon], 17, { animate: true, duration: 1.0 });

            // Si el marcador está en un cluster, hacer zoom para revelarlo
            if (loc.marker) {
                if (typeof markersGroup !== 'undefined' && markersGroup && typeof markersGroup.zoomToShowLayer === 'function') {
                    markersGroup.zoomToShowLayer(loc.marker, () => {
                        setTimeout(() => loc.marker.openPopup(), 250);
                    });
                } else {
                    setTimeout(() => loc.marker.openPopup(), 750);
                }
            }
        }

        // Resaltar la nube/perímetro de la SED si existe
        if (typeof focusSedCloud === 'function') {
            focusSedCloud(normSed || baseSed);
        }
        return;
    }

    // 3. Si no tiene falla activa hoy, buscar coordenadas en el histórico de ejecutados o en la metadata de SEDs críticas
    let histLat = null, histLon = null;
    const allEjecutados = window.ejecutadosRecords || (typeof ejecutadosRecords !== 'undefined' ? ejecutadosRecords : []);
    for (const r of allEjecutados) {
        const rSed = getProp(r, 'SED', 'sed', 'Sed', 'COD_SED', 'CODIGO_SED');
        const rNorm = typeof normalizeSedCode === 'function' ? normalizeSedCode(rSed) : '';
        const rBase = typeof extractBaseSedCode === 'function' ? extractBaseSedCode(rSed) : '';
        if (rNorm === normSed || rBase === baseSed || rNorm === baseSed || rBase === normSed) {
            const latVal = parseFloat(getProp(r, 'Latitud', 'latitud', 'Lat', 'lat'));
            const lonVal = parseFloat(getProp(r, 'Longitud', 'longitud', 'Lon', 'lon', 'lng'));
            if (!isNaN(latVal) && !isNaN(lonVal)) {
                histLat = latVal;
                histLon = lonVal;
                break;
            }
        }
    }

    if (!histLat && currentCriticalSedData) {
        const sedMeta = (typeof sedCriticasMap !== 'undefined' && sedCriticasMap) ? (sedCriticasMap.get(normSed) || sedCriticasMap.get(baseSed) || {}) : {};
        const latVal = parseFloat(getProp(sedMeta, 'LATITUD', 'latitud', 'lat'));
        const lonVal = parseFloat(getProp(sedMeta, 'LONGITUD', 'longitud', 'lon', 'lng'));
        if (!isNaN(latVal) && !isNaN(lonVal)) {
            histLat = latVal;
            histLon = lonVal;
        }
    }

    if (histLat && histLon) {
        targetMap.flyTo([histLat, histLon], 17, { animate: true, duration: 1.0 });
        L.popup()
            .setLatLng([histLat, histLon])
            .setContent(`
                <div style="font-family:'Inter',sans-serif; padding:4px;">
                    <b style="color:#0f172a; font-size:13px;">SED ${sedCode}</b>
                    <p style="margin:4px 0; font-size:11px; color:#64748b;">Subestación Reincidente Crítica</p>
                    <span style="display:inline-block; font-size:10px; font-weight:700; background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px;">Sin falla activa en curso</span>
                </div>
            `)
            .openOn(targetMap);

        if (typeof focusSedCloud === 'function') {
            focusSedCloud(normSed || baseSed);
        }
    } else {
        // Fallback: aplicar filtro de búsqueda en el input del mapa
        const inputTicket = document.getElementById("inputTicket");
        if (inputTicket) {
            inputTicket.value = baseSed || sedCode;
            if (typeof filterMapMarkers === 'function') filterMapMarkers();
        }
    }
}

/**
 * Notificación Toast de Alarma al Ingresar al Mapa.
 */
function checkAndNotifyCriticalSedsOnLoad() {
    const isAdmin = typeof isCurrentUserAdmin === 'function' ? isCurrentUserAdmin() : (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('oms_user_role') === 'admin');
    if (!isAdmin) return;
    ensureCriticalPanelDom();

    // Priorizar tickets del Top 4 de SEDs Críticas
    const topActiveTickets = (mapLocations || []).filter(loc => typeof isTopCriticalSed === 'function' ? isTopCriticalSed(loc.sed) : loc.es_sed_critica);
    const targetTickets = topActiveTickets.length > 0 ? topActiveTickets : (mapLocations || []).filter(loc => loc.es_sed_critica);

    if (targetTickets.length === 0) return;

    const uniqueSeds = [...new Set(targetTickets.map(l => normalizeSedCode(l.sed)))];
    const topSed = uniqueSeds[0];
    const matchingLoc = targetTickets[0];

    const toast = document.getElementById('criticalToastNotification');
    const desc = document.getElementById('criticalToastDesc');
    const btnAction = document.getElementById('criticalToastBtnAction');

    if (!toast || !desc || !btnAction) return;

    if (topActiveTickets.length > 0) {
        if (uniqueSeds.length === 1) {
            desc.innerHTML = `Atención: La <b>SED ${topSed} (Top 1 Crítica)</b> presenta falla activa en curso.`;
        } else {
            desc.innerHTML = `Atención de Guardia: <b>${uniqueSeds.length} SEDs del Top 4 Crítico</b> presentan fallas activas (ej. SED ${topSed}).`;
        }
    } else {
        if (uniqueSeds.length === 1) {
            desc.innerHTML = `La <b>SED ${topSed}</b> presenta falla activa en el mapa.`;
        } else {
            desc.innerHTML = `Detectadas <b>${uniqueSeds.length} SEDs críticas</b> con tickets activos (ej. SED ${topSed}).`;
        }
    }

    btnAction.onclick = () => {
        closeCriticalToast();
        const chkCrit = document.getElementById("chkCriticaMap");
        if (chkCrit) {
            chkCrit.checked = true;
            if (typeof filterMapMarkers === 'function') {
                filterMapMarkers();
            } else {
                chkCrit.dispatchEvent(new Event('change'));
            }
        }
    };

    toast.style.display = 'flex';
    requestAnimationFrame(() => {
        toast.classList.add('slide-in');
    });

    // Auto-cerrar con pausa al pasar el cursor (Criterio Sonner / Emil Kowalski)
    let autoCloseTimer = null;
    function startToastCountdown(duration = 12000) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = setTimeout(() => {
            closeCriticalToast();
        }, duration);
    }

    toast.onmouseenter = () => {
        clearTimeout(autoCloseTimer);
    };
    toast.onmouseleave = () => {
        startToastCountdown(6000);
    };

    startToastCountdown(12000);
}

function closeCriticalToast() {
    const toast = document.getElementById('criticalToastNotification');
    if (toast) {
        toast.classList.remove('slide-in');
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }
}

// Auto-inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureCriticalPanelDom);
} else {
    ensureCriticalPanelDom();
}
