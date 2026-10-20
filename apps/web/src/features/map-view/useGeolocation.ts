"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Coords } from "@cuub/shared";

export type LocationPermission = "unknown" | "prompt" | "granted" | "denied" | "unsupported";

const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60000,
};

function toCoords(position: GeolocationPosition): Coords {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

/**
 * Browser location for the map. Never prompts on its own: position is read
 * silently only when the browser already reports the permission as granted,
 * otherwise callers go through `request()` after a user action.
 */
export function useGeolocation() {
  const [permission, setPermission] = useState<LocationPermission>("unknown");
  const [coords, setCoords] = useState<Coords | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const startWatching = useCallback(() => {
    if (watchIdRef.current != null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setPermission("granted");
        setCoords(toCoords(position));
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setPermission("denied");
      },
      POSITION_OPTIONS
    );
  }, []);

  const request = useCallback((): Promise<Coords | null> => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setPermission("unsupported");
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = toCoords(position);
          setPermission("granted");
          setCoords(next);
          startWatching();
          resolve(next);
        },
        (error) => {
          console.warn("[location] Geolocation error:", error.code, error.message);
          if (error.code === error.PERMISSION_DENIED) setPermission("denied");
          resolve(null);
        },
        POSITION_OPTIONS
      );
    });
  }, [startWatching]);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setPermission("unsupported");
      return;
    }
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const apply = (state: PermissionState) => {
      setPermission(state);
      if (state === "granted") startWatching();
    };
    const onChange = () => {
      if (status) apply(status.state);
    };
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        if (cancelled) return;
        status = result;
        apply(result.state);
        result.addEventListener("change", onChange);
      })
      .catch(() => {
        /* Permissions API unavailable — stay "unknown" until request() */
      });
    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [startWatching]);

  return { permission, coords, request };
}
