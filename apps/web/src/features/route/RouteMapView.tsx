"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { cuubClient } from "@/lib/cuubClient";
import { chicagoNow, formatWindow, isOpenNow, type ChicagoNow } from "./openNow";
import type { RouteLocation } from "./types";
import styles from "./route.module.css";

type MapboxModule = typeof mapboxgl;

const RECOMPUTE_MS = 60_000;
const SOURCE_ID = "route-locations";
const LAYER_ID = "route-dots";
const GREEN = "#22C55E";
const GREY = "#D1D5DB";
const CLOSED_OPACITY = 0.35;
const STACK_OFFSET_METERS = 8;
const METERS_PER_DEG_LAT = 111_320;

interface PlacedLocation {
  location: RouteLocation;
  groupKey: string;
  /** Display position, nudged apart when several locations share coordinates. */
  lng: number;
  lat: number;
}

function groupKeyFor(location: RouteLocation): string {
  return `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
}

function placeLocations(locations: RouteLocation[]): {
  placed: PlacedLocation[];
  groups: Map<string, RouteLocation[]>;
} {
  const groups = new Map<string, RouteLocation[]>();
  for (const location of locations) {
    const key = groupKeyFor(location);
    const list = groups.get(key);
    if (list) list.push(location);
    else groups.set(key, [location]);
  }

  const placed: PlacedLocation[] = [];
  groups.forEach((members, groupKey) => {
    members.sort((a, b) => a.title.localeCompare(b.title));
    members.forEach((location, i) => {
      if (members.length === 1) {
        placed.push({ location, groupKey, lng: location.longitude, lat: location.latitude });
        return;
      }
      const angle = (2 * Math.PI * i) / members.length;
      const dLat = (STACK_OFFSET_METERS * Math.sin(angle)) / METERS_PER_DEG_LAT;
      const dLng =
        (STACK_OFFSET_METERS * Math.cos(angle)) /
        (METERS_PER_DEG_LAT * Math.cos((location.latitude * Math.PI) / 180));
      placed.push({
        location,
        groupKey,
        lng: location.longitude + dLng,
        lat: location.latitude + dLat,
      });
    });
  });
  return { placed, groups };
}

function toGeoJSON(placed: PlacedLocation[], now: ChicagoNow): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: placed.map(({ location, groupKey, lng, lat }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        id: location.locationId,
        groupKey,
        onCuubSoftware: location.onCuubSoftware,
        open: isOpenNow(location.hours, now),
      },
    })),
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildPopupContent(members: RouteLocation[], now: ChicagoNow): HTMLElement {
  const root = document.createElement("div");
  for (const location of members) {
    const item = el("div", styles.popupItem);
    item.appendChild(el("div", styles.popupTitle, location.hours?.name || location.title || "CUUB Location"));

    const open = isOpenNow(location.hours, now);
    item.appendChild(
      el("span", `${styles.badge} ${open ? styles.badgeOpen : styles.badgeClosed}`, open ? "Open now" : "Closed now")
    );

    const hours = location.hours;
    if (!hours || hours.hours_unknown) {
      item.appendChild(el("div", styles.hoursLine, "Hours not available"));
    } else {
      item.appendChild(el("div", styles.hoursLine, `Tue: ${formatWindow(hours.tue)}`));
      item.appendChild(el("div", styles.hoursLine, `Wed: ${formatWindow(hours.wed)}`));
    }
    if (hours?.note) item.appendChild(el("div", styles.note, hours.note));

    root.appendChild(item);
  }
  return root;
}

export interface RouteMapViewProps {
  locations: RouteLocation[];
}

export function RouteMapView({ locations }: RouteMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<{ popup: mapboxgl.Popup; groupKey: string } | null>(null);

  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [mapboxgl, setMapboxgl] = useState<MapboxModule | null>(null);
  const [layersReady, setLayersReady] = useState(false);
  const [now, setNow] = useState<ChicagoNow>(() => chicagoNow());
  const [error, setError] = useState<string | null>(null);

  const { placed, groups } = useMemo(() => placeLocations(locations), [locations]);
  const nowRef = useRef(now);
  nowRef.current = now;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  useEffect(() => {
    const id = setInterval(() => setNow(chicagoNow()), RECOMPUTE_MS);
    return () => clearInterval(id);
  }, []);

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
        style: "mapbox://styles/mapbox/dark-v11",
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
      popupRef.current?.popup.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map || !mapboxgl) return;
    let removed = false;

    const setup = () => {
      if (removed || map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: toGeoJSON(placed, nowRef.current),
      });
      map.addLayer({
        id: LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 7, 18, 9],
          "circle-color": ["case", ["get", "onCuubSoftware"], GREEN, GREY],
          "circle-opacity": ["case", ["get", "open"], 1, CLOSED_OPACITY],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": ["case", ["get", "open"], 1, CLOSED_OPACITY],
        },
      });

      map.on("click", LAYER_ID, (e) => {
        const groupKey = e.features?.[0]?.properties?.groupKey as string | undefined;
        const members = groupKey ? groupsRef.current.get(groupKey) : undefined;
        if (!groupKey || !members?.length) return;
        popupRef.current?.popup.remove();
        const popup = new mapboxgl.Popup({
          className: styles.popup,
          closeButton: true,
          maxWidth: "300px",
          offset: 10,
        })
          .setLngLat([members[0].longitude, members[0].latitude])
          .setDOMContent(buildPopupContent(members, nowRef.current))
          .addTo(map);
        const entry = { popup, groupKey };
        popupRef.current = entry;
        popup.on("close", () => {
          if (popupRef.current === entry) popupRef.current = null;
        });
      });
      map.on("mouseenter", LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
      setLayersReady(true);
    };

    if (map.isStyleLoaded()) setup();
    else map.once("load", setup);
    return () => {
      removed = true;
    };
  }, [map, mapboxgl, placed]);

  useEffect(() => {
    if (!map || !layersReady) return;
    const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(toGeoJSON(placed, now));

    const open = popupRef.current;
    const members = open ? groups.get(open.groupKey) : undefined;
    if (open && members) open.popup.setDOMContent(buildPopupContent(members, now));
  }, [map, layersReady, placed, groups, now]);

  const updatedLabel = useMemo(() => {
    const h = Math.floor(now.minutes / 60);
    const m = now.minutes % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const day = now.weekday.charAt(0).toUpperCase() + now.weekday.slice(1);
    return `${day} ${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} Chicago`;
  }, [now]);

  return (
    <div className={styles.root}>
      <div className={styles.legend} aria-label="Map legend">
        <div className={styles.legendRow}>
          <span className={`${styles.legendDot} ${styles.legendGreen}`} />
          On CUUB software
        </div>
        <div className={styles.legendRow}>
          <span className={`${styles.legendDot} ${styles.legendGrey}`} />
          Not on CUUB software
        </div>
        <div className={styles.legendRow}>
          <span className={`${styles.legendDot} ${styles.legendFaded}`} />
          Faded = closed now
        </div>
        <div className={styles.legendUpdated} suppressHydrationWarning>
          {error ?? `${locations.length} locations · ${updatedLabel}`}
        </div>
      </div>
      <div ref={containerRef} className={styles.map} id="route-map" />
    </div>
  );
}
