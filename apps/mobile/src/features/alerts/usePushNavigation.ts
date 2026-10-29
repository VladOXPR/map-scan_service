import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { APP_SCHEME } from '@cuub/core';

const opened = new Set<string>();

/** In-app path for a push `data.url` (`cuub://rentals/<id>` → `/rentals/<id>`). */
function pathFor(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const prefix = `${APP_SCHEME}://`;
  if (url.startsWith(prefix)) return `/${url.slice(prefix.length)}`;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return null;
}

/** Opens the screen a tapped push points at and refreshes the rental it is about. */
export function usePushNavigation(): void {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (opened.has(id)) return;
      opened.add(id);
      const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
      if (typeof data.rentalId === 'string') {
        void queryClient.invalidateQueries({ queryKey: ['rental-active'] });
      }
      const path = pathFor(data.url);
      if (path) router.push(path as Href);
    };

    try {
      open(Notifications.getLastNotificationResponse());
    } catch {
      // Not available in this runtime (Expo Go without push support).
    }
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [queryClient, router]);
}
