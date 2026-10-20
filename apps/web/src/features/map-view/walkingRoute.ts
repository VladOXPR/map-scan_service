import type { Coords } from "@cuub/shared";

type DirectionsResponse = {
  routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
};

function straightLine(from: Coords, to: Coords): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: [
        [from.longitude, from.latitude],
        [to.longitude, to.latitude],
      ],
    },
  };
}

/** Walking route via the Mapbox Directions API; straight line if it fails. */
export async function fetchWalkingRoute(
  from: Coords,
  to: Coords,
  accessToken: string | null | undefined
): Promise<GeoJSON.Feature<GeoJSON.LineString>> {
  if (!accessToken) return straightLine(from, to);
  const path = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/walking/${path}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(accessToken)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return straightLine(from, to);
    const data = (await res.json()) as DirectionsResponse;
    const coordinates = data.routes?.[0]?.geometry?.coordinates;
    if (!coordinates?.length) return straightLine(from, to);
    return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } };
  } catch {
    return straightLine(from, to);
  }
}
