/**
 * OMS Geo Utilities
 * Pure computational geometry algorithms for spatial operations, corridors, SED clouds and polygons.
 * UMD / Vanilla friendly.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.GeoUtils = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.GeoUtils = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
    const METERS_PER_DEGREE = 111320;

    /**
     * Andrew's monotone chain 2D convex hull algorithm.
     * Expects points as [[lat, lon], ...]
     */
    function convexHull(points) {
        if (!Array.isArray(points) || points.length <= 2) return (points || []).slice();
        const sorted = points.slice().sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lower = [];
        const upper = [];
        for (const point of sorted) {
            while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
            lower.push(point);
        }
        for (let i = sorted.length - 1; i >= 0; i -= 1) {
            const point = sorted[i];
            while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
            upper.push(point);
        }
        lower.pop();
        upper.pop();
        return lower.concat(upper);
    }

    /**
     * Local tangent plane projection (in meters) around centroid.
     */
    function projection(points) {
        if (!points || points.length === 0) {
            return {
                project: p => [0, 0],
                unproject: p => [0, 0]
            };
        }
        const lat0 = points.reduce((sum, point) => sum + point[0], 0) / points.length;
        const lon0 = points.reduce((sum, point) => sum + point[1], 0) / points.length;
        const lonScale = METERS_PER_DEGREE * Math.cos(lat0 * Math.PI / 180);
        return {
            project: point => [(point[1] - lon0) * lonScale, (point[0] - lat0) * METERS_PER_DEGREE],
            unproject: point => [lat0 + point[1] / METERS_PER_DEGREE, lon0 + point[0] / lonScale],
        };
    }

    /**
     * Finds the farthest pair of 2D points in projected coordinates.
     */
    function farthestPair(points) {
        if (!points || points.length === 0) return { pair: [[0, 0], [0, 0]], maxDistanceSquared: 0 };
        let pair = [points[0], points[0]];
        let maxDistanceSquared = -1;
        for (let i = 0; i < points.length; i += 1) {
            for (let j = i + 1; j < points.length; j += 1) {
                const dx = points[j][0] - points[i][0];
                const dy = points[j][1] - points[i][1];
                const distanceSquared = dx * dx + dy * dy;
                if (distanceSquared > maxDistanceSquared) {
                    maxDistanceSquared = distanceSquared;
                    pair = [points[i], points[j]];
                }
            }
        }
        return { pair, maxDistanceSquared: Math.max(0, maxDistanceSquared) };
    }

    /**
     * Shoelace formula for polygon area (projected meter coordinates).
     */
    function polygonArea(points) {
        if (!points || points.length < 3) return 0;
        return Math.abs(points.reduce((sum, point, index) => {
            const next = points[(index + 1) % points.length];
            return sum + point[0] * next[1] - next[0] * point[1];
        }, 0)) / 2;
    }

    /**
     * Builds a rectangular corridor around 2 or collinear points.
     */
    function buildCorridor(points, widthMeters) {
        const { project, unproject } = projection(points);
        const projected = points.map(project);
        const { pair } = farthestPair(projected);
        const dx = pair[1][0] - pair[0][0];
        const dy = pair[1][1] - pair[0][1];
        const length = Math.hypot(dx, dy) || 1;
        const halfWidth = widthMeters / 2;
        const nx = (-dy / length) * halfWidth;
        const ny = (dx / length) * halfWidth;
        return {
            kind: 'corridor',
            widthMeters,
            endpoints: pair.map(unproject),
            points: [
                unproject([pair[0][0] + nx, pair[0][1] + ny]),
                unproject([pair[1][0] + nx, pair[1][1] + ny]),
                unproject([pair[1][0] - nx, pair[1][1] - ny]),
                unproject([pair[0][0] - nx, pair[0][1] - ny]),
            ],
        };
    }

    /**
     * Builds shape representation of a SED area: empty, circle, corridor or polygon.
     */
    function buildSedAreaShape(points, options = {}) {
        const clean = (points || []).filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
        const corridorWidthMeters = options.corridorWidthMeters || 120;
        if (clean.length === 0) return { kind: 'empty', points: [] };
        if (clean.length === 1) return { kind: 'circle', center: clean[0], radiusMeters: 75, points: clean };
        if (clean.length === 2) return buildCorridor(clean, corridorWidthMeters);

        const hull = convexHull(clean);
        if (hull.length < 3) return buildCorridor(clean, corridorWidthMeters);
        const { project } = projection(hull);
        const projectedHull = hull.map(project);
        const { maxDistanceSquared } = farthestPair(projectedHull);
        const compactness = maxDistanceSquared > 0 ? polygonArea(projectedHull) / maxDistanceSquared : 0;
        if (compactness < 0.08) return buildCorridor(clean, corridorWidthMeters);
        return { kind: 'polygon', points: hull, compactness };
    }

    /**
     * Builds a rounded cloud shape around multiple SED fault points.
     */
    function buildSedCloudShape(points, options = {}) {
        const clean = (points || []).filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
        if (clean.length < 2) return { kind: 'empty', points: [], labelCenter: null };

        const paddingMeters = Math.max(40, options.paddingMeters || 75);
        const samplesPerPoint = Math.max(8, options.samplesPerPoint || 16);
        const { project, unproject } = projection(clean);
        const expandedPoints = [];

        clean.map(project).forEach(([x, y]) => {
            for (let sample = 0; sample < samplesPerPoint; sample += 1) {
                const angle = (sample / samplesPerPoint) * Math.PI * 2;
                expandedPoints.push([
                    x + Math.cos(angle) * paddingMeters,
                    y + Math.sin(angle) * paddingMeters,
                ]);
            }
        });

        return {
            kind: 'cloud',
            paddingMeters,
            points: convexHull(expandedPoints).map(unproject),
            labelCenter: [
                clean.reduce((sum, point) => sum + point[0], 0) / clean.length,
                clean.reduce((sum, point) => sum + point[1], 0) / clean.length,
            ],
        };
    }

    /**
     * Generates a buffered polygon around points with a given radius in meters.
     */
    function buildSedBufferPolygon(points, radiusMeters = 75, options = {}) {
        const clean = (points || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
        if (clean.length === 0) return { kind: 'empty', points: [] };
        if (clean.length === 1) {
            return {
                kind: 'buffer-circle',
                center: clean[0],
                radiusMeters,
                points: clean
            };
        }
        return buildSedCloudShape(clean, Object.assign({}, options, { paddingMeters: radiusMeters }));
    }

    /**
     * Computes spatial metrics: center, bounds, area, perimeter and compactness.
     */
    function computeMetrics(points) {
        const clean = (points || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
        if (clean.length === 0) {
            return { count: 0, center: null, bounds: null, areaM2: 0, perimeterMeters: 0 };
        }
        let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
        let sumLat = 0, sumLon = 0;
        clean.forEach(([lat, lon]) => {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            sumLat += lat;
            sumLon += lon;
        });

        const center = [sumLat / clean.length, sumLon / clean.length];
        const bounds = [[minLat, minLon], [maxLat, maxLon]];

        const { project } = projection(clean);
        const projected = clean.map(project);
        const hull = convexHull(clean);
        const projectedHull = hull.map(project);
        const areaM2 = polygonArea(projectedHull);

        let perimeterMeters = 0;
        for (let i = 0; i < projectedHull.length; i++) {
            const next = projectedHull[(i + 1) % projectedHull.length];
            perimeterMeters += Math.hypot(next[0] - projectedHull[i][0], next[1] - projectedHull[i][1]);
        }

        return {
            count: clean.length,
            center,
            bounds,
            areaM2: Math.round(areaM2),
            perimeterMeters: Math.round(perimeterMeters)
        };
    }

    function shouldPersistSedCloudLabel(ticketCount, zoom) {
        return ticketCount > 1 && zoom >= 13;
    }

    function getSedCloudFocusStyle(isSelected, hasSelection) {
        if (!hasSelection) return { opacity: 0.9, fillOpacity: 0.12 };
        return isSelected
            ? { opacity: 1, fillOpacity: 0.22 }
            : { opacity: 0.3, fillOpacity: 0.035 };
    }

    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    return {
        METERS_PER_DEGREE,
        convexHull,
        projection,
        farthestPair,
        polygonArea,
        buildCorridor,
        buildSedAreaShape,
        buildSedCloudShape,
        buildSedBufferPolygon,
        computeMetrics,
        shouldPersistSedCloudLabel,
        getSedCloudFocusStyle,
        haversineDistance
    };
}));
