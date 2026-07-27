require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const app = express();

function cuubApiUrl() {
    const url = process.env.CUUB_API_URL?.trim();
    return url ? url.replace(/\/$/, '') : null;
}

function cuubApiToken() {
    return process.env.CUUB_API_TOKEN?.trim() || null;
}

function parseJson(text) {
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

function fetchCuubApi({ path, method, headers, body, requireAuth }, callback) {
    const baseUrl = cuubApiUrl();
    const token = cuubApiToken();

    if (!baseUrl) {
        callback(503, { success: false, error: 'CUUB_API_URL is not configured' });
        return;
    }
    if (requireAuth && !token) {
        callback(503, { success: false, error: 'CUUB_API_TOKEN is not configured' });
        return;
    }

    let parsed;
    try {
        parsed = new URL(baseUrl);
    } catch (error) {
        callback(500, { success: false, error: 'Invalid CUUB_API_URL' });
        return;
    }

    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    const port = parsed.port || (isHttps ? 443 : 80);
    const postData = body ?? null;

    const options = {
        hostname: parsed.hostname,
        port,
        path,
        method,
        headers: {
            Accept: 'application/json',
            ...(requireAuth ? { Authorization: `Bearer ${token}` } : {}),
            ...(headers ?? {}),
            ...(postData
                ? { 'Content-Length': Buffer.byteLength(postData) }
                : {}),
        },
    };

    const request = client.request(options, (apiResponse) => {
        let data = '';
        apiResponse.on('data', (chunk) => {
            data += chunk;
        });
        apiResponse.on('end', () => {
            const json = parseJson(data);
            if (json === null) {
                callback(500, { success: false, error: 'Failed to parse API response' });
                return;
            }
            callback(apiResponse.statusCode || 500, json);
        });
    });

    request.on('error', (error) => {
        console.error('cuub-api request error:', error);
        callback(502, { success: false, error: 'Failed to reach cuub-api' });
    });

    if (postData) {
        request.write(postData);
    }
    request.end();
}

function hasValidCoords(latitude, longitude) {
    if (latitude == null || longitude == null) return false;
    const lat = Number(latitude);
    const lng = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

function locationStatus(value) {
    return String(value ?? '').toUpperCase();
}

function adaptMapToStations(mapPayload) {
    if (!mapPayload?.success || !Array.isArray(mapPayload.data)) {
        return { success: false, error: 'Invalid map response from cuub-api' };
    }

    const data = mapPayload.data
        .filter((row) => row.hasStation !== false)
        .filter((row) => hasValidCoords(row.latitude, row.longitude))
        .map((row) => ({
            id: row.locationId,
            title: row.title,
            latitude: row.latitude,
            longitude: row.longitude,
            filled_slots: null,
            open_slots: null,
            online: null,
            inactive: false,
        }));

    return { success: true, data, count: data.length };
}

function adaptLiveStations(livePayload) {
    if (!livePayload?.success || !Array.isArray(livePayload.data)) {
        return { success: false, error: 'Invalid live stations response from cuub-api' };
    }

    const coveredLocationIds = new Set();
    const data = livePayload.data
        .map((row) => {
            const loc = row.currentLocation;
            if (!loc || loc.isInventory === true) return null;
            const status = locationStatus(loc.status);
            if (status === 'ARCHIVED') return null;
            if (!hasValidCoords(loc.latitude, loc.longitude)) return null;
            if (!row.manufactureId) return null;

            if (loc.locationId) coveredLocationIds.add(String(loc.locationId));

            const live = row.live ?? null;
            const inactive = status === 'INACTIVE';
            return {
                id: row.manufactureId,
                title: loc.title,
                latitude: loc.latitude,
                longitude: loc.longitude,
                filled_slots: inactive ? null : live?.batteryCount ?? null,
                open_slots: inactive ? null : live?.openSlots ?? null,
                online: inactive ? null : live ? (live.online ?? false) : null,
                inactive,
            };
        })
        .filter(Boolean);

    return { success: true, data, count: data.length, coveredLocationIds };
}

function adaptInactiveLocations(payload) {
    if (!payload?.success || !Array.isArray(payload.data)) return [];
    return payload.data
        .map((row) => {
            if (!row.locationId || row.isInventory === true) return null;
            if (locationStatus(row.status) !== 'INACTIVE') return null;
            if (!hasValidCoords(row.latitude, row.longitude)) return null;
            return {
                id: row.locationId,
                title: row.title,
                latitude: row.latitude,
                longitude: row.longitude,
                filled_slots: null,
                open_slots: null,
                online: null,
                inactive: true,
            };
        })
        .filter(Boolean);
}

function mergeInactivePins(stations, inactivePins, coveredLocationIds) {
    const covered = coveredLocationIds instanceof Set
        ? coveredLocationIds
        : new Set(coveredLocationIds ?? []);
    const extras = inactivePins.filter((pin) => !covered.has(String(pin.id)));
    const data = [...stations, ...extras];
    return { success: true, data, count: data.length };
}

function respondWithStations(res, stationsPayload) {
    res.json(stationsPayload);
}

function fetchInactivePins(callback) {
    if (!cuubApiToken()) {
        callback([]);
        return;
    }
    fetchCuubApi(
        {
            path: '/locations?status=INACTIVE&is_inventory=false&limit=200',
            method: 'GET',
            requireAuth: true,
        },
        (status, payload) => {
            if (status !== 200) {
                console.warn('[stations] inactive locations fetch failed:', status);
                callback([]);
                return;
            }
            callback(adaptInactiveLocations(payload));
        },
    );
}

function respondWithPublicMap(res, inactivePins = []) {
    fetchCuubApi({ path: '/map', method: 'GET', requireAuth: false }, (status, payload) => {
        if (status !== 200) {
            if (inactivePins.length > 0) {
                return respondWithStations(res, {
                    success: true,
                    data: inactivePins,
                    count: inactivePins.length,
                });
            }
            return res.status(status).json(payload);
        }
        const adapted = adaptMapToStations(payload);
        if (!adapted.success) {
            return res.status(502).json(adapted);
        }
        const covered = new Set(adapted.data.map((s) => String(s.id)));
        respondWithStations(res, mergeInactivePins(adapted.data, inactivePins, covered));
    });
}

// Allow embedding in iframes (e.g. Framer at framer.com, map.cuub.tech)
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    res.removeHeader('X-Frame-Options');
    res.setHeader('Permissions-Policy', 'geolocation=*');
    next();
});

app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.get('/api/mapbox-token', (req, res) => {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) {
        return res.status(503).json({ error: 'MAPBOX_ACCESS_TOKEN is not set' });
    }
    res.json({ token });
});

app.get('/api/stations', (req, res) => {
    const livePath =
        '/stations?include_live=true&is_inventory=false&limit=200';

    fetchInactivePins((inactivePins) => {
        if (!cuubApiToken()) {
            return respondWithPublicMap(res, inactivePins);
        }

        fetchCuubApi({ path: livePath, method: 'GET', requireAuth: true }, (status, payload) => {
            if (status === 200 && payload?.success && Array.isArray(payload.data)) {
                const adapted = adaptLiveStations(payload);
                if (adapted.success && (adapted.data.length > 0 || inactivePins.length > 0)) {
                    return respondWithStations(
                        res,
                        mergeInactivePins(
                            adapted.data,
                            inactivePins,
                            adapted.coveredLocationIds,
                        ),
                    );
                }
            }

            console.warn(
                '[stations] live include_live fetch failed; falling back to GET /map:',
                status,
            );
            respondWithPublicMap(res, inactivePins);
        });
    });
});

app.get('/api/battery/:sticker_id', (req, res) => {
    const stickerId = req.params.sticker_id;
    fetchCuubApi(
        {
            path: `/battery/${encodeURIComponent(stickerId)}`,
            method: 'GET',
            requireAuth: true,
        },
        (status, payload) => res.status(status).json(payload),
    );
});

app.post('/api/battery/:sticker_id', express.json(), (req, res) => {
    const stickerId = req.params.sticker_id;
    const manufactureId = req.headers['manufacture_id'];
    const stickerType = req.headers['sticker_type'] || 'type one';
    const postData = JSON.stringify({});

    fetchCuubApi(
        {
            path: `/battery/${encodeURIComponent(stickerId)}`,
            method: 'POST',
            requireAuth: true,
            body: postData,
            headers: {
                'Content-Type': 'application/json',
                manufacture_id: manufactureId || '',
                sticker_type: stickerType,
            },
        },
        (status, payload) => res.status(status).json(payload),
    );
});

// sizl advert flow deprecated — noop stub for legacy clients.
app.patch('/api/battery/:sticker_id', express.json(), (req, res) => {
    res.json({ success: true });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'map_view.html'));
});

app.get('/map', (req, res) => {
    res.sendFile(path.join(__dirname, 'map_view.html'));
});

app.get('/map.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'map_view.html'));
});

app.get('/blank', (req, res) => {
    res.sendFile(path.join(__dirname, 'map_blank.html'));
});

app.use(express.static(__dirname));

app.get('/:sticker_id', (req, res) => {
    res.sendFile(path.join(__dirname, 'map_view.html'));
});

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

if (require.main === module) {
    app.listen(PORT, HOST, () => {
        console.log(`Server running on ${HOST}:${PORT}`);
        console.log(`cuub-api upstream -> ${cuubApiUrl() || '(CUUB_API_URL not set)'}`);
    });
}

module.exports = app;
