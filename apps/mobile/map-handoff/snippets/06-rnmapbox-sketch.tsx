/**
 * Minimal @rnmapbox/maps sketch mirroring production web settings.
 * Assets: register station-icon-0..6 from map-handoff/assets/png/
 * (or apps/mobile/assets/stations/).
 *
 * Gaps vs web to wire up when polishing:
 * - cluster expansion zoom on cluster press
 * - unclustered-circle fallback layer
 * - user location marker + nearest halo
 * - background tap to clear selection
 */
import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Mapbox from "@rnmapbox/maps";
import type { Station } from "@cuub/shared";

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "");

const STATION_ICONS = {
  "station-icon-0": require("../assets/png/icon0.png"),
  "station-icon-1": require("../assets/png/icon1.png"),
  "station-icon-2": require("../assets/png/icon2.png"),
  "station-icon-3": require("../assets/png/icon3.png"),
  "station-icon-4": require("../assets/png/icon4.png"),
  "station-icon-5": require("../assets/png/icon5.png"),
  "station-icon-6": require("../assets/png/icon6.png"),
};

function stationsToGeoJSON(stations: Station[], selectedId: string | number | null) {
  return {
    type: "FeatureCollection" as const,
    features: stations.map((s) => ({
      type: "Feature" as const,
      id: s.id,
      geometry: {
        type: "Point" as const,
        coordinates: [
          parseFloat(String(s.longitude)),
          parseFloat(String(s.latitude)),
        ],
      },
      properties: {
        id: s.id,
        filled_slots: s.filled_slots ?? null,
        open_slots: s.open_slots ?? null,
        selected: s.id === selectedId,
      },
    })),
  };
}

export function MapSketch({ stations }: { stations: Station[] }) {
  const [selected, setSelected] = useState<Station | null>(null);
  const cameraRef = useRef<Mapbox.Camera>(null);
  const shapeRef = useRef<Mapbox.ShapeSource>(null);

  const geojson = useMemo(
    () => stationsToGeoJSON(stations, selected?.id ?? null),
    [stations, selected]
  );

  const onPress = async (event: {
    features: Array<{
      properties?: Record<string, unknown> | null;
      geometry?: { coordinates?: number[] };
    }>;
  }) => {
    const feature = event.features?.[0];
    const props = feature?.properties;
    if (!props) return;

    // Cluster → expand
    if (props.cluster && props.cluster_id != null) {
      const zoom = await shapeRef.current?.getClusterExpansionZoom(
        // @ts-expect-error ShapeSource feature typing varies by version
        feature
      );
      const coords = feature.geometry?.coordinates as [number, number] | undefined;
      if (coords && zoom != null) {
        cameraRef.current?.setCamera({
          centerCoordinate: coords,
          zoomLevel: zoom,
          animationDuration: 400,
        });
      }
      return;
    }

    // Unclustered point → select
    const station = stations.find((s) => String(s.id) === String(props.id));
    if (station) setSelected(station);
  };

  return (
    <View style={styles.root}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Dark}>
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [-87.65, 41.9295],
            zoomLevel: 13.5,
            pitch: 45,
          }}
        />
        <Mapbox.ShapeSource
          ref={shapeRef}
          id="stations"
          shape={geojson as GeoJSON.FeatureCollection}
          cluster
          clusterRadius={25}
          clusterMaxZoomLevel={22}
          onPress={onPress}
        >
          <Mapbox.CircleLayer
            id="clusters"
            filter={["has", "point_count"]}
            style={{
              circleColor: "#0198FD",
              circleRadius: ["step", ["get", "point_count"], 15, 3, 20, 5, 25],
              circleStrokeWidth: 3,
              circleStrokeColor: "#ffffff",
            }}
          />
          <Mapbox.SymbolLayer
            id="cluster-count"
            filter={["has", "point_count"]}
            style={{
              textField: ["to-string", ["get", "point_count"]],
              textSize: ["step", ["get", "point_count"], 14, 10, 16, 30, 18],
              textColor: "#ffffff",
              textHaloColor: "#ffffff",
              textHaloWidth: 1,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
          <Mapbox.CircleLayer
            id="unclustered-circle"
            filter={["!", ["has", "point_count"]]}
            style={{
              circleRadius: ["case", ["get", "selected"], 14, 12],
              circleColor: "#ffffff",
              circleStrokeWidth: 2,
              circleStrokeColor: "#0198FD",
            }}
          />
          <Mapbox.SymbolLayer
            id="unclustered-point"
            filter={["!", ["has", "point_count"]]}
            style={{
              iconImage: [
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
              iconSize: ["case", ["get", "selected"], 1.2, 1],
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconAnchor: "center",
            }}
          />
        </Mapbox.ShapeSource>
        <Mapbox.Images images={STATION_ICONS} />
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
});
