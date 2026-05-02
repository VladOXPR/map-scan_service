import type { Station, Coords } from "../types";
import { nearestStation, formatDistance, type NearestResult } from "../geo";

export const FAR_STATION_METERS = 50000;

export interface NearestStationView {
  station: Station;
  distanceMeters: number;
  distanceText: string;
  isFar: boolean;
}

export function pickNearestStation(
  user: Coords,
  stations: Station[]
): NearestStationView | null {
  const result: NearestResult | null = nearestStation(user, stations);
  if (!result) return null;
  return {
    station: result.station,
    distanceMeters: result.distanceMeters,
    distanceText: formatDistance(result.distanceMeters),
    isFar: Number.isFinite(result.distanceMeters) && result.distanceMeters > FAR_STATION_METERS,
  };
}
