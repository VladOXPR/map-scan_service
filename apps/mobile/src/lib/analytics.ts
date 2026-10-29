import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Localization from 'expo-localization';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import PostHog from 'posthog-react-native';
import {
  createTracker,
  encodeGeohash,
  parseInstallReferrer,
  type AnalyticsPlatform,
  type MembershipStatus,
  type TrackerStorage,
} from '@cuub/core';
import { useLocationStore } from '@/store/locationStore';
import { getApiBaseUrl } from './config';

const REFERRER_CHECKED_KEY = 'cuub.analytics.referrerChecked';
const POSTHOG_DEFAULT_HOST = 'https://us.i.posthog.com';

const platform: AnalyticsPlatform =
  Platform.OS === 'android' ? 'android' : Platform.OS === 'web' ? 'web' : 'ios';

let token: string | null = null;
let membership: MembershipStatus | null = null;
let network: string | null = null;

const queueStorage: TrackerStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};

/** Keychain on iOS usually survives a reinstall, so the install id does too. */
const idStorage: TrackerStorage =
  Platform.OS === 'web'
    ? queueStorage
    : {
        getItem: (key) => SecureStore.getItemAsync(key),
        setItem: (key, value) =>
          SecureStore.setItemAsync(key, value, {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
          }),
      };

function locale(): { tag: string | null; timezone: string | null } {
  try {
    return {
      tag: Localization.getLocales()[0]?.languageTag ?? null,
      timezone: Localization.getCalendars()[0]?.timeZone ?? null,
    };
  } catch {
    return { tag: null, timezone: null };
  }
}

async function hardwareHint(): Promise<string | null> {
  if (Platform.OS === 'ios') return Application.getIosIdForVendorAsync();
  if (Platform.OS === 'android') return Application.getAndroidId();
  return null;
}

function createPostHog(deviceId: string): PostHog | null {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim();
  if (!key || Platform.OS === 'web') return null;
  return new PostHog(key, {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || POSTHOG_DEFAULT_HOST,
    bootstrap: { distinctId: deviceId, isIdentifiedId: false },
    // The tracker sends app_opened / app_foregrounded / app_backgrounded itself.
    captureAppLifecycleEvents: false,
    enableSessionReplay: true,
    sessionReplayConfig: {
      maskAllTextInputs: true,
      maskAllImages: false,
      captureLog: false,
    },
  });
}

export const tracker = createTracker({
  platform,
  endpoint: (kind) => `${getApiBaseUrl()}/app/analytics/${kind}`,
  storage: queueStorage,
  idStorage,
  getToken: () => token,
  posthog: createPostHog,
  hardwareHint,
  context: () => {
    const { permission, coords } = useLocationStore.getState();
    const granted = permission === 'granted';
    const { tag, timezone } = locale();
    return {
      appVersion: Application.nativeApplicationVersion,
      build: Application.nativeBuildVersion,
      os: Platform.OS,
      osVersion: String(Platform.Version),
      locale: tag,
      timezone,
      network,
      membership,
      hasLocationPermission: permission === 'undetermined' ? null : granted,
      geohash: granted && coords ? encodeGeohash(coords.latitude, coords.longitude, 6) : null,
    };
  },
  onError: (error, where) => {
    if (__DEV__) console.warn(`[analytics:${where}]`, error);
  },
});

export function setAnalyticsToken(next: string | null): void {
  token = next;
}

export function setAnalyticsMembership(next: MembershipStatus | null): void {
  membership = next;
  if (next) tracker.updatePerson({ membership: next });
}

/** Sent with verify-otp so the server links this install in the same call. */
export async function analyticsLoginContext() {
  await tracker.start();
  return {
    deviceId: tracker.getDeviceId(),
    sessionId: tracker.getSessionId(),
    webVisitorId: tracker.getWebVisitorId(),
    platform,
    hardwareHint: (await hardwareHint().catch(() => null)) ?? undefined,
  };
}

let networkWatched = false;

export function watchNetwork(): void {
  if (networkWatched || Platform.OS === 'web') return;
  networkWatched = true;
  const apply = (type: Network.NetworkStateType | undefined) => {
    network = type ? String(type).toLowerCase() : null;
  };
  Network.getNetworkStateAsync()
    .then((state) => apply(state.type))
    .catch(() => undefined);
  Network.addNetworkStateListener((state) => apply(state.type));
}

/** Android only: a Play Store install from the website carries `referrer=wv=<id>`. */
export async function linkInstallReferrer(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if ((await AsyncStorage.getItem(REFERRER_CHECKED_KEY)) === '1') return;
  try {
    const visitor = parseInstallReferrer(await Application.getInstallReferrerAsync());
    if (visitor) {
      await tracker.linkWebVisitor(visitor);
      tracker.setSessionSource('web_handoff');
    }
  } catch {
    // Not installed from Play (sideload, emulator): nothing to link.
  }
  await AsyncStorage.setItem(REFERRER_CHECKED_KEY, '1');
}

type GlobalErrorUtils = {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
};

let errorsWatched = false;

export function watchGlobalErrors(): void {
  if (errorsWatched) return;
  errorsWatched = true;
  const utils = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    tracker.error(error, { fatal: Boolean(isFatal), source: 'global' });
    previous(error, isFatal);
  });
}
