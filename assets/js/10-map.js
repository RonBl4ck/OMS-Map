        let baseLayersControl = null;
        let activeBaseLayer = null;

        function applyBaseLayers(cartoKey) {
            if (!leafletMap) return;

            let key = (cartoKey || sessionStorage.getItem('oms_carto_key') || '').trim();
            if (!key || key === 'undefined' || key === 'null') {
                key = 'cb1_27lw_1_d612fa2bb664e7fb0d1f742c';
            }

            sessionStorage.setItem('oms_carto_key', key);
            console.log("🗺️ [CARTO Basemaps] Capa base configurada con Key:", `${key.substring(0, 8)}...`);

            const cleanKey = encodeURIComponent(key);
            const keyParam = `?key=${cleanKey}&api_key=${cleanKey}`;

            // Capas Base Disponibles
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
                try { leafletMap.removeLayer(activeBaseLayer); } catch(e) {}
            }
            activeBaseLayer = voyagerLayer;
            activeBaseLayer.addTo(leafletMap);

            if (baseLayersControl) {
                try { leafletMap.removeControl(baseLayersControl); } catch(e) {}
            }

            const baseMaps = {
                "🗺️ CARTO Voyager": voyagerLayer,
                "☀️ CARTO Claro (Positron)": positronLayer,
                "🌙 CARTO Oscuro (Dark)": darkLayer,
                "🌍 OpenStreetMap": osmLayer,
                "🛰️ Satélite (Esri)": satelliteLayer
            };

            baseLayersControl = L.control.layers(baseMaps, null, { position: 'topright', collapsed: true }).addTo(leafletMap);
        }

        // Inicializar Mapa Leaflet
        function initMap() {
            if (leafletMap) return;

            leafletMap = L.map('map', {
                zoomControl: false,
                preferCanvas: true
            }).setView([-12.046374, -77.042793], 11);

            applyBaseLayers(sessionStorage.getItem('oms_carto_key') || '');

            L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);

            initLocateControl();

            markersGroup = L.layerGroup().addTo(leafletMap);
        }

        let mapCtrlEstado, mapCtrlEmpresa, mapCtrlFalla;
        let tdCtrlIntervalo, tdCtrlEmpresa, tdCtrlFalla, tdCtrlEstado;

        function processRawData(data) {
            const assignedContractor = sessionStorage.getItem("oms_assigned_contractor");
            if (assignedContractor && assignedContractor !== "*") {
                const targetEmp = assignedContractor.trim().toUpperCase();
                data = (data || []).filter(item => {
                    const emp = getProp(item, 'Empresa', 'Contratista', 'CONTRATISTA', 'empresa').toUpperCase();
                    return emp.includes(targetEmp);
                });
            }

            rawData = data;
            mapLocations = [];
            tdOmsRecords = [];

            // Detectar Fecha y Hora de la última subida (Día/Mes y Hora)
            let lastUploadTime = "";
            if (data && data.length > 0) {
                lastUploadTime = data[0].FECHA_ACTUALIZACION_SISTEMA || data[0].fecha_actualizacion || data[0].FECHA_ACTUALIZACION || "";
            }
            if (!lastUploadTime) {
                const now = new Date();
                const day = String(now.getDate()).padStart(2, '0');
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                lastUploadTime = `${day}/${month} ${time}`;
            } else if (typeof lastUploadTime === 'string') {
                const dateFullMatch = lastUploadTime.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?\s+(\d{1,2}:\d{2})/);
                if (dateFullMatch) {
                    const day = dateFullMatch[1].padStart(2, '0');
                    const month = dateFullMatch[2].padStart(2, '0');
                    const time = dateFullMatch[3];
                    lastUploadTime = `${day}/${month} ${time}`;
                } else {
                    const matchTime = lastUploadTime.match(/(\d{1,2}:\d{2})(?::\d{2})?/);
                    if (matchTime) {
                        const now = new Date();
                        const day = String(now.getDate()).padStart(2, '0');
                        const month = String(now.getMonth() + 1).padStart(2, '0');
                        lastUploadTime = `${day}/${month} ${matchTime[1]}`;
                    }
                }
            }
            const timeEl = document.getElementById("topNavTime");
            if (timeEl) timeEl.innerText = `🕒 ${lastUploadTime}`;

            data.forEach(item => {
                let lat = NaN;
                let lon = NaN;

                const isZeroZero = (cLat, cLon) => Math.abs(cLat) < 0.0001 && Math.abs(cLon) < 0.0001;

                // 1. Priorizar lectura desde la columna combinada 'Coordenadas' (texto exacto de alta precisión)
                const rawCoord = String(item.Coordenadas || item.Coordenada || item.Coordinates || '').trim();
                if (rawCoord.includes(',')) {
                    const parts = rawCoord.split(',');
                    const cLat = parseFloat(parts[0].trim());
                    const cLon = parseFloat(parts[1].trim());
                    if (!isNaN(cLat) && !isNaN(cLon) && cLat >= -90 && cLat <= 90 && cLon >= -180 && cLon <= 180 && !isZeroZero(cLat, cLon)) {
                        lat = cLat;
                        lon = cLon;
                    }
                }

                // 2. Fallback a columnas separadas Latitud / Longitud si Coordenadas no estaba presente o no era válida
                if (isNaN(lat) || isNaN(lon)) {
                    const fLat = parseFloat(item.Latitud || item.Latitude || item.Lat);
                    const fLon = parseFloat(item.Longitud || item.Longitude || item.Lon);
                    if (!isNaN(fLat) && !isNaN(fLon) && fLat >= -90 && fLat <= 90 && fLon >= -180 && fLon <= 180 && !isZeroZero(fLat, fLon)) {
                        lat = fLat;
                        lon = fLon;
                    }
                }

                const est = getProp(item, 'Estados', 'Estado', 'WO_STATUS_NAME', 'estado');
                const emp = getProp(item, 'Empresa', 'Contratista', 'CONTRATISTA', 'empresa');
                const fal = getProp(item, 'Falla ODM2', 'Falla', 'Punto de Falla', 'Tipo de Equipo probable de falla', 'falla').toUpperCase();
                const ticket = getProp(item, 'Ticket', 'Ticket de Avería', 'ticket');
                
                const rawOdm = getProp(item, 'ODM', 'Orden', 'odm');
                const odm = rawOdm;

                const cadena = getProp(item, 'Cadena', 'cadena');
                const suministro = getProp(item, 'Suministro', 'suministro');
                const fechaIni = getProp(item, 'Hora de inicio', 'Fecha Iniciio', 'Fecha Inicio', 'fecha_inicio');
                const direccion = getProp(item, 'Dirección', 'Direccion', 'direccion');
                const distrito = getProp(item, 'Distrito2', 'Distrito', 'distrito');
                const intervalo = getProp(item, 'Intervalo', 'PERIODO', 'intervalo');
                const dia = getProp(item, 'día', 'Día', 'dia');
                const sed = getProp(item, 'SED', 'sed', 'sed 2', 'sed 3');
                const alimentador = getProp(item, 'Alimentador', 'alimentador', 'ALIMENTADOR', 'ALIMENTADOR MT', 'alimentador mt');
                const afectacion = getProp(item, 'Afectación', 'Afectacin', 'Afectacion', 'afectacion');
                const llamadas = getProp(item, 'Llamadas', 'llamadas');
                const latitudVal = isNaN(lat) ? getProp(item, 'Latitud', 'Latitude', 'Lat') : lat;
                const longitudVal = isNaN(lon) ? getProp(item, 'Longitud', 'Longitude', 'Lon') : lon;

                const rawSedCount = getProp(item, 'Conteo_Fallas_SED_7D', 'Fallas_SED_7D');
                const sedCount = parseInt(rawSedCount, 10) || 0;
                const sedReincidenteStr = getProp(item, 'SED_Reincidente_>2', 'SED_Reincidente');
                const sedReincidente = sedReincidenteStr.toUpperCase() === 'SÍ' || sedReincidenteStr.toUpperCase() === 'SI' || sedCount > 2;

                const rawSuminCount = getProp(item, 'Conteo_Fallas_Suministro_7D', 'Fallas_Suministro_7D');
                const suministroCount = parseInt(rawSuminCount, 10) || 0;

                const esCritica = isSedCritica(sed);

                const record = {
                    lat, lon, ticket, odm, estado: est, empresa: emp, falla: fal,
                    cadena, suministro, suministro_count: suministroCount, fecha_inicio: fechaIni, hora_inicio: fechaIni,
                    direccion, distrito, intervalo, dia, sed, alimentador, sed_count: sedCount, sed_reincidente: sedReincidente, es_sed_critica: esCritica, afectacion, llamadas,
                    latitud: latitudVal, longitud: longitudVal, emoji: getEmoji(fal)
                };

                if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !isZeroZero(lat, lon)) {
                    mapLocations.push(record);
                }

                tdOmsRecords.push(record);
            });

            // Filtros en el Mapa
            mapCtrlEstado = initMultiSelect("mapMultiEstado", "Estado", mapLocations.map(m => m.estado), filterMapMarkers);
            mapCtrlEmpresa = initMultiSelect("mapMultiEmpresa", "Empresa", mapLocations.map(m => m.empresa), filterMapMarkers);
            mapCtrlFalla = initMultiSelect("mapMultiFalla", "Falla", mapLocations.map(m => m.falla), filterMapMarkers);

            // Filtros en el Modal TD OMS
            tdCtrlIntervalo = initMultiSelect("tdMultiIntervalo", "Intervalo", tdOmsRecords.map(r => r.intervalo), refreshDashboard);
            tdCtrlEmpresa = initMultiSelect("tdMultiEmpresa", "Empresa", tdOmsRecords.map(r => r.empresa), refreshDashboard);
            tdCtrlFalla = initMultiSelect("tdMultiFalla", "Falla", tdOmsRecords.map(r => r.falla), refreshDashboard);
            tdCtrlEstado = initMultiSelect("tdMultiEstado", "Estado", tdOmsRecords.map(r => r.estado), refreshDashboard);

            setupMapMarkers();
            filterMapMarkers();
            refreshDashboard();
        }

        function setupMapMarkers() {
            markersGroup.clearLayers();
            markerMap.clear();

            mapLocations.forEach(loc => {
                let stateClass = "otros";
                if (loc.estado.toLowerCase().includes("ejecuc")) stateClass = "ejecucion";
                else if (loc.estado.toLowerCase().includes("pendient")) stateClass = "pendiente";

                const popupHtml = `
                    <div style="font-family: Arial, sans-serif; font-size: 12px; min-width: 260px; line-height: 1.5;">
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #3c5a9f; padding-bottom:4px; margin-bottom:6px;">
                            <h4 style="margin:0; color:#3c5a9f; font-size:13px; font-weight:700;">${loc.emoji} Ticket: ${escapeHtml(loc.ticket)}</h4>
                            <span class="status-badge ${stateClass}">${escapeHtml(loc.estado)}</span>
                        </div>
                        <b>ODM:</b> ${escapeHtml(loc.odm)}<br>
                        <b>Cadena:</b> ${escapeHtml(loc.cadena)}<br>
                        <b>Empresa:</b> ${escapeHtml(loc.empresa)}<br>
                        <b>Falla:</b> ${escapeHtml(loc.falla)}<br>
                        <b>SED Llave:</b> ${escapeHtml(loc.sed)} ${loc.es_sed_critica ? `<span style="font-size:10px; font-weight:bold; color:#b45309; background:#fef3c7; border:1px solid #fcd34d; padding:1px 6px; border-radius:4px;">🚨 SED CRÍTICA</span>` : ''} ${loc.sed_count > 0 ? `<span style="font-size:10px; font-weight:bold; color:${loc.sed_reincidente ? '#dc2626' : '#2b4791'}; background:${loc.sed_reincidente ? '#fee2e2' : '#dbeafe'}; padding:1px 6px; border-radius:4px;">(7D: ${loc.sed_count}${loc.sed_reincidente ? ' 🚨 REINCIDENTE >2' : ' fallas'})</span>` : ''}<br>
                        <b>Alimentador:</b> ${escapeHtml(loc.alimentador || 'N/A')}<br>
                        <b>Suministro:</b> ${escapeHtml(loc.suministro)} ${loc.suministro_count > 0 ? `<span style="font-size:10px; font-weight:bold; color:#0d9488; background:#ccfbf1; padding:1px 6px; border-radius:4px;">(7D: ${loc.suministro_count} fallas)</span>` : ''}<br>
                        <b>Fecha Inicio:</b> ${escapeHtml(loc.fecha_inicio)}<br>
                        <b>Dirección:</b> ${escapeHtml(loc.direccion)}<br>
                        <b>Distrito:</b> ${escapeHtml(loc.distrito)}
                        <div style="margin-top: 10px; display: flex; gap: 6px; justify-content: center; align-items: center; flex-wrap: wrap;">
                            <a href="https://www.google.com/maps?q=${loc.lat},${loc.lon}" target="_blank" title="Ver Punto en Google Maps" style="
                                display: inline-block;
                                background-color: #6cab5e;
                                color: white;
                                text-decoration: none;
                                padding: 6px 12px;
                                font-weight: bold;
                                border-radius: 6px;
                                font-size: 11px;
                                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                            ">📍 Google Maps</a>
                            <a href="https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lon}" target="_blank" title="Trazar Ruta en Google Maps" style="
                                display: inline-block;
                                background-color: #3c5a9f;
                                color: white;
                                text-decoration: none;
                                padding: 6px 12px;
                                font-weight: bold;
                                border-radius: 6px;
                                font-size: 13px;
                                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                            ">🚗</a>
                        </div>
                    </div>
                `;

                const customIcon = L.divIcon({
                    className: 'custom-leaflet-emoji',
                    html: `<div style="font-size: 24px; text-align: center; cursor: pointer;">${loc.emoji}</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });

                const marker = L.marker([loc.lat, loc.lon], { icon: customIcon }).bindPopup(popupHtml);
                markerMap.set(loc.ticket.toLowerCase(), { marker, loc });
            });
        }

        let addressSearchMarker = null;
        let addressSearchLayer = null;
        let addressSearchTicketKeys = null;
        let addressPendingCandidates = [];
        let userLocationMarker = null;
        let userLocationAccuracy = null;

        function showMapNotice(message, tone = 'info') {
            const resBox = document.getElementById('addressResultBox');
            if (!resBox) return;
            const color = tone === 'error' ? '#f87171' : '#7dd3fc';
            resBox.style.display = 'block';
            resBox.innerHTML = `<span style="color:${color}; font-weight:700;">${message}</span>`;
        }

        function collapseMobileFiltersAfterAddressSearch() {
            if (window.innerWidth > 768) return;
            const wrapper = document.getElementById('mapFilterContentWrapper');
            const icon = document.getElementById('mobileFilterIcon');
            if (!wrapper || wrapper.classList.contains('collapsed-mobile')) return;
            wrapper.classList.add('collapsed-mobile');
            if (icon) icon.textContent = '▲';
        }

        function initLocateControl() {
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
            new LocateControl().addTo(leafletMap);
        }

        function locateUser() {
            const controlButton = document.querySelector('.map-locate-control button');
            if (!navigator.geolocation) {
                showMapNotice('⚠️ Este dispositivo no permite obtener la ubicación.', 'error');
                return;
            }
            const isLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
            if (!window.isSecureContext && !isLocal) {
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

                if (userLocationMarker) leafletMap.removeLayer(userLocationMarker);
                if (userLocationAccuracy) leafletMap.removeLayer(userLocationAccuracy);

                userLocationAccuracy = L.circle([lat, lon], {
                    radius: accuracy,
                    color: '#2563eb',
                    weight: 1,
                    fillColor: '#60a5fa',
                    fillOpacity: 0.16
                }).addTo(leafletMap);
                userLocationMarker = L.circleMarker([lat, lon], {
                    radius: 8,
                    color: '#ffffff',
                    weight: 3,
                    fillColor: '#2563eb',
                    fillOpacity: 1
                }).addTo(leafletMap);
                userLocationMarker.bindPopup(`<b>📍 Mi ubicación</b><br>Precisión aproximada: ${Math.round(accuracy)} m`).openPopup();
                leafletMap.setView([lat, lon], Math.max(15, leafletMap.getZoom()));

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

        function normalizeStreetText(value) {
            return normalizeAddressText(value)
                .replace(/\b(AVENIDA|AV|JR|JIRON|CALLE|CL|PASAJE|PSJ|PROLONGACION|PROL|CARRETERA|CR|MALECON|MLC)\b/g, ' ')
                .replace(/\b(?:N|NUM|NUMERO|NO)\s*\d+[A-Z]?\b/g, ' ')
                .replace(/\b\d+[A-Z]?\b/g, ' ')
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

        function recordMatchesStreet(record, streetKey) {
            const address = normalizeStreetText(record.direccion || '');
            const tokens = normalizeStreetText(streetKey).split(' ').filter(token => token.length >= 3);
            if (!address || !tokens.length) return false;
            const matched = tokens.filter(token => address.includes(token)).length;
            return matched >= Math.max(1, Math.ceil(tokens.length * 0.6));
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
            if (addressSearchMarker) leafletMap.removeLayer(addressSearchMarker);
            if (addressSearchLayer) leafletMap.removeLayer(addressSearchLayer);
            addressSearchMarker = null;
            addressSearchLayer = null;
        }

        function getGeometrySegments(geojson) {
            if (geojson && geojson.type === 'FeatureCollection') {
                return (geojson.features || []).flatMap(getGeometrySegments);
            }
            const geometry = geojson && geojson.type === 'Feature' ? geojson.geometry : geojson;
            if (!geometry) return [];
            if (geometry.type === 'GeometryCollection') {
                return (geometry.geometries || []).flatMap(getGeometrySegments);
            }
            const coords = geometry.coordinates || [];
            const groups = geometry.type === 'LineString' ? [coords]
                : geometry.type === 'MultiLineString' || geometry.type === 'Polygon' ? coords
                : geometry.type === 'MultiPolygon' ? coords.flat()
                : [];
            return groups.flatMap(group => group.slice(0, -1).map((coord, index) => [coord, group[index + 1]])
                .filter(pair => pair[0] && pair[1]));
        }

        function distancePointToSegmentMeters(lat, lon, start, end) {
            const aLon = Number(start[0]);
            const aLat = Number(start[1]);
            const bLon = Number(end[0]);
            const bLat = Number(end[1]);
            if (![aLon, aLat, bLon, bLat, lat, lon].every(Number.isFinite)) return Infinity;
            const metersPerDegree = 111320;
            const cosLat = Math.cos(lat * Math.PI / 180);
            const ax = aLon * metersPerDegree * cosLat;
            const ay = aLat * metersPerDegree;
            const bx = bLon * metersPerDegree * cosLat;
            const by = bLat * metersPerDegree;
            const px = lon * metersPerDegree * cosLat;
            const py = lat * metersPerDegree;
            const dx = bx - ax;
            const dy = by - ay;
            const lengthSquared = dx * dx + dy * dy;
            const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
            return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        }

        function distanceToStreetMeters(record, geojson, fallbackLat, fallbackLon) {
            const segments = getGeometrySegments(geojson);
            if (!segments.length) return calcularDistanciaMetros(fallbackLat, fallbackLon, Number(record.lat), Number(record.lon));
            return Math.min(...segments.map(segment => distancePointToSegmentMeters(Number(record.lat), Number(record.lon), segment[0], segment[1])));
        }

        function focusAddressTicket(ticketKey) {
            const target = markerMap.get(String(ticketKey || '').toLowerCase());
            if (!target) return;
            leafletMap.flyTo([target.loc.lat, target.loc.lon], 17, { animate: true, duration: 0.8 });
            setTimeout(() => target.marker.openPopup(), 850);
        }

        function getGeocoderDistrict(result) {
            const address = result?.address || {};
            return address.city_district || address.district || address.municipality || address.suburb || address.town || address.city || address.county || 'Distrito no identificado';
        }

        function isStreetGeocoderResult(result) {
            return isLinearStreetGeocoderResult(result) || ['neighbourhood', 'locality', 'quarter'].includes(result?.type);
        }

        function isLinearStreetGeocoderResult(result) {
            return result?.class === 'highway' || ['road', 'residential', 'secondary', 'tertiary', 'primary', 'pedestrian'].includes(result?.type);
        }

        function getAddressGeocoderQueries(query, mode) {
            const queries = [query];
            const normalized = normalizeAddressText(query);
            const hasStreetPrefix = /\b(AVENIDA|AV|JR|JIRON|CALLE|CL|PASAJE|PSJ|PROLONGACION|PROL|CARRETERA|CR|MALECON|MLC)\b/.test(normalized);
            if (mode === 'street' && !hasStreetPrefix) queries.push(`Avenida de ${query}`);
            return [...new Set(queries.map(value => value.trim()).filter(Boolean))];
        }

        function combineStreetGeometries(results) {
            const geometries = (results || []).map(result => result.geojson).filter(Boolean);
            if (geometries.length === 1) return geometries[0];
            if (geometries.length > 1) {
                return {
                    type: 'FeatureCollection',
                    features: geometries.map(geometry => ({ type: 'Feature', properties: {}, geometry }))
                };
            }
            return null;
        }

        function getLocalAddressMatches(query, mode, districtFilter = '') {
            const normalizedDistrict = normalizeAddressText(districtFilter);
            return (tdOmsRecords || []).filter(record => mode === 'street'
                ? recordMatchesStreet(record, query)
                : recordMatchesAddress(record, query)).filter(record => {
                    if (!normalizedDistrict) return true;
                    return normalizeAddressText(record.distrito || '').includes(normalizedDistrict);
                });
        }

        function buildAddressCandidates(query, mode, geocoderResults, districtFilter = '') {
            const candidates = [];
            const groups = new Map();
            const normalizedDistrict = normalizeAddressText(districtFilter);
            const results = (mode === 'street' ? geocoderResults.filter(isStreetGeocoderResult) : geocoderResults).filter(result => {
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
                const groupKey = mode === 'street'
                    ? `${normalizeStreetText(road)}|${normalizeAddressText(district)}`
                    : `${normalizeAddressText(result.display_name)}|${normalizeAddressText(district)}`;
                if (!groups.has(groupKey)) {
                    groups.set(groupKey, { mode, query, district, road, results: [], first: result, lat, lon });
                }
                groups.get(groupKey).results.push(result);
            });

            const localMatches = getLocalAddressMatches(query, mode, districtFilter);
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
                const streetGeometry = mode === 'street'
                    ? combineStreetGeometries(group.results.filter(isLinearStreetGeocoderResult))
                    : null;
                candidates.push({
                    mode,
                    query,
                    districtFilter,
                    district: group.district,
                    label: group.first.display_name,
                    streetKey: group.road,
                    lat: group.lat,
                    lon: group.lon,
                    geojson: streetGeometry,
                    localMatchCount: matchingLocal.length
                });
            });

            localGroups.forEach(group => {
                const districtKey = normalizeAddressText(group.district);
                const alreadyCovered = candidates.some(candidate => normalizeAddressText(candidate.district) === districtKey);
                const locatable = group.records.find(record => Number.isFinite(Number(record.lat)) && Number.isFinite(Number(record.lon)));
                if (!alreadyCovered && locatable) {
                    candidates.push({
                        mode,
                        query,
                        districtFilter,
                        district: group.district,
                        label: `Coincidencia OMS: ${query}, ${group.district}`,
                        streetKey: query,
                        lat: Number(locatable.lat),
                        lon: Number(locatable.lon),
                        geojson: null,
                        localMatchCount: group.records.length
                    });
                }
            });

            return candidates.slice(0, 12);
        }

        function renderAddressCandidateChoices(candidates) {
            const resBox = document.getElementById('addressResultBox');
            if (!resBox) return;
            addressPendingCandidates = candidates;
            addressSearchTicketKeys = new Set();
            clearAddressSearchVisuals();
            filterMapMarkers();
            resBox.style.display = 'block';
            resBox.innerHTML = `
                <div style="font-weight:700; color:#7dd3fc;">🔎 Se encontraron varias ubicaciones</div>
                <div style="font-size:10px; color:#cbd5e1; margin-top:3px;">Elige la ubicación correcta para continuar:</div>
                <div class="address-result-list">
                    ${candidates.map((candidate, index) => `
                        <button type="button" class="address-ticket-result" data-address-candidate="${index}">
                            <span>📍 <b>${escapeHtml(candidate.district)}</b><br><small>${escapeHtml(candidate.label)}</small></span>
                            <small>${candidate.localMatchCount ? `🎫 ${candidate.localMatchCount} OMS` : '🗺️ Ver aquí'}</small>
                        </button>
                    `).join('')}
                </div>
            `;
            collapseMobileFiltersAfterAddressSearch();
            resBox.querySelectorAll('[data-address-candidate]').forEach(button => {
                button.addEventListener('click', () => {
                    const candidate = addressPendingCandidates[Number(button.dataset.addressCandidate)];
                    if (candidate) applyAddressCandidate(candidate);
                });
            });
        }

        function renderAddressResults({ locationLabel, district, lat, lon, mode, radius, exactMatches, nearbyMatches, noCoordinateCount }) {
            const resBox = document.getElementById('addressResultBox');
            if (!resBox) return;
            const exactKeys = new Set(exactMatches.map(record => String(record.ticket || '').toLowerCase()).filter(Boolean));
            const nearbyKeys = new Set(nearbyMatches.map(item => String(item.r.ticket || '').toLowerCase()).filter(Boolean));
            addressSearchTicketKeys = new Set([...exactKeys, ...nearbyKeys]);
            filterMapMarkers();

            const nearbyOnly = nearbyMatches.filter(item => !exactKeys.has(String(item.r.ticket || '').toLowerCase()));
            const exactLabel = mode === 'street' ? 'Misma calle' : 'Misma dirección';
            const results = [
                ...exactMatches.map(record => ({ record, label: exactLabel, distance: null })),
                ...nearbyOnly.map(item => ({ record: item.r, label: 'Cercano', distance: item.d }))
            ];
            const visibleResults = results.slice(0, 20);
            const modeLabel = mode === 'street' ? 'Calle completa' : 'Punto y dirección';
            const streetLabel = mode === 'street' ? 'Se dibujó la calle y se buscaron tickets en su corredor.' : 'Se buscaron coincidencias de dirección y tickets cercanos.';

            resBox.style.display = 'block';
            resBox.innerHTML = `
                <div style="font-weight:700; color:#7dd3fc;">📍 ${escapeHtml(locationLabel)}</div>
                ${district ? `<div style="font-size:10px; color:#fbbf24; margin-top:3px;">Distrito seleccionado: ${escapeHtml(district)}</div>` : ''}
                <div style="font-size:10px; color:#cbd5e1; margin-top:3px;">${modeLabel} · ${escapeHtml(streetLabel)}</div>
                <div class="address-result-summary">
                    <span class="address-result-chip">🎫 ${exactMatches.length} ${mode === 'street' ? 'misma calle' : 'misma dirección'}</span>
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
            `;
            collapseMobileFiltersAfterAddressSearch();
            resBox.querySelectorAll('[data-address-ticket]').forEach(button => {
                button.addEventListener('click', () => focusAddressTicket(button.dataset.addressTicket));
            });
        }

        function applyAddressCandidate(candidate) {
            const { query, mode } = candidate;
            const radius = Number(candidate.radius || document.getElementById('addressRadiusMap')?.value || 500);
            const hasPoint = Number.isFinite(Number(candidate.lat)) && Number.isFinite(Number(candidate.lon));
            addressPendingCandidates = [];
            clearAddressSearchVisuals();

            if (hasPoint) {
                const searchIcon = L.divIcon({
                    className: 'custom-address-pin',
                    html: '<div style="font-size:28px; text-shadow:0 2px 6px rgba(0,0,0,0.5);">📍</div>',
                    iconSize: [32, 32],
                    iconAnchor: [16, 32]
                });
                addressSearchMarker = L.marker([candidate.lat, candidate.lon], { icon: searchIcon, title: 'Ubicación buscada' }).addTo(leafletMap);
                addressSearchMarker.bindPopup(`<b>📍 Ubicación buscada:</b><br>${escapeHtml(candidate.label)}`).openPopup();
            }

            if (mode === 'street' && hasPoint) {
                if (candidate.geojson) {
                    addressSearchLayer = L.geoJSON(candidate.geojson, {
                        style: { color: '#fbc140', weight: 6, opacity: 0.9, dashArray: '9 6' },
                        pointToLayer: (_feature, point) => L.circleMarker(point, { radius: 6, color: '#fbc140', fillColor: '#fbc140', fillOpacity: 0.9 })
                    }).addTo(leafletMap);
                } else {
                    addressSearchLayer = L.circle([candidate.lat, candidate.lon], { radius: Math.max(120, radius), color: '#fbc140', weight: 3, fillColor: '#fbc140', fillOpacity: 0.08 }).addTo(leafletMap);
                }
            }

            const candidateDistrict = normalizeAddressText(candidate.districtFilter || candidate.district || '');
            const useDistrict = candidateDistrict && !['LIMA', 'LIMA METROPOLITANA', 'PERU', 'DISTRITO NO IDENTIFICADO', 'COORDENADAS INGRESADAS'].includes(candidateDistrict);
            const exactMatches = (tdOmsRecords || []).filter(record => {
                const matchesQuery = mode === 'street'
                    ? recordMatchesStreet(record, candidate.streetKey || query)
                    : recordMatchesAddress(record, query);
                const matchesDistrict = !useDistrict || normalizeAddressText(record.distrito || '').includes(candidateDistrict);
                return matchesQuery && matchesDistrict;
            });
            const noCoordinateCount = exactMatches.filter(record => !Number.isFinite(Number(record.lat)) || !Number.isFinite(Number(record.lon))).length;
            const nearbyMatches = hasPoint ? mapLocations.map(record => ({
                r: record,
                d: mode === 'street' && candidate.geojson
                    ? distanceToStreetMeters(record, candidate.geojson, candidate.lat, candidate.lon)
                    : calcularDistanciaMetros(candidate.lat, candidate.lon, Number(record.lat), Number(record.lon))
            })).filter(item => Number.isFinite(item.d) && item.d <= radius).sort((a, b) => a.d - b.d) : [];

            renderAddressResults({
                locationLabel: candidate.label,
                district: candidate.district,
                lat: candidate.lat,
                lon: candidate.lon,
                mode,
                radius,
                exactMatches,
                nearbyMatches,
                noCoordinateCount
            });
            if (mode === 'street' && addressSearchLayer?.getBounds?.().isValid()) {
                leafletMap.fitBounds(addressSearchLayer.getBounds().pad(0.12));
            } else if (hasPoint) {
                leafletMap.setView([candidate.lat, candidate.lon], 16);
            }
        }

        async function buscarDireccionEnMapa() {
            const query = document.getElementById('inputTicket').value.trim();
            const resBox = document.getElementById('addressResultBox');
            const mode = document.getElementById('addressSearchMode')?.value || 'point';
            const radius = Number(document.getElementById('addressRadiusMap')?.value || 500);
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
                        mode,
                        query,
                        radius,
                        districtFilter,
                        district: districtFilter || 'Coordenadas ingresadas',
                        label: `Coordenadas: ${coordenadas.lat}, ${coordenadas.lon}`,
                        streetKey: query,
                        lat: coordenadas.lat,
                        lon: coordenadas.lon,
                        geojson: null
                    });
                    return;
                }

                const resultados = [];
                const geocoderQueries = getAddressGeocoderQueries(query, mode);
                for (let index = 0; index < geocoderQueries.length; index++) {
                    if (index > 0) await new Promise(resolve => setTimeout(resolve, 1100));
                    const params = new URLSearchParams({
                        format: 'jsonv2',
                        limit: '20',
                        countrycodes: 'pe',
                        addressdetails: '1',
                        q: `${geocoderQueries[index]}${districtFilter ? `, ${districtFilter}` : ''}, Lima, Perú`
                    });
                    if (mode === 'street') params.set('polygon_geojson', '1');
                    const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { headers: { 'Accept-Language': 'es' } });
                    if (!resp.ok) throw new Error('No se pudo consultar el servicio de mapas');
                    const entries = await resp.json();
                    resultados.push(...(Array.isArray(entries) ? entries : []));
                }
                const uniqueResults = [...new Map(resultados.map(result => [
                    result.osm_type && result.osm_id ? `${result.osm_type}:${result.osm_id}` : result.display_name,
                    result
                ])).values()];
                const candidates = buildAddressCandidates(query, mode, uniqueResults, districtFilter);
                if (!candidates.length) throw new Error('No se encontró una ubicación utilizable para esa búsqueda.');
                if (candidates.length > 1) {
                    renderAddressCandidateChoices(candidates);
                    return;
                }
                applyAddressCandidate({ ...candidates[0], radius });
            } catch (err) {
                addressSearchTicketKeys = null;
                addressPendingCandidates = [];
                resBox.innerHTML = `<span style="color:#f87171; font-weight:700;">⚠️ ${escapeHtml(err.message)}</span>`;
            }
        }

        function filterMapMarkers() {
            const searchType = document.getElementById("searchTypeMap") ? document.getElementById("searchTypeMap").value : "ticket";
            const query = document.getElementById("inputTicket").value.trim().toLowerCase();
            const selEsts = mapCtrlEstado ? mapCtrlEstado.getSelected() : [];
            const selEmps = mapCtrlEmpresa ? mapCtrlEmpresa.getSelected() : [];
            const selFallas = mapCtrlFalla ? mapCtrlFalla.getSelected() : [];
            const chk7 = document.getElementById("chk7LlamadasMap");
            const only7Llamadas = chk7 ? chk7.checked : false;
            const chkSed = document.getElementById("chkReincSedMap");
            const onlyReincSed = chkSed ? chkSed.checked : false;
            const chkSum = document.getElementById("chkReincSuminMap");
            const onlyReincSum = chkSum ? chkSum.checked : false;
            const chkCrit = document.getElementById("chkCriticaMap");
            const onlyCritica = chkCrit ? chkCrit.checked : false;

            markersGroup.clearLayers();
            let count = 0;
            const bounds = [];

            mapLocations.forEach(loc => {
                let matchQuery = true;
                if (query && searchType === "ticket") {
                    matchQuery = loc.ticket.toLowerCase().includes(query) || loc.odm.toLowerCase().includes(query);
                } else if (query && searchType === "sed") {
                    matchQuery = String(loc.sed || '').toLowerCase().includes(query);
                } else if (query && searchType === "alimentador") {
                    matchQuery = String(loc.alimentador || '').toLowerCase().includes(query);
                } else if (searchType === 'address' && addressSearchTicketKeys instanceof Set) {
                    matchQuery = addressSearchTicketKeys.has(String(loc.ticket || '').toLowerCase());
                }

                const matchEst = selEsts.includes(loc.estado);
                const matchEmp = selEmps.includes(loc.empresa);
                const matchFal = selFallas.includes(loc.falla);
                const numLlamadas = parseInt(loc.llamadas || 0, 10) || 0;
                const matchLlamadas = !only7Llamadas || numLlamadas >= 7;
                const matchSed = !onlyReincSed || (loc.sed_reincidente || loc.sed_count > 2);
                const matchSum = !onlyReincSum || (loc.suministro_count >= 2);
                const matchCrit = !onlyCritica || loc.es_sed_critica;

                if (matchQuery && matchEst && matchEmp && matchFal && matchLlamadas && matchSed && matchSum && matchCrit) {
                    if (markerMap.has(loc.ticket.toLowerCase())) {
                        markersGroup.addLayer(markerMap.get(loc.ticket.toLowerCase()).marker);
                        bounds.push([loc.lat, loc.lon]);
                        count++;
                    }
                }
            });

            if (bounds.length > 0) {
                leafletMap.fitBounds(L.latLngBounds(bounds).pad(0.1));
            }
            document.getElementById("topNavCount").innerText = `🚨 ${count}`;
        }

        const searchTypeMapEl = document.getElementById("searchTypeMap");
        const inputTicketEl = document.getElementById("inputTicket");
        const resBox = document.getElementById("addressResultBox");
        const addressSearchOptionsEl = document.getElementById('addressSearchOptions');
        const addressSearchModeEl = document.getElementById('addressSearchMode');
        const addressRadiusEl = document.getElementById('addressRadiusMap');

        function updateAddressSearchUi() {
            const isAddress = searchTypeMapEl?.value === 'address';
            if (addressSearchOptionsEl) addressSearchOptionsEl.style.display = isAddress ? 'flex' : 'none';
            if (isAddress && inputTicketEl) {
                inputTicketEl.placeholder = addressSearchModeEl?.value === 'street'
                    ? 'Ej. Av. Faucett o Jr. Pucallpa...'
                    : 'Ej. Av. Faucett 200, Callao...';
            }
        }

        if (searchTypeMapEl && inputTicketEl) {
            searchTypeMapEl.addEventListener("change", () => {
                const mode = searchTypeMapEl.value;
                addressSearchTicketKeys = null;
                addressPendingCandidates = [];
                clearAddressSearchVisuals();
                if (mode === "ticket") {
                    inputTicketEl.placeholder = "Buscar por Ticket o ODM...";
                    if (resBox) resBox.style.display = "none";
                } else if (mode === "sed") {
                    inputTicketEl.placeholder = "Buscar por SED (ej. 03033A)...";
                    if (resBox) resBox.style.display = "none";
                } else if (mode === "alimentador") {
                    inputTicketEl.placeholder = "Buscar por Alimentador (ej. MS-03)...";
                    if (resBox) resBox.style.display = "none";
                } else if (mode === "address") {
                    updateAddressSearchUi();
                }
                filterMapMarkers();
            });

            inputTicketEl.addEventListener("input", () => {
                if (searchTypeMapEl.value !== "address") {
                    filterMapMarkers();
                } else {
                    addressSearchTicketKeys = null;
                    addressPendingCandidates = [];
                    clearAddressSearchVisuals();
                    if (resBox) resBox.style.display = 'none';
                }
            });

            inputTicketEl.addEventListener("keyup", (e) => {
                if (e.key === "Enter") {
                    if (searchTypeMapEl.value === "address") {
                        buscarDireccionEnMapa();
                    } else {
                        document.getElementById("btnBuscar").click();
                    }
                }
            });
        }

        document.getElementById("btnBuscar").addEventListener("click", () => {
            const mode = searchTypeMapEl ? searchTypeMapEl.value : "ticket";
            if (mode === "address") {
                buscarDireccionEnMapa();
                return;
            }

            const query = document.getElementById("inputTicket").value.trim().toLowerCase();
            if (!query) return;

            if (mode === "sed" || mode === "alimentador") {
                filterMapMarkers();
                return;
            }

            if (markerMap.has(query)) {
                const target = markerMap.get(query);
                leafletMap.flyTo([target.loc.lat, target.loc.lon], 17, { animate: true, duration: 1.2 });
                setTimeout(() => target.marker.openPopup(), 1200);
            } else {
                filterMapMarkers();
            }
        });

        document.getElementById("btnLimpiar").addEventListener("click", () => {
            document.getElementById("inputTicket").value = "";
            if (resBox) resBox.style.display = "none";
            addressSearchTicketKeys = null;
            addressPendingCandidates = [];
            clearAddressSearchVisuals();
            const chk7Map = document.getElementById("chk7LlamadasMap");
            if (chk7Map) chk7Map.checked = false;
            const chkSedMap = document.getElementById("chkReincSedMap");
            if (chkSedMap) chkSedMap.checked = false;
            const chkSumMap = document.getElementById("chkReincSuminMap");
            if (chkSumMap) chkSumMap.checked = false;
            const chkCritMap = document.getElementById("chkCriticaMap");
            if (chkCritMap) chkCritMap.checked = false;

            if (mapCtrlEstado) mapCtrlEstado.reset();
            if (mapCtrlEmpresa) mapCtrlEmpresa.reset();
            if (mapCtrlFalla) mapCtrlFalla.reset();
            filterMapMarkers();
        });

        const chkMap7 = document.getElementById("chk7LlamadasMap");
        if (chkMap7) chkMap7.addEventListener("change", filterMapMarkers);
        const chkMapSed = document.getElementById("chkReincSedMap");
        if (chkMapSed) chkMapSed.addEventListener("change", filterMapMarkers);
        const chkMapSum = document.getElementById("chkReincSuminMap");
        if (chkMapSum) chkMapSum.addEventListener("change", filterMapMarkers);
        const chkMapCrit = document.getElementById("chkCriticaMap");
        if (chkMapCrit) chkMapCrit.addEventListener("change", filterMapMarkers);

        if (addressSearchModeEl) {
            addressSearchModeEl.addEventListener('change', () => {
                updateAddressSearchUi();
                if (searchTypeMapEl?.value === 'address' && inputTicketEl?.value.trim()) buscarDireccionEnMapa();
            });
        }
        if (addressRadiusEl) {
            addressRadiusEl.addEventListener('change', () => {
                if (searchTypeMapEl?.value === 'address' && inputTicketEl?.value.trim()) buscarDireccionEnMapa();
            });
        }
        updateAddressSearchUi();
