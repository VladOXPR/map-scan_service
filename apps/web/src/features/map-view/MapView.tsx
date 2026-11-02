"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type mapboxgl from "mapbox-gl";
import type { Coords, Station } from "@cuub/core";
import {
  MAP_STYLE_URL,
  buildSupportSmsUrl,
  distanceMiles,
  fetchWalkingRoute,
  formatMiles,
  isStationUnavailable,
  stationCoords,
  stationsToGeoJSON,
} from "@cuub/core";
import { cuubClient } from "@/lib/cuubClient";
import { AppPromptModal } from "@/features/app-prompt/AppPromptModal";
import { ScanModal } from "@/features/scan/ScanModal";
import { loadStationIcons } from "./loadStationIcons";
import {
  STATION_LAYER_IDS,
  addOverlayLayers,
  addStationLayers,
  setRouteLine,
  setUserPuck,
  startPuckPulse,
} from "./mapLayers";
import {
  CAMERA_MS,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAP_TILT,
  NO_PADDING,
  STATION_ZOOM,
  bearingDegrees,
  boundsAround,
  distanceMeters,
  networkPadding,
  sheetPadding,
  zoomForHorizontalSpan,
} from "./camera";
import { useGeolocation } from "./useGeolocation";
import { StationSheet } from "./StationSheet";
import { BottomDock, SupportButton } from "./MapChrome";
import { LocationSheet } from "./LocationSheet";

type MapboxModule = typeof mapboxgl;
type LocationAction = "nearest" | "locate";

const DEFAULT_SUPPORT_PHONE = "+14642377449";
const LOCATION_UNAVAILABLE = "Location unavailable — showing all stations.";
/** The intro fly-out frames the user plus stations within this radius. */
const INTRO_RADIUS_METERS = 50000;

export interface MapViewProps {
  variant?: "full" | "blank";
  stickerId?: string | null;
  embedMode?: boolean;
  // Stations seeded by the parent Server Component. When present, pins
  // render the moment React hydrates — no client-side round-trip needed
  // for first paint.
  initialStations?: Station[];
}

function readSafeAreaTop(): number {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;height:0;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return px;
}

/** Closest station that can actually rent (online, active venue). */
function pickNearest(from: Coords | null, stations: Station[]): Station | null {
  if (!from) return null;
  let best: Station | null = null;
  let bestMiles = Infinity;
  for (const station of stations) {
    if (isStationUnavailable(station)) continue;
    const c = stationCoords(station);
    if (!c) continue;
    const miles = distanceMiles(from, c);
    if (miles < bestMiles) {
      bestMiles = miles;
      best = station;
    }
  }
  return best;
}

export function MapView({
  variant = "full",
  stickerId = null,
  embedMode = false,
  initialStations = [],
}: MapViewProps) {
  const full = variant === "full";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [layersReady, setLayersReady] = useState(false);

  const [stations, setStations] = useState<Station[]>(initialStations);
  /** Sheet content — kept until the close animation finishes. */
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Pin highlight — cleared as soon as the sheet starts closing. */
  const [pinSelectedId, setPinSelectedId] = useState<Station["id"] | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [scanHeight, setScanHeight] = useState(0);
  const [locationSheet, setLocationSheet] = useState<LocationAction | null>(null);
  const [locationRequesting, setLocationRequesting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [supportPhone, setSupportPhone] = useState(DEFAULT_SUPPORT_PHONE);

  const { permission, coords, request } = useGeolocation();

  const stationsRef = useRef(stations);
  stationsRef.current = stations;
  const coordsRef = useRef(coords);
  coordsRef.current = coords;
  const scanHeightRef = useRef(scanHeight);
  scanHeightRef.current = scanHeight;
  const safeTopRef = useRef(0);
  const introPlayedRef = useRef(false);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeTokenRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    safeTopRef.current = readSafeAreaTop();
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
        console.error("Mapbox token missing. Set MAPBOX_ACCESS_TOKEN (see .env.example).");
        return;
      }
      const mb = (mod.default ?? mod) as MapboxModule;
      mb.accessToken = token;
      accessTokenRef.current = token;
      if (!containerRef.current) return;
      const instance = new mb.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        bearing: 0,
        pitch: MAP_TILT,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0,
        attributionControl: false,
      });
      instance.addControl(new mb.AttributionControl({ compact: true }), "bottom-right");
      mapRef.current = instance;
      setMap(instance);
    })();
    return () => {
      cancelled = true;
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Stations refresh — fires at mount, in parallel with the map setup. With
  // the route-level cache this is a sub-5ms hit in the common case, so the
  // freshness refresh is essentially free even when SSR seeded the pins.
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
    if (!full) return;
    let cancelled = false;
    fetch("/api/support-phone")
      .then((res) => res.json())
      .then((data: { phone?: string }) => {
        if (!cancelled && data.phone) setSupportPhone(data.phone);
      })
      .catch(() => {
        /* keep default */
      });
    return () => {
      cancelled = true;
    };
  }, [full]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const topInset = useCallback(
    () => Math.max(scanHeightRef.current, safeTopRef.current),
    []
  );

  const cancelIntro = useCallback(() => {
    introPlayedRef.current = true;
    if (introTimerRef.current) {
      clearTimeout(introTimerRef.current);
      introTimerRef.current = null;
    }
  }, []);

  const clearRoute = useCallback(() => {
    routeTokenRef.current += 1;
    if (mapRef.current) setRouteLine(mapRef.current, null);
  }, []);

  const showRoute = useCallback(async (from: Coords, to: Coords) => {
    const token = ++routeTokenRef.current;
    const feature = await fetchWalkingRoute(from, to, accessTokenRef.current);
    if (token !== routeTokenRef.current || !mapRef.current) return;
    setRouteLine(mapRef.current, feature);
  }, []);

  /** User on the left, station on the right, both above the sheet. */
  const fitUserAndStation = useCallback(
    (user: Coords, station: Coords) => {
      const m = mapRef.current;
      if (!m) return;
      const padding = sheetPadding(m, topInset());
      const width = m.getContainer().clientWidth || window.innerWidth;
      const mid = {
        latitude: (user.latitude + station.latitude) / 2,
        longitude: (user.longitude + station.longitude) / 2,
      };
      m.flyTo({
        center: [mid.longitude, mid.latitude],
        zoom: zoomForHorizontalSpan(
          distanceMeters(user, station),
          mid.latitude,
          width - padding.left - padding.right
        ),
        bearing: (bearingDegrees(user, station) - 90 + 360) % 360,
        pitch: MAP_TILT,
        padding,
        duration: CAMERA_MS,
        essential: true,
      });
    },
    [topInset]
  );

  /** Pan only — keep zoom and heading, center above the sheet. */
  const panToStation = useCallback(
    (station: Coords) => {
      const m = mapRef.current;
      if (!m) return;
      m.easeTo({
        center: [station.longitude, station.latitude],
        zoom: m.getZoom(),
        bearing: m.getBearing(),
        pitch: MAP_TILT,
        padding: sheetPadding(m, topInset()),
        duration: CAMERA_MS,
        essential: true,
      });
    },
    [topInset]
  );

  const centerOnUser = useCallback(
    (user: Coords) => {
      const m = mapRef.current;
      if (!m) return;
      cancelIntro();
      clearRoute();
      m.easeTo({
        center: [user.longitude, user.latitude],
        zoom: m.getZoom(),
        bearing: m.getBearing(),
        pitch: MAP_TILT,
        padding: NO_PADDING,
        duration: CAMERA_MS,
        essential: true,
      });
    },
    [cancelIntro, clearRoute]
  );

  const nearestStation = useMemo(() => pickNearest(coords, stations), [coords, stations]);

  /**
   * Shared open path for pin taps and Nearest. The nearest station (or an
   * explicit route origin) gets the user→station framing and walking route;
   * any other pin just pans.
   */
  const openStation = useCallback(
    (station: Station, routeFrom?: Coords | null) => {
      const target = stationCoords(station);
      if (!target) return;
      cancelIntro();
      setSelectedStation(station);
      setSheetOpen(true);
      setPinSelectedId(station.id);

      const from =
        routeFrom !== undefined
          ? routeFrom
          : coords && nearestStation && nearestStation.id === station.id
            ? coords
            : null;
      if (from) {
        fitUserAndStation(from, target);
        void showRoute(from, target);
      } else {
        clearRoute();
        panToStation(target);
      }
    },
    [cancelIntro, clearRoute, coords, fitUserAndStation, nearestStation, panToStation, showRoute]
  );

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setPinSelectedId(null);
    clearRoute();
  }, [clearRoute]);

  const onSheetClosed = useCallback(() => setSelectedStation(null), []);

  const runNearest = useCallback(
    (from: Coords) => {
      const station = pickNearest(from, stationsRef.current);
      if (!station) {
        showToast("No stations nearby yet");
        return;
      }
      openStation(station, from);
    },
    [openStation, showToast]
  );

  const runLocationAction = useCallback(
    (action: LocationAction, user: Coords) => {
      if (action === "nearest") runNearest(user);
      else centerOnUser(user);
    },
    [centerOnUser, runNearest]
  );

  const withLocation = useCallback(
    async (action: LocationAction) => {
      if (coords) {
        runLocationAction(action, coords);
        return;
      }
      if (permission === "granted") {
        const next = await request();
        if (next) runLocationAction(action, next);
        else showToast(LOCATION_UNAVAILABLE);
        return;
      }
      setLocationSheet(action);
    },
    [coords, permission, request, runLocationAction, showToast]
  );

  const onContinueLocation = useCallback(async () => {
    const action = locationSheet;
    if (!action) return;
    setLocationRequesting(true);
    const next = await request();
    setLocationRequesting(false);
    setLocationSheet(null);
    if (next) runLocationAction(action, next);
    else showToast(LOCATION_UNAVAILABLE);
  }, [locationSheet, request, runLocationAction, showToast]);

  const onSupport = useCallback(() => {
    window.location.href = buildSupportSmsUrl(supportPhone, stickerId);
  }, [supportPhone, stickerId]);

  // Map event handlers are registered once; route them through a ref so they
  // always see the latest state.
  const mapHandlersRef = useRef({
    onStationClick: (_station: Station) => {},
    onBackgroundClick: () => {},
  });
  mapHandlersRef.current = {
    onStationClick: (station) => {
      if (full) openStation(station);
    },
    onBackgroundClick: closeSheet,
  };

  useEffect(() => {
    if (!map) return;
    let removed = false;

    const setupLayers = async () => {
      await loadStationIcons(map);
      if (removed || map.getSource("stations")) return;

      addStationLayers(map, stationsToGeoJSON(stationsRef.current, null), {
        highlightSelected: full,
      });
      addOverlayLayers(map);

      const onClusterClick = (e: mapboxgl.MapMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const feature = features[0];
        const clusterId = feature?.properties?.cluster_id;
        if (!feature || clusterId == null) return;
        const source = map.getSource("stations") as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const center = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
          map.easeTo({ center, zoom: zoom ?? undefined, pitch: MAP_TILT, duration: 400 });
        });
      };

      const onPointClick = (e: mapboxgl.MapMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        const station = stationsRef.current.find((s) => String(s.id) === String(id));
        if (station) mapHandlersRef.current.onStationClick(station);
      };

      const onMapClick = (e: mapboxgl.MapMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [...STATION_LAYER_IDS],
        });
        if (features.length === 0) mapHandlersRef.current.onBackgroundClick();
      };

      const onUserMove = (e: object) => {
        if ((e as { originalEvent?: unknown }).originalEvent) cancelIntro();
      };

      const cursorOn = () => (map.getCanvas().style.cursor = "pointer");
      const cursorOff = () => (map.getCanvas().style.cursor = "");

      map.on("click", "clusters", onClusterClick);
      map.on("click", "unclustered-point", onPointClick);
      map.on("click", "unclustered-circle", onPointClick);
      map.on("click", onMapClick);
      map.on("dragstart", onUserMove);
      map.on("zoomstart", onUserMove);
      map.on("rotatestart", onUserMove);
      for (const layer of STATION_LAYER_IDS) {
        map.on("mouseenter", layer, cursorOn);
        map.on("mouseleave", layer, cursorOff);
      }
      setLayersReady(true);
    };

    if (map.isStyleLoaded()) void setupLayers();
    else map.once("load", () => void setupLayers());

    return () => {
      removed = true;
    };
  }, [map, full, cancelIntro]);

  useEffect(() => {
    if (!map || !layersReady) return;
    const source = map.getSource("stations") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(
      stationsToGeoJSON(stations, pinSelectedId) as unknown as GeoJSON.FeatureCollection
    );
  }, [map, layersReady, stations, pinSelectedId]);

  const showPuck = permission === "granted" && !!coords;

  useEffect(() => {
    if (!map || !layersReady) return;
    setUserPuck(map, showPuck ? coords : null);
  }, [map, layersReady, showPuck, coords]);

  useEffect(() => {
    if (!map || !layersReady || !showPuck) return;
    return startPuckPulse(map);
  }, [map, layersReady, showPuck]);

  /**
   * One-shot intro once the user's position is known: frame the puck, then
   * after 1s fly out so the user and the nearby network fit the viewport.
   */
  useEffect(() => {
    if (!map || !layersReady || introPlayedRef.current) return;
    if (!coords || !stations.length) return;
    introPlayedRef.current = true;
    map.jumpTo({
      center: [coords.longitude, coords.latitude],
      zoom: STATION_ZOOM,
      pitch: MAP_TILT,
      bearing: 0,
      padding: NO_PADDING,
    });
    introTimerRef.current = setTimeout(() => {
      introTimerRef.current = null;
      const user = coordsRef.current;
      if (!user) return;
      const nearby = stationsRef.current
        .map(stationCoords)
        .filter(
          (c): c is Coords => c != null && distanceMeters(user, c) <= INTRO_RADIUS_METERS
        );
      const bounds = boundsAround([user, ...nearby]);
      if (!bounds) return;
      map.fitBounds(bounds, {
        padding: networkPadding(map, topInset()),
        pitch: MAP_TILT,
        bearing: 0,
        duration: 1400,
        essential: true,
      });
    }, 1000);
  }, [map, layersReady, coords, stations, topInset]);

  // postMessage bridge for iframe parents (Framer embeds).
  const bridgeRef = useRef({ findNearest: () => {}, requestLocation: () => {} });
  bridgeRef.current = {
    findNearest: () => void withLocation("nearest"),
    requestLocation: () => {
      void request().then((next) => {
        if (next) runNearest(next);
        else showToast(LOCATION_UNAVAILABLE);
      });
    },
  };

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event?.data as { source?: string; type?: string } | null;
      if (!data || typeof data !== "object" || data.source !== "cuub") return;
      switch (data.type) {
        case "findNearest":
          bridgeRef.current.findNearest();
          break;
        case "requestLocation":
          bridgeRef.current.requestLocation();
          break;
        case "ping":
          try {
            window.parent?.postMessage({ source: "cuub", type: "pong" }, "*");
          } catch {
            /* noop */
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener("message", onMessage);
    try {
      window.parent?.postMessage(
        { source: "cuub", type: "ready", geolocation: "geolocation" in navigator },
        "*"
      );
    } catch {
      /* noop */
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const nearestDistanceLabel = useMemo(() => {
    if (!coords || !nearestStation) return null;
    const c = stationCoords(nearestStation);
    return c ? formatMiles(distanceMiles(coords, c)) : null;
  }, [coords, nearestStation]);

  const showSupport = full && !sheetOpen;
  const showDock = !embedMode && !sheetOpen;
  const ctrlBottom = sheetOpen
    ? `${sheetHeight}px`
    : showDock
      ? "var(--cuub-bar-h)"
      : "0px";

  return (
    <div
      className="cuub-map-root"
      style={{ "--cuub-ctrl-bottom": ctrlBottom } as CSSProperties}
    >
      <div ref={containerRef} className="cuub-map" id="map" />

      {stickerId && <ScanModal stickerId={stickerId} onHeightChange={setScanHeight} />}

      {showSupport && (
        <SupportButton
          onClick={onSupport}
          style={scanHeight > 0 ? { top: scanHeight + 12 } : undefined}
        />
      )}

      {showDock && (
        <BottomDock
          onNearest={() => void withLocation("nearest")}
          onLocate={() => void withLocation("locate")}
          distanceLabel={nearestDistanceLabel}
          locationShared={permission === "granted"}
        />
      )}

      <StationSheet
        station={selectedStation}
        open={sheetOpen}
        distanceFrom={coords}
        onRequestClose={closeSheet}
        onClosed={onSheetClosed}
        onVisibleHeightChange={setSheetHeight}
      />

      <LocationSheet
        open={locationSheet != null}
        loading={locationRequesting}
        onContinue={() => void onContinueLocation()}
        onDismiss={() => setLocationSheet(null)}
      />

      {toast && (
        <div className={`cuub-toast${showDock ? " cuub-toast--above-dock" : ""}`} role="status">
          {toast}
        </div>
      )}

      {full && <AppPromptModal disabled={embedMode} stickerId={stickerId} />}
    </div>
  );
}
