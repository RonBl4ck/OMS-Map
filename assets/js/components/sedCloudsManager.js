/**
 * OMS SED Clouds & Perimeters Manager
 * Handles geometric grouping of tickets by SED, rendering convex hulls & cloud shapes,
 * hover highlights, permanent labels at close zoom, and perimeter toggling.
 * Reuses window.GeoUtils.convexHull or window.SedGeometry.convexHull (no duplicate code).
 * UMD / Browser friendly.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.SedCloudsManager = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.SedCloudsManager = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
    'use strict';

    let sedPerimetersGroup = null;
    let sedCloudLayers = [];
    let activeSedCloudKey = '';
    let showSedPerimeters = true;

    function getPopupsModule() {
        if (typeof root !== 'undefined' && root.MapPopups) return root.MapPopups;
        if (typeof window !== 'undefined' && window.MapPopups) return window.MapPopups;
        return null;
    }

    function getGeometryUtils() {
        if (typeof root !== 'undefined' && root.GeoUtils) return root.GeoUtils;
        if (typeof window !== 'undefined' && window.GeoUtils) return window.GeoUtils;
        if (typeof root !== 'undefined' && root.SedGeometry) return root.SedGeometry;
        if (typeof window !== 'undefined' && window.SedGeometry) return window.SedGeometry;
        return null;
    }

    /**
     * Obtiene el convexHull reutilizando GeoUtils o SedGeometry
     * @param {Array<Array<number>>} points Lista de coordenadas [lat, lon]
     * @returns {Array<Array<number>>} Puntos del polígono convexo
     */
    function getConvexHull(points) {
        const geo = getGeometryUtils();
        if (geo && typeof geo.convexHull === 'function') {
            return geo.convexHull(points);
        }
        // Fallback básico si aún no ha cargado GeoUtils
        if (typeof buildSedCloudShape === 'function') {
            const shape = buildSedCloudShape(points, { paddingMeters: 75 });
            return shape.points || points;
        }
        return points;
    }

    function getSedGroupLayer() {
        if (sedPerimetersGroup) return sedPerimetersGroup;
        if (typeof window !== 'undefined' && window.sedPerimetersGroup) {
            sedPerimetersGroup = window.sedPerimetersGroup;
            return sedPerimetersGroup;
        }
        return null;
    }

    /**
     * Agrupa incidencias por SED y dibuja polígonos/nubes en el mapa
     * @param {Array<Object>} locations Lista de incidencias visibles
     */
    function renderSedPerimeters(locations) {
        const group = getSedGroupLayer();
        if (!group || typeof L === 'undefined') return;
        group.clearLayers();
        sedCloudLayers = [];
        if (!showSedPerimeters) return;

        const sedGroups = new Map();
        (locations || []).forEach(loc => {
            const sedKey = String(loc.sed || '').trim().toUpperCase();
            if (!sedKey || sedKey === 'N/A' || isNaN(loc.lat) || isNaN(loc.lon)) return;
            if (!sedGroups.has(sedKey)) {
                sedGroups.set(sedKey, {
                    sed: loc.sed,
                    es_critica: loc.es_sed_critica,
                    sed_reincidente: loc.sed_reincidente,
                    sed_count: loc.sed_count,
                    alimentador: loc.alimentador,
                    empresa: loc.empresa,
                    points: [],
                    tickets: []
                });
            }
            const g = sedGroups.get(sedKey);
            g.points.push([loc.lat, loc.lon]);
            g.tickets.push(loc);
        });

        const popups = getPopupsModule();

        sedGroups.forEach((g) => {
            const pts = g.points;
            const count = pts.length;
            const currentSedKey = String(g.sed || '').trim().toUpperCase();
            if (count < 2) return;
            const strokeColor = '#6d5bd0';
            const fillColor = '#8b7de3';
            const fillOpacity = 0.12;

            let layer = null;
            const shapeFn = (typeof buildSedCloudShape === 'function') 
                ? buildSedCloudShape 
                : (typeof root.buildSedCloudShape === 'function' ? root.buildSedCloudShape : null);

            if (!shapeFn) return;
            const shape = shapeFn(pts, { paddingMeters: 75 });
            const pathStyle = {
                color: strokeColor,
                fillColor,
                fillOpacity,
                weight: 3,
                opacity: 0.9,
                className: 'sed-perimeter-shape'
            };

            const popupContent = (popups && typeof popups.renderSedPopup === 'function')
                ? popups.renderSedPopup({ ...g, strokeColor, count })
                : `<b>Zona SED: ${g.sed}</b><br>Tickets: ${count}`;

            if (shape.kind === 'cloud') {
                layer = L.polygon(shape.points, pathStyle);
            }

            if (layer) {
                const escapeFn = popups?.escapeHtml || ((s) => String(s || ''));
                layer.bindTooltip(`SED ${escapeFn(g.sed)} · ${count} fallas`, {
                    permanent: false,
                    direction: 'center',
                    className: 'sed-cloud-label',
                    opacity: 1
                });
                layer.bindPopup(popupContent);
                layer.on('popupopen', () => focusSedCloud(g.sed));
                layer.on('popupclose', () => focusSedCloud(null));
                layer.on('mouseover', function () {
                    const focusStyleFn = (typeof getSedCloudFocusStyle === 'function') ? getSedCloudFocusStyle : null;
                    const style = focusStyleFn 
                        ? focusStyleFn(currentSedKey === activeSedCloudKey, Boolean(activeSedCloudKey))
                        : { opacity: 1, fillOpacity: 0.22 };
                    this.setStyle({ ...style, weight: 4, fillOpacity: Math.min(0.3, style.fillOpacity + 0.08) });
                });
                layer.on('mouseout', function () {
                    const focusStyleFn = (typeof getSedCloudFocusStyle === 'function') ? getSedCloudFocusStyle : null;
                    const style = focusStyleFn 
                        ? focusStyleFn(currentSedKey === activeSedCloudKey, Boolean(activeSedCloudKey))
                        : { opacity: 0.9, fillOpacity: 0.12 };
                    this.setStyle({ ...style, weight: 3 });
                });
                group.addLayer(layer);
                sedCloudLayers.push({ layer, count, sedKey: currentSedKey });
            }
        });

        syncSedCloudLabelVisibility();
    }

    /**
     * Sincroniza la visibilidad de los tooltips de SED según el nivel de zoom del mapa
     */
    function syncSedCloudLabelVisibility() {
        const map = (typeof leafletMap !== 'undefined' && leafletMap) || (typeof window !== 'undefined' && window.leafletMap);
        if (!map) return;
        const zoom = map.getZoom();
        const shouldPersistFn = (typeof shouldPersistSedCloudLabel === 'function') 
            ? shouldPersistSedCloudLabel 
            : (typeof root.shouldPersistSedCloudLabel === 'function' ? root.shouldPersistSedCloudLabel : null);

        sedCloudLayers.forEach(({ layer, count }) => {
            if (shouldPersistFn && shouldPersistFn(count, zoom)) {
                layer.openTooltip();
            } else {
                layer.closeTooltip();
            }
        });
    }

    /**
     * Enfoca o resalta el perímetro de una SED seleccionada
     * @param {string|null} sed Código de la SED a enfocar
     */
    function focusSedCloud(sed) {
        const selectedKey = String(sed || '').trim().toUpperCase();
        activeSedCloudKey = selectedKey;
        const focusStyleFn = (typeof getSedCloudFocusStyle === 'function') 
            ? getSedCloudFocusStyle 
            : (typeof root.getSedCloudFocusStyle === 'function' ? root.getSedCloudFocusStyle : null);

        sedCloudLayers.forEach(({ layer, sedKey }) => {
            if (layer && typeof layer.setStyle === 'function') {
                const style = focusStyleFn 
                    ? focusStyleFn(sedKey === selectedKey, Boolean(selectedKey))
                    : { opacity: sedKey === selectedKey ? 1 : 0.3, fillOpacity: sedKey === selectedKey ? 0.22 : 0.035 };
                layer.setStyle(style);
            }
        });
    }

    /**
     * Restablece los estilos normales de todos los perímetros SED
     */
    function resetSedPerimeterStyles() {
        focusSedCloud(null);
    }

    /**
     * Activa o desactiva la visibilidad de perímetros SED en el mapa
     */
    function toggleSedPerimeters() {
        showSedPerimeters = !showSedPerimeters;
        if (typeof document !== 'undefined') {
            const btn = document.getElementById("btnToggleSedLayer");
            if (btn) {
                btn.classList.toggle("active", showSedPerimeters);
                btn.setAttribute('aria-pressed', String(showSedPerimeters));
                const label = btn.querySelector('.btn-layer-label');
                if (label) label.textContent = showSedPerimeters ? 'Perímetros activos' : 'Perímetros SED';
            }
            document.body.classList.toggle('sed-perimeters-active', showSedPerimeters);
        }
        if (typeof filterMapMarkers === 'function') {
            filterMapMarkers();
        } else if (root.MarkersManager && typeof root.MarkersManager.filterMapMarkers === 'function') {
            root.MarkersManager.filterMapMarkers();
        }
    }

    if (typeof window !== 'undefined') {
        window.renderSedPerimeters = renderSedPerimeters;
        window.renderSedClouds = renderSedPerimeters;
        window.focusSedCloud = focusSedCloud;
        window.highlightSedPerimeter = focusSedCloud;
        window.resetSedPerimeterStyles = resetSedPerimeterStyles;
        window.syncSedCloudLabelVisibility = syncSedCloudLabelVisibility;
        window.toggleSedPerimeters = toggleSedPerimeters;
    }

    return {
        renderSedPerimeters,
        renderSedClouds: renderSedPerimeters,
        highlightSedPerimeter: focusSedCloud,
        focusSedCloud,
        resetSedPerimeterStyles,
        syncSedCloudLabelVisibility,
        toggleSedPerimeters,
        convexHull: getConvexHull
    };
}));
