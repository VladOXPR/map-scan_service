import type { Coordinates } from '@/types/station';
import { getMapboxTokenStatus } from '@/lib/mapbox';

type DirectionsResponse = {
  code?: string;
  routes?: Array<{
    geometry?: {
      type?: string;
      coordinates?: [number, number][];
    };
  }>;
};

function straightLineFeature(
  from: Coordinates,
  to: Coordinates,
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: [
        [from.longitude, from.latitude],
        [to.longitude, to.latitude],
      ],
    },
  };
}

/**
 * Walking route via Mapbox Directions API.
 * Falls back to a straight line if the request fails.
 */
export async function fetchWalkingRoute(
  from: Coordinates,
  to: Coordinates,
): Promise<GeoJSON.Feature<GeoJSON.LineString>> {
  const { ok, token } = getMapboxTokenStatus();
  if (!ok) return straightLineFeature(from, to);

  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return straightLineFeature(from, to);
    const data = (await res.json()) as DirectionsResponse;
    const coordinates = data.routes?.[0]?.geometry?.coordinates;
    if (!coordinates?.length) return straightLineFeature(from, to);

    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates,
      },
    };
  } catch {
    return straightLineFeature(from, to);
  }
}
