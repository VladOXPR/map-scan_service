import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { ensureNotificationPermissions } from '@/features/alerts/lowBatteryNotifications';
import { useReturnAlertsStore } from '@/store/returnAlertsStore';
import type { AppRental } from './api';
import { RENTAL_TRAIL_MAX_MS, syncReturnAlerts } from './returnAlerts';

type LocationRequest = () => Promise<{ status: 'undetermined' | 'granted' | 'denied'; canAskAgain: boolean }>;

/**
 * Return alerts for the open rental: keeps location updates in step with the
 * rental and the person's choice, and exposes the prompt and the on/off switch.
 * `rental` is undefined while it is still loading.
 */
export function useReturnAlerts(
  rental: AppRental | null | undefined,
  signedIn: boolean,
  requestLocation: LocationRequest,
) {
  const choice = useReturnAlertsStore((s) => s.choice);
  const hydrated = useReturnAlertsStore((s) => s.hydrated);
  const hydrate = useReturnAlertsStore((s) => s.hydrate);
  const setChoice = useReturnAlertsStore((s) => s.setChoice);
  const [running, setRunning] = useState(false);
  /** Bumped by turnOn so a permission granted while the choice was already on restarts updates. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  const rentalId = rental?.rentalId;
  const status = rental?.status;
  const startedAt = rental?.startedAt;
  const stationCode = rental?.stationCode ?? null;
  const loading = signedIn && rental === undefined;
  useEffect(() => {
    if (!hydrated || loading) return;
    let cancelled = false;
    const target =
      signedIn && choice === 'on' && rentalId && status && startedAt
        ? { rentalId, status, startedAt, stationCode }
        : null;
    void syncReturnAlerts(target).then((on) => {
      if (!cancelled) setRunning(on);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, loading, signedIn, choice, rentalId, status, startedAt, stationCode, attempt]);

  const eligible =
    Platform.OS !== 'web' &&
    signedIn &&
    status === 'ACTIVE' &&
    !!startedAt &&
    Date.now() < new Date(startedAt).getTime() + RENTAL_TRAIL_MAX_MS;

  const turnOn = useCallback(async () => {
    const current = await Location.getForegroundPermissionsAsync();
    const granted =
      current.status === Location.PermissionStatus.GRANTED || (await requestLocation()).status === 'granted';
    if (!granted) {
      await setChoice('off');
      return;
    }
    await ensureNotificationPermissions();
    await setChoice('on');
    setAttempt((n) => n + 1);
  }, [requestLocation, setChoice]);

  const turnOff = useCallback(() => setChoice('off'), [setChoice]);

  return {
    /** The prompt shows once, on the first rental after the app has this feature. */
    promptVisible: hydrated && eligible && choice === null,
    /** Shown on the rental card; null when the rental cannot have alerts. */
    alerts: eligible ? (choice === 'on' && running ? 'on' : 'off') : null,
    turnOn,
    turnOff,
  } as const;
}
