/**
 * OMS Markers Manager
 * Handles marker creation, custom SLA and fault icons, marker clusters,
 * faceted filtering with batch insertion and map bounds fit.
 * UMD / Browser friendly.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.MarkersManager = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.MarkersManager = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
    'use strict';

    function getPopupsModule() {
        if (typeof root !== 'undefined' && root.MapPopups) return root.MapPopups;
        if (typeof window !== 'undefined' && window.MapPopups) return window.MapPopups;
        return null;
    }

    /**
     * Crea el DivIcon personalizado para un ticket con SLA y estado
     * @param {Object} loc Datos de la incidencia
     * @returns {Object} Instancia L.divIcon
     */
    function getMarkerIcon(loc) {
        if (typeof L === 'undefined') return null;
        const popups = getPopupsModule();
        let iconHtml = '';
        if (popups && typeof popups.renderIncidentIcon === 'function') {
            iconHtml = popups.renderIncidentIcon(loc);
        } else {
            const stateClass = (typeof getOmsStatusClass === 'function') 
                ? getOmsStatusClass(loc.estado) 
                : String(loc.estado || '').toLowerCase();
            const isExecution = stateClass === 'ejecucion';
            const sla = loc.sla || { statusClass: '', label: '' };
            const faultIcon = (typeof getFaultIconHtml === 'function') ? getFaultIconHtml(loc.falla) : '⚡';
            const safeTicket = String(loc.ticket || '').replace(/"/g, '&quot;');
            const safeFalla = String(loc.falla || '').replace(/"/g, '&quot;');
            const safeSla = String(sla.label || '').replace(/"/g, '&quot;');
            const isSuministroReinc = Boolean(loc.suministro_reincidente || (loc.suministro_count >= 2));
            const sumCount = parseInt(loc.suministro_count || 1, 10);
            const sumDias = loc.suministro_ventana_dias || 2;
            let titleText = `Ticket: ${safeTicket} | ${safeFalla} | Plazo: ${safeSla}`;
            if (isSuministroReinc) {
                titleText += ` | ⚠️ S. REINCIDENTE (${sumCount} fallas en ${sumDias} días)`;
            }
            iconHtml = `
                <div class="marker-sla-badge ${sla.statusClass}${isExecution ? ' is-execution' : ''}${loc.es_top_critica ? ' is-sed-critica-pulse' : ''}${isSuministroReinc ? ' is-suministro-reincidente' : ''}" title="${titleText}">
                    ${isSuministroReinc ? `<span class="marker-reinc-badge" title="Falla recurrente: ${sumCount} veces">x${sumCount}</span>` : ''}
                    ${isExecution ? '<span class="marker-vehicle-backdrop" aria-hidden="true">🚚</span>' : ''}
                    <span class="marker-fault-icon">${faultIcon}</span>
                </div>
            `;
        }

        return L.divIcon({
            className: 'custom-leaflet-marker-wrapper',
            html: iconHtml,
            iconSize: [48, 48],
            iconAnchor: [24, 24],
            popupAnchor: [0, -24]
        });
    }

    /**
     * Construye y mapea todos los marcadores en el mapa Leaflet
     */
    function setupMapMarkers() {
        const mg = (typeof markersGroup !== 'undefined') ? markersGroup : (typeof window !== 'undefined' ? window.markersGroup : null);
        const mm = (typeof markerMap !== 'undefined') ? markerMap : (typeof window !== 'undefined' ? window.markerMap : null);
        const locs = (typeof mapLocations !== 'undefined') ? mapLocations : (typeof window !== 'undefined' ? window.mapLocations : []);
        const tdRecords = (typeof tdOmsRecords !== 'undefined') ? tdOmsRecords : (typeof window !== 'undefined' ? window.tdOmsRecords : []);

        if (mg && typeof mg.clearLayers === 'function') mg.clearLayers();
        if (mm && typeof mm.clear === 'function') mm.clear();

        const isAdmin = typeof isCurrentUserAdmin === 'function' 
            ? isCurrentUserAdmin() 
            : (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('oms_user_role') === 'admin');

        if (isAdmin && typeof recalculateTopCriticalSeds === 'function') {
            recalculateTopCriticalSeds();
        } else if (!isAdmin) {
            if (typeof topCriticalSedsSet !== 'undefined' && topCriticalSedsSet && typeof topCriticalSedsSet.clear === 'function') {
                topCriticalSedsSet.clear();
            }
            if (typeof topCriticalSedsList !== 'undefined') {
                topCriticalSedsList = [];
            }
        }

        tdRecords.forEach(r => {
            r.es_sed_critica = isAdmin && (typeof isSedCritica === 'function' ? isSedCritica(r.sed) : false);
            r.es_top_critica = isAdmin && (typeof isTopCriticalSed === 'function' ? isTopCriticalSed(r.sed) : false);
        });

        const popups = getPopupsModule();

        locs.forEach(loc => {
            loc.es_sed_critica = isAdmin && (typeof isSedCritica === 'function' ? isSedCritica(loc.sed) : false);
            loc.es_top_critica = isAdmin && (typeof isTopCriticalSed === 'function' ? isTopCriticalSed(loc.sed) : false);

            const popupHtml = popups && typeof popups.renderIncidentPopup === 'function'
                ? popups.renderIncidentPopup(loc)
                : `<b>Ticket: ${loc.ticket}</b><br>${loc.falla}`;

            const customIcon = getMarkerIcon(loc);

            if (typeof L !== 'undefined' && loc.lat && loc.lon) {
                const marker = L.marker([loc.lat, loc.lon], { icon: customIcon }).bindPopup(popupHtml, {
                    autoPanPaddingTopLeft: L.point(16, 120),
                    autoPanPaddingBottomRight: L.point(16, 70),
                    maxWidth: 290
                });

                marker.on('popupopen', () => {
                    if (typeof focusSedCloud === 'function') focusSedCloud(loc.sed);
                    else if (root.SedCloudsManager && typeof root.SedCloudsManager.focusSedCloud === 'function') {
                        root.SedCloudsManager.focusSedCloud(loc.sed);
                    }
                });
                marker.on('popupclose', () => {
                    if (typeof focusSedCloud === 'function') focusSedCloud(null);
                    else if (root.SedCloudsManager && typeof root.SedCloudsManager.focusSedCloud === 'function') {
                        root.SedCloudsManager.focusSedCloud(null);
                    }
                });

                if (mm) {
                    mm.set(String(loc.ticket).toLowerCase(), { marker, loc });
                }
            }
        });

        if (typeof checkAndNotifyCriticalSedsOnLoad === 'function') {
            checkAndNotifyCriticalSedsOnLoad();
        }

        if (typeof window !== 'undefined') {
            window.renderMapMarkers = setupMapMarkers;
        }
    }

    /**
     * Filtra los marcadores visibles en el mapa en base a los controles facetados
     * @param {Object} options Opciones de filtrado (p. ej. forceFitBounds: true)
     */
    function filterMapMarkers(options = {}) {
        if (typeof document === 'undefined') return;
        const mg = (typeof markersGroup !== 'undefined') ? markersGroup : (typeof window !== 'undefined' ? window.markersGroup : null);
        const mm = (typeof markerMap !== 'undefined') ? markerMap : (typeof window !== 'undefined' ? window.markerMap : null);
        const locs = (typeof mapLocations !== 'undefined') ? mapLocations : (typeof window !== 'undefined' ? window.mapLocations : []);
        const tdRecords = (typeof tdOmsRecords !== 'undefined') ? tdOmsRecords : (typeof window !== 'undefined' ? window.tdOmsRecords : []);
        const map = (typeof leafletMap !== 'undefined' && leafletMap) || (typeof window !== 'undefined' && window.leafletMap);

        const searchTypeEl = document.getElementById("searchTypeMap");
        const searchType = searchTypeEl ? searchTypeEl.value : "ticket";
        const inputTicketEl = document.getElementById("inputTicket");
        const query = inputTicketEl ? inputTicketEl.value.trim().toLowerCase() : "";

        const mapDia = (typeof mapCtrlDia !== 'undefined') ? mapCtrlDia : (typeof window !== 'undefined' ? window.mapCtrlDia : null);
        const mapEst = (typeof mapCtrlEstado !== 'undefined') ? mapCtrlEstado : (typeof window !== 'undefined' ? window.mapCtrlEstado : null);
        const mapEmp = (typeof mapCtrlEmpresa !== 'undefined') ? mapCtrlEmpresa : (typeof window !== 'undefined' ? window.mapCtrlEmpresa : null);
        const mapFal = (typeof mapCtrlFalla !== 'undefined') ? mapCtrlFalla : (typeof window !== 'undefined' ? window.mapCtrlFalla : null);

        const selDias = mapDia ? mapDia.getSelected() : [];
        const selEsts = mapEst ? mapEst.getSelected() : [];
        const selEmps = mapEmp ? mapEmp.getSelected() : [];
        const selFallas = mapFal ? mapFal.getSelected() : [];

        const chk7 = document.getElementById("chk7LlamadasMap");
        const only7Llamadas = chk7 ? chk7.checked : false;
        const chkSed = document.getElementById("chkReincSedMap");
        const onlyReincSed = chkSed ? chkSed.checked : false;
        const chkSum = document.getElementById("chkReincSuminMap");
        const onlyReincSum = chkSum ? chkSum.checked : false;
        const isAdmin = typeof isCurrentUserAdmin === 'function' ? isCurrentUserAdmin() : (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('oms_user_role') === 'admin');
        const chkCrit = document.getElementById("chkCriticaMap");
        const onlyCritica = isAdmin && chkCrit ? chkCrit.checked : false;

        if (mg && typeof mg.clearLayers === 'function') mg.clearLayers();
        let count = 0;
        const visibleBounds = [];
        const bounds = visibleBounds;
        const visibleLocations = [];
        const markersToAdd = [];

        function matchesCurrentMapFilter(item) {
            let matchQuery = true;
            if (query && searchType === "ticket") {
                matchQuery = true;
            } else if (query && searchType === "sed") {
                matchQuery = String(item.sed || '').toLowerCase().includes(query);
            } else if (query && searchType === "alimentador") {
                matchQuery = String(item.alimentador || '').toLowerCase().includes(query);
            }

            const matchDia = (typeof matchesMultiSelection === 'function') ? matchesMultiSelection(item.dia, selDias) : true;
            const matchEst = (typeof matchesMultiSelection === 'function') ? matchesMultiSelection(item.estado, selEsts) : true;
            const matchEmp = (typeof matchesMultiSelection === 'function') ? matchesMultiSelection(item.empresa, selEmps) : true;
            const matchFal = (typeof matchesMultiSelection === 'function') ? matchesMultiSelection(item.falla, selFallas) : true;
            const numLlamadas = parseInt(item.llamadas || 0, 10) || 0;
            const matchLlamadas = !only7Llamadas || numLlamadas >= 7;
            const matchSed = !onlyReincSed || (item.sed_reincidente || item.sed_count > 2);
            const matchSum = !onlyReincSum || (item.suministro_reincidente || item.suministro_count >= 2);
            const isTopCrit = isAdmin && (typeof isTopCriticalSed === 'function' ? isTopCriticalSed(item.sed) : !!item.es_top_critica);
            const matchCrit = !onlyCritica || isTopCrit;

            return matchQuery && matchDia && matchEst && matchEmp && matchFal && matchLlamadas && matchSed && matchSum && matchCrit;
        }

        const allRecordsSource = (tdRecords && tdRecords.length > 0) ? tdRecords : locs;
        allRecordsSource.forEach(record => {
            if (matchesCurrentMapFilter(record)) {
                count++;
            }
        });

        locs.forEach(loc => {
            if (matchesCurrentMapFilter(loc)) {
                const key = String(loc.ticket || '').toLowerCase();
                if (mm && mm.has(key)) {
                    const markerObj = mm.get(key).marker;
                    markersToAdd.push(markerObj);
                    visibleBounds.push([loc.lat, loc.lon]);
                    visibleLocations.push(loc);
                }
            }
        });

        if (markersToAdd.length > 0 && mg) {
            if (typeof mg.addLayers === 'function') {
                mg.addLayers(markersToAdd);
            } else if (typeof mg.addLayer === 'function') {
                markersToAdd.forEach(m => mg.addLayer(m));
            }
        }

        if (bounds.length > 0 && (!query || searchType !== "ticket")) {
            if (visibleBounds.length > 0 && (!window._mapInitialBoundsFitted || options.forceFitBounds === true)) {
                if (map && typeof map.fitBounds === 'function') {
                    map.fitBounds(visibleBounds, { padding: [50, 50], maxZoom: 16 });
                }
                window._mapInitialBoundsFitted = true;
            }
        }

        const topNavEl = document.getElementById("topNavCount");
        if (topNavEl) {
            const noGpsCount = count - visibleLocations.length;
            if (noGpsCount > 0) {
                topNavEl.title = `Total: ${count} incidencias (${visibleLocations.length} en mapa, ${noGpsCount} sin coordenadas GPS)`;
            } else {
                topNavEl.title = `Total: ${count} incidencias pendientes`;
            }
            topNavEl.innerText = count > 0 ? `🚨 ${count}` : '0';
        }

        if (typeof renderSedPerimeters === 'function') {
            renderSedPerimeters(visibleLocations);
        } else if (root.SedCloudsManager && typeof root.SedCloudsManager.renderSedPerimeters === 'function') {
            root.SedCloudsManager.renderSedPerimeters(visibleLocations);
        }
    }

    if (typeof window !== 'undefined') {
        window.setupMapMarkers = setupMapMarkers;
        window.renderMapMarkers = setupMapMarkers;
        window.filterMapMarkers = filterMapMarkers;
    }

    return {
        setupMapMarkers,
        filterMapMarkers,
        getMarkerIcon,
        createMarkerIcon: getMarkerIcon
    };
}));
