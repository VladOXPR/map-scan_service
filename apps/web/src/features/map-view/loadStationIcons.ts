import type mapboxgl from "mapbox-gl";

// Mapbox bundles every symbol layer on the same source into one per-tile
// "symbol bucket". If any referenced icon image is missing when the bucket
// is built, that whole bucket can commit in a poisoned state — meaning
// neither cluster-count text NOR unclustered-point icons render on that
// tile. The strategy here:
//   1. Register a transparent placeholder for every station-icon-N the
//      moment the map is ready, BEFORE any layer references them.
//   2. Kick off independent SVG downloads. Each one swaps into its
//      placeholder via map.updateImage() — no bucket disruption, no
//      all-or-nothing failure mode.
//   3. A styleimagemissing backstop covers any edge case where a
//      placeholder didn't get registered (e.g. style replacement).

const STATION_ICON_COUNT = 7;
const STATION_ICON_NATIVE_W = 54;
const STATION_ICON_NATIVE_H = 53;
const STATION_ICON_SCALE = 2;

type IconLoadState = "idle" | "loading" | "loaded" | "error";

// Per-map state so multiple maps (e.g. in tests) don't share load flags.
const stateByMap = new WeakMap<mapboxgl.Map, IconLoadState[]>();

function getState(map: mapboxgl.Map): IconLoadState[] {
  let state = stateByMap.get(map);
  if (!state) {
    state = new Array(STATION_ICON_COUNT).fill("idle") as IconLoadState[];
    stateByMap.set(map, state);
  }
  return state;
}

function buildTransparentPlaceholder(): ImageData {
  const w = STATION_ICON_NATIVE_W * STATION_ICON_SCALE;
  const h = STATION_ICON_NATIVE_H * STATION_ICON_SCALE;
  return new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
}

export function registerPlaceholderStationIcons(map: mapboxgl.Map): void {
  const placeholder = buildTransparentPlaceholder();
  for (let i = 0; i < STATION_ICON_COUNT; i++) {
    const id = `station-icon-${i}`;
    if (map.hasImage(id)) continue;
    try {
      map.addImage(id, placeholder, { pixelRatio: STATION_ICON_SCALE });
    } catch (err) {
      console.error(`Failed to register placeholder ${id}:`, err);
    }
  }
}

export function loadStationIcon(map: mapboxgl.Map, index: number): void {
  if (index < 0 || index >= STATION_ICON_COUNT) return;
  const state = getState(map);
  const id = `station-icon-${index}`;
  const prevState = state[index];
  if (prevState === "loading" || prevState === "loaded") return;
  state[index] = "loading";

  const img = new Image();
  img.onload = () => {
    try {
      const w = STATION_ICON_NATIVE_W * STATION_ICON_SCALE;
      const h = STATION_ICON_NATIVE_H * STATION_ICON_SCALE;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        state[index] = "error";
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      // updateImage() does not re-create the symbol bucket, so the layer
      // keeps rendering uninterrupted while pixels change underneath.
      if (map.hasImage(id)) map.updateImage(id, data);
      else map.addImage(id, data, { pixelRatio: STATION_ICON_SCALE });
      state[index] = "loaded";
    } catch (err) {
      console.error(`Failed to register ${id}:`, err);
      state[index] = "error";
    }
  };
  img.onerror = () => {
    console.error(`Failed to load /Icon${index}.svg`);
    state[index] = "error";
  };
  // Cache-bust on retry so a CDN/browser-cached failed response doesn't
  // re-serve the same broken bytes forever.
  const cacheBust = prevState === "error" ? `?r=${Date.now()}` : "";
  img.src = `/Icon${index}.svg${cacheBust}`;
}

export function loadAndRegisterStationIcons(map: mapboxgl.Map): void {
  for (let i = 0; i < STATION_ICON_COUNT; i++) loadStationIcon(map, i);
}

// Defensive backstop: if a placeholder didn't get registered for any reason
// (style replacement, addImage threw), Mapbox fires this so we can recover
// instead of leaving the bucket in a missing-image state.
export function attachStyleImageMissingHandler(map: mapboxgl.Map): void {
  map.on("styleimagemissing", (e) => {
    const missingId = (e as { id?: unknown })?.id;
    if (
      typeof missingId !== "string" ||
      !missingId.startsWith("station-icon-")
    )
      return;
    const index = parseInt(missingId.slice("station-icon-".length), 10);
    if (Number.isNaN(index)) return;
    // Drop in a placeholder immediately so the bucket has SOMETHING to
    // build against, then kick off the real load.
    registerPlaceholderStationIcons(map);
    const state = getState(map);
    if (state[index] === "error") state[index] = "idle";
    loadStationIcon(map, index);
  });
}

// Back-compat entry point. Resolves as soon as placeholders are registered
// (synchronously) — callers no longer block on real SVG downloads. The real
// icons swap in via map.updateImage() in the background.
export function loadStationIcons(map: mapboxgl.Map): Promise<void> {
  registerPlaceholderStationIcons(map);
  loadAndRegisterStationIcons(map);
  return Promise.resolve();
}
