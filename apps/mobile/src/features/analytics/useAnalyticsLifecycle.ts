import { useEffect } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { usePathname } from 'expo-router';
import { APP_SCHEME, WEB_HANDOFF_PARAM, parseStationLink } from '@cuub/core';
import {
  linkInstallReferrer,
  refreshBattery,
  tracker,
  watchBattery,
  watchGlobalErrors,
  watchNetwork,
} from '@/lib/analytics';
import { getLinkHosts } from '@/lib/config';
import { recordLocationFix } from '@/features/location/fix';

const handledResponses = new Set<string>();

function isOwnLink(url: string): boolean {
  if (url.startsWith(`${APP_SCHEME}://`)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && getLinkHosts().includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Universal links and `cuub://` opens; dev-client and Expo URLs are ignored. */
function trackLink(url: string | null): void {
  if (!url || !isOwnLink(url)) return;
  const station = parseStationLink(url, getLinkHosts());
  let webVisitorId = station?.webVisitorId ?? null;
  if (!station) {
    try {
      webVisitorId = new URL(url).searchParams.get(WEB_HANDOFF_PARAM);
    } catch {
      webVisitorId = null;
    }
  }
  tracker.deeplink({
    url,
    source: webVisitorId ? 'web_handoff' : 'universal_link',
    stationCode: station?.code ?? null,
  });
  if (webVisitorId) void tracker.linkWebVisitor(webVisitorId);
}

function pushProperties(notification: Notifications.Notification) {
  const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
  const kind = typeof data.kind === 'string' ? data.kind : typeof data.type === 'string' ? data.type : 'unknown';
  const trigger = notification.request.trigger as { type?: string } | null;
  return { kind, remote: trigger?.type === 'push' };
}

function trackResponse(response: Notifications.NotificationResponse | null): void {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (handledResponses.has(id)) return;
  handledResponses.add(id);
  tracker.push('opened', pushProperties(response.notification));
}

/**
 * Starts the tracker and auto-captures what every screen would otherwise have
 * to: lifecycle, screens, deep links, pushes, crashes, and where the phone is
 * when a new session starts. Mounted once in the root layout.
 */
export function useAnalyticsLifecycle(): void {
  const pathname = usePathname();

  useEffect(() => {
    watchGlobalErrors();
    watchNetwork();
    watchBattery();
    void refreshBattery()
      .then(() => tracker.start())
      .then(({ newSession }) => {
        if (newSession) void recordLocationFix('open');
        return linkInstallReferrer();
      });

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        tracker.background();
        return;
      }
      if (state !== 'active') return;
      void refreshBattery()
        .then(() => (AppState.currentState === 'active' ? tracker.foreground() : null))
        .then((result) => {
          if (result?.newSession) void recordLocationFix('open');
        });
    });

    void Linking.getInitialURL().then(trackLink).catch(() => undefined);
    const links = Linking.addEventListener('url', ({ url }) => trackLink(url));

    const subscriptions: Array<{ remove: () => void }> = [appState, links];
    if (Platform.OS !== 'web') {
      subscriptions.push(
        Notifications.addNotificationReceivedListener((notification) => {
          tracker.push('received', pushProperties(notification));
        }),
        Notifications.addNotificationResponseReceivedListener(trackResponse),
      );
      try {
        trackResponse(Notifications.getLastNotificationResponse());
      } catch {
        // Not available in this runtime (Expo Go without push support).
      }
    }

    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (pathname) tracker.screen(pathname);
  }, [pathname]);
}
