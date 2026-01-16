// Station data management using external API
// All station data is now stored in an external database and accessed via API

const fetch = require('node-fetch');
const API_BASE_URL = 'https://api.cuub.tech/stations';

// Helper functions for station management via API
const locationManager = {
    // Fetch all stations from API
    getAll: async () => {
        try {
            const response = await fetch(API_BASE_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const result = await response.json();
            
            if (result.success && result.data) {
                // Convert API format to internal format
                return result.data.map(station => ({
                    id: station.id,
                    name: station.title,
                    coordinates: [parseFloat(station.longitude), parseFloat(station.latitude)],
                    updated_at: station.updated_at
                }));
            }
            return [];
        } catch (error) {
            console.error('Error fetching all stations:', error);
            return [];
        }
    },
    
    // Get all location IDs
    getAllIds: async () => {
        const stations = await locationManager.getAll();
        return stations.map(s => s.id);
    },
    
    // Get a specific location by ID
    getById: async (id) => {
        try {
            const response = await fetch(`${API_BASE_URL}/${id}`);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const result = await response.json();
            
            if (result.success && result.data) {
                const station = result.data;
                return {
                    id: station.id,
                    name: station.title,
                    coordinates: [parseFloat(station.longitude), parseFloat(station.latitude)],
                    updated_at: station.updated_at
                };
            }
            return null;
        } catch (error) {
            console.error(`Error fetching station ${id}:`, error);
            return null;
        }
    },
    
    // Get locations formatted for map display
    getForMap: async () => {
        const stations = await locationManager.getAll();
        return stations.map(station => ({
            id: station.id,
            name: station.name,
            coordinates: station.coordinates
        }));
    },
    
    // Get locations formatted for server API
    getForServer: async () => {
        const stations = await locationManager.getAll();
        return stations.map(station => ({
            id: station.id,
            name: station.name,
            coordinates: station.coordinates
        }));
    },
    
    // Check if a location is currently open (always returns true since API doesn't have hours)
    isOpen: (id) => {
        // External API doesn't provide hours, so always return true
        return true;
    },
    
    // Add a new station
    add: async (id, locationData) => {
        try {
            const response = await fetch(API_BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: id,
                    title: locationData.name,
                    latitude: locationData.coordinates[1],
                    longitude: locationData.coordinates[0]
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `HTTP error! Status: ${response.status}`);
            }
            
            const result = await response.json();
            if (result.success) {
                return {
                    id: result.data.id,
                    name: result.data.title,
                    coordinates: [parseFloat(result.data.longitude), parseFloat(result.data.latitude)]
                };
            }
            throw new Error('Failed to add station');
        } catch (error) {
            console.error('Error adding station:', error);
            throw error;
        }
    },
    
    // Remove a station
    remove: async (id) => {
        try {
            const response = await fetch(`${API_BASE_URL}/${id}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `HTTP error! Status: ${response.status}`);
            }
            
            const result = await response.json();
            return result.success;
        } catch (error) {
            console.error('Error removing station:', error);
            throw error;
        }
    },
    
    // Update a station
    update: async (id, locationData) => {
        try {
            const updateData = {};
            if (locationData.name) updateData.title = locationData.name;
            if (locationData.coordinates) {
                updateData.latitude = locationData.coordinates[1];
                updateData.longitude = locationData.coordinates[0];
            }
            
            const response = await fetch(`${API_BASE_URL}/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `HTTP error! Status: ${response.status}`);
            }
            
            const result = await response.json();
            if (result.success) {
                return {
                    id: result.data.id,
                    name: result.data.title,
                    coordinates: [parseFloat(result.data.longitude), parseFloat(result.data.latitude)]
                };
            }
            throw new Error('Failed to update station');
        } catch (error) {
            console.error('Error updating station:', error);
            throw error;
        }
    }
};

module.exports = {
    locationManager
};
