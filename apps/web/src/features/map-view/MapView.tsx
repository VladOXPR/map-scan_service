"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import type { Station } from "@cuub/shared";
import { cuubClient } from "@/lib/cuubClient";
import { stationsToGeoJSON } from "./stationsToGeoJSON";
import { loadStationIcons } from "./loadStationIcons";
import { StationModal } from "./StationModal";
import { SupportButton } from "./SupportButton";
import { NearestStationFeature } from "@/features/nearest/NearestStationFeature";

type MapboxModule = typeof mapboxgl;

export interface MapViewProps {
  variant?: "full" | "blank";
  stickerId?: string | null;
  embedMode?: boolean;
}

export function MapView({
  variant = "full",
  stickerId = null,
  embedMode = false,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [mapboxgl, setMapboxgl] = useState<MapboxModule | null>(null);

  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [modalHeight, setModalHeight] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mod, token] = await Promise.all([
        import("mapbox-gl"),
        cuubClient.getMapboxToken(),
      ]);
      if (cancelled) return;
      if (!token) {
        console.error(
          "Mapbox token missing. Set MAPBOX_ACCESS_TOKEN (see .env.example)."
        );
        return;
      }
      const mb = (mod.default ?? mod) as MapboxModule;
      mb.accessToken = token;
      if (!containerRef.current) return;
      const instance = new mb.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [-87.65, 41.9295],
        zoom: 13.5,
        bearing: 0,
        pitch: 45,
        fadeDuration: 0,
      });
      mapRef.current = instance;
      setMapboxgl(mb);
      setMap(instance);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    (async () => {
      const result = await cuubClient.getStations();
      if (cancelled) return;
      if (result.success && result.data) {
        setStations(result.data);
      } else {
        console.error("Failed to fetch stations:", result);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [map]);

  const selectedId = selectedStation?.id ?? null;

  useEffect(() => {
    if (!map || !mapboxgl) return;
    let removed = false;

    const setupLayers = async () => {
      await loadStationIcons(map);
      if (removed) return;

      const geojson = stationsToGeoJSON(stations, selectedId);
      const existingSource = map.getSource("stations") as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (existingSource) {
        existingSource.setData(geojson as unknown as GeoJSON.FeatureCollection);
        return;
      }

      map.addSource("stations", {
        type: "geojson",
        data: geojson as unknown as GeoJSON.FeatureCollection,
        cluster: true,
        clusterMaxZoom: 22,
        clusterRadius: 25,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "stations",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#0198FD",
            10,
            "#0198FD",
            30,
            "#0198FD",
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            15,
            3,
            20,
            5,
            25,
          ],
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
          "text-size": ["step", ["get", "point_count"], 14, 10, 16, 30, 18],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1,
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
          ],
          "icon-size":
            variant === "full"
              ? (["case", ["get", "selected"], 1.2, 1] as unknown as number)
              : 1,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });

      const onClusterClick = (e: mapboxgl.MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource("stations") as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const coords = (features[0].geometry as GeoJSON.Point).coordinates as [
            number,
            number
          ];
          map.easeTo({ center: coords, zoom: zoom ?? undefined });
        });
      };

      const onPointClick = (e: mapboxgl.MapLayerMouseEvent) => {
        if (variant !== "full") return;
        const props = e.features?.[0]?.properties ?? {};
        const station = stationsRef.current.find(
          (s) => String(s.id) === String(props.id)
        );
        if (station) setSelectedStation(station);
      };

      const onBackgroundClick = (e: mapboxgl.MapMouseEvent) => {
        if (variant !== "full") return;
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters", "unclustered-point"],
        });
        if (features.length === 0) setSelectedStation(null);
      };

      const cursorOn = () => (map.getCanvas().style.cursor = "pointer");
      const cursorOff = () => (map.getCanvas().style.cursor = "");

      map.on("click", "clusters", onClusterClick);
      map.on("click", "unclustered-point", onPointClick);
      map.on("click", onBackgroundClick);
      map.on("mouseenter", "clusters", cursorOn);
      map.on("mouseleave", "clusters", cursorOff);
      map.on("mouseenter", "unclustered-point", cursorOn);
      map.on("mouseleave", "unclustered-point", cursorOff);
    };

    if (map.isStyleLoaded()) setupLayers();
    else map.once("load", setupLayers);

    return () => {
      removed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mapboxgl, variant]);

  const stationsRef = useRef<Station[]>([]);
  useEffect(() => {
    stationsRef.current = stations;
    if (!map) return;
    const source = map.getSource("stations") as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (!source) return;
    source.setData(
      stationsToGeoJSON(stations, selectedId) as unknown as GeoJSON.FeatureCollection
    );
  }, [stations, selectedId, map]);

  const triggerBottomPx = useMemo(() => {
    if (variant !== "full") return 20;
    return modalHeight > 0 ? modalHeight + 20 : 20;
  }, [variant, modalHeight]);

  return (
    <>
      <div ref={containerRef} className="cuub-map" id="map" />
      {variant === "full" && (
        <>
          <StationModal
            station={selectedStation}
            onClose={() => setSelectedStation(null)}
            onHeightChange={setModalHeight}
          />
          <SupportButton
            stickerId={stickerId}
            liftedBottomPx={modalHeight > 0 ? modalHeight + 20 : undefined}
          />
        </>
      )}
      <NearestStationFeature
        map={map}
        mapboxgl={mapboxgl}
        stations={stations}
        isStickerPage={!!stickerId}
        hideTriggerButton={embedMode}
        disableAutoPrompt={embedMode}
        triggerBottomPx={triggerBottomPx}
      />
    </>
  );
}
