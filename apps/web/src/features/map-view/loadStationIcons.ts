import type mapboxgl from "mapbox-gl";

// One station icon for everyone. Eliminates the multi-variant match
// expression, the per-variant state machine, and 6 of 7 SVG downloads.
//
// The placeholder strategy is preserved (and now trivially simple) because
// it's what keeps the symbol bucket committable: Mapbox bundles every
// symbol layer on the same source into one per-tile bucket. If the bucket
// references an image that hasn't been registered yet, the entire bucket
// can fail to commit on that tile — taking cluster numbers down with the
// pins. By registering a transparent placeholder synchronously up front,
// the bucket always builds against an existing image, and the real SVG
// swaps in via map.updateImage() with no bucket disruption.

const STATION_ICON_ID = "station-icon";
const STATION_ICON_URL = "/Icon6.svg";
const STATION_ICON_NATIVE_W = 54;
const STATION_ICON_NATIVE_H = 53;
const STATION_ICON_SCALE = 2;

const inFlight = new WeakMap<mapboxgl.Map, Promise<void>>();

function placeholder(): ImageData {
  const w = STATION_ICON_NATIVE_W * STATION_ICON_SCALE;
  const h = STATION_ICON_NATIVE_H * STATION_ICON_SCALE;
  return new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
}

export const STATION_ICON_NAME = STATION_ICON_ID;

export function loadStationIcons(map: mapboxgl.Map): Promise<void> {
  // Register the placeholder synchronously so any layer added immediately
  // after this call already has a valid image to reference.
  if (!map.hasImage(STATION_ICON_ID)) {
    try {
      map.addImage(STATION_ICON_ID, placeholder(), {
        pixelRatio: STATION_ICON_SCALE,
      });
    } catch (err) {
      console.error(`Failed to register placeholder ${STATION_ICON_ID}:`, err);
    }
  }

  // De-dupe concurrent calls; the real SVG only needs to load once per map.
  const existing = inFlight.get(map);
  if (existing) return existing;

  const promise = new Promise<void>((resolve) => {
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
          resolve();
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        // updateImage() leaves the symbol bucket intact — pixels swap in
        // without re-tessellating any tiles.
        if (map.hasImage(STATION_ICON_ID)) map.updateImage(STATION_ICON_ID, data);
        else
          map.addImage(STATION_ICON_ID, data, {
            pixelRatio: STATION_ICON_SCALE,
          });
      } catch (err) {
        console.error(`Failed to register ${STATION_ICON_ID}:`, err);
      }
      resolve();
    };
    img.onerror = () => {
      console.error(`Failed to load ${STATION_ICON_URL}`);
      resolve();
    };
    img.src = STATION_ICON_URL;
  });

  inFlight.set(map, promise);
  return promise;
}
