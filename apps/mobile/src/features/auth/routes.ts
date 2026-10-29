import type { Href } from 'expo-router';

export type ProfileTrigger = 'signup' | 'unlock' | 'account';

/** Only in-app paths may be returned to after sign-in; anything else lands on the map. */
export function safeNext(next: string | string[] | undefined): string | null {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export function afterAuthHref(next: string | null): Href {
  return (next ?? '/(app)') as Href;
}

export function phoneHref(options: { entry: string; next?: string | null }): Href {
  return {
    pathname: '/(auth)/phone',
    params: { entry: options.entry, ...(options.next ? { next: options.next } : {}) },
  } as Href;
}

export function profileHref(options: { trigger: ProfileTrigger; next?: string | null }): Href {
  return {
    pathname: '/(auth)/profile',
    params: { trigger: options.trigger, ...(options.next ? { next: options.next } : {}) },
  } as Href;
}

export type PaywallTrigger = 'unlock' | 'account' | 'station';

export function membershipPath(options: { trigger: PaywallTrigger; stationCode?: string | null }): string {
  const station = options.stationCode ? `&station=${encodeURIComponent(options.stationCode)}` : '';
  return `/membership?trigger=${options.trigger}${station}`;
}

/** Station screen; the same `/s/<code>` path is the QR and universal-link target. */
export function stationPath(code: string, entry?: string): string {
  const path = `/s/${encodeURIComponent(code)}`;
  return entry ? `${path}?entry=${entry}` : path;
}
