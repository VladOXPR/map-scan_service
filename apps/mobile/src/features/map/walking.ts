import { useQueries } from '@tanstack/react-query';
import { distanceMiles } from '@/lib/distance';
import type { Coordinates } from '@/types/station';
import { fetchWalkingRoute } from './fetchWalkingRoute';

/** Brisk-but-easy walking pace and street detour for the straight-line fallback. */
const WALK_METERS_PER_SECOND = 1.3;
const WALK_DETOUR = 1.25;
const METERS_PER_MILE = 1609.344;

type RouteLike = { properties?: { durationSeconds?: number } | null };

export function walkingMinutes(route: RouteLike | null, from: Coordinates, to: Coordinates): number {
  const seconds =
    typeof route?.properties?.durationSeconds === 'number'
      ? route.properties.durationSeconds
      : (distanceMiles(from, to) * METERS_PER_MILE * WALK_DETOUR) / WALK_METERS_PER_SECOND;
  return Math.max(1, Math.round(seconds / 60));
}

export function walkingLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${minutes / 60} h`;
}

/** ~100 m grid, so a drifting GPS fix doesn't refetch the route every few seconds. */
function cell(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Walking minutes from `from` to each target (Mapbox time, straight-line estimate until it lands). */
export function useWalkingMinutes(
  from: Coordinates | null,
  targets: ReadonlyArray<Coordinates & { id: string }>,
): Array<number | null> {
  const origin = from ? { latitude: cell(from.latitude), longitude: cell(from.longitude) } : null;
  const results = useQueries({
    queries: targets.map((target) => ({
      queryKey: ['walking-route', origin?.latitude, origin?.longitude, target.id],
      queryFn: () => fetchWalkingRoute(origin!, target),
      enabled: origin != null,
      staleTime: 5 * 60_000,
    })),
  });
  return targets.map((target, i) =>
    from ? walkingMinutes(results[i]?.data ?? null, from, target) : null,
  );
}
