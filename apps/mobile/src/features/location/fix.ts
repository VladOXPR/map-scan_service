import * as Location from 'expo-location';
import type { LocationTrigger } from '@cuub/core';
import { tracker } from '@/lib/analytics';
import { useLocationStore } from '@/store/locationStore';

export type Fix = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  /** When the phone took the reading (epoch ms); a fallback reading can be old. */
  fixedAt: number;
};

/** Launch, foreground and the map screen ask within moments of each other. */
const REUSE_MS = 5_000;

let inflight: Promise<Fix | null> | null = null;
let last: { fix: Fix; readAt: number } | null = null;

function toFix(position: Location.LocationObject): Fix {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM: position.coords.accuracy ?? null,
    fixedAt: position.timestamp,
  };
}

async function read(): Promise<Fix | null> {
  try {
    return toFix(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  } catch {
    const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
    return lastKnown ? toFix(lastKnown) : null;
  }
}

/** One GPS read shared by every caller asking at the same time. Needs permission already granted. */
export function readFix(): Promise<Fix | null> {
  if (last && Date.now() - last.readAt < REUSE_MS) return Promise.resolve(last.fix);
  inflight ??= read()
    .then((fix) => {
      if (fix) last = { fix, readAt: Date.now() };
      return fix;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Reads the position and records it on the analytics session with the phone
 * battery. Never prompts: without location permission it does nothing.
 */
export async function recordLocationFix(trigger: LocationTrigger): Promise<Fix | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) return null;
    const fix = await readFix();
    if (!fix) return null;
    useLocationStore.getState().setCoords({ latitude: fix.latitude, longitude: fix.longitude });
    tracker.location({ trigger, ...fix });
    return fix;
  } catch {
    return null;
  }
}
