
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const batteryIdMap = require('./public/batteryIdMap');
const { locationManager } = require('./locations.js');
const compression = require('compression');
const supplierApi = require('./supplierApi');
const qrStats = require('./qrStats');

const app = express();

// Middleware optimization
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware for better performance
app.use(compression());

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// API cache
const apiCache = new Map();
const CACHE_TTL = 10000; // 10 seconds


const getCachedData = (key) => {
    const cached = apiCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    apiCache.delete(key);
    return null;
};

// Analytics tracking middleware - uses qrStats module
const trackAnalytics = qrStats.trackingMiddleware;

// Specific routes (must come before static middleware)
// Admin route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin.html'));
});

app.get('/map.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/map.html'));
});

// Stats page route
app.get('/stats', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/qrStats.html'));
});

// Key management page route
app.get('/key', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/key.html'));
});

// Landing page route with analytics tracking
app.get('/', trackAnalytics, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index-backup.html'));
});

// Static files with caching (after specific routes)
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0'
}));

// Battery ID routes with analytics tracking (only for valid battery IDs)
app.get('/:batteryId', (req, res, next) => {
    const batteryId = req.params.batteryId;
    
    // Skip static files and other non-battery ID routes
    const skipRoutes = ['stats', 'admin', 'map', 'key', 'favicon.ico', 'robots.txt', 'sitemap.xml'];
    if (batteryId.includes('.') || skipRoutes.includes(batteryId)) {
        return next(); // Let other routes or static middleware handle these
    }
    
    // Apply analytics tracking for valid battery IDs
    trackAnalytics(req, res, () => {
        res.sendFile(path.join(__dirname, 'public/index-backup.html'));
    });
});

// Input validation middleware
const validateBatteryId = (req, res, next) => {
    const { batteryId } = req.params;
    if (!batteryId || !(batteryId in batteryIdMap)) {
        return res.status(400).json({ error: "Invalid battery ID" });
    }
    const realBatteryId = batteryIdMap[batteryId];
    if (!realBatteryId || realBatteryId.trim() === '') {
        return res.status(400).json({ error: "Battery ID not configured" });
    }
    next();
};



// Station data endpoint
app.get('/api/stations', async (req, res) => {
    const cacheKey = 'stations';
    const cachedData = getCachedData(cacheKey);
    
    if (cachedData) {
        return res.json(cachedData);
    }

    try {
        // Fetch all stations from external API
        const allStations = await locationManager.getAll();
        const stationIds = allStations.map(s => s.id);
        
        // Fetch station data (automatically uses ChargeNow or Energo API based on station ID)
        const stationsData = await supplierApi.fetchMultipleStations(stationIds);
        
        // Create a map of station info by ID
        const stationInfoMap = {};
        allStations.forEach(station => {
            stationInfoMap[station.id] = station;
        });
        
        // Merge with location data
        const stations = stationsData.map(stationData => {
            const stationInfo = stationInfoMap[stationData.id];
            
            return {
                id: stationData.id,
                name: stationInfo?.name || `Station ${stationData.id}`,
                address: stationInfo?.address || '',
                coordinates: stationInfo?.coordinates || [0, 0],
                hours: stationInfo?.hours || null,
                isOpen: stationInfo?.hours ? locationManager.isOpen(stationData.id) : true,
                available: stationData.available || 0,
                occupied: stationData.occupied || 0,
                error: stationData.error || false
            };
        });
        
        // Cache the result
        apiCache.set(cacheKey, {
            data: stations,
            timestamp: Date.now()
        });
        
        res.json(stations);
    } catch (error) {
        console.error('Error fetching station data:', error);
        res.status(500).json({ error: 'Failed to fetch station data' });
    }
});

// Locations data endpoint
app.get('/api/locations', async (req, res) => {
    try {
        const locations = await locationManager.getForMap();
        res.json(locations);
    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});

// Station management endpoints
app.get('/api/admin/stations', async (req, res) => {
    try {
        const stations = await locationManager.getAll();
        res.json(stations);
    } catch (error) {
        console.error('Error fetching stations:', error);
        res.status(500).json({ error: 'Failed to fetch stations' });
    }
});

app.post('/api/admin/stations', async (req, res) => {
    try {
        const { id, name, address, coordinates, hours } = req.body;
        
        // Validate required fields
        if (!id || !name || !coordinates) {
            return res.status(400).json({ error: 'Missing required fields: id, name, coordinates' });
        }
        
        // Validate coordinates format
        if (!Array.isArray(coordinates) || coordinates.length !== 2) {
            return res.status(400).json({ error: 'Coordinates must be an array with [longitude, latitude]' });
        }
        
        // Check if station already exists
        const existingStation = await locationManager.getById(id);
        if (existingStation) {
            return res.status(409).json({ error: 'Station with this ID already exists' });
        }
        
        // Add the new station
        const stationData = { name, coordinates };
        if (address) stationData.address = address;
        if (hours) stationData.hours = hours;
        
        const newStation = await locationManager.add(id, stationData);
        
        res.status(201).json({ 
            message: 'Station added successfully', 
            station: newStation
        });
    } catch (error) {
        console.error('Error adding station:', error);
        res.status(500).json({ error: error.message || 'Failed to add station' });
    }
});

app.put('/api/admin/stations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, address, coordinates, hours } = req.body;
        
        // Check if station exists
        const existingStation = await locationManager.getById(id);
        if (!existingStation) {
            return res.status(404).json({ error: 'Station not found' });
        }
        
        // Validate coordinates format if provided
        if (coordinates && (!Array.isArray(coordinates) || coordinates.length !== 2)) {
            return res.status(400).json({ error: 'Coordinates must be an array with [longitude, latitude]' });
        }
        
        // Update the station
        const updateData = {};
        if (name) updateData.name = name;
        if (address) updateData.address = address;
        if (coordinates) updateData.coordinates = coordinates;
        if (hours) updateData.hours = hours;
        
        const updatedStation = await locationManager.update(id, updateData);
        
        res.json({ 
            message: 'Station updated successfully', 
            station: updatedStation
        });
    } catch (error) {
        console.error('Error updating station:', error);
        res.status(500).json({ error: error.message || 'Failed to update station' });
    }
});

app.delete('/api/admin/stations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if station exists
        const existingStation = await locationManager.getById(id);
        if (!existingStation) {
            return res.status(404).json({ error: 'Station not found' });
        }
        
        // Remove the station
        await locationManager.remove(id);
        
        res.json({ message: 'Station deleted successfully' });
    } catch (error) {
        console.error('Error deleting station:', error);
        res.status(500).json({ error: error.message || 'Failed to delete station' });
    }
});

// Battery data endpoint
app.get('/api/battery/:batteryId', validateBatteryId, async (req, res) => {
    const customBatteryId = req.params.batteryId;
    const realBatteryId = batteryIdMap[customBatteryId];
    
    const cacheKey = `battery_${realBatteryId}`;
    const cachedData = getCachedData(cacheKey);
    
    if (cachedData) {
        return res.json(cachedData);
    }

    try {
        console.log(`Fetching battery data for ${customBatteryId} -> ${realBatteryId}`);
        // Use the ChargeNow API module to find battery
        const result = await supplierApi.findBatteryById(realBatteryId);
        
        if (result.success) {
            // Cache the result
            apiCache.set(cacheKey, {
                data: result.data,
                timestamp: Date.now()
            });
            res.json(result.data);
        } else {
            console.error(`Battery lookup failed for ${realBatteryId}:`, result.error);
            res.status(404).json({ error: result.error || "Battery not found" });
        }
    } catch (error) {
        console.error("Error fetching battery data:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});






// Analytics API endpoints
app.get('/api/analytics', (req, res) => {
    try {
        res.json(qrStats.getStats());
    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics data' });
    }
});

app.get('/api/analytics/summary', (req, res) => {
    try {
        res.json(qrStats.getStatsSummary());
    } catch (error) {
        console.error('Error fetching analytics summary:', error);
        res.status(500).json({ error: 'Failed to fetch analytics summary' });
    }
});

// Energo token API endpoints
app.get('/api/energo-token', (req, res) => {
    try {
        const token = supplierApi.getEnergoToken();
        res.json({ token: token || '' });
    } catch (error) {
        console.error('Error fetching Energo token:', error);
        res.status(500).json({ error: 'Failed to fetch token' });
    }
});

app.post('/api/energo-token', (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token || typeof token !== 'string' || !token.trim()) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const success = supplierApi.updateEnergoToken(token);
        
        if (success) {
            res.json({ success: true, message: 'Token updated successfully' });
        } else {
            res.status(500).json({ error: 'Failed to update token' });
        }
    } catch (error) {
        console.error('Error updating Energo token:', error);
        res.status(500).json({ error: 'Failed to update token' });
    }
});

// Logging middleware for development
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message 
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    
    // Stop background polling
    if (stationPollingStop) stationPollingStop();
    if (batteryPollingStop) batteryPollingStop();
    
    qrStats.saveStats();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    
    // Stop background polling
    if (stationPollingStop) stationPollingStop();
    if (batteryPollingStop) batteryPollingStop();
    
    qrStats.saveStats();
    process.exit(0);
});

// Load analytics data on startup
qrStats.loadStats();

// Background polling for ChargeNow API
let stationPollingStop = null;
let batteryPollingStop = null;

// Start background polling for station data
const startBackgroundPolling = async () => {
    console.log('Starting background polling for ChargeNow API...');
    
    try {
        // Fetch station IDs from external API
        const allStations = await locationManager.getAll();
        const stationIds = allStations.map(s => s.id);
        
        // Poll station data every 30 seconds
        stationPollingStop = supplierApi.pollStationData(
            stationIds,
            30000, // 30 seconds
            async (error, data) => {
                if (error) {
                    console.error('Error in station polling:', error.message);
                } else {
                    try {
                        // Fetch latest stations from external API
                        const allStations = await locationManager.getAll();
                        const stationInfoMap = {};
                        allStations.forEach(station => {
                            stationInfoMap[station.id] = station;
                        });
                        
                        console.log(`Background: Fetched data for ${data.length} stations`);
                        // Update cache with fresh data
                        const stations = data.map(stationData => {
                            const stationInfo = stationInfoMap[stationData.id];
                            return {
                                id: stationData.id,
                                name: stationInfo?.name || `Station ${stationData.id}`,
                                address: stationInfo?.address || '',
                                coordinates: stationInfo?.coordinates || [0, 0],
                                hours: stationInfo?.hours || null,
                                isOpen: stationInfo?.hours ? locationManager.isOpen(stationData.id) : true,
                                available: stationData.available || 0,
                                occupied: stationData.occupied || 0,
                                error: stationData.error || false
                            };
                        });
                        
                        apiCache.set('stations', {
                            data: stations,
                            timestamp: Date.now()
                        });
                    } catch (fetchError) {
                        console.error('Error fetching stations in polling callback:', fetchError);
                    }
                }
            }
        );
    } catch (error) {
        console.error('Error starting background polling:', error);
    }
    
    // Poll battery orders every 60 seconds
    batteryPollingStop = supplierApi.pollBatteryOrders(
        60000, // 60 seconds
        (error, data) => {
            if (error) {
                console.error('Error in battery orders polling:', error.message);
            } else if (data.success) {
                console.log(`Background: Fetched ${data.data.length} battery orders`);
                // Battery data is fetched on-demand, so we don't cache all of it
                // But we can perform any background processing here if needed
            }
        }
    );
    
    console.log('Background polling started successfully');
};

// Check API health on startup
supplierApi.checkApiHealth().then(isHealthy => {
    if (isHealthy) {
        console.log('ChargeNow API is healthy');
        startBackgroundPolling();
    } else {
        console.warn('ChargeNow API health check failed, will retry polling in 30 seconds');
        setTimeout(startBackgroundPolling, 30000);
    }
});

// Start Energo API token keep-alive to prevent token expiration
// This runs in the background and sends a request every minute
let energoTokenKeepAliveStop = null;
energoTokenKeepAliveStop = supplierApi.startEnergoTokenKeepAlive('RL3D52000012', 60000);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle server errors
server.on('error', (err) => {
    console.error('Server error:', err);
});

module.exports = app;
