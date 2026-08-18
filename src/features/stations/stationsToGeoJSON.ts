import type { Station } from '@/types/station';

export type StationFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: {
      id: string;
      title: string;
      filled_slots: number;
      open_slots: number | null;
      selected: boolean;
      /** Offline and/or inactive venue — pin should render at 50% opacity. */
      dimmed: boolean;
    };
  }>;
};

function isDimmed(station: Station): boolean {
  const offline = station.online === false;
  const inactive = station.locationInactive === true;
  return offline || inactive;
}

/** Map CUUB stations → GeoJSON for Mapbox clustering / symbol layers. */
export function stationsToGeoJSON(
  stations: Station[],
  selectedId: string | null = null,
): StationFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((station) => {
      // No Energo live data → icon6 (unknown). Otherwise clamp 0–6 for icon0–icon6.
      const filled = station.hasLiveData
        ? Math.max(0, Math.min(6, Math.round(station.batteriesAvailable)))
        : 6;

      return {
        type: 'Feature',
        id: station.id,
        geometry: {
          type: 'Point',
          coordinates: [station.longitude, station.latitude],
        },
        properties: {
          id: station.id,
          title: station.name,
          filled_slots: filled,
          open_slots: station.openSlots ?? null,
          selected: station.id === selectedId,
          dimmed: isDimmed(station),
        },
      };
    }),
  };
}
