import type mapboxgl from "mapbox-gl";
import { DEFAULT_CENTER as CENTER } from "@cuub/core";

export {
  CAMERA_MS,
  DEFAULT_ZOOM,
  MAP_TILT,
  STATION_ZOOM,
  bearingDegrees,
  boundsAround,
  distanceMeters,
  zoomForHorizontalSpan,
} from "@cuub/core";

export const DEFAULT_CENTER: [number, number] = [CENTER.longitude, CENTER.latitude];

export type Padding = { top: number; bottom: number; left: number; right: number };

export const NO_PADDING: Padding = { top: 0, bottom: 0, left: 0, right: 0 };

/** Keeps pins in the map area above the ~48% station sheet. */
export function sheetPadding(map: mapboxgl.Map, topInset: number): Padding {
  const height = map.getContainer().clientHeight || window.innerHeight;
  return {
    top: Math.max(topInset, 12) + 56,
    bottom: Math.round(height * 0.52),
    left: 72,
    right: 72,
  };
}

export function networkPadding(map: mapboxgl.Map, topInset: number): Padding {
  const container = map.getContainer();
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  return {
    top: Math.max(topInset, 12) + 72,
    bottom: Math.max(Math.round(height * 0.22), 120),
    left: Math.max(Math.round(width * 0.08), 40),
    right: Math.max(Math.round(width * 0.08), 40),
  };
}
