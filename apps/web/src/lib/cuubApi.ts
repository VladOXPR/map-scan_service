import { mapMapLocations, type MapLocationRow, type Station } from "@cuub/core";

interface ProxyOptions {
  path: string;
  method: "GET" | "POST" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
}

export function cuubApiUrl(): string | null {
  const url = process.env["CUUB_API_URL"]?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

export function cuubApiToken(): string | null {
  // Accept either name so copying from cuub-dashboard (.env MACHINE_API_TOKEN) works.
  const token =
    process.env["CUUB_API_TOKEN"]?.trim() ||
    process.env["MACHINE_API_TOKEN"]?.trim();
  return token || null;
}

export function parseJsonResponse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Must match the CUUB app map (apps/mobile/src/features/stations/api.ts): live first, then plain pins. */
const MAP_SOURCES = [
  // Live counts come from Energo through cuub-api; a stalled call must not hold the page render.
  { path: "/map/live", timeoutMs: 10_000 },
  { path: "/map", timeoutMs: null },
] as const;

async function fetchMapLocations(
  baseUrl: string,
  path: string,
  timeoutMs: number | null
): Promise<Station[] | null> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const text = await res.text();
  const json = parseJsonResponse(text) as { success?: boolean; data?: MapLocationRow[] } | null;
  if (res.ok && json?.success && Array.isArray(json.data)) return mapMapLocations(json.data);
  console.warn(`[stations] GET ${path} failed:`, res.status, text.slice(0, 200));
  return null;
}

/** Public GET /map/live (pins with live online and battery counts), falling back to GET /map. */
export async function fetchMapStations(): Promise<{ status: number; payload: unknown }> {
  const baseUrl = cuubApiUrl();
  if (!baseUrl) {
    return {
      status: 503,
      payload: { success: false, error: "CUUB_API_URL is not configured" },
    };
  }

  for (const { path, timeoutMs } of MAP_SOURCES) {
    try {
      const stations = await fetchMapLocations(baseUrl, path, timeoutMs);
      if (stations) {
        return { status: 200, payload: { success: true, data: stations, count: stations.length } };
      }
    } catch (err) {
      console.warn(`[stations] GET ${path} network error:`, err);
    }
  }

  return {
    status: 502,
    payload: { success: false, error: "Failed to fetch map locations from cuub-api" },
  };
}

export interface StationLandingData {
  code: string;
  title: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  online: boolean;
  charged: number;
  slots: number;
}

/**
 * Public GET /app/stations/by-code/:code for the `/s/<code>` landing page.
 * `null` when the code matches no station; throws on transport errors.
 */
export async function fetchStationByCode(code: string): Promise<StationLandingData | null> {
  const baseUrl = cuubApiUrl();
  if (!baseUrl) throw new Error("CUUB_API_URL is not configured");
  const res = await fetch(`${baseUrl}/app/stations/by-code/${encodeURIComponent(code)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404 || res.status === 400) return null;
  const json = parseJsonResponse(await res.text()) as { success?: boolean; data?: StationLandingData } | null;
  if (!res.ok || !json?.success || !json.data) throw new Error(`Station lookup failed (${res.status})`);
  const { title, address, latitude, longitude, online, charged, slots } = json.data;
  return { code: json.data.code, title, address, latitude, longitude, online, charged, slots };
}

/** Machine-auth battery routes on cuub-api (GET/POST /battery/:cuubId). */
export async function proxyCuubBattery({
  path,
  method,
  headers,
  body,
}: ProxyOptions): Promise<{ status: number; payload: unknown }> {
  const baseUrl = cuubApiUrl();
  const token = cuubApiToken();
  if (!baseUrl || !token) {
    return {
      status: 503,
      payload: {
        success: false,
        error: "CUUB_API_URL or CUUB_API_TOKEN is not configured",
      },
    };
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(headers ?? {}),
    },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  const json = parseJsonResponse(text);
  if (json === null) {
    return {
      status: 500,
      payload: { success: false, error: "Failed to parse API response" },
    };
  }

  return { status: res.status, payload: json };
}
