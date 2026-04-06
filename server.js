const express = require('express');
const path = require('path');
const https = require('https');
const app = express();

// Allow embedding in iframes (e.g. Framer at framer.com, map.cuub.tech)
app.use((req, res, next) => {
    // Permit any parent origin to frame this app (replaces restrictive X-Frame-Options)
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    res.removeHeader('X-Frame-Options');
    next();
});

// Enable CORS for API endpoints
app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
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
    });
}

module.exports = app;
