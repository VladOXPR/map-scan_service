import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Battery from 'expo-battery';

export type PhoneBattery = {
  /** 0–1, or null when the device doesn't report it (simulators). */
  level: number | null;
  pluggedIn: boolean;
};

const UNKNOWN: PhoneBattery = { level: null, pluggedIn: false };

function pluggedIn(state: Battery.BatteryState): boolean {
  return (
    state === Battery.BatteryState.CHARGING ||
    state === Battery.BatteryState.FULL ||
    state === Battery.BatteryState.NOT_CHARGING
  );
}

function levelOrNull(level: number): number | null {
  return level >= 0 ? Math.min(1, level) : null;
}

/**
 * The phone's charge and whether it's on external power. Rechecked on resume
 * because iOS doesn't deliver battery events while the app is suspended.
 */
export function usePhoneBattery(enabled: boolean): PhoneBattery {
  const [battery, setBattery] = useState<PhoneBattery>(UNKNOWN);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') {
      setBattery(UNKNOWN);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      Battery.getPowerStateAsync()
        .then(({ batteryLevel, batteryState }) => {
          if (!cancelled) setBattery({ level: levelOrNull(batteryLevel), pluggedIn: pluggedIn(batteryState) });
        })
        .catch(() => undefined);
    };
    refresh();
    const stateSub = Battery.addBatteryStateListener(({ batteryState }) => {
      setBattery((prev) => ({ ...prev, pluggedIn: pluggedIn(batteryState) }));
    });
    const levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setBattery((prev) => ({ ...prev, level: levelOrNull(batteryLevel) }));
    });
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      cancelled = true;
      stateSub.remove();
      levelSub.remove();
      appSub.remove();
    };
  }, [enabled]);

  return battery;
}
