import { useCallback, useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import { useLocationStore } from '@/store/locationStore';

type PermissionStatus = 'undetermined' | 'granted' | 'denied';

function toStatus(
  status: Location.PermissionStatus,
): PermissionStatus {
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

async function readPosition(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    if (!last) return null;
    return {
      latitude: last.coords.latitude,
      longitude: last.coords.longitude,
    };
  }
}

export function useLocationPermission() {
  const permission = useLocationStore((s) => s.permission);
  const prompted = useLocationStore((s) => s.prompted);
  const coords = useLocationStore((s) => s.coords);
  const setPermission = useLocationStore((s) => s.setPermission);
  const setPrompted = useLocationStore((s) => s.setPrompted);
  const setCoords = useLocationStore((s) => s.setCoords);

  const refreshPermission = useCallback(async () => {
    const current = await Location.getForegroundPermissionsAsync();
    const status = toStatus(current.status);
    setPermission(status);
    return { status, canAskAgain: current.canAskAgain !== false };
  }, [setPermission]);

  const loadCurrentPosition = useCallback(async () => {
    const { status } = await refreshPermission();
    if (status !== 'granted') {
      setCoords(null);
      return null;
    }
    const next = await readPosition();
    setCoords(next);
    return next;
  }, [refreshPermission, setCoords]);

  const requestPermission = useCallback(async () => {
    const existing = await Location.getForegroundPermissionsAsync();

    // iOS will not show the system dialog again after a deny — Settings is required.
    if (
      existing.status === Location.PermissionStatus.DENIED &&
      existing.canAskAgain === false
    ) {
      setPermission('denied');
      await setPrompted(true);
      await Linking.openSettings();
      return { status: 'denied' as PermissionStatus, canAskAgain: false };
    }

    const result = await Location.requestForegroundPermissionsAsync();
    await setPrompted(true);
    const status = toStatus(result.status);
    setPermission(status);

    if (status === 'granted') {
      const next = await readPosition();
      setCoords(next);
    } else {
      setCoords(null);
    }

    return {
      status,
      canAskAgain: result.canAskAgain !== false,
    };
  }, [setCoords, setPermission, setPrompted]);

  // Pick up grants made in Settings while the app was backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void loadCurrentPosition();
    });
    return () => sub.remove();
  }, [loadCurrentPosition]);

  return {
    permission,
    prompted,
    coords,
    refreshPermission,
    requestPermission,
    loadCurrentPosition,
  };
}
