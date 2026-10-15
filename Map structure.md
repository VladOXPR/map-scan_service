# Map structure

Self-contained copy of how CUUB builds the Mapbox map, clusters, and station pins.

**Stack:** React (Next.js) + Mapbox GL JS (`mapbox-gl`) — imperative Mapbox API inside a React component (not `react-map-gl`).

**Production source:** `apps/web/src/features/map-view/`

| File | Role |
|---|---|
| `MapView.tsx` | Create map, add source + layers, click handlers |
| `stationsToGeoJSON.ts` | Station list → GeoJSON FeatureCollection |
| `loadStationIcons.ts` | Register `Icon0`–`Icon6` into the map style |

---

## 1. Create the map

```ts
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = token; // from /api/mapbox-token in production

const map = new mapboxgl.Map({
  container: containerEl, // a <div ref={...} />
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-87.65, 41.9295], // Chicago
  zoom: 13.5,
  bearing: 0,
  pitch: 45,
  fadeDuration: 0,
});
```

Wait for style load before adding sources/layers:

```ts
if (map.isStyleLoaded()) setupLayers();
else map.once("load", setupLayers);
```

---

## 2. Stations → GeoJSON

Each station becomes a Point feature. Properties drive icon choice, opacity, and selection.

```ts
type Station = {
  id: string | number;
  title?: string;
  latitude: number | string;
  longitude: number | string;
  filled_slots?: number | string | null;
  open_slots?: number | string | null;
  online?: boolean | null;
  inactive?: boolean;
};

function stationsToGeoJSON(
  stations: Station[],
  selectedId: string | number | null = null
) {
  return {
    type: "FeatureCollection" as const,
    features: stations.map((station) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [
          parseFloat(String(station.longitude)),
          parseFloat(String(station.latitude)),
        ] as [number, number],
      },
      properties: {
        id: station.id,
        title: station.title,
        filled_slots: station.filled_slots ?? null,
        open_slots: station.open_slots ?? null,
        online: station.online ?? null,
        inactive: station.inactive === true,
        latitude: station.latitude,
        longitude: station.longitude,
        selected: station.id === selectedId,
      },
    })),
  };
}
```

---

## 3. Load pin icons (critical reliability pattern)

Mapbox puts **all symbol layers on one source into one per-tile bucket**. If any `icon-image` is missing when the bucket builds, **cluster numbers and pins can all disappear**.

Fix: register transparent placeholders sync, then `updateImage()` when SVGs load.

```ts
const STATION_ICON_COUNT = 7; // Icon0..Icon6
const NATIVE_W = 54;
const NATIVE_H = 53;
const SCALE = 2;

function placeholder(): ImageData {
  const w = NATIVE_W * SCALE;
  const h = NATIVE_H * SCALE;
  return new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
}

function loadOne(map: mapboxgl.Map, index: number): Promise<void> {
  return new Promise((resolve) => {
    const id = `station-icon-${index}`;
    const img = new Image();
    img.onload = () => {
      const w = NATIVE_W * SCALE;
      const h = NATIVE_H * SCALE;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve();
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      if (map.hasImage(id)) map.updateImage(id, data);
      else map.addImage(id, data, { pixelRatio: SCALE });
      resolve();
    };
    img.onerror = () => resolve();
    img.src = `/assets/stations/Icon${index}.svg`; // Icon0.svg .. Icon6.svg
  });
}

async function loadStationIcons(map: mapboxgl.Map) {
  const ph = placeholder();
  for (let i = 0; i < STATION_ICON_COUNT; i++) {
    const id = `station-icon-${i}`;
    if (!map.hasImage(id)) map.addImage(id, ph, { pixelRatio: SCALE });
  }
  await Promise.all(
    Array.from({ length: STATION_ICON_COUNT }, (_, i) => loadOne(map, i))
  );
}
```

---

## 4. Source + cluster config

```ts
await loadStationIcons(map);

const geojson = stationsToGeoJSON(stations, selectedId);

map.addSource("stations", {
  type: "geojson",
  data: geojson,
  cluster: true,
  clusterMaxZoom: 22,
  clusterRadius: 25,
});
```

Later updates (no re-create):

```ts
(map.getSource("stations") as mapboxgl.GeoJSONSource).setData(geojson);
```

---

## 5. Layers (order matters — bottom → top)

### 5a. Cluster circles

```ts
map.addLayer({
  id: "clusters",
  type: "circle",
  source: "stations",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": "#0198FD",
    "circle-radius": [
      "step",
      ["get", "point_count"],
      15, // default
      3, 20, // ≥3 stations
      5, 25, // ≥5 stations
    ],
    "circle-stroke-width": 3,
    "circle-stroke-color": "#ffffff",
    "circle-stroke-opacity": 1,
    "circle-radius-transition": { duration: 0, delay: 0 },
    "circle-color-transition": { duration: 0, delay: 0 },
  },
});
```

### 5b. Cluster count text

Use an **explicit font stack**. Missing glyphs can fail the whole symbol bucket (pins + numbers).

```ts
map.addLayer({
  id: "cluster-count",
  type: "symbol",
  source: "stations",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["to-string", ["get", "point_count"]],
    "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
    "text-size": ["step", ["get", "point_count"], 14, 10, 16, 30, 18],
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: {
    "text-color": "#ffffff",
    // avoid white text-halo — it makes digits look overly fat
  },
});
```

### 5c. Fallback pin circle (separate bucket from symbols)

If SVG symbols fail, these circles still show a pin.

```ts
map.addLayer({
  id: "unclustered-circle",
  type: "circle",
  source: "stations",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-radius": ["case", ["get", "selected"], 14, 12],
    "circle-color": "#ffffff",
    "circle-stroke-width": 2,
    "circle-stroke-color": "#0198FD",
    "circle-opacity": [
      "case",
      ["any", ["==", ["get", "online"], false], ["==", ["get", "inactive"], true]],
      0,
      1,
    ],
    "circle-stroke-opacity": [
      "case",
      ["any", ["==", ["get", "online"], false], ["==", ["get", "inactive"], true]],
      0,
      1,
    ],
  },
});
```

### 5d. Station pin icons

`filled_slots` 0–6 → `station-icon-{n}`. Missing slots → icon 6. Offline/inactive → 40% opacity.

```ts
map.addLayer({
  id: "unclustered-point",
  type: "symbol",
  source: "stations",
  filter: ["!", ["has", "point_count"]],
  layout: {
    "icon-image": [
      "match",
      ["min", 6, ["to-number", ["coalesce", ["get", "filled_slots"], 6]]],
      0, "station-icon-0",
      1, "station-icon-1",
      2, "station-icon-2",
      3, "station-icon-3",
      4, "station-icon-4",
      5, "station-icon-5",
      6, "station-icon-6",
      "station-icon-6",
    ],
    "icon-size": ["case", ["get", "selected"], 1.2, 1],
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
  },
  paint: {
    "icon-opacity": [
      "case",
      ["any", ["==", ["get", "online"], false], ["==", ["get", "inactive"], true]],
      0.4,
      1,
    ],
  },
});
```

---

## 6. Click handlers

```ts
// Zoom into a cluster
map.on("click", "clusters", (e) => {
  const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
  const clusterId = features[0]?.properties?.cluster_id;
  const source = map.getSource("stations") as mapboxgl.GeoJSONSource;
  source.getClusterExpansionZoom(clusterId, (err, zoom) => {
    if (err) return;
    const coords = (features[0].geometry as GeoJSON.Point).coordinates as [
      number,
      number,
    ];
    map.easeTo({ center: coords, zoom: zoom ?? undefined });
  });
});

// Open station detail from a pin
map.on("click", "unclustered-point", (e) => {
  const props = e.features?.[0]?.properties ?? {};
  // look up station by props.id in your stations array
});

map.on("click", "unclustered-circle", /* same as pin */);

// Clear selection when clicking empty map
map.on("click", (e) => {
  const hits = map.queryRenderedFeatures(e.point, {
    layers: ["clusters", "unclustered-point", "unclustered-circle"],
  });
  if (hits.length === 0) /* clear selection */;
});

// Pointer cursor
const on = () => (map.getCanvas().style.cursor = "pointer");
const off = () => (map.getCanvas().style.cursor = "");
map.on("mouseenter", "clusters", on);
map.on("mouseleave", "clusters", off);
map.on("mouseenter", "unclustered-point", on);
map.on("mouseleave", "unclustered-point", off);
```

---

## Quick reference

| Setting | Value |
|---|---|
| Style | `mapbox://styles/mapbox/dark-v11` |
| Center | `[-87.65, 41.9295]` |
| Zoom / pitch | `13.5` / `45` |
| Cluster radius | `25` |
| Cluster maxZoom | `22` |
| Brand blue | `#0198FD` |
| Icons | `filled_slots` 0–6 → `station-icon-{n}` |
| Selected pin scale | `1.2` |
| Offline / inactive opacity | `0.4` |
| Cluster font | `DIN Pro Bold`, fallback `Arial Unicode MS Bold` |

---

## Assets needed

```
/assets/stations/Icon0.svg
/assets/stations/Icon1.svg
...
/assets/stations/Icon6.svg
```

(Pre-rasterized PNGs also exist under `map-handoff/assets/` if porting to React Native.)
