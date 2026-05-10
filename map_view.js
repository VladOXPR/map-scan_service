// CUUB API endpoint (proxied through server to avoid CORS)
const STATIONS_API = '/api/stations';

// Map instance (created after token is loaded from /api/mapbox-token)
let map;

// Store stations data
let stations = [];
let selectedStation = null;
let selectedStationId = null;

// Handle returned by the shared nearest-station module (lib/nearest_feature.js).
let nearestFeature = null;

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

// Push current state into the stations source. Safe to call before map/source exist.
function refreshStationsSource() {
    if (!map) return;
    const source = map.getSource('stations');
    if (!source) return;
    source.setData(stationsToGeoJSON(stations, selectedStationId));
}

// Fetch stations from CUUB API. Returns the stations array (or [] on failure)
// so callers can run this in parallel with other startup work.
async function fetchStationsData() {
    try {
        const response = await fetch(STATIONS_API);
        const result = await response.json();
        if (result && result.success && result.data) return result.data;
        console.error('Failed to fetch stations:', result);
    } catch (error) {
        console.error('Error fetching stations:', error);
    }
    return [];
}

// Two-step icon pipeline so SVG downloads can run in parallel with the map's
// own style/tiles loading instead of serially after `map.on('load')`:
//   1. preloadStationIconImages() downloads Icon0.svg ... Icon6.svg into <img>
//      elements as soon as the page script runs. No map dependency.
//   2. registerStationIcons(images) rasterizes each <img> at 2x and registers
//      it via map.addImage(). Must run after the map's style is loaded.
// A single failed icon no longer blocks the rest — we resolve to null for that
// slot and fall back to whichever icon is available at render time.
const STATION_ICON_COUNT = 7; // Icon0.svg ... Icon6.svg
let stationIconImagesPromise = null;
function preloadStationIconImages() {
    if (stationIconImagesPromise) return stationIconImagesPromise;
    const loaders = [];
    for (let i = 0; i < STATION_ICON_COUNT; i++) {
        loaders.push(new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.error(`Failed to load /Icon${i}.svg`);
                resolve(null);
            };
            img.src = `/Icon${i}.svg`;
        }));
    }
    stationIconImagesPromise = Promise.all(loaders);
    return stationIconImagesPromise;
}

function registerStationIcons(images) {
    const scale = 2;
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img) continue;
        const id = `station-icon-${i}`;
        if (map.hasImage(id)) continue;
        try {
            const w = img.naturalWidth || 54;
            const h = img.naturalHeight || 53;
            const canvas = document.createElement('canvas');
            canvas.width = w * scale;
            canvas.height = h * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
            map.addImage(id, data, { pixelRatio: scale });
        } catch (err) {
            console.error(`Failed to register station-icon-${i}:`, err);
        }
    }
}

// Add markers to the map with clustering. Assumes icons have already been
// registered via registerStationIcons() — caller is responsible for ordering.
function addMarkersToMap(stations) {
    const geojson = stationsToGeoJSON(stations, selectedStationId);

    map.addSource('stations', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 22,   // let clusterRadius govern at every zoom
        clusterRadius: 25,    // only merge points within ~25px of each other
        clusterProperties: {}
    });

    map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'stations',
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': [
                'step',
                ['get', 'point_count'],
                '#0198FD',
                10, '#0198FD',
                30, '#0198FD'
            ],
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                15,  // radius for 1-2 points
                3, 20,  // radius for 3+ points
                5, 25   // radius for 5+ points
            ],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 1,
            // Snap instantly between cluster buckets instead of the default 300ms fade.
            'circle-radius-transition': { duration: 0, delay: 0 },
            'circle-color-transition': { duration: 0, delay: 0 }
        }
    });

    map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'stations',
        filter: ['has', 'point_count'],
        layout: {
            'text-field': ['to-string', ['get', 'point_count']],
            'text-size': [
                'step',
                ['get', 'point_count'],
                14,
                10, 16,
                30, 18
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

    // Pick the first icon that's actually registered as a fallback so a single
    // missing icon (e.g. a flaky SVG download) doesn't blank out the whole
    // unclustered-point layer.
    let fallbackIconId = null;
    for (let i = STATION_ICON_COUNT - 1; i >= 0; i--) {
        const id = `station-icon-${i}`;
        if (map.hasImage(id)) { fallbackIconId = id; break; }
    }

    map.addLayer({
        id: 'unclustered-point',
        type: 'symbol',
        source: 'stations',
        filter: ['!', ['has', 'point_count']],
        layout: {
            'icon-image': [
                'match',
                ['min', 6, ['to-number', ['coalesce', ['get', 'filled_slots'], 6]]],
                0, map.hasImage('station-icon-0') ? 'station-icon-0' : (fallbackIconId || 'station-icon-0'),
                1, map.hasImage('station-icon-1') ? 'station-icon-1' : (fallbackIconId || 'station-icon-1'),
                2, map.hasImage('station-icon-2') ? 'station-icon-2' : (fallbackIconId || 'station-icon-2'),
                3, map.hasImage('station-icon-3') ? 'station-icon-3' : (fallbackIconId || 'station-icon-3'),
                4, map.hasImage('station-icon-4') ? 'station-icon-4' : (fallbackIconId || 'station-icon-4'),
                5, map.hasImage('station-icon-5') ? 'station-icon-5' : (fallbackIconId || 'station-icon-5'),
                6, map.hasImage('station-icon-6') ? 'station-icon-6' : (fallbackIconId || 'station-icon-6'),
                fallbackIconId || 'station-icon-6'
            ],
            'icon-size': [
                'case',
                ['get', 'selected'],
                1.2,  // 20% larger when selected
                1
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
        }
    });

    map.on('click', 'clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        const clusterId = features[0].properties.cluster_id;
        map.getSource('stations').getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({
                center: features[0].geometry.coordinates,
                zoom: zoom
            });
        });
    });

    map.on('click', 'unclustered-point', (e) => {
        const properties = e.features[0].properties;
        const station = stations.find(s => s.id === properties.id);
        if (station) selectStation(station);
    });

    map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });
}

function selectStation(station) {
    selectedStation = station;
    selectedStationId = station.id;
    refreshStationsSource();
    showStationModal(station);
}

function showStationModal(station) {
    modalTitle.textContent = station.title || 'Title';

    // If slot data hasn't loaded for this station, hide the slot readouts
    // entirely and just show the title.
    const hasFilled = station.filled_slots !== null && station.filled_slots !== undefined && station.filled_slots !== '';
    const hasOpen = station.open_slots !== null && station.open_slots !== undefined && station.open_slots !== '';
    const slotsContainer = modal.querySelector('.modal-slots');
    if (slotsContainer) {
        if (hasFilled || hasOpen) {
            slotsContainer.style.display = '';
            filledSlots.textContent = hasFilled ? station.filled_slots : 0;
            openSlots.textContent = hasOpen ? station.open_slots : 0;
        } else {
            slotsContainer.style.display = 'none';
        }
    }

    modal.classList.add('active');

    // Lift support + nearest-station buttons above the station modal.
    const modalHeight = modal.offsetHeight || 200;
    const lifted = `${modalHeight + 20}px`;
    const supportButton = document.getElementById('supportButton');
    if (supportButton) supportButton.style.bottom = lifted;
    if (nearestFeature) nearestFeature.setTriggerButtonBottom(modalHeight + 20);
}

function hideStationModal() {
    modal.classList.remove('active');
    selectedStation = null;
    selectedStationId = null;

    const supportButton = document.getElementById('supportButton');
    if (supportButton) supportButton.style.bottom = '20px';
    if (nearestFeature) nearestFeature.setTriggerButtonBottom(20);

    refreshStationsSource();
}

async function startMapApp() {
    // Kick off independent network work in parallel so first-load isn't a long
    // serial chain (token -> map style -> stations -> icons -> render). The
    // SVG icons + stations API don't depend on Mapbox, so we start them
    // immediately. Without this, on first load the icons only begin
    // downloading after the stations API responds, which is why stations
    // would appear noticeably late (or "not at all" until refresh, when
    // everything is cached).
    const stationsDataPromise = fetchStationsData();
    const iconImagesPromise = preloadStationIconImages();

    const res = await fetch('/api/mapbox-token');
    const data = await res.json();
    if (!data.token) {
        console.error('Mapbox token missing. Set MAPBOX_ACCESS_TOKEN (see .env.example).');
        return;
    }
    mapboxgl.accessToken = data.token;
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-87.65, 41.9295],
        zoom: 13.5,
        bearing: 0.00,
        pitch: 45,
        // Disable symbol label-collision fade so cluster-count text snaps
        // between buckets instead of crossfading.
        fadeDuration: 0
    });

    if (directionsButton) {
        directionsButton.addEventListener('click', () => {
            if (selectedStation && window.CuubNearest && window.CuubNearest.openDirectionsTo) {
                window.CuubNearest.openDirectionsTo(selectedStation.latitude, selectedStation.longitude);
            }
        });
    }

    map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, {
            layers: ['clusters', 'unclustered-point']
        });
        if (features.length === 0) hideStationModal();
    });

    // Attach the shared nearest-station feature (works on both /, /map, and /{sticker_id}).
    // ?embed=1 in the URL hides the built-in trigger button and disables the
    // auto-prompt so a parent page (e.g. Framer) can own the trigger via postMessage.
    if (window.CuubNearest && window.CuubNearest.attach) {
        const embedMode = getQueryFlag('embed') === '1';
        nearestFeature = window.CuubNearest.attach({
            map: map,
            mapboxgl: mapboxgl,
            isStickerPage: !!getStickerIdFromURL(),
            hideTriggerButton: embedMode,
            disableAutoPrompt: embedMode
        });
    }

    // Run setup once the map's style is ready. Use an idempotent runner so
    // we don't miss the event if it has already fired (rare, but possible
    // if the style was served from disk cache faster than this code path).
    const onMapReady = async () => {
        try {
            const iconImages = await iconImagesPromise;
            registerStationIcons(iconImages);
            const stationsData = await stationsDataPromise;
            stations = stationsData || [];
            if (stations.length > 0) {
                addMarkersToMap(stations);
            } else {
                console.warn('No stations to render.');
            }
            if (nearestFeature) nearestFeature.setStations(stations);
        } catch (err) {
            console.error('Error setting up station markers:', err);
        }
    };
    if (map.loaded && map.loaded()) {
        onMapReady();
    } else {
        map.once('load', onMapReady);
    }
}

startMapApp();

// Read a query-string flag from the current URL. Returns null on errors.
function getQueryFlag(name) {
    try {
        const url = new URL(window.location.href);
        return url.searchParams.get(name);
    } catch (_) {
        return null;
    }
}

// Get sticker_id from URL path (if available)
function getStickerIdFromURL() {
    const path = window.location.pathname;
    const stickerId = path.replace(/^\//, '');
    if (!stickerId || stickerId === 'map' || stickerId === 'blank' || stickerId === 'api' || stickerId.includes('.')) {
        return null;
    }
    return stickerId;
}

// Customer Support Button - redirect to SMS
const supportButton = document.getElementById('supportButton');
if (supportButton) {
    supportButton.addEventListener('click', () => {
        const phoneNumber = '+14642377449';
        const stickerId = getStickerIdFromURL();
        let smsUrl = `sms:${phoneNumber}`;
        if (stickerId) {
            const messageText = `The number on my battery is ${stickerId}`;
            smsUrl += `?body=${encodeURIComponent(messageText)}`;
        }
        window.location.href = smsUrl;
    });
}
