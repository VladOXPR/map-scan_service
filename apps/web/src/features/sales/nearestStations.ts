import { haversineMeters, type Coords, type Station } from "@cuub/shared";

export interface RankedStation {
  station: Station;
  distanceMeters: number;
}

function toCoords(station: Station): Coords | null {
  const latitude = parseFloat(String(station.latitude));
  const longitude = parseFloat(String(station.longitude));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) < 0.01 && Math.abs(longitude) < 0.01) return null;
  return { latitude, longitude };
}

/** Nearest N stations by haversine distance (skips invalid / 0,0 coords). */
export function nearestStations(
  origin: Coords,
  stations: Station[],
  limit: number = 3
): RankedStation[] {
  const ranked: RankedStation[] = [];
  for (const station of stations) {
    const coords = toCoords(station);
    if (!coords) continue;
    const distanceMeters = haversineMeters(origin, coords);
    if (!Number.isFinite(distanceMeters)) continue;
    ranked.push({ station, distanceMeters });
  }
  ranked.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return ranked.slice(0, Math.max(0, limit));
}
