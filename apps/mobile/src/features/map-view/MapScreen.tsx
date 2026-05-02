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
  "station-icon-0": require("../../../assets/stations/icon0.png"),
  "station-icon-1": require("../../../assets/stations/icon1.png"),
  "station-icon-2": require("../../../assets/stations/icon2.png"),
  "station-icon-3": require("../../../assets/stations/icon3.png"),
  "station-icon-4": require("../../../assets/stations/icon4.png"),
  "station-icon-5": require("../../../assets/stations/icon5.png"),
  "station-icon-6": require("../../../assets/stations/icon6.png"),
};

if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

export interface MapScreenProps {
  variant?: "full" | "blank";
  stickerId?: string | null;
}

export function MapScreen({
  variant = "full",
  stickerId = null,
}: MapScreenProps) {
  const { stations } = useStations();
  const [selected, setSelected] = useState<Station | null>(null);
  const cameraRef = useRef<Mapbox.Camera | null>(null);

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

  const handleFeaturePress = useCallback(
    (event: { features: Array<{ properties?: { [key: string]: unknown } | null }> }) => {
      if (variant !== "full") return;
      const props = event.features?.[0]?.properties;
      if (!props) return;
      const id = props.id;
      const station = stations.find((s) => String(s.id) === String(id));
      if (station) setSelected(station);
    },
    [stations, variant]
  );

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

        <Mapbox.ShapeSource
          id="stations"
          shape={geojson as unknown as GeoJSON.FeatureCollection}
          cluster
          clusterRadius={25}
          clusterMaxZoomLevel={22}
          onPress={handleFeaturePress}
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
              textHaloColor: "#ffffff",
              textHaloWidth: 1,
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
          <Mapbox.SymbolLayer
            id="unclustered-point"
            filter={["!", ["has", "point_count"]]}
            style={{
              iconImage: [
                "match",
                ["min", 6, ["to-number", ["coalesce", ["get", "filled_slots"], 6]]],
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
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconAnchor: "center",
            }}
          />
        </Mapbox.ShapeSource>
        <Mapbox.Images images={STATION_ICONS} />
      </Mapbox.MapView>

      {variant === "full" && (
        <>
          <StationModal station={selected} onClose={() => setSelected(null)} />
          <SupportButton stickerId={stickerId} />
        </>
      )}

      <NearestStationFeature
        stations={stations}
        isStickerPage={!!stickerId}
        onCameraTarget={onCameraTarget}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  map: { flex: 1 },
});
