"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import {
  buildDirectionsUrl,
  detectWebPlatform,
  pickNearestStation,
  type Coords,
  type NearestStationView,
  type Station,
} from "@cuub/shared";

const LOC_SESSION_KEY = "cuub:locationPrompt";
const HALO_SOURCE_ID = "cuub-nearest";
const HALO_LAYER_ID = "cuub-nearest-halo";

type MapboxModule = typeof mapboxgl;

export interface NearestStationFeatureProps {
  map: mapboxgl.Map | null;
  mapboxgl: MapboxModule | null;
  stations: Station[];
  isStickerPage?: boolean;
  hideTriggerButton?: boolean;
  disableAutoPrompt?: boolean;
  triggerBottomPx?: number;
}

function safeSessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

function hasGeolocation(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

export function NearestStationFeature({
  map,
  mapboxgl: mb,
  stations,
  isStickerPage = false,
  hideTriggerButton = false,
  disableAutoPrompt = false,
  triggerBottomPx = 20,
}: NearestStationFeatureProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<Coords | null>(null);
  const [nearest, setNearest] = useState<NearestStationView | null>(null);
  const [cardVisible, setCardVisible] = useState(false);

  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const haloPulseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingLocateRef = useRef(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, durationMs: number = 4000) => {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  const setHaloStation = useCallback(
    (station: Station | null) => {
      if (!map) return;
      const lng = station ? parseFloat(String(station.longitude)) : NaN;
      const lat = station ? parseFloat(String(station.latitude)) : NaN;
      const data =
        station && Number.isFinite(lng) && Number.isFinite(lat)
          ? {
              type: "FeatureCollection" as const,
              features: [
                {
                  type: "Feature" as const,
                  geometry: { type: "Point" as const, coordinates: [lng, lat] },
                  properties: {},
                },
              ],
            }
          : { type: "FeatureCollection" as const, features: [] };
      const src = map.getSource(HALO_SOURCE_ID) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (src) src.setData(data as unknown as GeoJSON.FeatureCollection);
    },
    [map]
  );

  const stopPulse = useCallback(() => {
    if (haloPulseRef.current) {
      clearInterval(haloPulseRef.current);
      haloPulseRef.current = null;
    }
  }, []);

  const startPulse = useCallback(() => {
    if (!map) return;
    if (haloPulseRef.current) return;
    let t = 0;
    haloPulseRef.current = setInterval(() => {
      if (!map.getLayer || !map.getLayer(HALO_LAYER_ID)) return;
      t += 0.12;
      const r = 27 + Math.sin(t) * 5;
      const op = 0.25 + (Math.sin(t) + 1) * 0.1;
      try {
        map.setPaintProperty(HALO_LAYER_ID, "circle-radius", r);
        map.setPaintProperty(HALO_LAYER_ID, "circle-opacity", op);
      } catch {
        /* style not ready */
      }
    }, 60);
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const addHaloLayer = () => {
      if (!map.getSource(HALO_SOURCE_ID)) {
        map.addSource(HALO_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer(HALO_LAYER_ID)) {
        map.addLayer({
          id: HALO_LAYER_ID,
          type: "circle",
          source: HALO_SOURCE_ID,
          paint: {
            "circle-radius": 26,
            "circle-color": "#0198FD",
            "circle-opacity": 0.28,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#0198FD",
            "circle-stroke-opacity": 0.6,
          },
        });
        try {
          if (map.getLayer("unclustered-point")) {
            map.moveLayer(HALO_LAYER_ID, "unclustered-point");
          }
        } catch {
          /* noop */
        }
      }
    };
    if (map.isStyleLoaded()) {
      addHaloLayer();
    } else {
      map.once("load", addHaloLayer);
    }
    const styleHandler = () => {
      if (!map.getLayer(HALO_LAYER_ID)) addHaloLayer();
    };
    map.on("styledata", styleHandler);
    return () => {
      map.off("styledata", styleHandler);
      stopPulse();
    };
  }, [map, stopPulse]);

  const ensureUserMarker = useCallback(
    (coords: Coords) => {
      if (!map || !mb) return;
      const lngLat: [number, number] = [coords.longitude, coords.latitude];
      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat(lngLat);
        return;
      }
      const el = document.createElement("div");
      el.className = "cuub-user-location-marker";
      el.setAttribute("aria-label", "Your current location");
      userMarkerRef.current = new mb.Marker({ element: el, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(map);
    },
    [map, mb]
  );

  const applyUserCoords = useCallback(
    (coords: Coords) => {
      if (!map || !mb) return;
      setUserCoords(coords);
      ensureUserMarker(coords);

      const result = stations.length > 0 ? pickNearestStation(coords, stations) : null;
      if (!result) {
        pendingLocateRef.current = true;
        map.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: 15.8,
          speed: 0.9,
          curve: 1.4,
          essential: true,
        });
        return;
      }

      setNearest(result);
      setCardVisible(true);
      setHaloStation(result.station);
      startPulse();

      const stationLng = parseFloat(String(result.station.longitude));
      const stationLat = parseFloat(String(result.station.latitude));
      const stationOk = Number.isFinite(stationLng) && Number.isFinite(stationLat);

      const container = map.getContainer();
      const containerWidth = container.clientWidth || window.innerWidth || 1024;
      const containerHeight = container.clientHeight || window.innerHeight || 768;
      const isNarrow = containerWidth < 480;
      const isShort = containerHeight < 520;

      let desiredTop = isStickerPage
        ? isNarrow
          ? 320
          : 340
        : isShort
        ? 120
        : isNarrow
        ? 220
        : 240;
      let desiredBottom = isShort ? 80 : isNarrow ? 120 : 140;
      let desiredLeft = isNarrow ? 40 : 80;
      let desiredRight = isNarrow ? 40 : 80;

      const maxVertical = Math.max(40, Math.floor(containerHeight * 0.7));
      const maxHorizontal = Math.max(40, Math.floor(containerWidth * 0.7));
      const vSum = desiredTop + desiredBottom;
      if (vSum > maxVertical && vSum > 0) {
        const vScale = maxVertical / vSum;
        desiredTop = Math.floor(desiredTop * vScale);
        desiredBottom = Math.floor(desiredBottom * vScale);
      }
      const hSum = desiredLeft + desiredRight;
      if (hSum > maxHorizontal && hSum > 0) {
        const hScale = maxHorizontal / hSum;
        desiredLeft = Math.floor(desiredLeft * hScale);
        desiredRight = Math.floor(desiredRight * hScale);
      }

      let fitted = false;
      if (stationOk) {
        try {
          const bounds = new mb.LngLatBounds();
          bounds.extend([coords.longitude, coords.latitude]);
          bounds.extend([stationLng, stationLat]);
          map.fitBounds(bounds, {
            padding: {
              top: desiredTop,
              bottom: desiredBottom,
              left: desiredLeft,
              right: desiredRight,
            },
            maxZoom: 16,
            duration: 1200,
            essential: true,
          });
          fitted = true;
        } catch (err) {
          console.warn("[CuubNearest] fitBounds failed:", err);
        }
      }

      if (!fitted) {
        map.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: 15.2,
          speed: 0.9,
          curve: 1.4,
          essential: true,
        });
      }
    },
    [map, mb, stations, ensureUserMarker, setHaloStation, startPulse, isStickerPage]
  );

  useEffect(() => {
    if (pendingLocateRef.current && userCoords && stations.length > 0) {
      pendingLocateRef.current = false;
      applyUserCoords(userCoords);
    }
  }, [stations, userCoords, applyUserCoords]);

  const requestLocation = useCallback(() => {
    if (!hasGeolocation()) {
      showToast("Location unavailable — showing all stations.");
      safeSessionSet(LOC_SESSION_KEY, "unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!position?.coords) {
          showToast("Location unavailable — showing all stations.");
          return;
        }
        applyUserCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        if (error)
          console.warn(
            "[CuubNearest] Geolocation error:",
            error.code,
            error.message
          );
        showToast("Location unavailable — showing all stations.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [applyUserCoords, showToast]);

  useEffect(() => {
    if (!map) return;
    if (disableAutoPrompt) return;
    if (!hasGeolocation()) {
      setTimeout(
        () => showToast("Location unavailable — showing all stations."),
        600
      );
      return;
    }
    const prior = safeSessionGet(LOC_SESSION_KEY);
    if (!prior) {
      const t = setTimeout(
        () => setModalOpen(true),
        isStickerPage ? 900 : 500
      );
      return () => clearTimeout(t);
    }
  }, [map, disableAutoPrompt, isStickerPage, showToast]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event?.data;
      if (!data || typeof data !== "object") return;
      const typed = data as { source?: string; type?: string };
      if (typed.source !== "cuub" || typeof typed.type !== "string") return;
      switch (typed.type) {
        case "findNearest":
          setModalOpen(true);
          break;
        case "requestLocation":
          requestLocation();
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
    return () => window.removeEventListener("message", onMessage);
  }, [requestLocation]);

  useEffect(() => {
    try {
      window.parent?.postMessage(
        { source: "cuub", type: "ready", geolocation: hasGeolocation() },
        "*"
      );
    } catch {
      /* noop */
    }
  }, []);

  const handleYes = () => {
    safeSessionSet(LOC_SESSION_KEY, "yes");
    setModalOpen(false);
    requestLocation();
  };
  const handleNo = () => {
    safeSessionSet(LOC_SESSION_KEY, "no");
    setModalOpen(false);
  };
  const dismissModal = () => {
    safeSessionSet(LOC_SESSION_KEY, "dismissed");
    setModalOpen(false);
  };

  const onDirections = () => {
    if (!nearest) return;
    const platform = detectWebPlatform(navigator.userAgent || "");
    const url = buildDirectionsUrl(
      nearest.station.latitude,
      nearest.station.longitude,
      platform
    );
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {
        /* noop */
      }
    }, 0);
  };

  const triggerStyle = useMemo<React.CSSProperties>(
    () => ({ bottom: `${triggerBottomPx}px` }),
    [triggerBottomPx]
  );

  const stickerClass = isStickerPage ? "cuub-sticker-page-active" : "";

  useEffect(() => {
    if (!isStickerPage) return;
    document.body.classList.add("cuub-sticker-page");
    return () => document.body.classList.remove("cuub-sticker-page");
  }, [isStickerPage]);

  return (
    <>
      {!hideTriggerButton && hasGeolocation() && (
        <button
          type="button"
          className={`cuub-nearest-button ${stickerClass}`}
          style={triggerStyle}
          onClick={() => setModalOpen(true)}
        >
          Find nearest station
        </button>
      )}

      <div
        className={`cuub-loc-backdrop ${modalOpen ? "active" : ""}`}
        onClick={dismissModal}
      />
      <div
        className={`cuub-loc-modal ${modalOpen ? "active" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cuubLocModalTitle"
      >
        <h2 id="cuubLocModalTitle" className="cuub-loc-modal-title">
          CUUB near you?
        </h2>
        <div className="cuub-loc-modal-actions">
          <button
            type="button"
            className="cuub-loc-btn cuub-loc-btn-secondary"
            onClick={handleNo}
          >
            Not now
          </button>
          <button
            type="button"
            className="cuub-loc-btn cuub-loc-btn-primary"
            onClick={handleYes}
          >
            Find
          </button>
        </div>
      </div>

      {nearest && (
        <div
          className={`cuub-nearest-card ${cardVisible ? "active" : ""}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="cuub-nearest-card-header">
            <div className="cuub-nearest-card-label">Nearest station</div>
            <button
              type="button"
              className="cuub-nearest-card-close"
              aria-label="Dismiss nearest station info"
              onClick={() => setCardVisible(false)}
            >
              ×
            </button>
          </div>
          <div className="cuub-nearest-card-name">
            {nearest.station.title || "CUUB Station"}
          </div>
          <div className="cuub-nearest-card-meta">
            <div className="cuub-nearest-card-distance">
              {nearest.distanceText}
            </div>
            <div className="cuub-nearest-card-slots">
              <div className="cuub-nearest-slot">
                <span className="cuub-nearest-slot-dot filled" />
                <span className="cuub-nearest-slot-number">
                  {nearest.station.filled_slots ?? 0}
                </span>
                <span>Filled</span>
              </div>
              <div className="cuub-nearest-slot">
                <span className="cuub-nearest-slot-dot open" />
                <span className="cuub-nearest-slot-number">
                  {nearest.station.open_slots ?? 0}
                </span>
                <span>Open</span>
              </div>
            </div>
          </div>
          {nearest.isFar && (
            <div className="cuub-nearest-card-note">
              Nearest station is far from you
            </div>
          )}
          <button
            type="button"
            className="cuub-nearest-directions-button"
            onClick={onDirections}
          >
            Get Directions
          </button>
        </div>
      )}

      {toast && <div className="cuub-toast active">{toast}</div>}
    </>
  );
}
