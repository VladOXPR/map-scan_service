import React, { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Mapbox from "@rnmapbox/maps";
import type { Station, Coords } from "@cuub/shared";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/config";
import { useStations } from "@/features/stations/useStations";
import { stationsToGeoJSON } from "./stationsToGeoJSON";
import { StationModal } from "./StationModal";
import { SupportButton } from "./SupportButton";
import { NearestStationFeature } from "@/features/nearest/NearestStationFeature";

const STATION_ICONS = {
  "station-icon-0": require("../../../../../assets/stations/icon0.png"),
  "station-icon-1": require("../../../../../assets/stations/icon1.png"),
  "station-icon-2": require("../../../../../assets/stations/icon2.png"),
  "station-icon-3": require("../../../../../assets/stations/icon3.png"),
  "station-icon-4": require("../../../../../assets/stations/icon4.png"),
  "station-icon-5": require("../../../../../assets/stations/icon5.png"),
  "station-icon-6": require("../../../../../assets/stations/icon6.png"),
};

if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

export interface MapScreenProps {
  variant?: "full" | "blank";
  stickerId?: string | null;
}

function isClusterFeature(feature: GeoJSON.Feature | undefined): boolean {
  if (!feature?.properties) return false;
  const p = feature.properties;
  return (
    p.cluster === true ||
    p.cluster === 1 ||
    p.cluster === "true" ||
    typeof p.point_count === "number" ||
    typeof p.point_count === "string"
  );
}

/** Resolve a pressed Mapbox feature to a Station (skips clusters). */
function findStation(
  stations: Station[],
  features: GeoJSON.Feature[] | undefined
): Station | null {
  if (!features?.length) return null;

  for (const feature of features) {
    if (isClusterFeature(feature)) continue;

    const props = feature.properties ?? {};
    const id = props.id ?? feature.id;
    if (id != null) {
      const byId = stations.find((s) => String(s.id) === String(id));
      if (byId) return byId;
    }

    if (feature.geometry?.type === "Point") {
      const [lng, lat] = feature.geometry.coordinates;
      const byCoords = stations.find(
        (s) =>
          Math.abs(parseFloat(String(s.longitude)) - lng) < 0.00005 &&
          Math.abs(parseFloat(String(s.latitude)) - lat) < 0.00005
      );
      if (byCoords) return byCoords;
    }
  }

  return null;
}

export function MapScreen({
  variant = "full",
  stickerId = null,
}: MapScreenProps) {
  const { stations } = useStations();
  const [selected, setSelected] = useState<Station | null>(null);
  const cameraRef = useRef<Mapbox.Camera | null>(null);
  const shapeRef = useRef<Mapbox.ShapeSource | null>(null);
  const stationsRef = useRef(stations);
  stationsRef.current = stations;

  const geojson = useMemo(
    () => stationsToGeoJSON(stations, selected?.id ?? null),
    [stations, selected]
  );

  const onCameraTarget = useCallback(
    (user: Coords, station: { latitude: number; longitude: number }) => {
      cameraRef.current?.fitBounds(
        [user.longitude, user.latitude],
        [station.longitude, station.latitude],
        [240, 80, 140, 80],
        1200
      );
    },
    []
  );

  /** Pin tap → open bottom location sheet. Cluster tap → zoom in. */
  const onShapePress = useCallback(
    async (event: { features?: GeoJSON.Feature[] }) => {
      const features = event.features ?? [];
      if (features.length === 0) return;

      // 1) Unclustered pin → location bottom popup
      if (variant === "full") {
        const station = findStation(stationsRef.current, features);
        if (station) {
          setSelected(station);
          return;
        }
      }

      // 2) Cluster → expand
      const clusterFeature = features.find((f) => isClusterFeature(f));
      if (clusterFeature && shapeRef.current) {
        try {
          const zoom = await shapeRef.current.getClusterExpansionZoom(
            // @ts-expect-error Feature typing varies by rnmapbox version
            clusterFeature
          );
          const coords =
            clusterFeature.geometry?.type === "Point"
              ? (clusterFeature.geometry.coordinates as [number, number])
              : null;
          if (coords && zoom != null) {
            cameraRef.current?.setCamera({
              centerCoordinate: coords,
              zoomLevel: zoom,
              animationDuration: 400,
            });
          }
        } catch {
          /* ignore */
        }
      }
    },
    [variant]
  );

  const sheetOpen = variant === "full" && selected != null;

  return (
    <View style={styles.root}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Dark}
        attributionEnabled={false}
        logoEnabled={false}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [-87.65, 41.9295],
            zoomLevel: 13.5,
            pitch: 45,
          }}
        />

        <Mapbox.Images images={STATION_ICONS} />

        <Mapbox.ShapeSource
          ref={shapeRef}
          id="stations"
          shape={geojson as unknown as GeoJSON.FeatureCollection}
          cluster
          clusterRadius={25}
          clusterMaxZoomLevel={22}
          hitbox={{ width: 80, height: 80 }}
          onPress={onShapePress}
        >
          <Mapbox.CircleLayer
            id="clusters"
            filter={["has", "point_count"]}
            style={{
              circleColor: "#0198FD",
              circleRadius: [
                "step",
                ["get", "point_count"],
                15,
                3,
                20,
                5,
                25,
              ],
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
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
          {/* Slightly visible hit target — opacity 0 is not tappable */}
          <Mapbox.CircleLayer
            id="unclustered-hit"
            filter={["!", ["has", "point_count"]]}
            style={{
              circleRadius: 22,
              circleColor: "#0198FD",
              circleOpacity: 0.01,
              circleStrokeWidth: 0,
            }}
          />
          <Mapbox.SymbolLayer
            id="unclustered-point"
            filter={["!", ["has", "point_count"]]}
            style={{
              iconImage: [
                "match",
                [
                  "min",
                  6,
                  ["to-number", ["coalesce", ["get", "filled_slots"], 6]],
                ],
                0,
                "station-icon-0",
                1,
                "station-icon-1",
                2,
                "station-icon-2",
                3,
                "station-icon-3",
                4,
                "station-icon-4",
                5,
                "station-icon-5",
                6,
                "station-icon-6",
                "station-icon-6",
              ] as unknown as string,
              iconSize:
                variant === "full"
                  ? (["case", ["get", "selected"], 1.2, 1] as unknown as number)
                  : 1,
              iconOpacity: [
                "case",
                [
                  "any",
                  ["==", ["get", "online"], false],
                  ["==", ["get", "inactive"], true],
                ],
                0.4,
                1,
              ] as unknown as number,
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconAnchor: "center",
            }}
          />
        </Mapbox.ShapeSource>
      </Mapbox.MapView>

      {variant === "full" && (
        <>
          <StationModal
            station={selected}
            onClose={() => setSelected(null)}
          />
          <SupportButton stickerId={stickerId} />
        </>
      )}

      <NearestStationFeature
        stations={stations}
        isStickerPage={!!stickerId}
        onCameraTarget={onCameraTarget}
        // Keep nearest button above the location sheet when open
        bottom={sheetOpen ? 200 : 20}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  map: { flex: 1 },
});
