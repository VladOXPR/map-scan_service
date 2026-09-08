import type { Station } from '@/types/station';

export type StationFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: {
      id: string;
      title: string;
      filled_slots: number;
      open_slots: number;
      selected: number;
      /** Offline and/or inactive venue — pin should render at 50% opacity. */
      dimmed: number;
    };
  }>;
};

function isDimmed(station: Station): boolean {
  const offline = station.online === false;
  const inactive = station.locationInactive === true;
  return offline || inactive;
}

function isFiniteCoord(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** Map CUUB stations → GeoJSON for Mapbox clustering / symbol layers. */
export function stationsToGeoJSON(
  stations: Station[],
  selectedId: string | null = null,
): StationFeatureCollection {
  const features: StationFeatureCollection['features'] = [];

  for (const station of stations) {
    const latitude = station.latitude;
    const longitude = station.longitude;
    if (!isFiniteCoord(latitude, longitude)) continue;

    // No Energo live data → icon6 (unknown). Otherwise clamp 0–6 for icon0–icon6.
    const filled = station.hasLiveData
      ? Math.max(0, Math.min(6, Math.round(station.batteriesAvailable)))
      : 6;

    features.push({
      type: 'Feature',
      // Omit Feature.id — UUID strings can fail Mapbox iOS GeoJSON decode.
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      properties: {
        id: String(station.id),
        title: station.name || 'CUUB Station',
        filled_slots: filled,
        // Never null — iOS ShapeSource rejects null property values.
        open_slots:
          typeof station.openSlots === 'number' &&
          Number.isFinite(station.openSlots)
            ? station.openSlots
            : -1,
        selected: station.id === selectedId ? 1 : 0,
        dimmed: isDimmed(station) ? 1 : 0,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
