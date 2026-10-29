import { fetchWalkingRoute as fetchRoute, type LineFeature } from '@cuub/core';
import type { Coordinates } from '@/types/station';
import { getMapboxTokenStatus } from '@/lib/mapbox';

/** Walking route via Mapbox Directions; straight line if the token or request fails. */
export function fetchWalkingRoute(from: Coordinates, to: Coordinates): Promise<LineFeature> {
  const { ok, token } = getMapboxTokenStatus();
  return fetchRoute(from, to, ok ? token : null);
}
