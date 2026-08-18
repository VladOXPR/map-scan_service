// apps/web/src/features/map-view/stationsToGeoJSON.ts (excerpt)

import type { Station } from "@cuub/shared";

export function stationsToGeoJSON(
  stations: Station[],
  selectedId: string | number | null = null
) {
  return {
    type: "FeatureCollection" as const,
    features: stations.map((station) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [
          parseFloat(String(station.longitude)),
          parseFloat(String(station.latitude)),
        ] as [number, number],
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
