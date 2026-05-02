import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import type { Coords } from "@cuub/shared";

export interface UserLocationState {
  coords: Coords | null;
  status: "idle" | "requesting" | "granted" | "denied" | "unavailable";
  error?: string;
}

export function useUserLocation() {
  const [state, setState] = useState<UserLocationState>({
    coords: null,
    status: "idle",
  });

  const request = useCallback(async () => {
    setState((s) => ({ ...s, status: "requesting" }));
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setState({ coords: null, status: "denied" });
        return null;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coords: Coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setState({ coords, status: "granted" });
      return coords;
    } catch (err) {
      setState({
        coords: null,
        status: "unavailable",
        error: err instanceof Error ? err.message : "Location error",
      });
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      /* nothing to teardown for one-shot location requests */
    };
  }, []);

  return { ...state, request };
}
