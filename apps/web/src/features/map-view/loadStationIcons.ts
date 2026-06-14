import type mapboxgl from "mapbox-gl";

// 7 station icons, one per filled-slot count (0–6). Same placeholder-then-
// updateImage pattern as the single-icon version, just looped:
//
//   1. Synchronously register a transparent placeholder for every variant
//      so the symbol bucket can always commit. (Mapbox bundles every symbol
//      layer on a source into one per-tile bucket; if any referenced image
//      is missing at build time the entire bucket can fail to commit —
//      taking cluster numbers down with the pins.)
//   2. Kick off 7 SVG downloads in parallel. Each one swaps into its
//      placeholder via map.updateImage() — no bucket disruption, no
//      all-or-nothing failure mode. A flaky network on Icon3 leaves the
//      other 6 variants fully functional.
//   3. De-dupe per map via a WeakMap so re-mounts don't re-download.

const STATION_ICON_COUNT = 7;
const NATIVE_W = 54;
const NATIVE_H = 53;
const SCALE = 2;

const inFlight = new WeakMap<mapboxgl.Map, Promise<void>>();

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
      try {
        const w = NATIVE_W * SCALE;
        const h = NATIVE_H * SCALE;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve();
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        // updateImage() leaves the symbol bucket intact — pixels swap in
        // without re-tessellating any tiles.
        if (map.hasImage(id)) map.updateImage(id, data);
        else map.addImage(id, data, { pixelRatio: SCALE });
      } catch (err) {
        console.error(`Failed to register ${id}:`, err);
      }
      resolve();
    };
    img.onerror = () => {
      console.error(`Failed to load /Icon${index}.svg`);
      resolve();
    };
    img.src = `/Icon${index}.svg`;
  });
}

export function loadStationIcons(map: mapboxgl.Map): Promise<void> {
  const ph = placeholder();
  for (let i = 0; i < STATION_ICON_COUNT; i++) {
    const id = `station-icon-${i}`;
    if (map.hasImage(id)) continue;
    try {
      map.addImage(id, ph, { pixelRatio: SCALE });
    } catch (err) {
      console.error(`Failed to register placeholder ${id}:`, err);
    }
  }

  const existing = inFlight.get(map);
  if (existing) return existing;

  const promise = Promise.all(
    Array.from({ length: STATION_ICON_COUNT }, (_, i) => loadOne(map, i))
  ).then(() => undefined);

  inFlight.set(map, promise);
  return promise;
}
