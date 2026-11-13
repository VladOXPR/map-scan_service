import { distanceMiles, type Coords, type LineFeature } from "@cuub/core";

/** Same pace and detour as the app's straight-line fallback (apps/mobile walking.ts). */
const WALK_METERS_PER_SECOND = 1.3;
const WALK_DETOUR = 1.25;
const METERS_PER_MILE = 1609.344;

/** Mapbox walking time when the route has it, otherwise a straight-line estimate. */
export function walkingMinutes(route: LineFeature | null, from: Coords, to: Coords): number {
  const seconds =
    typeof route?.properties.durationSeconds === "number"
      ? route.properties.durationSeconds
      : (distanceMiles(from, to) * METERS_PER_MILE * WALK_DETOUR) / WALK_METERS_PER_SECOND;
  return Math.max(1, Math.round(seconds / 60));
}

export function walkingLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`;
}
