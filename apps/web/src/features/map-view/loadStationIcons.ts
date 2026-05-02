import type mapboxgl from "mapbox-gl";

const STATION_ICON_COUNT = 7;
const cache = new WeakMap<mapboxgl.Map, Promise<void>>();

export function loadStationIcons(map: mapboxgl.Map): Promise<void> {
  const existing = cache.get(map);
  if (existing) return existing;

  const scale = 2;
  const loaders: Promise<void>[] = [];
  for (let i = 0; i < STATION_ICON_COUNT; i++) {
    loaders.push(
      new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || 54;
          const h = img.naturalHeight || 53;
          const canvas = document.createElement("canvas");
          canvas.width = w * scale;
          canvas.height = h * scale;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas 2D context unavailable"));
            return;
          }
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
      })
    );
  }

  const all = Promise.all(loaders).then(() => undefined);
  cache.set(map, all);
  return all;
}
