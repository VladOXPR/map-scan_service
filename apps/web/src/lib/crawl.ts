import { createHash, timingSafeEqual } from "node:crypto";
import { cuubApiToken, cuubApiUrl, parseJsonResponse } from "@/lib/cuubApi";

export const CRAWL_COOLDOWN_MS = 60 * 60_000;
export const CRAWL_COOKIE = "crawl_dispensed";

export type CrawlMatch = { stationId: string; title: string };

type StationRow = {
  stationId?: string;
  manufactureId?: string;
  status?: string;
  currentLocation?: { title?: string; status?: string } | null;
};

export class CrawlError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function isThreeDigits(value: unknown): value is string {
  return typeof value === "string" && /^\d{3}$/.test(value);
}

export function checkCrawlPassword(password: unknown): boolean {
  if (typeof password !== "string") return false;
  const expected = process.env["CRAWL_PASSWORD"]?.trim() || "crawl";
  const digest = (value: string) => createHash("sha256").update(value.trim().toLowerCase()).digest();
  return timingSafeEqual(digest(password), digest(expected.toLowerCase()));
}

async function callCuubApi(path: string, method: "GET" | "POST") {
  const baseUrl = cuubApiUrl();
  const token = cuubApiToken();
  if (!baseUrl || !token) {
    throw new CrawlError("This page isn't set up yet. Please contact CUUB support.", 503);
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = parseJsonResponse(await res.text()) as { success?: boolean; data?: unknown; error?: string } | null;
  return { status: res.status, json };
}

/** Stations at a non-archived location (inventory included) whose ID ends with `digits`. */
export async function findStationsBySuffix(digits: string): Promise<CrawlMatch[]> {
  const { status, json } = await callCuubApi(`/stations?q=${encodeURIComponent(digits)}&limit=200`, "GET");
  if (status !== 200 || !json?.success || !Array.isArray(json.data)) {
    console.error("[crawl] station lookup failed:", status, json?.error);
    throw new CrawlError("We couldn't look up stations right now. Please try again.", 502);
  }

  return (json.data as StationRow[])
    .filter((row) => row.stationId && row.manufactureId?.endsWith(digits))
    .filter((row) => {
      const location = row.currentLocation;
      return location != null && String(location.status ?? "").toUpperCase() !== "ARCHIVED";
    })
    .map((row) => ({ stationId: row.stationId!, title: row.currentLocation?.title?.trim() || row.manufactureId! }));
}

const FRIENDLY_REFUSALS: Array<[RegExp, string]> = [
  [/offline/i, "This station is offline right now. Please try another station."],
  [/No charged power bank/i, "This station has no charged power banks right now. Please try another station."],
  [/in progress/i, "This station is busy releasing a power bank. Please wait a moment and try again."],
];

/** Asks cuub-api to release the best charged power bank at the station. */
export async function freeDispense(stationId: string): Promise<void> {
  const { status, json } = await callCuubApi(`/stations/${encodeURIComponent(stationId)}/free-dispense`, "POST");
  if (status === 201 && json?.success) return;

  console.error("[crawl] free-dispense failed:", status, json?.error);
  const friendly = FRIENDLY_REFUSALS.find(([pattern]) => pattern.test(json?.error ?? ""));
  if (status === 409 && friendly) throw new CrawlError(friendly[1], 409);
  throw new CrawlError("We couldn't release a power bank. Please try again.", 502);
}

// Per instance only; the cookie covers the same browser across instances.
const lastDispenseByIp = new Map<string, number>();

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

export function isCoolingDown(ip: string, hasCookie: boolean, now = Date.now()): boolean {
  if (hasCookie) return true;
  const last = lastDispenseByIp.get(ip);
  return last !== undefined && now - last < CRAWL_COOLDOWN_MS;
}

export function recordDispense(ip: string, now = Date.now()): void {
  lastDispenseByIp.set(ip, now);
  for (const [key, at] of lastDispenseByIp) {
    if (now - at >= CRAWL_COOLDOWN_MS) lastDispenseByIp.delete(key);
  }
}
