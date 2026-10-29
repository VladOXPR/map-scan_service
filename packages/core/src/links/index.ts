/**
 * Store links, station QR links and the web → app handoff parameter.
 * The kiosk QR, the website and the app all agree on these.
 */

export const IOS_BUNDLE_ID = "tech.cuub.user";
export const ANDROID_PACKAGE = "com.cuub.user";
export const APPLE_TEAM_ID = "8X4H3BPTXL";
export const APP_STORE_ID = "6805257335";
export const APP_STORE_URL = `https://apps.apple.com/us/app/cuub/id${APP_STORE_ID}`;
export const APP_SCHEME = "cuub";

/** Query parameter carrying the anonymous web visitor id into the app. */
export const WEB_HANDOFF_PARAM = "wv";

export const STATION_PATH_PREFIX = "/s/";

/** Crockford base32 (no I, L, O, U), 8 characters. */
export const STATION_CODE_LENGTH = 8;
const STATION_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

export type StorePlatform = "ios" | "android" | "other";

/** iPadOS reports a Macintosh UA, so Mac counts as Apple like the old /app redirect. */
export function detectStorePlatform(userAgent: string | null | undefined): StorePlatform {
  const ua = userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod|Macintosh/i.test(ua)) return "ios";
  return "other";
}

export function playStoreUrl(webVisitorId?: string | null): string {
  const base = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  if (!webVisitorId) return base;
  const referrer = `${WEB_HANDOFF_PARAM}=${webVisitorId}`;
  return `${base}&referrer=${encodeURIComponent(referrer)}`;
}

export function storeUrlFor(
  platform: StorePlatform,
  options: { webVisitorId?: string | null } = {}
): string {
  if (platform === "android") return playStoreUrl(options.webVisitorId);
  return APP_STORE_URL;
}

/** Normalises human/scanner input: case, hyphens, and Crockford look-alikes. */
export function normalizeStationCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw
    .trim()
    .toUpperCase()
    .replace(/-/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return STATION_CODE_RE.test(code) ? code : null;
}

function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function buildStationUrl(
  origin: string,
  code: string,
  options: { webVisitorId?: string | null } = {}
): string {
  const url = `${trimOrigin(origin)}${STATION_PATH_PREFIX}${code}`;
  if (!options.webVisitorId) return url;
  return `${url}?${WEB_HANDOFF_PARAM}=${encodeURIComponent(options.webVisitorId)}`;
}

export interface StationLink {
  code: string;
  webVisitorId: string | null;
}

/**
 * Accepts `https://<allowed host>/s/<code>`, `cuub://s/<code>` and a bare code
 * (what a kiosk QR decodes to if someone prints the code alone).
 */
export function parseStationLink(
  input: string | null | undefined,
  allowedHosts: readonly string[]
): StationLink | null {
  if (!input) return null;
  const raw = input.trim();

  const bare = normalizeStationCode(raw);
  if (bare) return { code: bare, webVisitorId: null };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  let path: string;
  if (url.protocol === `${APP_SCHEME}:`) {
    // cuub://s/CODE parses with host "s" and path "/CODE".
    path = url.host ? `/${url.host}${url.pathname}` : url.pathname;
  } else if (url.protocol === "https:") {
    const host = url.hostname.toLowerCase();
    if (!allowedHosts.some((allowed) => allowed.toLowerCase() === host)) return null;
    path = url.pathname;
  } else {
    return null;
  }

  const match = path.match(/^\/s\/([^/?#]+)\/?$/i);
  if (!match) return null;
  const code = normalizeStationCode(decodeURIComponent(match[1]));
  if (!code) return null;
  return { code, webVisitorId: url.searchParams.get(WEB_HANDOFF_PARAM) };
}

/** Play Store install referrer "wv=<id>" → web visitor id. */
export function parseInstallReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  const params = new URLSearchParams(referrer);
  const id = params.get(WEB_HANDOFF_PARAM);
  return id && /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null;
}
