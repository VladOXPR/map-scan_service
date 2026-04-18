// CUUB API endpoint (proxied through server to avoid CORS)
const STATIONS_API = '/api/stations';

// Map instance (created after token is loaded from /api/mapbox-token)
let map;

// Store stations data
let stations = [];
let selectedStation = null;
let selectedStationId = null;

// Nearest-station / geolocation state
let nearestStationId = null;
let userCoords = null;                 // { latitude, longitude }
let userLocationMarker = null;          // mapboxgl.Marker
let haloPulseInterval = null;
let pendingLocateAfterStations = false; // user coords arrived before stations list

// Location-prompt modal state (focus trap + restore)
let lastFocusedBeforeLocModal = null;
let locModalKeydownHandler = null;
let toastTimeoutId = null;

// Constants
const FAR_STATION_METERS = 50000;
const LOC_SESSION_KEY = 'cuub:locationPrompt';

// DOM elements
const modal = document.getElementById('stationModal');
const modalTitle = document.getElementById('modalTitle');
const filledSlots = document.getElementById('filledSlots');
const openSlots = document.getElementById('openSlots');
const directionsButton = document.getElementById('directionsButton');

// Convert stations to GeoJSON format
function stationsToGeoJSON(stations, selectedId = null, nearestId = null) {
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
                selected: station.id === selectedId,
                nearest: nearestId != null && station.id === nearestId
            }
        }))
    };
}

// Push current state into the stations source. Safe to call before map/source exist.
function refreshStationsSource() {
    if (!map) return;
    const source = map.getSource('stations');
    if (!source) return;
    source.setData(stationsToGeoJSON(stations, selectedStationId, nearestStationId));
}

// Fetch stations from CUUB API
async function fetchStations() {
    try {
        const response = await fetch(STATIONS_API);
        const result = await response.json();
        
        if (result.success && result.data) {
            stations = result.data;
            addMarkersToMap(stations);
            // If the user already granted location before stations loaded, finish that flow now.
            if (pendingLocateAfterStations && userCoords) {
                pendingLocateAfterStations = false;
                applyUserCoords(userCoords);
            }
        } else {
            console.error('Failed to fetch stations:', result);
        }
    } catch (error) {
        console.error('Error fetching stations:', error);
    }
}

// Add markers to the map with clustering
function addMarkersToMap(stations) {
    const geojson = stationsToGeoJSON(stations, selectedStationId, nearestStationId);
    
    // Add source with clustering enabled (Mapbox standard configuration)
    map.addSource('stations', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 13, // Max zoom to cluster points on
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
    
    // Nearest-station accent halo. Added BEFORE unclustered-point so it renders underneath.
    map.addLayer({
        id: 'nearest-halo',
        type: 'circle',
        source: 'stations',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'nearest'], true]],
        paint: {
            'circle-radius': 26,
            'circle-color': '#0198FD',
            'circle-opacity': 0.28,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0198FD',
            'circle-stroke-opacity': 0.6
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
    refreshStationsSource();
    
    // Show modal
    showStationModal(station);
}

// Show station modal with station data
function showStationModal(station) {
    modalTitle.textContent = station.title || 'Title';
    filledSlots.textContent = station.filled_slots || 0;
    openSlots.textContent = station.open_slots || 0;
    
    modal.classList.add('active');
    
    // Move support + nearest buttons up to avoid overlay
    const modalHeight = modal.offsetHeight || 200;
    const lifted = `${modalHeight + 20}px`;
    const supportButton = document.getElementById('supportButton');
    if (supportButton) supportButton.style.bottom = lifted;
    const nearestBtn = document.getElementById('nearestButton');
    if (nearestBtn) nearestBtn.style.bottom = lifted;
}

// Hide station modal and reset marker size
function hideStationModal() {
    modal.classList.remove('active');
    selectedStation = null;
    selectedStationId = null;
    
    // Move support + nearest buttons back to original position
    const supportButton = document.getElementById('supportButton');
    if (supportButton) supportButton.style.bottom = '20px';
    const nearestBtn = document.getElementById('nearestButton');
    if (nearestBtn) nearestBtn.style.bottom = '20px';
    
    // Update the source data to unmark all stations
    refreshStationsSource();
}

async function startMapApp() {
    const res = await fetch('/api/mapbox-token');
    const data = await res.json();
    if (!data.token) {
        console.error('Mapbox token missing. Set MAPBOX_ACCESS_TOKEN (see .env.example).');
        return;
    }
    mapboxgl.accessToken = data.token;
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/standard',
        config: {
            basemap: {
                lightPreset: 'night',
                showPedestrianRoads: false,
                showPlaceLabels: false,
                showPointOfInterestLabels: false,
                showTransitLabels: false,
                showAdminBoundaries: false,
                show3dFacades: true,
                theme: 'faded'
            }
        },
        center: [-87.65, 41.9295],
        zoom: 13.5,
        bearing: 0.00,
        pitch: 45
    });

    if (directionsButton) {
        directionsButton.addEventListener('click', () => {
            if (selectedStation) {
                const { latitude, longitude } = selectedStation;
                const userAgent = navigator.userAgent || navigator.vendor || window.opera;
                let directionsUrl;
                if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
                    directionsUrl = `maps://maps.google.com/maps?daddr=${latitude},${longitude}`;
                } else if (/android/i.test(userAgent)) {
                    directionsUrl = `google.navigation:q=${latitude},${longitude}`;
                } else {
                    directionsUrl = `https://maps.google.com/maps?daddr=${latitude},${longitude}`;
                }
                window.location.href = directionsUrl;
            }
        });
    }

    map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, {
            layers: ['clusters', 'unclustered-point']
        });
        if (features.length === 0) {
            hideStationModal();
        }
    });

    map.on('load', () => {
        fetchStations();
    });
}

startMapApp();

// Get sticker_id from URL path (if available)
function getStickerIdFromURL() {
    const path = window.location.pathname;
    // Remove leading slash and get the sticker_id
    const stickerId = path.replace(/^\//, '');
    // If it's empty or matches known routes, return null
    if (!stickerId || stickerId === 'map' || stickerId === 'blank' || stickerId === 'api' || stickerId.includes('.')) {
        return null;
    }
    return stickerId;
}

// Customer Support Button - redirect to SMS
const supportButton = document.getElementById('supportButton');
if (supportButton) {
    supportButton.addEventListener('click', () => {
        // Format phone number for SMS (remove dashes and spaces)
        const phoneNumber = '+1464237744';
        
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

// ---------------------------------------------------------------------------
// Find-nearest-CUUB-station geolocation flow
// ---------------------------------------------------------------------------
// Flow entry points:
//   - auto-shown prompt modal (once per session) on non-sticker pages
//   - re-open via "Find nearest station" button
// On success: fly to user, drop "You are here" marker, pulse + highlight the
// nearest station, show an info card with name + distance.
// On denial/error: non-blocking toast; stations remain as-is.
// Coordinates are NEVER sent to any server.

const IS_STICKER_PAGE = !!getStickerIdFromURL();

function safeSessionGet(key) {
    try {
        if (typeof window === 'undefined' || !window.sessionStorage) return null;
        return window.sessionStorage.getItem(key);
    } catch (_) {
        return null;
    }
}

function safeSessionSet(key, value) {
    try {
        if (typeof window === 'undefined' || !window.sessionStorage) return;
        window.sessionStorage.setItem(key, value);
    } catch (_) { /* ignore quota / privacy mode */ }
}

function hasGeolocation() {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

// --- Toast / banner ---------------------------------------------------------
function showToast(message, durationMs = 4000) {
    const toast = document.getElementById('locToast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    // Trigger transition on next frame
    requestAnimationFrame(() => toast.classList.add('active'));
    if (toastTimeoutId) clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
        toast.classList.remove('active');
        // Hide after fade
        setTimeout(() => { toast.hidden = true; }, 250);
    }, durationMs);
}

// --- Nearest-station info card ---------------------------------------------
function showNearestCard(station, distanceMeters) {
    const card = document.getElementById('nearestCard');
    const name = document.getElementById('nearestCardName');
    const distance = document.getElementById('nearestCardDistance');
    const note = document.getElementById('nearestCardNote');
    if (!card || !name || !distance) return;

    name.textContent = station.title || 'CUUB Station';
    distance.textContent = (window.CuubGeo && window.CuubGeo.formatDistance)
        ? window.CuubGeo.formatDistance(distanceMeters)
        : Math.round(distanceMeters) + ' m';

    if (note) {
        const isFar = Number.isFinite(distanceMeters) && distanceMeters > FAR_STATION_METERS;
        note.hidden = !isFar;
    }

    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('active'));
}

function hideNearestCard() {
    const card = document.getElementById('nearestCard');
    if (!card) return;
    card.classList.remove('active');
    setTimeout(() => { card.hidden = true; }, 250);
}

// --- User "you are here" marker --------------------------------------------
function ensureUserMarker(coords) {
    if (!map) return;
    const lngLat = [coords.longitude, coords.latitude];
    if (userLocationMarker) {
        userLocationMarker.setLngLat(lngLat);
        return;
    }
    const el = document.createElement('div');
    el.className = 'user-location-marker';
    el.setAttribute('aria-label', 'Your current location');
    userLocationMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lngLat)
        .addTo(map);
}

// --- Nearest-halo pulse -----------------------------------------------------
function startNearestPulse() {
    if (!map) return;
    if (haloPulseInterval) return;
    let t = 0;
    haloPulseInterval = setInterval(() => {
        if (!map || !map.getLayer || !map.getLayer('nearest-halo')) return;
        t += 0.12;
        // Radius oscillates between ~22 and ~32
        const r = 27 + Math.sin(t) * 5;
        const op = 0.25 + (Math.sin(t) + 1) * 0.1; // 0.25 - 0.45
        try {
            map.setPaintProperty('nearest-halo', 'circle-radius', r);
            map.setPaintProperty('nearest-halo', 'circle-opacity', op);
        } catch (_) { /* style not ready yet */ }
    }, 60);
}

function stopNearestPulse() {
    if (haloPulseInterval) {
        clearInterval(haloPulseInterval);
        haloPulseInterval = null;
    }
}

// --- Core: apply user coords (locate, highlight, card) ---------------------
function applyUserCoords(coords) {
    if (!coords) return;
    userCoords = coords;

    // If the map isn't ready yet, defer until stations are in.
    if (!map || !map.getSource || !map.getSource('stations')) {
        pendingLocateAfterStations = true;
        return;
    }

    ensureUserMarker(coords);

    // Smooth fly to user; zoom ~16 gives a ~500m-1km visible radius.
    map.flyTo({
        center: [coords.longitude, coords.latitude],
        zoom: 15.8,
        speed: 0.9,
        curve: 1.4,
        essential: true
    });

    // Compute nearest station and update highlight + card.
    const geo = window.CuubGeo;
    if (!geo || !stations || stations.length === 0) {
        pendingLocateAfterStations = true;
        return;
    }
    const result = geo.nearestStation(coords, stations);
    if (!result) return;

    nearestStationId = result.station.id;
    refreshStationsSource();
    startNearestPulse();
    showNearestCard(result.station, result.distanceMeters);
}

// --- Geolocation request ----------------------------------------------------
function requestLocation() {
    if (!hasGeolocation()) {
        showToast('Location unavailable — showing all stations.');
        safeSessionSet(LOC_SESSION_KEY, 'unavailable');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            if (!position || !position.coords) {
                showToast('Location unavailable — showing all stations.');
                return;
            }
            applyUserCoords({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            });
        },
        (error) => {
            // PERMISSION_DENIED (1), POSITION_UNAVAILABLE (2), TIMEOUT (3)
            console.warn('Geolocation error:', error && error.code, error && error.message);
            showToast('Location unavailable — showing all stations.');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

// --- Location prompt modal (accessible dialog with focus trap + ESC) -------
function getLocModalFocusable() {
    const modalEl = document.getElementById('locModal');
    if (!modalEl) return [];
    return Array.from(modalEl.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ));
}

function openLocModal() {
    const backdrop = document.getElementById('locBackdrop');
    const modalEl = document.getElementById('locModal');
    if (!backdrop || !modalEl) return;

    lastFocusedBeforeLocModal = document.activeElement;
    backdrop.hidden = false;
    modalEl.hidden = false;
    // Next frame so CSS transitions run.
    requestAnimationFrame(() => {
        backdrop.classList.add('active');
        modalEl.classList.add('active');
    });

    // Move focus to the primary action.
    const primary = document.getElementById('locBtnYes');
    if (primary) {
        setTimeout(() => primary.focus(), 20);
    }

    locModalKeydownHandler = (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            e.preventDefault();
            dismissLocModal();
            return;
        }
        if (e.key === 'Tab') {
            const focusable = getLocModalFocusable();
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };
    document.addEventListener('keydown', locModalKeydownHandler, true);
}

function closeLocModal() {
    const backdrop = document.getElementById('locBackdrop');
    const modalEl = document.getElementById('locModal');
    if (!backdrop || !modalEl) return;

    backdrop.classList.remove('active');
    modalEl.classList.remove('active');
    setTimeout(() => {
        backdrop.hidden = true;
        modalEl.hidden = true;
    }, 220);

    if (locModalKeydownHandler) {
        document.removeEventListener('keydown', locModalKeydownHandler, true);
        locModalKeydownHandler = null;
    }

    if (lastFocusedBeforeLocModal && typeof lastFocusedBeforeLocModal.focus === 'function') {
        try { lastFocusedBeforeLocModal.focus(); } catch (_) { /* noop */ }
    }
    lastFocusedBeforeLocModal = null;
}

function dismissLocModal() {
    safeSessionSet(LOC_SESSION_KEY, 'dismissed');
    closeLocModal();
}

// --- Wire up on page load ---------------------------------------------------
(function initNearestStationFeature() {
    // Feature is suppressed entirely on /{sticker_id} pages.
    if (IS_STICKER_PAGE) return;

    const nearestBtn = document.getElementById('nearestButton');
    const btnYes = document.getElementById('locBtnYes');
    const btnNo = document.getElementById('locBtnNo');
    const backdrop = document.getElementById('locBackdrop');
    const cardClose = document.getElementById('nearestCardClose');

    // If no geolocation support, show a banner and hide the trigger button.
    if (!hasGeolocation()) {
        if (nearestBtn) nearestBtn.hidden = true;
        // Delay the banner slightly so it's not jarring.
        setTimeout(() => showToast('Location unavailable — showing all stations.'), 600);
        return;
    }

    // Show the re-open trigger on non-sticker pages.
    if (nearestBtn) {
        nearestBtn.hidden = false;
        nearestBtn.addEventListener('click', () => {
            openLocModal();
        });
    }

    // Button handlers.
    if (btnYes) {
        btnYes.addEventListener('click', () => {
            safeSessionSet(LOC_SESSION_KEY, 'yes');
            closeLocModal();
            requestLocation();
        });
    }
    if (btnNo) {
        btnNo.addEventListener('click', () => {
            safeSessionSet(LOC_SESSION_KEY, 'no');
            closeLocModal();
        });
    }
    // Backdrop click dismisses (treated same as "Not now" for this session).
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            dismissLocModal();
        });
    }
    // Dismiss the nearest-station info card.
    if (cardClose) {
        cardClose.addEventListener('click', () => {
            hideNearestCard();
        });
    }

    // Auto-show prompt once per session.
    const prior = safeSessionGet(LOC_SESSION_KEY);
    if (!prior) {
        // Wait a beat so the map has a chance to render first.
        setTimeout(openLocModal, 500);
    }
})();
