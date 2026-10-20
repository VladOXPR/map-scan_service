import type mapboxgl from "mapbox-gl";
import type { Coords } from "@cuub/shared";

/** Camera tilt in degrees — the only pitch the user app ever uses. */
export const MAP_TILT = 53;
export const STATION_ZOOM = 15;
export const DEFAULT_CENTER: [number, number] = [-87.65, 41.9295];
export const DEFAULT_ZOOM = 13.5;
export const CAMERA_MS = 650;

const EARTH_RADIUS_M = 6371000;
/** Avoid over-zooming when user and station are nearly on top of each other. */
const MIN_FIT_DISTANCE_M = 80;

export type Padding = { top: number; bottom: number; left: number; right: number };

export const NO_PADDING: Padding = { top: 0, bottom: 0, left: 0, right: 0 };

function toRad(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians: number) {
  return (radians * 180) / Math.PI;
}

/** Compass bearing from `from` → `to`, degrees clockwise from north. */
export function bearingDegrees(from: Coords, to: Coords): number {
  const φ1 = toRad(from.latitude);
  const φ2 = toRad(to.latitude);
  const Δλ = toRad(to.longitude - from.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function distanceMeters(from: Coords, to: Coords): number {
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Zoom so `spanMeters` covers a centered slice of the horizontal content width. */
export function zoomForHorizontalSpan(
  spanMeters: number,
  latitude: number,
  availableWidthPx: number
): number {
  const usableWidth = Math.max(availableWidthPx * 0.42, 120);
  const metersPerPixel = Math.max(spanMeters, MIN_FIT_DISTANCE_M) / usableWidth;
  const zoom = Math.log2((156543.03392 * Math.cos(toRad(latitude))) / metersPerPixel);
  return Math.max(3, Math.min(17, zoom));
}

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

export function boundsAround(points: Coords[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let minLat = points[0].latitude;
  let maxLat = minLat;
  let minLng = points[0].longitude;
  let maxLng = minLng;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  const pad = 0.002;
  if (maxLat - minLat < pad) {
    minLat -= pad / 2;
    maxLat += pad / 2;
  }
  if (maxLng - minLng < pad) {
    minLng -= pad / 2;
    maxLng += pad / 2;
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
