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

// 7 station icons, one per filled-slot count (0–6). Same placeholder-then-
// updateImage pattern used everywhere else in the codebase: register a
// transparent placeholder for every variant synchronously so the symbol
// bucket can always commit, then swap real SVG bytes in via
// map.updateImage() as each download finishes. Per-icon failures stay
// isolated; a flaky network on Icon3 leaves the other 6 fully functional.
const STATION_ICON_COUNT = 7;
const STATION_ICON_NATIVE_W = 54;
const STATION_ICON_NATIVE_H = 53;
const STATION_ICON_SCALE = 2;
const stationIconLoaded = new Array(STATION_ICON_COUNT).fill(false);

function stationIconId(index) { return `station-icon-${index}`; }

function buildTransparentPlaceholder() {
    const w = STATION_ICON_NATIVE_W * STATION_ICON_SCALE;
    const h = STATION_ICON_NATIVE_H * STATION_ICON_SCALE;
    return new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
}

function registerStationIconPlaceholders() {
    if (!map) return;
    const placeholder = buildTransparentPlaceholder();
    for (let i = 0; i < STATION_ICON_COUNT; i++) {
        const id = stationIconId(i);
        if (map.hasImage(id)) continue;
        try {
            map.addImage(id, placeholder, { pixelRatio: STATION_ICON_SCALE });
        } catch (err) {
            console.error(`Failed to register placeholder ${id}:`, err);
        }
    }
}

function loadStationIconAt(index) {
    if (!map || stationIconLoaded[index]) return;
    const id = stationIconId(index);
    const url = `/assets/stations/Icon${index}.svg`;
    const img = new Image();
    img.onload = () => {
        if (!map) return;
        try {
            const w = STATION_ICON_NATIVE_W * STATION_ICON_SCALE;
            const h = STATION_ICON_NATIVE_H * STATION_ICON_SCALE;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h);
            if (map.hasImage(id)) map.updateImage(id, data);
            else map.addImage(id, data, { pixelRatio: STATION_ICON_SCALE });
            stationIconLoaded[index] = true;
        } catch (err) {
            console.error(`Failed to register ${id}:`, err);
        }
    };
    img.onerror = () => console.error(`Failed to load ${url}`);
    img.src = url;
}

function loadStationIcons() {
    for (let i = 0; i < STATION_ICON_COUNT; i++) loadStationIconAt(i);
}

// Track whether station click/hover handlers have been wired so a styledata
// reload (which only re-creates source/layers) doesn't double-bind them.
let stationInteractionsBound = false;

// Render the stations source + layers. Idempotent — safe to call again after a
// style reload that wipes them. Pin VISUALS do NOT depend on icon registration:
// a fallback circle layer is drawn at every station coordinate, so as soon as
// we know where a station is, it shows on the map. The SVG icon layer is drawn
// on top of that and "lights up" automatically whenever map.addImage() finishes
// registering the icons (Mapbox auto-rerenders missing images on registration).
function addMarkersToMap(stations) {
    const geojson = stationsToGeoJSON(stations, selectedStationId);

    if (!map.getSource('stations')) {
        map.addSource('stations', {
            type: 'geojson',
            data: geojson,
            cluster: true,
            clusterMaxZoom: 22,   // let clusterRadius govern at every zoom
            clusterRadius: 25,    // only merge points within ~25px of each other
            clusterProperties: {}
        });
    } else {
        // Source already exists (e.g. styledata reload) — just push fresh data.
        map.getSource('stations').setData(geojson);
    }

    if (!map.getLayer('clusters')) {
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
    }

    if (!map.getLayer('cluster-count')) {
        map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'stations',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': ['to-string', ['get', 'point_count']],
                // Explicit font stack. Without this Mapbox uses the implicit
                // default ("Open Sans Regular"), which we've observed go
                // un-requested intermittently — when that happens the entire
                // symbol bucket on the source fails to commit and the
                // unclustered-point icons disappear with the cluster numbers.
                // Listing two fonts gives Mapbox a fallback if the first
                // glyph PBF ever fails. Arial Unicode MS Bold is Mapbox's
                // universal fallback and is virtually always cached.
                'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
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
    }

    // Fallback circle for unclustered points. Always rendered, regardless of
    // whether SVG icons have loaded — guarantees a station is visible the
    // moment its coordinates are known. Sized to sit fully under the SVG icon
    // (icons are 54x53 CSS px), so when icons load they cover this completely.
    if (!map.getLayer('unclustered-circle')) {
        map.addLayer({
            id: 'unclustered-circle',
            type: 'circle',
            source: 'stations',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-radius': [
                    'case',
                    ['get', 'selected'], 14,
                    12
                ],
                'circle-color': '#ffffff',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#0198FD',
                'circle-stroke-opacity': 1
            }
        });
    }

    // Symbol layer with the SVG pins. icon-image is a match expression on
    // filled_slots — every branch resolves to a placeholder that's already
    // registered, so the bucket builds successfully even before the real
    // SVGs finish downloading. updateImage() swaps in the bytes per icon.
    if (!map.getLayer('unclustered-point')) {
        map.addLayer({
            id: 'unclustered-point',
            type: 'symbol',
            source: 'stations',
            filter: ['!', ['has', 'point_count']],
            layout: {
                'icon-image': [
                    'match',
                    ['min', 6, ['to-number', ['coalesce', ['get', 'filled_slots'], 6]]],
                    0, 'station-icon-0',
                    1, 'station-icon-1',
                    2, 'station-icon-2',
                    3, 'station-icon-3',
                    4, 'station-icon-4',
                    5, 'station-icon-5',
                    6, 'station-icon-6',
                    'station-icon-6'
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
    }

    if (stationInteractionsBound) return;
    stationInteractionsBound = true;

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

    const onUnclusteredClick = (e) => {
        const properties = e.features[0].properties;
        const station = stations.find(s => s.id === properties.id);
        if (station) selectStation(station);
    };
    map.on('click', 'unclustered-point', onUnclusteredClick);
    map.on('click', 'unclustered-circle', onUnclusteredClick);

    map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', 'unclustered-circle', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'unclustered-circle', () => { map.getCanvas().style.cursor = ''; });
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
    // Fire the stations request the moment the script runs — completely
    // independent of map creation, so it overlaps with the token fetch and
    // Mapbox style load.
    const stationsDataPromise = fetchStationsData();

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

    // Wait until the style is ready before touching addSource/addLayer/addImage.
    // isStyleLoaded() catches the case where 'load' already fired before we got here.
    await new Promise((resolve) => {
        if (map.isStyleLoaded && map.isStyleLoaded()) resolve();
        else map.once('load', resolve);
    });

    // CRITICAL ORDER: register transparent placeholders for every station
    // icon BEFORE addMarkersToMap adds the unclustered-point symbol layer.
    // This guarantees the symbol bucket is built against existing images,
    // which is what previously caused the bucket (and its sibling
    // cluster-count text layer) to fail to commit on tiles where icons
    // hadn't downloaded yet — manifesting as the entire station network
    // disappearing.
    registerStationIconPlaceholders();

    // Kick off the real SVG loads in parallel. Each one swaps into its
    // placeholder via map.updateImage() when it finishes.
    loadStationIcons();

    // The whole point: the moment we have coordinates, pins go on the map.
    // No Promise.all dance, no icon dependency, no questions asked.
    stations = (await stationsDataPromise) || [];
    if (stations.length > 0) {
        addMarkersToMap(stations);
    } else {
        console.warn('No stations to render.');
    }
    if (nearestFeature) nearestFeature.setStations(stations);

    // If Mapbox reloads the style for any reason (setStyle, language change,
    // etc.), our source/layers/images get wiped. Re-add them — placeholder
    // FIRST so the symbol bucket is never built against a missing image,
    // then the source/layers, then the real icon. All helpers are idempotent.
    map.on('styledata', () => {
        // If any icon got wiped by a style replacement, reset its load flag
        // so the upcoming load actually runs instead of short-circuiting.
        for (let i = 0; i < STATION_ICON_COUNT; i++) {
            if (!map.hasImage(stationIconId(i))) stationIconLoaded[i] = false;
        }
        registerStationIconPlaceholders();
        if (stations.length > 0 && !map.getSource('stations')) {
            addMarkersToMap(stations);
        }
        loadStationIcons();
    });
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
