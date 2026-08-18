import { useCallback } from 'react';
import * as Location from 'expo-location';
import { useLocationStore } from '@/store/locationStore';

export function useLocationPermission() {
  const permission = useLocationStore((s) => s.permission);
  const prompted = useLocationStore((s) => s.prompted);
  const coords = useLocationStore((s) => s.coords);
  const setPermission = useLocationStore((s) => s.setPermission);
  const setPrompted = useLocationStore((s) => s.setPrompted);
  const setCoords = useLocationStore((s) => s.setCoords);

  const refreshPermission = useCallback(async () => {
    const current = await Location.getForegroundPermissionsAsync();
    const status =
      current.status === 'granted'
        ? 'granted'
        : current.status === 'denied'
          ? 'denied'
          : 'undetermined';
    setPermission(status);
    return status;
  }, [setPermission]);

  const requestPermission = useCallback(async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    await setPrompted(true);
    const status =
      result.status === 'granted'
        ? 'granted'
        : result.status === 'denied'
          ? 'denied'
          : 'undetermined';
    setPermission(status);

    if (status === 'granted') {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    }

    return status;
  }, [setCoords, setPermission, setPrompted]);

  const loadCurrentPosition = useCallback(async () => {
    const status = await refreshPermission();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const next = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    setCoords(next);
    return next;
  }, [refreshPermission, setCoords]);

  return {
    permission,
    prompted,
    coords,
    refreshPermission,
    requestPermission,
    loadCurrentPosition,
  };
}
