// Mapbox access token
const MAPBOX_TOKEN = 'pk.eyJ1IjoidmxhZHZhbGNoa291IiwiYSI6ImNtYzlhemFpZTF2MXUya29sNzM4OXhuZjYifQ.jrfH07QPTw_XfnmXXv42Pw';

// CUUB API endpoint (proxied through server to avoid CORS)
const STATIONS_API = '/api/stations';

// Initialize map
mapboxgl.accessToken = MAPBOX_TOKEN;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/standard',
    config: {
        basemap: {
            lightPreset: "dusk",
            showPedestrianRoads: false,
            showPlaceLabels: false,
            showPointOfInterestLabels: false,
            showTransitLabels: false,
            showAdminBoundaries: false,
            show3dFacades: true,
            theme: "faded"
        }
    },
    center: [-87.65, 41.9295],
    zoom: 13.5,
    bearing: 0.00,
    pitch: 45,
});

// Store stations data
let stations = [];
let selectedStation = null;
let selectedStationId = null;

// DOM elements
const modal = document.getElementById('stationModal');
const modalTitle = document.getElementById('modalTitle');
const filledSlots = document.getElementById('filledSlots');
const openSlots = document.getElementById('openSlots');
const directionsButton = document.getElementById('directionsButton');

// Convert stations to GeoJSON format
function stationsToGeoJSON(stations, selectedId = null) {
    return {
        type: 'FeatureCollection',
        features: stations.map(station => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [parseFloat(station.longitude), parseFloat(station.latitude)]
            },
            properties: {
                id: station.id,
                title: station.title,
                filled_slots: station.filled_slots,
                open_slots: station.open_slots,
                latitude: station.latitude,
                longitude: station.longitude,
                selected: station.id === selectedId
            }
        }))
    };
}

// Fetch stations from CUUB API
async function fetchStations() {
    try {
        const response = await fetch(STATIONS_API);
        const result = await response.json();
        
        if (result.success && result.data) {
            stations = result.data;
            addMarkersToMap(stations);
        } else {
            console.error('Failed to fetch stations:', result);
        }
    } catch (error) {
        console.error('Error fetching stations:', error);
    }
}

// Add markers to the map with clustering
function addMarkersToMap(stations) {
    const geojson = stationsToGeoJSON(stations, selectedStationId);
    
    // Add source with clustering enabled (Mapbox standard configuration)
    map.addSource('stations', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14, // Max zoom to cluster points on
        clusterRadius: 50, // Radius of each cluster when clustering points (Mapbox default)
        clusterProperties: {
            // Keep any aggregated properties here if needed
        }
    });
    
    // Add cluster circles layer (Mapbox standard pattern)
    map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'stations',
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': [
                'step',
                ['get', 'point_count'],
                '#0198FD',  // Default color for small clusters
                10, '#0198FD',  // Color for medium clusters
                30, '#0198FD'   // Color for large clusters
            ],
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                20,  // Default size for clusters
                10, 30,  // If point_count >= 10, size = 50
                30, 30   // If point_count >= 30, size = 60
            ],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 1
        }
    });
    
    // Add cluster count labels
    map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'stations',
        filter: ['has', 'point_count'],
        layout: {
            'text-field': [
                'to-string',
                ['get', 'point_count']
            ],
            'text-size': [
                'step',
                ['get', 'point_count'],
                14,  // Default size for small clusters
                10, 16,  // If point_count >= 10, size = 16
                30, 18   // If point_count >= 30, size = 18
            ],
            'text-allow-overlap': true,
            'text-ignore-placement': true
        },
        paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1
        }
    });
    
    // Add individual station markers (non-clustered)
    map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'stations',
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-color': '#0198FD',
            'circle-radius': [
                'case',
                ['get', 'selected'],
                18,  // 20% larger when selected (15 * 1.2 = 18)
                15   // Normal size
            ],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff'
        }
    });
    
    // Handle clicks on clusters (Mapbox standard pattern)
    map.on('click', 'clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, {
            layers: ['clusters']
        });
        const clusterId = features[0].properties.cluster_id;
        const pointCount = features[0].properties.point_count;
        
        // Get the expansion zoom for this cluster
        map.getSource('stations').getClusterExpansionZoom(
            clusterId,
            (err, zoom) => {
                if (err) return;
                
                map.easeTo({
                    center: features[0].geometry.coordinates,
                    zoom: zoom
                });
            }
        );
    });
    
    // Handle clicks on individual markers
    map.on('click', 'unclustered-point', (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const properties = e.features[0].properties;
        
        // Find the station from our stations array
        const station = stations.find(s => s.id === properties.id);
        if (station) {
            selectStation(station);
        }
    });
    
    // Change cursor on hover
    map.on('mouseenter', 'clusters', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'clusters', () => {
        map.getCanvas().style.cursor = '';
    });
    
    map.on('mouseenter', 'unclustered-point', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'unclustered-point', () => {
        map.getCanvas().style.cursor = '';
    });
}

// Select a station and update marker size
function selectStation(station) {
    // Update selected station
    selectedStation = station;
    selectedStationId = station.id;
    
    // Update the source data to mark the selected station
    const geojson = stationsToGeoJSON(stations, selectedStationId);
    map.getSource('stations').setData(geojson);
    
    // Show modal
    showStationModal(station);
}

// Show station modal with station data
function showStationModal(station) {
    modalTitle.textContent = station.title || 'Title';
    filledSlots.textContent = station.filled_slots || 0;
    openSlots.textContent = station.open_slots || 0;
    
    modal.classList.add('active');
    
    // Move support button up to avoid overlay
    const supportButton = document.getElementById('supportButton');
    if (supportButton) {
        const modalHeight = modal.offsetHeight || 200; // Get modal height or use default
        supportButton.style.bottom = `${modalHeight + 20}px`; // Modal height + 20px padding
    }
}

// Hide station modal and reset marker size
function hideStationModal() {
    modal.classList.remove('active');
    selectedStation = null;
    selectedStationId = null;
    
    // Move support button back to original position
    const supportButton = document.getElementById('supportButton');
    if (supportButton) {
        supportButton.style.bottom = '20px';
    }
    
    // Update the source data to unmark all stations
    const geojson = stationsToGeoJSON(stations, null);
    map.getSource('stations').setData(geojson);
}

// Handle directions button click
directionsButton.addEventListener('click', () => {
    if (selectedStation) {
        const { latitude, longitude } = selectedStation;
        
        // Open directions in default map app
        // For iOS: use maps://
        // For Android: use geo: or google.navigation:
        // Universal: use https://maps.google.com/maps?daddr=
        
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        let directionsUrl;
        
        if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
            // iOS
            directionsUrl = `maps://maps.google.com/maps?daddr=${latitude},${longitude}`;
        } else if (/android/i.test(userAgent)) {
            // Android
            directionsUrl = `google.navigation:q=${latitude},${longitude}`;
        } else {
            // Fallback to web
            directionsUrl = `https://maps.google.com/maps?daddr=${latitude},${longitude}`;
        }
        
        window.location.href = directionsUrl;
    }
});

// Close modal when clicking outside (on the map)
map.on('click', (e) => {
    // Check if click was on a feature (cluster or marker)
    const features = map.queryRenderedFeatures(e.point, {
        layers: ['clusters', 'unclustered-point']
    });
    
    // Only close if clicking on the map itself, not on a feature
    if (features.length === 0) {
        hideStationModal();
    }
});

// Initialize: fetch stations when map loads
map.on('load', () => {
    fetchStations();
});

// Get sticker_id from URL path (if available)
function getStickerIdFromURL() {
    const path = window.location.pathname;
    // Remove leading slash and get the sticker_id
    const stickerId = path.replace(/^\//, '');
    // If it's empty or matches known routes, return null
    if (!stickerId || stickerId === 'map' || stickerId === 'api' || stickerId.includes('.')) {
        return null;
    }
    return stickerId;
}

// Customer Support Button - redirect to SMS
const supportButton = document.getElementById('supportButton');
if (supportButton) {
    supportButton.addEventListener('click', () => {
        // Format phone number for SMS (remove dashes and spaces)
        const phoneNumber = '7739460236';
        
        // Get sticker_id from URL if available
        const stickerId = getStickerIdFromURL();
        
        // Build SMS URL with optional body text
        let smsUrl = `sms:${phoneNumber}`;
        if (stickerId) {
            const messageText = `The number on my battery is ${stickerId}`;
            smsUrl += `?body=${encodeURIComponent(messageText)}`;
        }
        
        // Use sms: protocol to open SMS app
        window.location.href = smsUrl;
    });
}
