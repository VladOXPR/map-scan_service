# CUUB Mapbox Map — Porting Handoff

Extracted from the monorepo for porting / parity with `@rnmapbox/maps`.

**Source of truth (production web):** `apps/web/src/features/map-view/`  
**Partial RN port already exists:** `apps/mobile/src/features/map-view/MapScreen.tsx`  
**Legacy vanilla JS (pre-Next, still in repo):** `map_view.js`, `map_blank.js`, `lib/nearest_feature.js`

Do **not** treat `map_view.js` as production unless you are still serving the Express `server.js` stack. The Next app (`apps/web`) is the current production map.

---

## 0. Implementations inventory

| Implementation | Path | Status |
|---|---|---|
| **Production web** | `apps/web/src/features/map-view/MapView.tsx` | Active — used by `/`, `/blank`, `/[sticker_id]` |
| Nearest UX (web) | `apps/web/src/features/nearest/NearestStationFeature.tsx` | Active |
| Mobile RN (in progress) | `apps/mobile/src/features/map-view/MapScreen.tsx` | Present; clustering + icons largely mirrored |
| Legacy full map | `map_view.js` + `map_view.html` | Legacy Express |
| Legacy blank map | `map_blank.js` + `map_blank.html` | Legacy Express |
| Legacy nearest | `lib/nearest_feature.js` | Legacy (logic ported to React + `@cuub/shared`) |

Shared reusable logic lives in `packages/shared` (`Station` type, `pickNearestStation`, directions URLs, API client).

---

## 1. Mapbox config

### Access tokens (env key names only)

| Client | Env var | How used |
|---|---|---|
| Web (server) | `MAPBOX_ACCESS_TOKEN` | Server-only; served via `GET /api/mapbox-token` → `{ token }` |
| Mobile | `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` | Set at build/runtime via `Mapbox.setAccessToken(...)` |

Web never embeds the token in the client bundle; mobile needs the public token in the native SDK.

### Style URL

```
mapbox://styles/mapbox/dark-v11
```

Mobile equivalent: `Mapbox.StyleURL.Dark` (same dark-v11 family).

### Initial camera

| Property | Value |
|---|---|
| `center` | `[-87.65, 41.9295]` (lng, lat — Chicago area) |
| `zoom` | `13.5` |
| `bearing` | `0` |
| `pitch` | `45` |

### Map constructor options (web production)

```ts
new mb.Map({
  container: containerRef.current,
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-87.65, 41.9295],
  zoom: 13.5,
  bearing: 0,
  pitch: 45,
  fadeDuration: 0, // snap cluster label buckets; no crossfade
});
```

### Options **not** set (defaults apply)

- No `cooperativeGestures`
- No explicit `attributionControl` / `logoPosition` on web (Mapbox defaults)
- No `dragRotate` / `pitchWithRotate` / `touchPitch` overrides
- No `minZoom` / `maxZoom` on the map instance
- No `bounds` / `maxBounds`
- No fog, light, terrain, sky, or 3D buildings customization

### Mobile differences already in repo

```tsx
attributionEnabled={false}
logoEnabled={false}
```

### CSS container (web)

`.cuub-map` → `width: 100%`, `height: 100vh`, `min-height: 100%` (`apps/web/src/app/globals.css`).

---

## 2. Clustering

### Source settings

```ts
map.addSource("stations", {
  type: "geojson",
  data: geojson,
  cluster: true,
  clusterMaxZoom: 22,
  clusterRadius: 25,
  // clusterMinPoints: NOT set (Mapbox default = 2)
  // clusterProperties: NOT set in production TS
});
```

Legacy JS also set `clusterProperties: {}` (empty — no custom aggregations).

### Layers

#### `clusters` (circle)

- Filter: `["has", "point_count"]`
- Color: always `#0198FD` (step expression has identical colors at all thresholds — size is what changes)
- Radius step: `15` → at count ≥3 → `20` → at count ≥5 → `25`
- Stroke: width `3`, color `#ffffff`, opacity `1`
- Transitions disabled (`duration: 0`) for radius/color

#### `cluster-count` (symbol)

- Filter: `["has", "point_count"]`
- Text: `["to-string", ["get", "point_count"]]`
- Font (web): `["DIN Pro Bold", "Arial Unicode MS Bold"]` — critical for symbol-bucket reliability
- Size step: `14` → ≥10 → `16` → ≥30 → `18`
- Color: `#ffffff`; halo `#ffffff` width `1`
- `text-allow-overlap: true`, `text-ignore-placement: true`

### Cluster click behavior

**Zoom to expansion** via `getClusterExpansionZoom` + `easeTo` — **not** spiderfy, not expand-in-place.

```ts
source.getClusterExpansionZoom(clusterId, (err, zoom) => {
  if (err) return;
  map.easeTo({ center: coords, zoom: zoom ?? undefined });
});
```

### Unclustered point click

- Only when `variant === "full"`
- Reads `properties.id`, finds matching `Station` in local array, opens `StationModal`
- `variant === "blank"` → clicks ignored (pins still render)

### Background click

- Queries `clusters`, `unclustered-point`, `unclustered-circle`
- If empty hit → clears selection (`setSelectedStation(null)`)

### Cursor (web-only)

`pointer` on enter for clusters / unclustered layers; cleared on leave.

### Mobile gap

`MapScreen.tsx` wires `ShapeSource.onPress` for pin selection only. It does **not** yet call `getClusterExpansionZoom` on cluster presses — port that from web.

---

## 3. Pins / markers

### Variants

There is **no** separate “unavailable / offline / error” pin. Variants are **filled-slot counts 0–6**:

| Image id | Asset | Meaning |
|---|---|---|
| `station-icon-0` | `Icon0.svg` | 0 filled slots |
| `station-icon-1` | `Icon1.svg` | 1 filled |
| … | … | … |
| `station-icon-6` | `Icon6.svg` | 6 filled (also default when missing) |

`StationMapIcon.svg` exists in `public/` / repo root but is **not referenced** by the current map code (legacy / unused).

### How rendered

| Platform | Technique |
|---|---|
| Web | GeoJSON `SymbolLayer` (`unclustered-point`) + canvas-rasterized SVGs via `map.addImage` / `updateImage` |
| Web fallback | `CircleLayer` (`unclustered-circle`) under icons so pins remain visible if symbol bucket fails |
| Mobile | `SymbolLayer` + `<Mapbox.Images>` with pre-rasterized PNGs (native Mapbox cannot use SVG) |
| User location (web) | DOM `mapboxgl.Marker` with CSS class `cuub-user-location-marker` |
| Nearest halo | Separate GeoJSON source/layer `cuub-nearest` / `cuub-nearest-halo` (pulsing circle) |

**Not used:** HTML Markers for stations, Marker clustering libraries, canvas overlays for pins.

### Icon registration (web)

From `loadStationIcons.ts`:

- Native SVG size: **54×53**
- Rasterized at **2×** (`SCALE = 2` → 108×106) with `pixelRatio: 2`
- Pattern: register transparent placeholders synchronously → download `/Icon{n}.svg` in parallel → `updateImage`
- URLs: `/Icon0.svg` … `/Icon6.svg` (from `apps/web/public/`)

### Icon expression

```js
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
]
```

Missing `filled_slots` → treat as **6**.

### Selected state

- Feature property `selected: boolean` (true when `station.id === selectedId`)
- Icon size: `["case", ["get", "selected"], 1.2, 1]` when `variant === "full"`; always `1` on blank
- Fallback circle radius: `["case", ["get", "selected"], 14, 12]`
- No separate selected SVG asset; selection is scale-only
- Anchor: default (center). Mobile explicitly sets `iconAnchor: "center"`. No `icon-offset`.

### Unclustered circle fallback paint

```
circle-color: #ffffff
circle-stroke-width: 2
circle-stroke-color: #0198FD
```

### User location marker (web CSS)

```css
.cuub-user-location-marker {
  width: 20px; height: 20px; border-radius: 50%;
  background-color: #0198fd;
  border: 3px solid #fff;
  box-shadow: 0 0 0 2px rgba(1, 152, 253, 0.35);
}
/* ::after pulse ring — animation cuub-user-pulse 1.8s */
```

Marker options: `anchor: "center"`.

### Nearest halo

- Source id: `cuub-nearest`
- Layer id: `cuub-nearest-halo`
- Base paint: radius `26`, color `#0198FD`, opacity `0.28`, stroke width `2`, stroke opacity `0.6`
- Pulse every 60ms: radius `27 + sin(t)*5`, opacity `0.25 + (sin(t)+1)*0.1`, `t += 0.12`
- Moved below `unclustered-point` so icon stays on top

---

## 4. Data layer

### API

- `GET /api/stations` → `{ success, data: Station[] }`
- Upstream: CUUB API `/stations` proxied/cached (`getInitialStations.ts`, revalidate 300s)
- **No client-side filter** — every station in `data` becomes a feature
- Coordinates accepted as string or number; parsed with `parseFloat`

### `Station` type (`@cuub/shared`)

```ts
interface Station {
  id: string | number;
  title?: string;
  latitude: string | number;
  longitude: string | number;
  filled_slots?: number | string | null;
  open_slots?: number | string | null;
}
```

### FeatureCollection shape (web)

```ts
{
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] }, // [longitude, latitude]
    properties: {
      id,
      title,
      filled_slots,   // drives icon
      open_slots,     // used in modal UI, not map paint
      latitude,       // duplicated into props (web only)
      longitude,
      selected,       // boolean
    }
  }]
}
```

Mobile `stationsToGeoJSON` is the same minus lat/lng in properties, plus top-level `feature.id = station.id`.

### Transform

`stationsToGeoJSON(stations, selectedId)` — only transform. No status mapping, no availability filter, no coordinate validation beyond `parseFloat`.

---

## 5. Camera / UX

| Behavior | Details |
|---|---|
| Initial view | Chicago center / zoom 13.5 / pitch 45 |
| Select pin | Opens bottom `StationModal`; icon scales to 1.2; **no** fly-to-selected on pin tap alone |
| Deselect | Tap empty map → close modal |
| Cluster tap | `easeTo` expansion zoom |
| Find nearest | Geolocation → `pickNearestStation` (`@cuub/shared`) → halo + card + `fitBounds` |
| Fit bounds padding | Responsive; maxZoom **16**; duration **1200ms** |
| Far threshold | `FAR_STATION_METERS = 50000` → “Nearest station is far from you” |
| Recenter alone | If no stations yet: `flyTo` user at zoom **15.8**; fallback flyTo zoom **15.2** |
| Min/max zoom | Not clamped on map; fitBounds capped at 16 |
| Auto location prompt | After 500ms (900ms on sticker page); sessionStorage key `cuub:locationPrompt` |
| Embed mode | `?embed=1` → hide nearest button + disable auto-prompt; parent can `postMessage` `{source:"cuub", type:"findNearest"|"requestLocation"}` |

### Fit-bounds padding (web, approximate)

Depends on sticker page / narrow (`<480`) / short (`<520`) viewport, then scaled to ≤70% of container. Mobile hardcodes padding `[240, 80, 140, 80]` (top/right/bottom/left) for 1200ms.

### Geolocation options (web)

```
{ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
```

---

## 6. File inventory

### Production web (must-read)

```
apps/web/src/features/map-view/MapView.tsx
apps/web/src/features/map-view/stationsToGeoJSON.ts
apps/web/src/features/map-view/loadStationIcons.ts
apps/web/src/features/map-view/StationModal.tsx
apps/web/src/features/map-view/SupportButton.tsx
apps/web/src/features/nearest/NearestStationFeature.tsx
apps/web/src/app/globals.css          # .cuub-map, .cuub-user-location-marker, nearest UI
apps/web/src/app/api/mapbox-token/route.ts
apps/web/src/app/api/stations/route.ts
apps/web/src/lib/getInitialStations.ts
apps/web/src/lib/cuubClient.ts       # (via @/lib/cuubClient → shared client)
apps/web/public/Icon0.svg … Icon6.svg
apps/web/public/StationMapIcon.svg  # unused by map code
apps/web/.env.example                # MAPBOX_ACCESS_TOKEN
```

### Shared

```
packages/shared/src/types.ts
packages/shared/src/nearest/index.ts
packages/shared/src/geo/index.ts
packages/shared/src/directions/index.ts
packages/shared/src/api/index.ts
```

### Mobile (existing port reference)

```
apps/mobile/src/features/map-view/MapScreen.tsx
apps/mobile/src/features/map-view/stationsToGeoJSON.ts
apps/mobile/src/features/nearest/NearestStationFeature.tsx
apps/mobile/src/features/nearest/useUserLocation.ts
apps/mobile/src/lib/config.ts
apps/mobile/assets/stations/icon{0..6}.png (+ @2x @3x)
apps/mobile/.env.example             # EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN
scripts/rasterize-station-icons.sh
```

### Legacy (parity only)

```
map_view.js / map_view.html
map_blank.js / map_blank.html
lib/nearest_feature.js
Icon0.svg … Icon6.svg / StationMapIcon.svg   # repo root copies (same as public)
server.js                                    # Express /api/mapbox-token
```

---

## 7. Copied assets (this package)

```
map-handoff/assets/svg/Icon0.svg … Icon6.svg
map-handoff/assets/svg/StationMapIcon.svg   # unused; included for completeness
map-handoff/assets/png/icon{0..6}.png
map-handoff/assets/png/icon{0..6}@2x.png
map-handoff/assets/png/icon{0..6}@3x.png
```

PNG sizes: 54×53 / 108×106 / 162×159. Regenerate from SVG with:

```bash
bash scripts/rasterize-station-icons.sh
```

**SVG rasterization note:** outer hex fill uses a white→white `linearGradient` via `url(#paint0_…)`. ImageMagick may drop that path; the script inlines `fill="white"` before rasterizing.

---

## 8. Minimal reference snippets

See `map-handoff/snippets/`:

| File | Contents |
|---|---|
| `01-source-cluster.ts` | GeoJSON source + cluster options |
| `02-cluster-layers.ts` | `clusters` + `cluster-count` layers |
| `03-unclustered-layers.ts` | circle fallback + symbol pin |
| `04-handlers.ts` | cluster / point / background presses |
| `05-stationsToGeoJSON.ts` | Feature transform |
| `06-rnmapbox-sketch.tsx` | `@rnmapbox/maps` sketch aligned to production |

---

## 9. Porting notes — web vs React Native

### Reusable as-is (concepts / shared code)

- Style URL dark-v11, camera numbers, cluster radius/maxZoom
- Layer paint/layout expressions (circle color/radius, icon match, selected scale)
- GeoJSON property schema + `stationsToGeoJSON`
- `pickNearestStation` / haversine / FAR threshold from `@cuub/shared`
- Icon id naming `station-icon-{0..6}` and filled_slots → icon mapping
- Brand color `#0198FD`

### Web-specific (replace on RN)

| Web | RN replacement |
|---|---|
| `mapbox-gl` + CSS import | `@rnmapbox/maps` |
| Token via `/api/mapbox-token` | `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` + `setAccessToken` |
| SVG → canvas → `addImage` | Pre-rasterized PNG + `<Mapbox.Images>` |
| `map.on("click", layer, …)` | `ShapeSource.onPress` / layer press; query cluster props |
| `getClusterExpansionZoom` callback | Same API on ShapeSource (ensure you call it for clusters) |
| DOM `Marker` for user | `PointAnnotation`, `LocationPuck`, or custom View annotation |
| CSS pulse halo via `setInterval` + `setPaintProperty` | Animated circle layer or RN `Animated` overlay |
| `mouseenter` cursor | N/A |
| `fadeDuration: 0` | Not always exposed the same way; verify on native |
| `postMessage` embed API | N/A (or deep links) |
| sessionStorage prompt gate | `AsyncStorage` if desired |
| `StationModal` DOM | Already ported as RN modal components |

### Already done in `apps/mobile`

Clustering radius/zoom, dark style, camera defaults, icon match expression, selected scale, PNG assets, fitBounds on nearest (simplified padding).

### Still to mirror for full parity

1. Cluster press → expansion zoom  
2. Unclustered circle fallback layer  
3. User-location blue pulsing marker  
4. Nearest station halo pulse under pin  
5. Background tap to deselect  
6. Responsive fitBounds padding / sticker-page offsets  
7. Explicit cluster-count font stack if glyphs fail on native (may not apply)

### Color / brand constants

```
Primary blue: #0198FD
Cluster/user stroke white: #ffffff
Fallback pin fill: #ffffff
Fallback pin stroke: #0198FD
```
