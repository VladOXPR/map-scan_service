import { WEB_HANDOFF_PARAM } from "@cuub/core";

/** Set by middleware: path + query of the page being rendered. */
export const PAGE_URL_HEADER = "x-cuub-page-url";
/** Set by middleware when the page is a Framer embed (`?embed=1`). */
export const EMBED_HEADER = "x-cuub-embed";

const VISITOR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `wv` visitor id from a cookie value, if well formed. */
export function visitorIdFrom(value: string | null | undefined): string | null {
  return value && VISITOR_RE.test(value) ? value : null;
}

/** Public origin of this site (the QR / universal-link host). */
export function publicOrigin(): string {
  const configured = process.env.PUBLIC_WEB_ORIGIN?.trim() || process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim();
  return (configured || "https://go.cuub.tech").replace(/\/+$/, "");
}

/** Absolute URL for the page with `wv` attached, for the Smart App Banner's app-argument. */
export function appArgumentFor(pageUrl: string, visitorId: string | null): string {
  const url = new URL(pageUrl || "/", publicOrigin());
  url.searchParams.delete("embed");
  if (visitorId) url.searchParams.set(WEB_HANDOFF_PARAM, visitorId);
  return url.toString();
}
