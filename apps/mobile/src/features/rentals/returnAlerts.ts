import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { distanceMeters } from '@cuub/core';
import { ApiError } from '@/lib/apiClient';
import { formatDistance } from '@/lib/distance';
import { getItem, removeItem, setItem } from '@/lib/storage';
import { fetchNearbyStations } from '@/features/stations/api';
import { readStoredToken, useAuthStore } from '@/store/authStore';
import type { Station } from '@/types/station';
import { fetchRental, fetchStationByCode } from './api';

/**
 * Return alerts: while a member who opted in holds a power bank, the phone
 * compares where it is with the public station map and alerts about a
 * station with an open slot close by. The location never leaves the phone;
 * the server is only asked whether the rental is still out.
 */
export const RETURN_ALERTS_TASK = 'cuub-return-alerts';
export const RENTAL_TRAIL_MAX_MS = 24 * 60 * 60_000;

const STATE_KEY = 'cuub.returnAlerts.state';
/** Older builds queued location points here before sending them; never read. */
const LEGACY_TRAIL_KEY = 'cuub.returnAlerts.trail';
/** A station with an open slot this close is worth an alert. */
const RETURN_ALERT_RADIUS_M = 200;
/** A fix older than this says nothing about what is nearby now. */
const NEARBY_MAX_AGE_MS = 5 * 60_000;
/** The venue it came from has the slot it just left; not worth an alert this soon. */
const START_VENUE_QUIET_MS = 60 * 60_000;
/** One alert per station per rental, and never two within this gap. */
const ALERT_GAP_MS = 15 * 60_000;
const METERS_PER_MILE = 1609.344;

const LOCATION_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  distanceInterval: 150,
  timeInterval: 60_000,
  activityType: Location.ActivityType.Other,
  pausesUpdatesAutomatically: false,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'Return alerts are on',
    notificationBody: 'CUUB uses your location while you have a power bank.',
    killServiceOnDestroy: false,
  },
};

type AlertState = {
  rentalId: string;
  startedAt: string;
  trackUntil: string;
  /** The venue it was unlocked at, when known. */
  startLocationId: string | null;
  /** Stations already alerted about on this rental. */
  alerted: string[];
  lastAlertAt: number | null;
};

type NearbyReturn = { locationId: string; title: string; distanceM: number; openSlots: number };

async function readState(): Promise<AlertState | null> {
  const raw = await getItem(STATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AlertState;
    return typeof parsed?.rentalId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeState(state: AlertState): Promise<void> {
  return setItem(STATE_KEY, JSON.stringify(state));
}

async function updatesRunning(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(RETURN_ALERTS_TASK).catch(() => false);
}

async function currentToken(): Promise<string | null> {
  const { hydrated, session } = useAuthStore.getState();
  return hydrated ? session?.token ?? null : readStoredToken();
}

/** Background batches can overlap; each reads and writes the stored state in turn. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.catch(() => undefined);
  return run;
}

async function stopNow(): Promise<void> {
  await removeItem(STATE_KEY);
  await removeItem(LEGACY_TRAIL_KEY);
  if (Platform.OS === 'web') return;
  if (await updatesRunning()) {
    await Location.stopLocationUpdatesAsync(RETURN_ALERTS_TASK).catch(() => undefined);
  }
}

async function startLocationIdFor(stationCode: string | null): Promise<string | null> {
  if (!stationCode) return null;
  try {
    const station = await fetchStationByCode(stationCode, await currentToken());
    return station.locationId;
  } catch {
    return null;
  }
}

async function startNow(rental: {
  rentalId: string;
  startedAt: string;
  stationCode: string | null;
}): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await removeItem(LEGACY_TRAIL_KEY);
  const trackUntil = new Date(rental.startedAt).getTime() + RENTAL_TRAIL_MAX_MS;
  if (!Number.isFinite(trackUntil) || Date.now() >= trackUntil) {
    await stopNow();
    return false;
  }
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    await stopNow();
    return false;
  }

  const current = await readState();
  const sameRental = current?.rentalId === rental.rentalId;
  if (sameRental && (await updatesRunning())) return true;
  await writeState({
    rentalId: rental.rentalId,
    startedAt: rental.startedAt,
    trackUntil: new Date(trackUntil).toISOString(),
    startLocationId: sameRental ? current.startLocationId : await startLocationIdFor(rental.stationCode),
    alerted: sameRental ? current.alerted : [],
    lastAlertAt: sameRental ? current.lastAlertAt : null,
  });
  try {
    await Location.startLocationUpdatesAsync(RETURN_ALERTS_TASK, LOCATION_OPTIONS);
    return true;
  } catch (error) {
    console.warn('[return-alerts] could not start', error);
    await removeItem(STATE_KEY);
    return false;
  }
}

/**
 * Runs location updates while the rental is out (and the person opted in), else stops.
 * Resolves true while location updates run for it.
 */
export function syncReturnAlerts(
  rental: { rentalId: string; status: string; startedAt: string; stationCode: string | null } | null,
): Promise<boolean> {
  return serial(async () => {
    if (!rental || rental.status !== 'ACTIVE') {
      await stopNow();
      return false;
    }
    return startNow(rental);
  });
}

export function stopReturnAlerts(): Promise<void> {
  return serial(stopNow);
}

async function notificationsAllowed(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** The closest online station with an open slot within the alert radius, other than `skipLocationId`. */
function nearbyReturnFor(
  point: Location.LocationObjectCoords,
  stations: Station[],
  skipLocationId: string | null,
): NearbyReturn | null {
  let best: NearbyReturn | null = null;
  for (const station of stations) {
    const locationId = station.locationId ?? station.id;
    if (locationId === skipLocationId) continue;
    const openSlots = station.hasLiveData && station.online ? station.openSlots ?? 0 : 0;
    if (openSlots <= 0) continue;
    const distanceM = Math.round(distanceMeters(point, station));
    if (distanceM > RETURN_ALERT_RADIUS_M || (best && distanceM >= best.distanceM)) continue;
    best = { locationId, title: station.name, distanceM, openSlots };
  }
  return best;
}

async function maybeAlert(state: AlertState, nearby: NearbyReturn): Promise<AlertState> {
  if (state.alerted.includes(nearby.locationId)) return state;
  if (state.lastAlertAt && Date.now() - state.lastAlertAt < ALERT_GAP_MS) return state;
  if (!(await notificationsAllowed())) return state;

  const slots = `${nearby.openSlots} open slot${nearby.openSlots === 1 ? '' : 's'}`;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Return it at ${nearby.title}`,
      body: `${formatDistance(nearby.distanceM / METERS_PER_MILE)} away · ${slots}`,
      sound: true,
      data: { type: 'return_alert', locationId: nearby.locationId },
    },
    trigger: null,
  });
  return { ...state, alerted: [...state.alerted, nearby.locationId], lastAlertAt: Date.now() };
}

/** True while the power bank is still out; false once it is back or no longer this person's. */
async function rentalStillOut(rentalId: string, token: string): Promise<boolean | null> {
  try {
    const rental = await fetchRental(token, rentalId);
    return rental.status === 'ACTIVE' && rental.endedAt === null;
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) {
      return false;
    }
    return null;
  }
}

async function checkNearby(locations: Location.LocationObject[]): Promise<void> {
  const state = await readState();
  if (!state) {
    await stopNow();
    return;
  }
  if (Date.now() >= new Date(state.trackUntil).getTime()) {
    await stopNow();
    return;
  }

  const token = await currentToken();
  if (!token) return;
  const out = await rentalStillOut(state.rentalId, token);
  if (out === false) {
    await stopNow();
    return;
  }
  if (out === null) return;

  const newest = locations.reduce((latest, location) => (location.timestamp > latest.timestamp ? location : latest));
  if (Date.now() - newest.timestamp > NEARBY_MAX_AGE_MS) return;

  const skipLocationId =
    Date.now() - new Date(state.startedAt).getTime() < START_VENUE_QUIET_MS ? state.startLocationId : null;
  const nearby = nearbyReturnFor(newest.coords, await fetchNearbyStations(), skipLocationId);
  if (nearby) await writeState(await maybeAlert(state, nearby));
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(RETURN_ALERTS_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  await serial(() => checkNearby(data.locations)).catch((cause) => {
    console.warn('[return-alerts] batch failed', cause);
  });
});
