import posthog from "posthog-js";
import {
  WEB_HANDOFF_PARAM,
  createTracker,
  type PostHogAdapter,
  type Tracker,
  type TrackerStorage,
} from "@cuub/core";

const VISITOR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TWO_YEARS_SECONDS = 60 * 60 * 24 * 365 * 2;
const POSTHOG_DEFAULT_HOST = "https://us.i.posthog.com";

let tracker: Tracker | null = null;
let started = false;

export function readWebVisitorId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${WEB_HANDOFF_PARAM}=([^;]+)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return value && VISITOR_RE.test(value) ? value : null;
}

const localStore: TrackerStorage = {
  async getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Private mode or full storage: the queue lives in memory for this page.
    }
  },
};

/** The `wv` cookie set by middleware is the web deviceId, so store links and the tracker agree. */
const visitorCookie: TrackerStorage = {
  async getItem() {
    return readWebVisitorId();
  },
  async setItem(_key, value) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${WEB_HANDOFF_PARAM}=${encodeURIComponent(value)}; Path=/; Max-Age=${TWO_YEARS_SECONDS}; SameSite=Lax${secure}`;
  },
};

function createPostHog(deviceId: string): PostHogAdapter | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return null;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || POSTHOG_DEFAULT_HOST,
    bootstrap: { distinctID: deviceId, isIdentifiedID: false },
    // page_viewed comes from the tracker so cuub-api and PostHog see the same event.
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    persistence: "localStorage+cookie",
    session_recording: { maskAllInputs: true },
  });
  return posthog as unknown as PostHogAdapter;
}

/** Created on first use in the browser; never in embed mode (Framer iframes). */
export function getWebTracker(): Tracker | null {
  if (typeof window === "undefined") return null;
  if (!tracker) {
    tracker = createTracker({
      platform: "web",
      endpoint: (kind) => `/api/analytics/${kind}`,
      storage: localStore,
      idStorage: visitorCookie,
      posthog: createPostHog,
      sendBeacon: (url, body) =>
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon(url, new Blob([body], { type: "text/plain;charset=UTF-8" })),
      context: () => ({
        locale: navigator.language || null,
        os: /android/i.test(navigator.userAgent)
          ? "android"
          : /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent)
            ? "ios"
            : "other",
        network:
          (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? null,
      }),
      onError: (error, where) => {
        if (process.env.NODE_ENV !== "production") console.warn(`[analytics:${where}]`, error);
      },
    });
  }
  return tracker;
}

export function isEmbedMode(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "1";
}

/** Safe anywhere on the client; a no-op on the server and in embed mode. */
export function webTrack(...args: Parameters<Tracker["track"]>): void {
  if (typeof window === "undefined" || isEmbedMode()) return;
  startWebTracker()?.track(...args);
}

export function startWebTracker(): Tracker | null {
  const instance = getWebTracker();
  if (!instance || started) return instance;
  started = true;
  void instance.start();
  return instance;
}
