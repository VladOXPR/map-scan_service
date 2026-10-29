# Map handoff package

Portable extract of the CUUB Mapbox implementation for React Native (`@rnmapbox/maps`).

## Contents

| Path | Purpose |
|---|---|
| [`MAPBOX_HANDOFF.md`](./MAPBOX_HANDOFF.md) | Full consolidated handoff (config, clustering, pins, data, camera, porting notes) |
| [`assets/svg/`](./assets/svg/) | `Icon0`–`Icon6.svg` (+ unused `StationMapIcon.svg`) |
| [`assets/png/`](./assets/png/) | Pre-rasterized 1x/2x/3x PNGs for native Mapbox |
| [`snippets/`](./snippets/) | Minimal recreate snippets |

## Production source

`apps/web/src/features/map-view/MapView.tsx` (Next.js). A partial RN port already lives at `apps/mobile/src/features/map-view/MapScreen.tsx`.

## Quick numbers

- Style: `mapbox://styles/mapbox/dark-v11`
- Center: `[-87.65, 41.9295]`, zoom `13.5`, pitch `45`, bearing `0`
- Cluster: `radius 25`, `maxZoom 22`
- Brand blue: `#0198FD`
- Icons: `filled_slots` 0–6 → `station-icon-{n}`; missing → 6; selected scale 1.2×
- Env: web `MAPBOX_ACCESS_TOKEN`, mobile `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`
