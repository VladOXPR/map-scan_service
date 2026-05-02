import type { Coords, Station } from "../types";

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export function haversineMeters(a: Coords, b: Coords): number {
  if (!a || !b) return NaN;
  const lat1 = toNumber(a.latitude);
  const lon1 = toNumber(a.longitude);
  const lat2 = toNumber(b.latitude);
  const lon2 = toNumber(b.longitude);
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return NaN;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearestResult {
  station: Station;
  distanceMeters: number;
}

export function nearestStation(
  userCoords: Coords,
  stations: Station[]
): NearestResult | null {
  if (!userCoords || !Array.isArray(stations) || stations.length === 0) return null;

  let best: Station | null = null;
  let bestDist = Infinity;
  for (const s of stations) {
    if (!s) continue;
    const lat = toNumber(s.latitude);
    const lon = toNumber(s.longitude);
    if (lat === null || lon === null) continue;

    const d = haversineMeters(userCoords, { latitude: lat, longitude: lon });
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
