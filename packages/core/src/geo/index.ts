import type { Coords } from "../types";

const EARTH_RADIUS_METERS = 6371000;
const EARTH_RADIUS_MILES = 3958.8;
/** Avoid over-zooming when user and station are nearly on top of each other. */
const MIN_FIT_DISTANCE_M = 80;

type LooseCoords = { latitude: number | string; longitude: number | string };

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function haversine(a: LooseCoords, b: LooseCoords, radius: number): number {
  if (!a || !b) return NaN;
  const lat1 = toNumber(a.latitude);
  const lon1 = toNumber(a.longitude);
  const lat2 = toNumber(b.latitude);
  const lon2 = toNumber(b.longitude);
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return NaN;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function haversineMeters(a: LooseCoords, b: LooseCoords): number {
  return haversine(a, b, EARTH_RADIUS_METERS);
}

export const distanceMeters = haversineMeters;

export function distanceMiles(from: LooseCoords, to: LooseCoords): number {
  return haversine(from, to, EARTH_RADIUS_MILES);
}

/** "450 ft" under 0.1 mi, otherwise "0.7 mi". Same label on the app and the web. */
export function formatMiles(miles: number): string {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(1)} mi`;
}

export interface NearestResult<T> {
  station: T;
  distanceMeters: number;
}

export function nearestStation<T extends LooseCoords>(
  userCoords: Coords,
  stations: T[]
): NearestResult<T> | null {
  if (!userCoords || !Array.isArray(stations) || stations.length === 0) return null;

  let best: T | null = null;
  let bestDist = Infinity;
  for (const s of stations) {
    if (!s) continue;
    const d = haversineMeters(userCoords, s);
    if (!Number.isFinite(d)) continue;
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }

  if (!best) return null;
  return { station: best, distanceMeters: bestDist };
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Compass bearing from `from` to `to`, degrees clockwise from north. */
export function bearingDegrees(from: Coords, to: Coords): number {
  const φ1 = toRadians(from.latitude);
  const φ2 = toRadians(to.latitude);
  const Δλ = toRadians(to.longitude - from.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Zoom so `spanMeters` covers a centered slice of the horizontal content width. */
export function zoomForHorizontalSpan(
  spanMeters: number,
  latitude: number,
  availableWidthPx: number
): number {
  const usableWidth = Math.max(availableWidthPx * 0.42, 120);
  const metersPerPixel = Math.max(spanMeters, MIN_FIT_DISTANCE_M) / usableWidth;
  const zoom = Math.log2((156543.03392 * Math.cos(toRadians(latitude))) / metersPerPixel);
  return Math.max(3, Math.min(17, zoom));
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

const GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Geohash of `precision` characters. Precision 6 is a cell of about
 * 1.2 km x 0.6 km, the coarse location analytics events are allowed to carry.
 */
export function encodeGeohash(latitude: number, longitude: number, precision = 6): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = "";
  let bits = 0;
  let value = 0;
  let evenBit = true;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (longitude >= mid) {
        value = value * 2 + 1;
        lngMin = mid;
      } else {
        value *= 2;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude >= mid) {
        value = value * 2 + 1;
        latMin = mid;
      } else {
        value *= 2;
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    if (++bits === 5) {
      hash += GEOHASH_BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}
