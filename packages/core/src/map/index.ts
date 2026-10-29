import type { Coords, Station } from "../types";

/** Map look shared by the app (@rnmapbox/maps) and the website (mapbox-gl). */
export const MAP_STYLE_URL = "mapbox://styles/mapbox/dark-v11";
/** Camera tilt in degrees — the only pitch either client uses. */
export const MAP_TILT = 53;
export const STATION_ZOOM = 15;
export const DEFAULT_CENTER: Coords = { latitude: 41.9295, longitude: -87.65 };
export const DEFAULT_ZOOM = 13.5;
export const CAMERA_MS = 650;
export const MAP_BRAND_BLUE = "#0198FD";
export const CLUSTER_RADIUS = 25;
export const ROUTE_GRADIENT_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, "#5EC8FF"],
  [0.45, MAP_BRAND_BLUE],
  [1, "#1F68E0"],
];

export interface StationFeatureProperties {
  id: string;
  title: string;
  /** Icon index 0–6; 6 (unknown) when the row has no live counts. */
  filled_slots: number;
  /** -1 when unknown. Never null — iOS ShapeSource rejects null property values. */
  open_slots: number;
  selected: 0 | 1;
  /** Offline and/or inactive venue — pin renders at 50% opacity. */
  dimmed: 0 | 1;
}

export interface StationFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: StationFeatureProperties;
  }>;
}

function isFiniteCoord(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function stationIconIndex(station: Station): number {
  if (!station.hasLiveData) return 6;
  return Math.max(0, Math.min(6, Math.round(station.batteriesAvailable)));
}

export function isStationDimmed(station: Station): boolean {
  return station.online === false || station.locationInactive === true;
}

/** Stations → GeoJSON for Mapbox clustering and the Icon0–6 symbol layer. */
export function stationsToGeoJSON(
  stations: Station[],
  selectedId: string | null = null
): StationFeatureCollection {
  const features: StationFeatureCollection["features"] = [];
  for (const station of stations) {
    if (!isFiniteCoord(station.latitude, station.longitude)) continue;
    features.push({
      type: "Feature",
      // Omit Feature.id — UUID strings can fail Mapbox iOS GeoJSON decode.
      geometry: { type: "Point", coordinates: [station.longitude, station.latitude] },
      properties: {
        id: String(station.id),
        title: station.name || "CUUB Station",
        filled_slots: stationIconIndex(station),
        open_slots:
          typeof station.openSlots === "number" && Number.isFinite(station.openSlots)
            ? station.openSlots
            : -1,
        selected: station.id === selectedId ? 1 : 0,
        dimmed: isStationDimmed(station) ? 1 : 0,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export type LineFeature = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

type DirectionsResponse = {
  routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
};

function straightLine(from: Coords, to: Coords): LineFeature {
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
): Promise<LineFeature> {
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
