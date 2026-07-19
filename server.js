require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const app = express();

function isCuubApiMirrorEnabled() {
    const flag = process.env.CUUB_API_MIRROR_ENABLED;
    return flag === 'true' || flag === '1';
}

function mirrorScanToCuubApi(stickerId, manufactureId) {
    if (!isCuubApiMirrorEnabled()) {
        return;
    }

    const baseUrl = process.env.CUUB_API_URL?.trim();
    const token = process.env.CUUB_API_TOKEN?.trim();
    if (!baseUrl || !token) {
        console.warn('[cuub-api mirror] CUUB_API_MIRROR_ENABLED but CUUB_API_URL or CUUB_API_TOKEN is missing');
        return;
    }

    let parsed;
    try {
        parsed = new URL(baseUrl);
    } catch (error) {
        console.error('[cuub-api mirror] Invalid CUUB_API_URL:', baseUrl, error.message);
        return;
    }

    const postData = JSON.stringify({});
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    const port = parsed.port || (isHttps ? 443 : 80);
    const requestPath = `/battery/${encodeURIComponent(stickerId)}`;

    const options = {
        hostname: parsed.hostname,
        port,
        path: requestPath,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            Authorization: `Bearer ${token}`,
            ...(manufactureId ? { manufacture_id: manufactureId } : {}),
        },
    };

    const mirrorRequest = client.request(options, (mirrorResponse) => {
        let data = '';

        mirrorResponse.on('data', (chunk) => {
            data += chunk;
        });

        mirrorResponse.on('end', () => {
            if (mirrorResponse.statusCode === 201) {
                console.log(`[cuub-api mirror] scan recorded for ${stickerId}`);
                return;
            }

            console.warn(
                `[cuub-api mirror] ${stickerId} -> HTTP ${mirrorResponse.statusCode}:`,
                data.slice(0, 300),
            );
        });
    });

    mirrorRequest.on('error', (error) => {
        console.warn(`[cuub-api mirror] ${stickerId} network error:`, error.message);
    });

    mirrorRequest.write(postData);
    mirrorRequest.end();
}

// Allow embedding in iframes (e.g. Framer at framer.com, map.cuub.tech)
app.use((req, res, next) => {
    // Permit any parent origin to frame this app (replaces restrictive X-Frame-Options)
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    res.removeHeader('X-Frame-Options');
    // Allow geolocation inside cross-origin iframes. The parent page MUST still
    // include allow="geolocation" on the <iframe> tag for browsers to delegate it.
    res.setHeader('Permissions-Policy', 'geolocation=*');
    next();
});

// Enable CORS for API endpoints
app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Mapbox public token from env (keeps pk. token out of git for push protection)
app.get('/api/mapbox-token', (req, res) => {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) {
        return res.status(503).json({ error: 'MAPBOX_ACCESS_TOKEN is not set' });
    }
    res.json({ token });
});

// Proxy endpoint for CUUB stations API
app.get('/api/stations', (req, res) => {
    const options = {
        hostname: 'api.cuub.tech',
        path: '/stations',
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    };

    const request = https.request(options, (apiResponse) => {
        let data = '';

        apiResponse.on('data', (chunk) => {
            data += chunk;
        });

        apiResponse.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                res.json(jsonData);
            } catch (error) {
                console.error('Error parsing API response:', error);
                res.status(500).json({ success: false, error: 'Failed to parse API response' });
            }
        });
    });

    request.on('error', (error) => {
        console.error('Error fetching stations:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch stations' });
    });

    request.end();
});

// Proxy endpoint for CUUB battery API (GET)
app.get('/api/battery/:sticker_id', (req, res) => {
    const stickerId = req.params.sticker_id;
    
    const options = {
        hostname: 'api.cuub.tech',
        path: `/battery/${stickerId}`,
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    };

    const request = https.request(options, (apiResponse) => {
        let data = '';

        apiResponse.on('data', (chunk) => {
            data += chunk;
        });

        apiResponse.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                res.json(jsonData);
            } catch (error) {
                console.error('Error parsing API response:', error);
                res.status(500).json({ success: false, error: 'Failed to parse API response' });
            }
        });
    });

    request.on('error', (error) => {
        console.error('Error fetching battery data:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch battery data' });
    });

    request.end();
});

// Proxy endpoint for CUUB battery API (POST - create scan record)
app.post('/api/battery/:sticker_id', express.json(), (req, res) => {
    const stickerId = req.params.sticker_id;
    const manufactureId = req.headers['manufacture_id'];
    const stickerType = req.headers['sticker_type'] || 'type one';
    
    const postData = JSON.stringify({});

    mirrorScanToCuubApi(stickerId, manufactureId);
    
    const options = {
        hostname: 'api.cuub.tech',
        path: `/battery/${stickerId}`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'manufacture_id': manufactureId || '',
            'sticker_type': stickerType
        }
    };

    const request = https.request(options, (apiResponse) => {
        let data = '';

        apiResponse.on('data', (chunk) => {
            data += chunk;
        });

        apiResponse.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                res.json(jsonData);
            } catch (error) {
                console.error('Error parsing API response:', error);
                res.status(500).json({ success: false, error: 'Failed to parse API response' });
            }
        });
    });

    request.on('error', (error) => {
        console.error('Error creating scan record:', error);
        res.status(500).json({ success: false, error: 'Failed to create scan record' });
    });

    request.write(postData);
    request.end();
});

// Proxy endpoint for CUUB battery API (PATCH - update sizl redirect status)
app.patch('/api/battery/:sticker_id', express.json(), (req, res) => {
    const stickerId = req.params.sticker_id;
    const manufactureId = req.headers['manufacture_id'];
    
    const patchData = JSON.stringify({ sizl: true });
    
    const options = {
        hostname: 'api.cuub.tech',
        path: `/battery/${stickerId}`,
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(patchData),
            'manufacture_id': manufactureId || ''
        }
    };

    const request = https.request(options, (apiResponse) => {
        let data = '';

        apiResponse.on('data', (chunk) => {
            data += chunk;
        });

        apiResponse.on('end', () => {
            try {
                const jsonData = JSON.parse(data);
                res.json(jsonData);
            } catch (error) {
                console.error('Error parsing API response:', error);
                res.status(500).json({ success: false, error: 'Failed to parse API response' });
            }
        });
    });

    request.on('error', (error) => {
        console.error('Error updating sizl status:', error);
        res.status(500).json({ success: false, error: 'Failed to update sizl status' });
    });

    request.write(patchData);
    request.end();
});

// Serve map view as default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'map_view.html'));
});

// Also serve map view at /map for backwards compatibility
app.get('/map', (req, res) => {
    res.sendFile(path.join(__dirname, 'map_view.html'));
});

// Embed-friendly URL (matches Framer iframe pattern: .../map.html)
app.get('/map.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'map_view.html'));
});

// Map only: stations, no scan UI or support button
app.get('/blank', (req, res) => {
    res.sendFile(path.join(__dirname, 'map_blank.html'));
});

// Serve static files (HTML, JS, CSS) - serves existing files, passes through for non-files
app.use(express.static(__dirname));

// Serve map view with scan service for sticker_id routes
// This catch-all route should come after static file serving
app.get('/:sticker_id', (req, res) => {
    // Serve map view with scan service for sticker IDs
    res.sendFile(path.join(__dirname, 'map_view.html'));
});

// Start server - Cloud Run will set PORT environment variable
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0'; // Listen on all network interfaces for Cloud Run

if (require.main === module) {
    app.listen(PORT, HOST, () => {
        console.log(`Server running on ${HOST}:${PORT}`);
        if (isCuubApiMirrorEnabled()) {
            console.log(`cuub-api scan mirror enabled -> ${process.env.CUUB_API_URL || '(CUUB_API_URL not set)'}`);
        }
    });
}

module.exports = app;
