import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type Updates = typeof import('expo-updates');

/** Minimum time between foreground checks. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** Internal builds on this channel are for trying updates, so they restart into one as soon as it downloads. */
const IMMEDIATE_CHANNEL = 'preview';

/** Release builds only: importing expo-updates throws in binaries built without it. */
function loadUpdates(): Updates | null {
  if (__DEV__ || Platform.OS === 'web') return null;
  if (!requireOptionalNativeModule('ExpoUpdates')) return null;
  const updates: Updates = require('expo-updates');
  return updates.isEnabled ? updates : null;
}

/**
 * The binary checks EAS Update on every launch; this also checks when the app comes
 * back to the foreground. Updates only download here and start on the next launch,
 * so the app never restarts under the user or drops a station link it was opened with.
 * Preview builds instead check on launch and every foreground and restart right away.
 */
export function useUpdateChecks() {
  useEffect(() => {
    const updates = loadUpdates();
    if (!updates) return;
    const immediate = updates.channel === IMMEDIATE_CHANNEL;
    let lastCheckAt = immediate ? 0 : Date.now();
    let checking = false;
    const check = () => {
      if (checking) return;
      if (!immediate && Date.now() - lastCheckAt < CHECK_INTERVAL_MS) return;
      checking = true;
      lastCheckAt = Date.now();
      updates
        .checkForUpdateAsync()
        .then((result) => (result.isAvailable ? updates.fetchUpdateAsync() : undefined))
        .then((fetched) => {
          if (immediate && (fetched?.isNew || fetched?.isRollBackToEmbedded)) return updates.reloadAsync();
        })
        .catch(() => undefined)
        .finally(() => {
          checking = false;
        });
    };
    if (immediate) check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, []);
}
