import { randomUUID } from "node:crypto";
import { cuubApiUrl } from "./cuubApi";

/** A slow cuub-api must not hold up the visitor's redirect. */
const TIMEOUT_MS = 1500;

export interface ServerEvent {
  name: string;
  properties: Record<string, string | number | boolean>;
}

async function post(baseUrl: string, path: string, body: unknown, signal: AbortSignal): Promise<void> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status})`);
}

/**
 * Records web events for a visitor who is redirected before the browser tracker
 * can run: registers the `wv` id as a web device, then logs the events on a new
 * session. Never throws.
 */
export async function trackServerVisit(input: {
  visitorId: string;
  source: string;
  events: ServerEvent[];
}): Promise<void> {
  const baseUrl = cuubApiUrl();
  if (!baseUrl) return;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const now = new Date().toISOString();
  try {
    await post(baseUrl, "/app/analytics/device", { deviceId: input.visitorId, platform: "web" }, signal);
    await post(
      baseUrl,
      "/app/analytics/events",
      {
        deviceId: input.visitorId,
        sessionId: randomUUID(),
        source: input.source,
        sentAt: now,
        events: input.events.map((event) => ({ ...event, eventId: randomUUID(), occurredAt: now })),
      },
      signal
    );
  } catch (error) {
    console.warn("[analytics] server-side visit not recorded:", error);
  }
}
