import { useCallback, useEffect } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import { tracker } from '@/lib/analytics';
import { useLocationStore } from '@/store/locationStore';
import { readFix, recordLocationFix } from './fix';

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
  const fix = await readFix();
  return fix ? { latitude: fix.latitude, longitude: fix.longitude } : null;
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

    tracker.permission('location', 'prompted');
    const result = await Location.requestForegroundPermissionsAsync();
    await setPrompted(true);
    const status = toStatus(result.status);
    setPermission(status);
    const outcome = status === 'denied' && result.canAskAgain === false ? 'blocked' : status;
    tracker.permission('location', 'result', outcome);
    tracker.track('location_permission_result', { result: outcome });

    if (status === 'granted') {
      // The app-open fix was skipped while permission was missing.
      const fix =
        existing.status === Location.PermissionStatus.GRANTED
          ? await readFix()
          : await recordLocationFix('open');
      setCoords(fix ? { latitude: fix.latitude, longitude: fix.longitude } : null);
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
