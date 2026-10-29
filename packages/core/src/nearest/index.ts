import type { Coords } from "../types";
import { nearestStation, formatDistance } from "../geo";

export const FAR_STATION_METERS = 50000;

export interface NearestStationView<T> {
  station: T;
  distanceMeters: number;
  distanceText: string;
  isFar: boolean;
}

export function pickNearestStation<T extends { latitude: number | string; longitude: number | string }>(
  user: Coords,
  stations: T[]
): NearestStationView<T> | null {
  const result = nearestStation(user, stations);
  if (!result) return null;
  return {
    station: result.station,
    distanceMeters: result.distanceMeters,
    distanceText: formatDistance(result.distanceMeters),
    isFar: Number.isFinite(result.distanceMeters) && result.distanceMeters > FAR_STATION_METERS,
  };
}
