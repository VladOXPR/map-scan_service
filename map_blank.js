// Minimal map: stations + clustering + "find nearest station" feature.
// No station details modal, no scan service, no support button.

const STATIONS_API = '/api/stations';

let map;
let stations = [];
// Handle returned by lib/nearest_feature.js (same module used on the main map).
let nearestFeature = null;

// Read a query-string flag from the current URL. Returns null on errors.
function getQueryFlag(name) {
    try {
        const url = new URL(window.location.href);
        return url.searchParams.get(name);
    } catch (_) {
        return null;
    }
}

function stationsToGeoJSON(stationList) {
    return {
        type: 'FeatureCollection',
        features: stationList.map(station => ({
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
                longitude: station.longitude
            }
        }))
    };
}

async function fetchStations() {
    try {
        const response = await fetch(STATIONS_API);
        const result = await response.json();

        if (result.success && result.data) {
            stations = result.data;
            addMarkersToMap(stations);
            if (nearestFeature) nearestFeature.setStations(stations);
        } else {
            console.error('Failed to fetch stations:', result);
        }
    } catch (error) {
        console.error('Error fetching stations:', error);
    }
}

// Preload Icon0.svg ... Icon6.svg and register one Mapbox image per filled-slot
// count. Each SVG is rasterized at 2x for retina sharpness. Cached as a Promise
// so repeated calls are cheap.
const STATION_ICON_COUNT = 7; // Icon0.svg ... Icon6.svg
let stationIconsPromise = null;
function loadStationIcons() {
    if (stationIconsPromise) return stationIconsPromise;
    const scale = 2;
    const loaders = [];
    for (let i = 0; i < STATION_ICON_COUNT; i++) {
        loaders.push(new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const w = img.naturalWidth || 54;
                const h = img.naturalHeight || 53;
                const canvas = document.createElement('canvas');
                canvas.width = w * scale;
                canvas.height = h * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const id = `station-icon-${i}`;
                if (!map.hasImage(id)) {
                    map.addImage(id, data, { pixelRatio: scale });
                }
                resolve();
            };
            img.onerror = reject;
            img.src = `/Icon${i}.svg`;
        }));
    }
    stationIconsPromise = Promise.all(loaders);
    return stationIconsPromise;
}

async function addMarkersToMap(stationList) {
    const geojson = stationsToGeoJSON(stationList);

    await loadStationIcons();

    map.addSource('stations', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50,
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
                10,
                '#0198FD',
                30,
                '#0198FD'
            ],
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                20,
                10,
                30,
                30,
                30
            ],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 1
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
                10,
                16,
                30,
                18
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
            'icon-size': 1,
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
                zoom
            });
        });
    });

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
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-87.65, 41.9295],
        zoom: 13.5,
        bearing: 0.00,
        pitch: 45
    });
    // Attach shared nearest-station feature (injects its own DOM + CSS).
    // ?embed=1 in the URL hides the built-in trigger button and disables the
    // auto-prompt so a parent page (e.g. Framer) can own the trigger via postMessage.
    if (window.CuubNearest && window.CuubNearest.attach) {
        const embedMode = getQueryFlag('embed') === '1';
        nearestFeature = window.CuubNearest.attach({
            map: map,
            mapboxgl: mapboxgl,
            isStickerPage: false,
            hideTriggerButton: embedMode,
            disableAutoPrompt: embedMode
        });
    }

    map.on('load', () => {
        fetchStations();
    });
}

startMapApp();
