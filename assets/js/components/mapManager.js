/**
 * OMS Map Manager
 * Handles Leaflet map lifecycle, tile base layers, floating controls,
 * address & coordinate searching (Nominatim geocoder), and ticket focus.
 * UMD / Browser friendly.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.MapManager = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.MapManager = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
    'use strict';

    let baseLayersControl = null;
    let activeBaseLayer = null;
    let addressSearchMarker = null;
    let addressSearchLayer = null;
    let addressSearchTicketKeys = null;
    let addressPendingCandidates = [];
    let userLocationMarker = null;
    let userLocationAccuracy = null;
    const ADDRESS_SEARCH_RADIUS_METERS = 500;

    function getEscapeHtml() {
        if (typeof root !== 'undefined' && typeof root.escapeHtml === 'function') return root.escapeHtml;
        if (typeof root !== 'undefined' && root.DomUtils && typeof root.DomUtils.escapeHtml === 'function') return root.DomUtils.escapeHtml;
        if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') return window.escapeHtml;
        return (val) => String(val || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[c]));
    }

    /**
     * Aplica y conmuta capas base de CARTO, OSM y Esri
     * @param {string} cartoKey API Key opcional de CARTO
     */
    function applyBaseLayers(cartoKey) {
        const map = (typeof leafletMap !== 'undefined' && leafletMap) || (typeof window !== 'undefined' && window.leafletMap);
        if (!map || typeof L === 'undefined') return;

        let key = (cartoKey || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('oms_carto_key')) || '').trim();
        if (key === 'undefined' || key === 'null') {
            key = '';
        }

        if (key && typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('oms_carto_key', key);
            console.log("🗺️ [CARTO Basemaps] Capa base configurada con Key:", `${key.substring(0, 8)}...`);
        }

        const cleanKey = encodeURIComponent(key);
        const keyParam = key ? `?key=${cleanKey}&api_key=${cleanKey}` : '';

        const voyagerLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${keyParam}`, {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        });

        const positronLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png${keyParam}`, {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        });

        const darkLayer = L.tileLayer(`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${keyParam}`, {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        });

        const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        });

        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri',
            maxZoom: 19
        });

        if (activeBaseLayer) {
            try { map.removeLayer(activeBaseLayer); } catch(e) {}
        }
        activeBaseLayer = voyagerLayer;
        activeBaseLayer.addTo(map);

        if (baseLayersControl) {
            try { map.removeControl(baseLayersControl); } catch(e) {}
        }

        const baseMaps = {
            "🗺️ CARTO Voyager": voyagerLayer,
            "☀️ CARTO Claro (Positron)": positronLayer,
            "🌙 CARTO Oscuro (Dark)": darkLayer,
            "🌍 OpenStreetMap": osmLayer,
            "🛰️ Satélite (Esri)": satelliteLayer
        };

        baseLayersControl = L.control.layers(baseMaps, null, { position: 'topright', collapsed: true }).addTo(map);
    }

    /**
     * Inicializa la instancia principal de Leaflet
     */
    function initMap() {
        if (typeof leafletMap !== 'undefined' && leafletMap) return leafletMap;
        if (typeof window !== 'undefined' && window.leafletMap) return window.leafletMap;
        if (typeof L === 'undefined') return null;

        const mapInstance = L.map('map', {
            zoomControl: false,
            preferCanvas: true,
            autoPanPaddingTopLeft: L.point(16, 120),
            autoPanPaddingBottomRight: L.point(16, 70)
        }).setView([-12.046374, -77.042793], 11);

        if (typeof leafletMap !== 'undefined') leafletMap = mapInstance;
        if (typeof window !== 'undefined') window.leafletMap = mapInstance;

        applyBaseLayers(typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('oms_carto_key') || '' : '');
        L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);
        initLocateControl();

        const clusterMaxZoom = (typeof MAP_CLUSTER_MAX_ZOOM !== 'undefined') ? MAP_CLUSTER_MAX_ZOOM : 12;
        const mg = L.markerClusterGroup({
            disableClusteringAtZoom: clusterMaxZoom,
            maxClusterRadius: 54,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: false,
            zoomToBoundsOnClick: true,
            animate: false,
            removeOutsideVisibleBounds: true,
            chunkedLoading: true,
            chunkInterval: 80,
            chunkDelay: 20,
            iconCreateFunction(cluster) {
                const count = cluster.getChildCount();
                const size = count >= 100 ? 'large' : count >= 20 ? 'medium' : 'small';
                return L.divIcon({
                    html: `<span>${count}</span>`,
                    className: `oms-marker-cluster oms-marker-cluster--${size}`,
                    iconSize: L.point(44, 44)
                });
            }
        }).addTo(mapInstance);

        if (typeof markersGroup !== 'undefined') markersGroup = mg;
        if (typeof window !== 'undefined') window.markersGroup = mg;

        const sedGroup = L.layerGroup().addTo(mapInstance);
        if (typeof sedPerimetersGroup !== 'undefined') sedPerimetersGroup = sedGroup;
        if (typeof window !== 'undefined') window.sedPerimetersGroup = sedGroup;

        mapInstance.on('zoomend', () => {
            if (typeof syncSedCloudLabelVisibility === 'function') {
                syncSedCloudLabelVisibility();
            } else if (root.SedCloudsManager && typeof root.SedCloudsManager.syncSedCloudLabelVisibility === 'function') {
                root.SedCloudsManager.syncSedCloudLabelVisibility();
            }
        });

        return mapInstance;
    }

    /**
     * Muestra notificación de búsqueda de dirección
     */
    function showMapNotice(message, tone = 'warning') {
        const resBox = typeof document !== 'undefined' ? document.getElementById('addressResultBox') : null;
        if (!resBox) return;
        syncAddressResultPosition();
        const escapeHtml = getEscapeHtml();
        const safeMsg = escapeHtml(String(message ?? ''));
        const color = tone === 'error' ? '#f87171' : (tone === 'warning' ? '#fbbf24' : '#7dd3fc');
        resBox.style.display = 'block';
        resBox.innerHTML = `<span style="color:${color}; font-weight:700;">${safeMsg}</span>`;
    }

    function getMapToolbarBottom() {
        if (typeof document === 'undefined') return 0;
        const toolbar = document.getElementById('mapSearchToolbar');
        return toolbar ? Math.ceil(toolbar.getBoundingClientRect().bottom) : 0;
    }

    function syncAddressResultPosition() {
        if (typeof document === 'undefined') return;
        const resBox = document.getElementById('addressResultBox');
        if (!resBox) return;
        resBox.style.setProperty('--address-result-top', `${getMapToolbarBottom() + 10}px`);
    }

    function wireAddressResultToggle(resBox) {
        const button = resBox?.querySelector('[data-address-result-toggle]');
        if (!button) return;
        button.addEventListener('click', () => {
            const collapsed = resBox.classList.toggle('is-collapsed');
            button.setAttribute('aria-expanded', String(!collapsed));
            button.textContent = collapsed ? '▾' : '▴';
            button.title = collapsed ? 'Expandir resultados' : 'Contraer resultados';
            button.setAttribute('aria-label', button.title);
        });
    }

    function collapseMobileFiltersAfterAddressSearch() {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        if (window.innerWidth > 768) return;
        const wrapper = document.getElementById('mapFilterContentWrapper');
        const icon = document.getElementById('mobileFilterIcon');
        if (!wrapper || wrapper.classList.contains('collapsed-mobile')) return;
        wrapper.classList.add('collapsed-mobile');
        if (icon) icon.textContent = '▲';
    }

    function initLocateControl() {
        const map = (typeof leafletMap !== 'undefined' && leafletMap) || (typeof window !== 'undefined' && window.leafletMap);
        if (!map || typeof L === 'undefined') return;
        const LocateControl = L.Control.extend({
            options: { position: 'topright' },
            onAdd: function() {
                const container = L.DomUtil.create('div', 'map-locate-control leaflet-bar');
                const button = L.DomUtil.create('button', '', container);
                button.type = 'button';
                button.title = 'Usar mi ubicación actual';
                button.setAttribute('aria-label', 'Usar mi ubicación actual');
                button.innerHTML = '📍';
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.on(button, 'click', locateUser);
                return container;
            }
        });
        new LocateControl().addTo(map);
    }

    function locateUser() {
        if (typeof document === 'undefined' || typeof navigator === 'undefined') return;
        const controlButton = document.querySelector('.map-locate-control button');
        const map = (typeof leafletMap !== 'undefined' && leafletMap) || (typeof window !== 'undefined' && window.leafletMap);

        if (!navigator.geolocation) {
            showMapNotice('⚠️ Este dispositivo no permite obtener la ubicación.', 'error');
            return;
        }
        const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
        if (typeof window !== 'undefined' && !window.isSecureContext && !isLocal) {
            showMapNotice('⚠️ La ubicación requiere abrir el OMS Map mediante HTTPS.', 'error');
            return;
        }

        if (controlButton) {
            controlButton.classList.add('is-loading');
            controlButton.innerHTML = '⏳';
            controlButton.setAttribute('aria-busy', 'true');
        }

        navigator.geolocation.getCurrentPosition(position => {
            const lat = Number(position.coords.latitude);
            const lon = Number(position.coords.longitude);
            const accuracy = Math.max(10, Number(position.coords.accuracy) || 50);

            if (userLocationMarker && map) map.removeLayer(userLocationMarker);
            if (userLocationAccuracy && map) map.removeLayer(userLocationAccuracy);

            if (map && typeof L !== 'undefined') {
                userLocationAccuracy = L.circle([lat, lon], {
                    radius: accuracy,
                    color: '#2563eb',
                    weight: 1,
                    fillColor: '#60a5fa',
                    fillOpacity: 0.16
                }).addTo(map);
                userLocationMarker = L.circleMarker([lat, lon], {
                    radius: 8,
                    color: '#ffffff',
                    weight: 3,
                    fillColor: '#2563eb',
                    fillOpacity: 1
                }).addTo(map);
                userLocationMarker.bindPopup(`<b>📍 Mi ubicación</b><br>Precisión aproximada: ${Math.round(accuracy)} m`).openPopup();
                map.setView([lat, lon], Math.max(15, map.getZoom()));
            }

            if (controlButton) {
                controlButton.classList.remove('is-loading');
                controlButton.innerHTML = '📍';
                controlButton.setAttribute('aria-busy', 'false');
            }
        }, error => {
            const messages = {
                1: 'Permiso de ubicación denegado. Actívalo en el navegador para continuar.',
                2: 'No se pudo determinar tu ubicación. Verifica el GPS o la señal.',
                3: 'La búsqueda de ubicación tardó demasiado. Intenta nuevamente.'
            };
            showMapNotice(`⚠️ ${messages[error.code] || 'No se pudo obtener tu ubicación.'}`, 'error');
            if (controlButton) {
                controlButton.classList.remove('is-loading');
                controlButton.innerHTML = '📍';
                controlButton.setAttribute('aria-busy', 'false');
            }
        }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    }

    function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const p1 = lat1 * Math.PI / 180;
        const p2 = lat2 * Math.PI / 180;
        const dp = (lat2 - lat1) * Math.PI / 180;
        const dl = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
        return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function normalizeAddressText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9Ñ ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function recordAddressText(record) {
        return normalizeAddressText(`${record.direccion || ''} ${record.distrito || ''}`);
    }

    function recordMatchesAddress(record, query) {
        const q = normalizeAddressText(query);
        return Boolean(q && recordAddressText(record).includes(q));
    }

    function parsearCoordenadas(texto) {
        const match = String(texto || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*(?:,|;|\s+)\s*(-?\d+(?:\.\d+)?)$/);
        if (!match) return null;
        const lat = Number(match[1]);
        const lon = Number(match[2]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            throw new Error('Las coordenadas no son válidas. Usa latitud y longitud dentro de sus rangos permitidos.');
        }
        return { lat, lon };
    }

    function clearAddressSearchVisuals() {
        const map = (typeof leafletMap !== 'undefined' && leafletMap) || (typeof window !== 'undefined' && window.leafletMap);
        if (addressSearchMarker && map) map.removeLayer(addressSearchMarker);
        if (addressSearchLayer && map) map.removeLayer(addressSearchLayer);
        addressSearchMarker = null;
        addressSearchLayer = null;
    }

    /**
     * Enfoca un ticket u orden en el mapa mediante flyTo, abriendo su popup con efecto pulsante
     * @param {string} rawQuery Ticket u ODM a enfocar
     * @param {boolean} notifyIfNotFound Muestra notificación si no existe
     * @returns {boolean} True si se encontró y enfocó el ticket
     */
    function focusTicketInMap(rawQuery, notifyIfNotFound = false) {
        if (!rawQuery) {
            if (notifyIfNotFound && typeof showAppNotification === 'function') {
                showAppNotification('⚠️ Escribe un número de Ticket o ODM.', 'warning');
            }
            return false;
        }
        const query = String(rawQuery).trim().toLowerCase();
        if (!query) return false;

        const locs = (typeof mapLocations !== 'undefined') ? mapLocations : (typeof window !== 'undefined' ? window.mapLocations : []);
        const mm = (typeof markerMap !== 'undefined') ? markerMap : (typeof window !== 'undefined' ? window.markerMap : null);
        const mg = (typeof markersGroup !== 'undefined') ? markersGroup : (typeof window !== 'undefined' ? window.markersGroup : null);
        const map = (typeof leafletMap !== 'undefined' && leafletMap) || (typeof window !== 'undefined' && window.leafletMap);

        // 1. Buscar coincidencia exacta por Ticket
        let match = (locs || []).find(l => String(l.ticket || '').trim().toLowerCase() === query);

        // 2. Si no, buscar coincidencia exacta por ODM
        if (!match) {
            match = (locs || []).find(l => String(l.odm || '').trim().toLowerCase() === query);
        }

        // 3. Coincidencias parciales si query >= 4 caracteres
        if (!match && query.length >= 4) {
            const partialMatches = (locs || []).filter(l => {
                const t = String(l.ticket || '').toLowerCase();
                const o = String(l.odm || '').toLowerCase();
                return t.includes(query) || o.includes(query);
            });
            if (partialMatches.length === 1) {
                match = partialMatches[0];
            } else if (partialMatches.length > 1) {
                const prefixMatch = partialMatches.find(l => 
                    String(l.ticket || '').toLowerCase().startsWith(query) || 
                    String(l.odm || '').toLowerCase().startsWith(query)
                );
                match = prefixMatch || partialMatches[0];
                if (notifyIfNotFound && typeof showAppNotification === 'function') {
                    showAppNotification(`Se encontraron ${partialMatches.length} coincidencias. Enfocando Ticket #${match.ticket}`, 'info');
                }
            }
        }

        if (!match) {
            if (notifyIfNotFound && typeof showAppNotification === 'function') {
                showAppNotification(`Ticket u ODM "${rawQuery}" no encontrado en el mapa en vivo.`, 'warning');
            }
            return false;
        }

        const targetKey = String(match.ticket || '').toLowerCase();
        const target = mm ? mm.get(targetKey) : null;

        if (!target || !target.marker) {
            if (notifyIfNotFound && typeof showAppNotification === 'function') {
                showAppNotification(`El marcador del ticket #${match.ticket} no está disponible en el mapa.`, 'warning');
            }
            return false;
        }

        if (mg && !mg.hasLayer(target.marker)) {
            mg.addLayer(target.marker);
        }

        const executeFocus = () => {
            if (map) {
                map.flyTo([match.lat, match.lon], 17, { animate: true, duration: 0.8 });
                setTimeout(() => {
                    target.marker.openPopup();
                    if (target.marker._icon) {
                        target.marker._icon.classList.add('marker-highlight-pulse');
                        setTimeout(() => {
                            target.marker._icon?.classList.remove('marker-highlight-pulse');
                        }, 3500);
                    }
                }, 850);
            }
        };

        if (mg && typeof mg.zoomToShowLayer === 'function') {
            mg.zoomToShowLayer(target.marker, executeFocus);
        } else {
            executeFocus();
        }

        return true;
    }

    function navigateToTicketOnMap(ticketOrOdm) {
        if (typeof document !== 'undefined') {
            const inputTicket = document.getElementById("inputTicket");
            const searchTypeMap = document.getElementById("searchTypeMap");
            if (inputTicket) inputTicket.value = ticketOrOdm;
            if (searchTypeMap) searchTypeMap.value = "ticket";
        }
        return focusTicketInMap(ticketOrOdm, false);
    }

    function focusAddressTicket(ticketKey) {
        focusTicketInMap(ticketKey, false);
    }

    function getGeocoderDistrict(result) {
        const address = result?.address || {};
        return address.city_district || address.district || address.municipality || address.suburb || address.town || address.city || address.county || 'Distrito no identificado';
    }

    function getLocalAddressMatches(query, districtFilter = '') {
        const records = (typeof tdOmsRecords !== 'undefined') ? tdOmsRecords : (typeof window !== 'undefined' ? window.tdOmsRecords : []);
        const normalizedDistrict = normalizeAddressText(districtFilter);
        return (records || []).filter(record => recordMatchesAddress(record, query)).filter(record => {
            if (!normalizedDistrict) return true;
            return normalizeAddressText(record.distrito || '').includes(normalizedDistrict);
        });
    }

    function buildAddressCandidates(query, geocoderResults, districtFilter = '') {
        const candidates = [];
        const groups = new Map();
        const normalizedDistrict = normalizeAddressText(districtFilter);
        const results = geocoderResults.filter(result => {
            if (!normalizedDistrict) return true;
            return normalizeAddressText(getGeocoderDistrict(result)).includes(normalizedDistrict) ||
                normalizeAddressText(result.display_name).includes(normalizedDistrict);
        });

        results.forEach(result => {
            const lat = Number(result.lat);
            const lon = Number(result.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            const district = getGeocoderDistrict(result);
            const road = result.address?.road || query;
            const groupKey = `${normalizeAddressText(result.display_name)}|${normalizeAddressText(district)}`;
            if (!groups.has(groupKey)) {
                groups.set(groupKey, { query, district, road, results: [], first: result, lat, lon });
            }
            groups.get(groupKey).results.push(result);
        });

        const localMatches = getLocalAddressMatches(query, districtFilter);
        const localGroups = new Map();
        localMatches.forEach(record => {
            const district = String(record.distrito || record.distrito2 || 'Distrito no identificado').trim() || 'Distrito no identificado';
            const key = normalizeAddressText(district);
            if (!localGroups.has(key)) localGroups.set(key, { district, records: [] });
            localGroups.get(key).records.push(record);
        });

        groups.forEach(group => {
            const districtKey = normalizeAddressText(group.district);
            const matchingLocal = localGroups.get(districtKey)?.records || [];
            candidates.push({
                query,
                districtFilter,
                district: group.district,
                label: group.first.display_name,
                streetKey: group.road,
                lat: group.lat,
                lon: group.lon,
                localMatchCount: matchingLocal.length
            });
        });

        localGroups.forEach(group => {
            const districtKey = normalizeAddressText(group.district);
            const alreadyCovered = candidates.some(candidate => normalizeAddressText(candidate.district) === districtKey);
            const locatable = group.records.find(record => Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lon)));
            if (!alreadyCovered && locatable) {
                candidates.push({
                    query,
                    districtFilter,
                    district: group.district,
                    label: `Coincidencia OMS: ${query}, ${group.district}`,
                    streetKey: query,
                    lat: Number(locatable.lat),
                    lon: Number(locatable.lon),
                    localMatchCount: group.records.length
                });
            }
        });

        return candidates.slice(0, 12);
    }

    function renderAddressCandidateChoices(candidates) {
        if (typeof document === 'undefined') return;
        const resBox = document.getElementById('addressResultBox');
        if (!resBox) return;
        const escapeHtml = getEscapeHtml();
        addressPendingCandidates = candidates;
        addressSearchTicketKeys = new Set();
        clearAddressSearchVisuals();
        if (typeof filterMapMarkers === 'function') filterMapMarkers();
        resBox.style.display = 'block';
        resBox.innerHTML = `
            <div class="address-result-heading">
                <div><div style="font-weight:700; color:#7dd3fc;">🔎 Se encontraron varias ubicaciones</div></div>
                <button type="button" class="address-result-toggle" data-address-result-toggle aria-expanded="true" aria-label="Contraer resultados" title="Contraer resultados">▴</button>
            </div>
            <div class="address-result-body">
                <div style="font-size:10px; color:#cbd5e1; margin-top:3px;">Elige la ubicación correcta para continuar:</div>
                <div class="address-result-list">
                ${candidates.map((candidate, index) => `
                    <button type="button" class="address-ticket-result" data-address-candidate="${index}">
                        <span>📍 <b>${escapeHtml(candidate.district)}</b><br><small>${escapeHtml(candidate.label)}</small></span>
                        <small>${candidate.localMatchCount ? `🎫 ${candidate.localMatchCount} OMS` : '🗺️ Ver aquí'}</small>
                    </button>
                `).join('')}
                </div>
            </div>
        `;
        collapseMobileFiltersAfterAddressSearch();
        wireAddressResultToggle(resBox);
        resBox.querySelectorAll('[data-address-candidate]').forEach(button => {
            button.addEventListener('click', () => {
                const candidate = addressPendingCandidates[Number(button.dataset.addressCandidate)];
                if (candidate) applyAddressCandidate(candidate);
            });
        });
    }

    function renderAddressResults({ locationLabel, district, lat, lon, radius, exactMatches, nearbyMatches, noCoordinateCount }) {
        if (typeof document === 'undefined') return;
        const resBox = document.getElementById('addressResultBox');
        if (!resBox) return;
        const escapeHtml = getEscapeHtml();
        const exactKeys = new Set(exactMatches.map(record => String(record.ticket || '').toLowerCase()).filter(Boolean));
        const nearbyKeys = new Set(nearbyMatches.map(item => String(item.r.ticket || '').toLowerCase()).filter(Boolean));
        addressSearchTicketKeys = new Set([...exactKeys, ...nearbyKeys]);
        if (typeof filterMapMarkers === 'function') filterMapMarkers();

        const nearbyOnly = nearbyMatches.filter(item => !exactKeys.has(String(item.r.ticket || '').toLowerCase()));
        const exactLabel = 'Misma dirección';
        const results = [
            ...exactMatches.map(record => ({ record, label: exactLabel, distance: null })),
            ...nearbyOnly.map(item => ({ record: item.r, label: 'Cercano', distance: item.d }))
        ];
        const visibleResults = results.slice(0, 20);
        syncAddressResultPosition();

        resBox.style.display = 'block';
        resBox.innerHTML = `
            <div class="address-result-heading">
                <div style="font-weight:700; color:#7dd3fc;">📍 ${escapeHtml(locationLabel)}</div>
                <button type="button" class="address-result-toggle" data-address-result-toggle aria-expanded="true" aria-label="Contraer resultados" title="Contraer resultados">▴</button>
            </div>
            <div class="address-result-body">
                ${district ? `<div style="font-size:10px; color:#fbbf24; margin-top:3px;">Distrito seleccionado: ${escapeHtml(district)}</div>` : ''}
                <div style="font-size:10px; color:#cbd5e1; margin-top:3px;">Se encontraron coincidencias de dirección y tickets cercanos.</div>
                <div class="address-result-summary">
                <span class="address-result-chip">🎫 ${exactMatches.length} misma dirección</span>
                <span class="address-result-chip">🚨 ${nearbyOnly.length} cercanos</span>
                ${noCoordinateCount ? `<span class="address-result-chip">⚠️ ${noCoordinateCount} sin coordenadas</span>` : ''}
                <span class="address-result-chip">Radio ${radius} m</span>
                </div>
                ${visibleResults.length ? `<div class="address-result-list">
                ${visibleResults.map(item => `
                    <button type="button" class="address-ticket-result" data-address-ticket="${escapeHtml(String(item.record.ticket || '').toLowerCase())}">
                        <span>🎫 <b>${escapeHtml(item.record.ticket)}</b> · ${escapeHtml(item.label)}<br><small>${escapeHtml(item.record.direccion || 'Sin dirección')}</small></span>
                        ${item.distance === null ? '<small>dirección</small>' : `<small>${Math.round(item.distance)} m</small>`}
                    </button>
                `).join('')}
            </div>` : '<div style="color:#cbd5e1; margin-top:8px;">No se encontraron tickets en la dirección o radio indicado.</div>'}
            ${results.length > visibleResults.length ? `<div style="color:#94a3b8; margin-top:5px;">Mostrando ${visibleResults.length} de ${results.length} resultados.</div>` : ''}
            ${noCoordinateCount ? '<div style="color:#fbbf24; margin-top:6px;">Los tickets sin coordenadas se muestran aquí, pero no pueden dibujarse en el mapa.</div>' : ''}
                <div style="margin-top:8px; display:flex; gap:8px; justify-content:center; align-items:center;">
                <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" style="color:#4ade80; font-weight:700; text-decoration:underline;">🗺️ Google Maps</a>
                <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" target="_blank" title="Trazar Ruta en Google Maps" style="color:#38bdf8; font-weight:700; font-size:14px; text-decoration:none;">🚗</a>
                </div>
            </div>
        `;
        collapseMobileFiltersAfterAddressSearch();
        wireAddressResultToggle(resBox);
        resBox.querySelectorAll('[data-address-ticket]').forEach(button => {
            button.addEventListener('click', () => focusAddressTicket(button.dataset.addressTicket));
        });
    }

    function applyAddressCandidate(candidate) {
        const { query } = candidate;
        const radius = ADDRESS_SEARCH_RADIUS_METERS;
        const hasPoint = Number.isFinite(Number(candidate.lat)) && Number.isFinite(Number(candidate.lon));
        const map = (typeof leafletMap !== 'undefined' && leafletMap) || (typeof window !== 'undefined' && window.leafletMap);
        const escapeHtml = getEscapeHtml();
        addressPendingCandidates = [];
        clearAddressSearchVisuals();

        if (hasPoint && map && typeof L !== 'undefined') {
            const searchIcon = L.divIcon({
                className: 'custom-address-pin',
                html: '<div style="font-size:28px; text-shadow:0 2px 6px rgba(0,0,0,0.5);">📍</div>',
                iconSize: [32, 32],
                iconAnchor: [16, 32]
            });
            addressSearchMarker = L.marker([candidate.lat, candidate.lon], { icon: searchIcon, title: 'Ubicación buscada' }).addTo(map);
            addressSearchMarker.bindPopup(`<b>📍 Ubicación buscada:</b><br>${escapeHtml(candidate.label)}`, {
                autoPanPaddingTopLeft: [16, getMapToolbarBottom() + 16]
            });
        }

        const candidateDistrict = normalizeAddressText(candidate.districtFilter || candidate.district || '');
        const useDistrict = candidateDistrict && !['LIMA', 'LIMA METROPOLITANA', 'PERU', 'DISTRITO NO IDENTIFICADO', 'COORDENADAS INGRESADAS'].includes(candidateDistrict);
        const tdRecords = (typeof tdOmsRecords !== 'undefined') ? tdOmsRecords : (typeof window !== 'undefined' ? window.tdOmsRecords : []);
        const mapLocs = (typeof mapLocations !== 'undefined') ? mapLocations : (typeof window !== 'undefined' ? window.mapLocations : []);

        const exactMatches = (tdRecords || []).filter(record => {
            const matchesQuery = recordMatchesAddress(record, query);
            const matchesDistrict = !useDistrict || normalizeAddressText(record.distrito || '').includes(candidateDistrict);
            return matchesQuery && matchesDistrict;
        });
        const noCoordinateCount = exactMatches.filter(record => !Number.isFinite(Number(record.lat)) || !Number.isFinite(Number(record.lon))).length;
        const nearbyMatches = hasPoint ? mapLocs.map(record => ({
            r: record,
            d: calcularDistanciaMetros(candidate.lat, candidate.lon, Number(record.lat), Number(record.lon))
        })).filter(item => Number.isFinite(item.d) && item.d <= radius).sort((a, b) => a.d - b.d) : [];

        renderAddressResults({
            locationLabel: candidate.label,
            district: candidate.district,
            lat: candidate.lat,
            lon: candidate.lon,
            radius,
            exactMatches,
            nearbyMatches,
            noCoordinateCount
        });
        if (hasPoint && map) {
            map.setView([candidate.lat, candidate.lon], 16);
            addressSearchMarker?.openPopup();
        }
    }

    async function buscarDireccionEnMapa() {
        if (typeof document === 'undefined') return;
        const inputTicketEl = document.getElementById('inputTicket');
        const query = inputTicketEl ? inputTicketEl.value.trim() : '';
        const resBox = document.getElementById('addressResultBox');
        const radius = ADDRESS_SEARCH_RADIUS_METERS;
        const districtFilter = '';
        if (!resBox) return;

        if (!query) {
            showMapNotice('⚠️ Escribe una dirección, calle o referencia urbana.', 'error');
            return;
        }

        resBox.style.display = 'block';
        resBox.innerHTML = '🔎 Buscando ubicaciones, distritos y tickets...';
        addressSearchTicketKeys = null;
        addressPendingCandidates = [];
        clearAddressSearchVisuals();

        try {
            const coordenadas = parsearCoordenadas(query);
            if (coordenadas) {
                applyAddressCandidate({
                    query,
                    radius,
                    districtFilter,
                    district: districtFilter || 'Coordenadas ingresadas',
                    label: `Coordenadas: ${coordenadas.lat}, ${coordenadas.lon}`,
                    streetKey: query,
                    lat: coordenadas.lat,
                    lon: coordenadas.lon,
                });
                return;
            }

            const resultados = [];
            const geocoderQueries = [query];
            for (let index = 0; index < geocoderQueries.length; index++) {
                if (index > 0) await new Promise(resolve => setTimeout(resolve, 1100));
                const params = new URLSearchParams({
                    format: 'jsonv2',
                    limit: '20',
                    countrycodes: 'pe',
                    addressdetails: '1',
                    q: `${geocoderQueries[index]}${districtFilter ? `, ${districtFilter}` : ''}, Lima, Perú`
                });
                const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { headers: { 'Accept-Language': 'es' } });
                if (!resp.ok) throw new Error('No se pudo consultar el servicio de mapas');
                const entries = await resp.json();
                resultados.push(...(Array.isArray(entries) ? entries : []));
            }
            const uniqueResults = [...new Map(resultados.map(result => [
                result.osm_type && result.osm_id ? `${result.osm_type}:${result.osm_id}` : result.display_name,
                result
            ])).values()];
            const candidates = buildAddressCandidates(query, uniqueResults, districtFilter);
            if (!candidates.length) throw new Error('No se encontró una ubicación utilizable para esa búsqueda.');
            if (candidates.length > 1) {
                renderAddressCandidateChoices(candidates);
                return;
            }
            applyAddressCandidate({ ...candidates[0], radius });
        } catch (err) {
            addressSearchTicketKeys = null;
            addressPendingCandidates = [];
            const escapeHtml = getEscapeHtml();
            resBox.innerHTML = `<span style="color:#f87171; font-weight:700;">⚠️ ${escapeHtml(err.message)}</span>`;
        }
    }

    function setMapLegendExpanded(expanded, persist = true) {
        if (typeof document === 'undefined') return;
        const legend = document.getElementById('mapEmojiLegend');
        const button = document.getElementById('btnToggleMapLegend');
        if (!legend || !button) return;
        legend.classList.toggle('is-collapsed', !expanded);
        button.setAttribute('aria-expanded', String(expanded));
        if (persist && typeof localStorage !== 'undefined') localStorage.setItem('oms-map-legend-expanded', String(expanded));
    }

    function initMapLegend() {
        if (typeof document === 'undefined') return;
        const button = document.getElementById('btnToggleMapLegend');
        if (!button) return;
        const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('oms-map-legend-expanded') : null;
        const defaultExpanded = typeof window !== 'undefined' ? window.matchMedia('(min-width: 769px)').matches : true;
        setMapLegendExpanded(saved === null ? defaultExpanded : saved === 'true', false);
        button.addEventListener('click', () => {
            setMapLegendExpanded(button.getAttribute('aria-expanded') !== 'true');
        });
    }

    function updateAddressSearchUi() {
        if (typeof document === 'undefined') return;
        const searchTypeMapEl = document.getElementById("searchTypeMap");
        const addressSearchOptionsEl = document.getElementById('addressSearchOptions');
        const inputTicketEl = document.getElementById("inputTicket");
        const isAddress = searchTypeMapEl?.value === 'address';
        if (addressSearchOptionsEl) addressSearchOptionsEl.style.display = isAddress ? 'flex' : 'none';
        if (isAddress && inputTicketEl) {
            inputTicketEl.placeholder = 'Ej. Av. Faucett 200, Callao...';
        }
    }

    return {
        applyBaseLayers,
        initMap,
        locateUser,
        initLocateControl,
        initMapLegend,
        setMapLegendExpanded,
        buscarDireccionEnMapa,
        focusTicketInMap,
        navigateToTicketOnMap,
        focusAddressTicket,
        showMapNotice,
        clearAddressSearchVisuals,
        applyAddressCandidate,
        renderAddressResults,
        renderAddressCandidateChoices,
        buildAddressCandidates,
        getLocalAddressMatches,
        getGeocoderDistrict,
        syncAddressResultPosition,
        wireAddressResultToggle,
        collapseMobileFiltersAfterAddressSearch,
        updateAddressSearchUi,
        ADDRESS_SEARCH_RADIUS_METERS,
        getMapToolbarBottom,
        normalizeAddressText,
        recordAddressText,
        recordMatchesAddress,
        calcularDistanciaMetros,
        parsearCoordenadas
    };
}));
