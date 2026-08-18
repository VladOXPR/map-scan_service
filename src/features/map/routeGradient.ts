type LngLat = [number, number];

const GRADIENT_STOPS: Array<{ t: number; rgb: [number, number, number] }> = [
  { t: 0, rgb: [94, 200, 255] }, // #5EC8FF
  { t: 0.45, rgb: [1, 152, 253] }, // brand blue
  { t: 1, rgb: [31, 104, 224] }, // #1F68E0
];

function distMeters(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function colorAt(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  let i = 0;
  while (
    i < GRADIENT_STOPS.length - 2 &&
    GRADIENT_STOPS[i + 1]!.t < clamped
  ) {
    i += 1;
  }
  const a = GRADIENT_STOPS[i]!;
  const b = GRADIENT_STOPS[i + 1]!;
  const span = b.t - a.t || 1;
  const u = (clamped - a.t) / span;
  const r = Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * u);
  const g = Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * u);
  const bl = Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * u);
  return `rgb(${r},${g},${bl})`;
}

/**
 * Split a route into short colored segments.
 * Preferable to Mapbox `lineGradient` on RN, which often paints black
 * when line metrics aren't applied correctly.
 */
export function lineStringToGradientSegments(
  feature: GeoJSON.Feature<GeoJSON.LineString>,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const coords = feature.geometry.coordinates as LngLat[];
  if (coords.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }

  const dists = [0];
  for (let i = 1; i < coords.length; i++) {
    dists.push(dists[i - 1]! + distMeters(coords[i - 1]!, coords[i]!));
  }
  const total = dists[dists.length - 1] || 1;

  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const t = (dists[i]! + dists[i + 1]!) / 2 / total;
    features.push({
      type: 'Feature',
      properties: { color: colorAt(t) },
      geometry: {
        type: 'LineString',
        coordinates: [coords[i]!, coords[i + 1]!],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
