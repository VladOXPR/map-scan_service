"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type mapboxgl from "mapbox-gl";
import type { Station } from "@cuub/core";
import { MAP_STYLE_URL, stationsToGeoJSON } from "@cuub/core";
import { cuubClient } from "@/lib/cuubClient";
import { loadStationIcons } from "@/features/map-view/loadStationIcons";
import { addStationLayers } from "@/features/map-view/mapLayers";
import { StationSheet } from "@/features/map-view/StationSheet";
import { nearestStations, type RankedStation } from "./nearestStations";

type MapboxModule = typeof mapboxgl;

const METERS_PER_MILE = 1609.344;

function formatMiles(meters: number): string {
  if (!Number.isFinite(meters)) return "";
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return "<0.1 mi";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export interface SalesMapViewProps {
  initialStations?: Station[];
}

export function SalesMapView({ initialStations = [] }: SalesMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const stationsRef = useRef<Station[]>(initialStations);
  const selectedRef = useRef<Station | null>(null);

  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [mapboxgl, setMapboxgl] = useState<MapboxModule | null>(null);
  const [stations, setStations] = useState<Station[]>(initialStations);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nearby, setNearby] = useState<RankedStation[]>([]);
  const [searching, setSearching] = useState(false);
  const [modalHeight, setModalHeight] = useState(0);
  const [searchPoint, setSearchPoint] = useState<{ latitude: number; longitude: number } | null>(
    null
  );

  stationsRef.current = stations;
  selectedRef.current = selectedStation;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mod, token] = await Promise.all([
        import("mapbox-gl"),
        cuubClient.getMapboxToken(),
      ]);
      if (cancelled) return;
      if (!token) {
        console.error("Mapbox token missing. Set MAPBOX_ACCESS_TOKEN.");
        setError("Mapbox token missing");
        return;
      }
      const mb = (mod.default ?? mod) as MapboxModule;
      mb.accessToken = token;
      if (!containerRef.current) return;
      const instance = new mb.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: [-87.65, 41.9295],
        zoom: 13.5,
        bearing: 0,
        pitch: 45,
        fadeDuration: 0,
        attributionControl: false,
      });
      instance.addControl(new mb.AttributionControl({ compact: true }), "bottom-right");
      mapRef.current = instance;
      setMapboxgl(mb);
      setMap(instance);
    })();
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await cuubClient.getStations();
      if (cancelled) return;
      if (result.success && result.data) setStations(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!map || !mapboxgl) return;
    let removed = false;

    const setupLayers = async () => {
      await loadStationIcons(map);
      if (removed) return;

      const geojson = stationsToGeoJSON(
        stationsRef.current,
        selectedRef.current?.id ?? null
      );
      if (map.getSource("stations")) {
        (map.getSource("stations") as mapboxgl.GeoJSONSource).setData(
          geojson as unknown as GeoJSON.FeatureCollection
        );
        return;
      }

      addStationLayers(map, geojson, { highlightSelected: true });

      const onClusterClick = (e: mapboxgl.MapLayerMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource("stations") as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const coords = (features[0].geometry as GeoJSON.Point)
            .coordinates as [number, number];
          map.easeTo({ center: coords, zoom: zoom ?? undefined });
        });
      };

      const onPointClick = (e: mapboxgl.MapLayerMouseEvent) => {
        const props = e.features?.[0]?.properties ?? {};
        const station = stationsRef.current.find(
          (s) => String(s.id) === String(props.id)
        );
        if (station) setSelectedStation(station);
      };

      const onBackgroundClick = (e: mapboxgl.MapMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters", "unclustered-point", "unclustered-circle"],
        });
        if (features.length === 0) setSelectedStation(null);
      };

      const cursorOn = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const cursorOff = () => {
        map.getCanvas().style.cursor = "";
      };

      map.on("click", "clusters", onClusterClick);
      map.on("click", "unclustered-point", onPointClick);
      map.on("click", "unclustered-circle", onPointClick);
      map.on("click", onBackgroundClick);
      map.on("mouseenter", "clusters", cursorOn);
      map.on("mouseleave", "clusters", cursorOff);
      map.on("mouseenter", "unclustered-point", cursorOn);
      map.on("mouseleave", "unclustered-point", cursorOff);
      map.on("mouseenter", "unclustered-circle", cursorOn);
      map.on("mouseleave", "unclustered-circle", cursorOff);
    };

    if (map.isStyleLoaded()) setupLayers();
    else map.once("load", setupLayers);

    return () => {
      removed = true;
    };
  }, [map, mapboxgl]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource("stations") as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (!source) return;
    source.setData(
      stationsToGeoJSON(
        stations,
        selectedStation?.id ?? null
      ) as unknown as GeoJSON.FeatureCollection
    );
  }, [stations, selectedStation, map]);

  const selectNearbyStation = (station: Station) => {
    setSelectedStation(station);
    if (!map) return;
    const lng = parseFloat(String(station.longitude));
    const lat = parseFloat(String(station.latitude));
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    map.easeTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: 600,
      essential: true,
      padding: { top: 140, bottom: Math.max(80, modalHeight + 20), left: 40, right: 40 },
    });
  };

  const onSearch = async (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q || !map || !mapboxgl) return;

    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: { placeName: string; latitude: number; longitude: number };
      };
      if (!json.success || !json.data) {
        setNearby([]);
        setError(json.error || "Address not found");
        return;
      }

      const { latitude, longitude } = json.data;
      const lngLat: [number, number] = [longitude, latitude];
      setSearchPoint({ latitude, longitude });

      if (markerRef.current) {
        markerRef.current.setLngLat(lngLat);
      } else {
        markerRef.current = new mapboxgl.Marker({ color: "#E53935" })
          .setLngLat(lngLat)
          .addTo(map);
      }

      const ranked = nearestStations(
        { latitude, longitude },
        stationsRef.current,
        3
      );
      setNearby(ranked);

      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend(lngLat);
      for (const { station } of ranked) {
        bounds.extend([
          parseFloat(String(station.longitude)),
          parseFloat(String(station.latitude)),
        ]);
      }

      map.fitBounds(bounds, {
        padding: {
          top: 160,
          bottom: Math.max(60, modalHeight + 20),
          left: 60,
          right: 60,
        },
        maxZoom: 15.5,
        duration: 1000,
        essential: true,
      });
    } catch (err) {
      console.error("[sales search]", err);
      setNearby([]);
      setError("Search failed — try again");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="sales-map-root">
      <form className="sales-search" onSubmit={onSearch}>
        <input
          className="sales-search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an address…"
          enterKeyHint="search"
          autoComplete="street-address"
          aria-label="Search address"
        />
        <button
          type="submit"
          className="sales-search-btn"
          disabled={searching || !query.trim()}
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <div className="sales-search-status sales-search-error">{error}</div>}

      {nearby.length > 0 && (
        <div className="sales-nearby" role="list" aria-label="Nearest stations">
          {nearby.map(({ station, distanceMeters }) => (
            <button
              key={String(station.id)}
              type="button"
              role="listitem"
              className={`sales-nearby-chip${
                selectedStation?.id === station.id ? " active" : ""
              }`}
              onClick={() => selectNearbyStation(station)}
            >
              <span className="sales-nearby-title">
                {station.name || "CUUB Station"}
              </span>
              <span className="sales-nearby-distance">
                {formatMiles(distanceMeters)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div ref={containerRef} className="cuub-map" id="sales-map" />

      <StationSheet
        station={selectedStation}
        open={selectedStation != null}
        distanceFrom={searchPoint}
        onRequestClose={() => setSelectedStation(null)}
        onVisibleHeightChange={setModalHeight}
      />
    </div>
  );
}
