import type mapboxgl from "mapbox-gl";
import type { Coords, StationFeatureCollection } from "@cuub/core";
import { CLUSTER_RADIUS, MAP_BRAND_BLUE, ROUTE_GRADIENT_STOPS } from "@cuub/core";

export { MAP_BRAND_BLUE };

export const STATION_LAYER_IDS = [
  "clusters",
  "unclustered-point",
  "unclustered-circle",
] as const;

const PUCK_SOURCE = "cuub-user-puck";
const PUCK_PULSE_LAYER = "cuub-puck-pulse";
const PUCK_CORE_LAYER = "cuub-puck-core";
const PUCK_FILL = "#1F69E1";
const PULSE_BEAT_MS = 1800;
const PULSE_CORE = 11;
const PULSE_SPREAD = 22;

const ROUTE_SOURCE = "cuub-nearest-route";
const ROUTE_LAYER = "cuub-nearest-route-line";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export const DIMMED: mapboxgl.ExpressionSpecification = ["==", ["get", "dimmed"], 1];
export const SELECTED: mapboxgl.ExpressionSpecification = ["==", ["get", "selected"], 1];

/**
 * Clustered station source + layers. Offline and inactive pins use the same
 * Icon0–6 artwork at 50% opacity without the white backing disk.
 */
export function addStationLayers(
  map: mapboxgl.Map,
  data: StationFeatureCollection,
  { highlightSelected }: { highlightSelected: boolean }
) {
  map.addSource("stations", {
    type: "geojson",
    data: data as unknown as GeoJSON.FeatureCollection,
    cluster: true,
    clusterMaxZoom: 22,
    clusterRadius: CLUSTER_RADIUS,
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stations",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": MAP_BRAND_BLUE,
      "circle-radius": ["step", ["get", "point_count"], 15, 3, 20, 5, 25],
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": 1,
      "circle-radius-transition": { duration: 0, delay: 0 },
      "circle-color-transition": { duration: 0, delay: 0 },
    },
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stations",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["to-string", ["get", "point_count"]],
      // Explicit font stack. Without it Mapbox uses the implicit default
      // ("Open Sans Regular"), whose glyph PBF has intermittently failed to
      // load — when that happens the whole symbol bucket on this source fails
      // to commit, taking cluster numbers AND unclustered icons down with it.
      "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
      "text-size": ["step", ["get", "point_count"], 14, 10, 16, 30, 18],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#ffffff",
    },
  });

  // Fallback disk in a separate (circle) bucket so every coordinate keeps a
  // visible pin even if the symbol bucket fails; the icon layer covers it.
  map.addLayer({
    id: "unclustered-circle",
    type: "circle",
    source: "stations",
    filter: ["all", ["!", ["has", "point_count"]], ["!", DIMMED]],
    paint: {
      "circle-radius": ["case", SELECTED, 14, 12],
      "circle-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-stroke-color": MAP_BRAND_BLUE,
    },
  });

  map.addLayer({
    id: "unclustered-point",
    type: "symbol",
    source: "stations",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": [
        "match",
        ["min", 6, ["to-number", ["coalesce", ["get", "filled_slots"], 6]]],
        0, "station-icon-0",
        1, "station-icon-1",
        2, "station-icon-2",
        3, "station-icon-3",
        4, "station-icon-4",
        5, "station-icon-5",
        6, "station-icon-6",
        "station-icon-6",
      ],
      "icon-size": highlightSelected ? ["case", SELECTED, 1.2, 1] : 1,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: {
      "icon-opacity": ["case", DIMMED, 0.5, 1],
    },
  });
}

/** Walking route + user puck, stacked route → puck → stations. */
export function addOverlayLayers(map: mapboxgl.Map) {
  if (!map.getSource(PUCK_SOURCE)) {
    map.addSource(PUCK_SOURCE, { type: "geojson", data: EMPTY });
  }
  if (!map.getLayer(PUCK_PULSE_LAYER)) {
    map.addLayer(
      {
        id: PUCK_PULSE_LAYER,
        type: "circle",
        source: PUCK_SOURCE,
        paint: {
          "circle-pitch-alignment": "map",
          "circle-radius": PULSE_CORE,
          "circle-color": PUCK_FILL,
          "circle-opacity": 0,
          "circle-radius-transition": { duration: 0, delay: 0 },
          "circle-opacity-transition": { duration: 0, delay: 0 },
        },
      },
      "clusters"
    );
  }
  if (!map.getLayer(PUCK_CORE_LAYER)) {
    map.addLayer(
      {
        id: PUCK_CORE_LAYER,
        type: "circle",
        source: PUCK_SOURCE,
        paint: {
          "circle-pitch-alignment": "map",
          "circle-radius": PULSE_CORE,
          "circle-color": "#000000",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      },
      "clusters"
    );
  }

  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, { type: "geojson", data: EMPTY, lineMetrics: true });
  }
  if (!map.getLayer(ROUTE_LAYER)) {
    map.addLayer(
      {
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 9,
          "line-gradient": [
            "interpolate",
            ["linear"],
            ["line-progress"],
            ...ROUTE_GRADIENT_STOPS.flat(),
          ] as mapboxgl.ExpressionSpecification,
        },
      },
      PUCK_PULSE_LAYER
    );
  }
}

export function setUserPuck(map: mapboxgl.Map, coords: Coords | null) {
  const source = map.getSource(PUCK_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (!source) return;
  source.setData(
    coords
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: [coords.longitude, coords.latitude] },
            },
          ],
        }
      : EMPTY
  );
}

/** Expanding ring under the puck, one beat every 1.8s. Returns a stop function. */
export function startPuckPulse(map: mapboxgl.Map): () => void {
  let frame = 0;
  let last = 0;
  const started = performance.now();
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (now - last < 33) return;
    last = now;
    if (!map.getLayer(PUCK_PULSE_LAYER)) return;
    const t = ((now - started) % PULSE_BEAT_MS) / PULSE_BEAT_MS;
    map.setPaintProperty(PUCK_PULSE_LAYER, "circle-radius", PULSE_CORE + t * PULSE_SPREAD);
    map.setPaintProperty(PUCK_PULSE_LAYER, "circle-opacity", 0.42 * (1 - t));
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

export function setRouteLine(
  map: mapboxgl.Map,
  feature: GeoJSON.Feature<GeoJSON.LineString> | null
) {
  const source = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (!source) return;
  source.setData(feature ?? EMPTY);
}
