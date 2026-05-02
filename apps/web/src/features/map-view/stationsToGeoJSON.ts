import type { Station } from "@cuub/shared";

export interface StationFeatureProps {
  id: string | number;
  title?: string;
  filled_slots?: number | string | null;
  open_slots?: number | string | null;
  latitude: number | string;
  longitude: number | string;
  selected: boolean;
}

export interface StationsGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: StationFeatureProps;
  }>;
}

export function stationsToGeoJSON(
  stations: Station[],
  selectedId: string | number | null = null
): StationsGeoJSON {
  return {
    type: "FeatureCollection",
    features: stations.map((station) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [
          parseFloat(String(station.longitude)),
          parseFloat(String(station.latitude)),
        ],
      },
      properties: {
        id: station.id,
        title: station.title,
        filled_slots: station.filled_slots ?? null,
        open_slots: station.open_slots ?? null,
        latitude: station.latitude,
        longitude: station.longitude,
        selected: station.id === selectedId,
      },
    })),
  };
}
