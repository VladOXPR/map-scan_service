import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken } from '@/features/auth/api';
import { ensureNotificationPermissions } from './lowBatteryNotifications';

function getEasProjectId(): string | null {
  const id =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof id !== 'string' || !id.trim()) return null;
  if (id.includes('REPLACE')) return null;
  return id.trim();
}

/**
 * Stores the Expo push token on the backend for future remote push.
 * Does not send low-battery pushes itself (server has no battery %).
 */
export async function syncExpoPushToken(sessionToken: string): Promise<void> {
  if (Platform.OS === 'web') return;

  const projectId = getEasProjectId();
  if (!projectId) {
    console.warn(
      '[push] Skipping token sync — set extra.eas.projectId (eas init).',
    );
    return;
  }

  const permitted = await ensureNotificationPermissions();
  if (!permitted) return;

  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  if (!expoPushToken) return;

  await registerPushToken(sessionToken, expoPushToken);
}
