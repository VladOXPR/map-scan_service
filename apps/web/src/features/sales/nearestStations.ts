import { haversineMeters, stationCoords, type Coords, type Station } from "@cuub/core";

export interface RankedStation {
  station: Station;
  distanceMeters: number;
}

/** Nearest N stations by haversine distance (skips invalid coords). */
export function nearestStations(
  origin: Coords,
  stations: Station[],
  limit: number = 3
): RankedStation[] {
  const ranked: RankedStation[] = [];
  for (const station of stations) {
    const coords = stationCoords(station);
    if (!coords) continue;
    const distanceMeters = haversineMeters(origin, coords);
    if (!Number.isFinite(distanceMeters)) continue;
    ranked.push({ station, distanceMeters });
  }
  ranked.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return ranked.slice(0, Math.max(0, limit));
}
