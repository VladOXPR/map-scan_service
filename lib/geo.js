// Pure geo utilities for the map view.
// Exposes window.CuubGeo with: haversineMeters, nearestStation, formatDistance.
// No DOM / network / map dependencies so this stays unit-test friendly.
(function (global) {
    var EARTH_RADIUS_METERS = 6371000;

    function toRadians(degrees) {
        return (degrees * Math.PI) / 180;
    }

    function toNumber(value) {
        var n = typeof value === 'number' ? value : parseFloat(value);
        return Number.isFinite(n) ? n : null;
    }

    // a, b: { latitude, longitude }
    function haversineMeters(a, b) {
        if (!a || !b) return NaN;
        var lat1 = toNumber(a.latitude);
        var lon1 = toNumber(a.longitude);
        var lat2 = toNumber(b.latitude);
        var lon2 = toNumber(b.longitude);
        if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return NaN;

        var dLat = toRadians(lat2 - lat1);
        var dLon = toRadians(lon2 - lon1);
        var sinDLat = Math.sin(dLat / 2);
        var sinDLon = Math.sin(dLon / 2);
        var h = sinDLat * sinDLat +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinDLon * sinDLon;
        return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    // userCoords: { latitude, longitude }
    // stations: Array of objects with `latitude` and `longitude` (strings or numbers).
    // Returns { station, distanceMeters } or null when no usable stations.
    function nearestStation(userCoords, stations) {
        if (!userCoords || !Array.isArray(stations) || stations.length === 0) return null;

        var best = null;
        var bestDist = Infinity;
        for (var i = 0; i < stations.length; i++) {
            var s = stations[i];
            if (!s) continue;
            var lat = toNumber(s.latitude);
            var lon = toNumber(s.longitude);
            if (lat === null || lon === null) continue;

            var d = haversineMeters(userCoords, { latitude: lat, longitude: lon });
            if (!Number.isFinite(d)) continue;
            if (d < bestDist) {
                bestDist = d;
                best = s;
            }
        }

        if (!best) return null;
        return { station: best, distanceMeters: bestDist };
    }

    function formatDistance(meters) {
        if (!Number.isFinite(meters)) return '';
        if (meters < 1000) return Math.round(meters) + ' m';
        var km = meters / 1000;
        // 1 decimal under 10 km, no decimals beyond.
        return (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km';
    }

    global.CuubGeo = {
        haversineMeters: haversineMeters,
        nearestStation: nearestStation,
        formatDistance: formatDistance
    };
})(typeof window !== 'undefined' ? window : globalThis);
