import { Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { fetchNearbyStations } from '@/features/stations/api';
import { tracker } from '@/lib/analytics';
import { distanceMiles } from '@/lib/distance';
import { getItem, setItem } from '@/lib/storage';
import type { Station } from '@/types/station';
import {
  LOW_BATTERY_ARMED_KEY,
  LOW_BATTERY_MAX_DISTANCE_MILES,
  LOW_BATTERY_REARM_THRESHOLD,
  LOW_BATTERY_THRESHOLD,
} from './constants';

let handlerConfigured = false;

export function configureNotificationHandler() {
  if (handlerConfigured || Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  handlerConfigured = true;
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  configureNotificationHandler();

  const current = await Notifications.getPermissionsAsync();
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }

  tracker.permission('notifications', 'prompted');
  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });

  const granted =
    requested.granted === true ||
    requested.status === 'granted' ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  const result = granted ? 'granted' : requested.canAskAgain === false ? 'blocked' : 'denied';
  tracker.permission('notifications', 'result', result);
  tracker.track('notification_permission_result', { result });
  return granted;
}

function isEligibleStation(station: Station) {
  if (station.locationInactive) return false;
  if (station.online === false) return false;
  return true;
}

function findNearestStation(
  coords: { latitude: number; longitude: number },
  stations: Station[],
): { station: Station; miles: number } | null {
  const eligible = stations.filter(isEligibleStation);
  const pool = eligible.length ? eligible : stations;
  if (!pool.length) return null;

  let best: { station: Station; miles: number } | null = null;
  for (const station of pool) {
    const miles = distanceMiles(coords, station);
    if (!best || miles < best.miles) {
      best = { station, miles };
    }
  }
  return best;
}

function formatAlertDistance(miles: number) {
  if (miles < 0.1) return miles.toFixed(2);
  return miles.toFixed(1);
}

async function isArmed(): Promise<boolean> {
  const raw = await getItem(LOW_BATTERY_ARMED_KEY);
  return raw !== '0';
}

async function setArmed(armed: boolean) {
  await setItem(LOW_BATTERY_ARMED_KEY, armed ? '1' : '0');
}

async function resolveCoords() {
  const locationPermission = await Location.getForegroundPermissionsAsync();
  if (locationPermission.status !== 'granted') {
    const requested = await Location.requestForegroundPermissionsAsync();
    if (requested.status !== 'granted') {
      throw new Error('Location permission is required for low-battery alerts.');
    }
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

async function presentLowBatteryNotification(opts: {
  percent: number;
  miles: number;
  stationId: string;
}) {
  const distanceLabel = formatAlertDistance(opts.miles);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Im at ${opts.percent}% 😔`,
      body: `There’s a CUUB ${distanceLabel}mi away 👀`,
      sound: true,
      data: {
        type: 'low_battery',
        stationId: opts.stationId,
      },
    },
    trigger: null,
  });
  tracker.track('low_battery_alert_shown', { miles: Number(distanceLabel) });
}

/**
 * Evaluates battery + nearest station locally and may schedule a notification.
 * Never uploads battery % or GPS.
 */
export async function maybeNotifyLowBattery(
  batteryLevel?: number,
): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const available = await Battery.isAvailableAsync();
    if (!available) {
      // Simulators never report battery — skip quietly.
      return;
    }

    const level = batteryLevel ?? (await Battery.getBatteryLevelAsync());
    if (level < 0) return;

    if (level > LOW_BATTERY_REARM_THRESHOLD) {
      await setArmed(true);
      return;
    }

    if (level > LOW_BATTERY_THRESHOLD) return;

    const armed = await isArmed();
    if (!armed) return;

    const permitted = await ensureNotificationPermissions();
    if (!permitted) return;

    const coords = await resolveCoords();
    const stations = await fetchNearbyStations();
    const nearest = findNearestStation(coords, stations);
    if (!nearest) return;
    if (nearest.miles > LOW_BATTERY_MAX_DISTANCE_MILES) return;

    const pct = Math.max(1, Math.round(level * 100));
    await presentLowBatteryNotification({
      percent: pct,
      miles: nearest.miles,
      stationId: nearest.station.id,
    });

    await setArmed(false);
  } catch (error) {
    console.warn('[low-battery] skipped', error);
  }
}

/**
 * Manual test path — ignores battery % / armed state.
 * Still uses real nearest-station distance (no GPS/battery uploaded).
 */
export async function sendTestLowBatteryNotification(): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Notifications are not available on web.');
  }

  const permitted = await ensureNotificationPermissions();
  if (!permitted) {
    throw new Error('Notification permission was denied.');
  }

  const available = await Battery.isAvailableAsync();
  const level = available ? await Battery.getBatteryLevelAsync() : 0.3;
  const pct =
    level >= 0 ? Math.max(1, Math.round(level * 100)) : 38;

  const coords = await resolveCoords();
  const stations = await fetchNearbyStations();
  const nearest = findNearestStation(coords, stations);
  if (!nearest) {
    throw new Error('No stations found near you.');
  }

  await presentLowBatteryNotification({
    percent: Math.min(pct, 38),
    miles: nearest.miles,
    stationId: nearest.station.id,
  });

  return `Alert sent · nearest CUUB ${formatAlertDistance(nearest.miles)} mi`;
}
