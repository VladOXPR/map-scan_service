import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Battery from 'expo-battery';
import {
  configureNotificationHandler,
  ensureNotificationPermissions,
  maybeNotifyLowBattery,
} from './lowBatteryNotifications';

/**
 * Watches device battery (on-device) and fires a local notification when
 * level drops to ≤38% and a CUUB is within 2 miles.
 */
export function useLowBatteryAlerts(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    configureNotificationHandler();
    void ensureNotificationPermissions();
    void maybeNotifyLowBattery();

    const levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      void maybeNotifyLowBattery(batteryLevel);
    });

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void maybeNotifyLowBattery();
      }
    });

    return () => {
      levelSub.remove();
      appSub.remove();
    };
  }, [enabled]);
}
