import {
  mapFoundationStations,
  mapInactiveLocations,
  mapMapLocations,
  mergeStationsWithInactive,
  type FoundationStationRow,
  type LocationRow,
  type MapLocationRow,
  type Station,
} from "@cuub/core";

interface ProxyOptions {
  path: string;
  method: "GET" | "POST" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
}

function cuubApiUrl(): string | null {
  const url = process.env["CUUB_API_URL"]?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

function cuubApiToken(): string | null {
  // Accept either name so copying from cuub-dashboard (.env MACHINE_API_TOKEN) works.
  const token =
    process.env["CUUB_API_TOKEN"]?.trim() ||
    process.env["MACHINE_API_TOKEN"]?.trim();
  return token || null;
}

function parseJsonResponse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Public GET /map pins only — no live slot/online data. Active venues only. */
async function fetchPublicMapStations(
  baseUrl: string
): Promise<{ status: number; payload: unknown; stations: Station[] }> {
  const res = await fetch(`${baseUrl}/map`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  const json = parseJsonResponse(text) as { success?: boolean; data?: MapLocationRow[] } | null;
  if (!res.ok || !json?.success || !Array.isArray(json.data)) {
    return {
      status: res.ok ? 502 : res.status,
      payload: {
        success: false,
        error: "Failed to fetch map locations from cuub-api",
      },
      stations: [],
    };
  }

  const mapped = mapMapLocations(json.data);
  return {
    status: 200,
    payload: { success: true, data: mapped, count: mapped.length },
    stations: mapped,
  };
}

/**
 * Machine-auth inactive venues (no station required). Inventory excluded via query.
 */
async function fetchInactiveLocationPins(
  baseUrl: string,
  token: string
): Promise<Station[]> {
  try {
    const path = "/locations?status=INACTIVE&is_inventory=false&limit=200";
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const text = await res.text();
    const json = parseJsonResponse(text) as {
      success?: boolean;
      data?: LocationRow[];
    } | null;
    if (!res.ok || !json?.success || !Array.isArray(json.data)) {
      console.warn(
        "[stations] inactive locations fetch failed:",
        res.status,
        text.slice(0, 200)
      );
      return [];
    }
    return mapInactiveLocations(json.data);
  } catch (err) {
    console.warn("[stations] inactive locations network error:", err);
    return [];
  }
}

function stationsPayload(stations: Station[]) {
  return {
    status: 200,
    payload: { success: true, data: stations, count: stations.length },
  };
}

/** Live Energo enrichment must finish within this window or we use public GET /map. */
const LIVE_STATIONS_TIMEOUT_MS = 2000;

/**
 * Prefer live Energo enrichment via machine-auth stations list (same path as
 * dashboard). Always merge inactive (non-inventory) locations when auth is
 * available. Fall back to public GET /map pins if the live call fails or does
 * not respond within LIVE_STATIONS_TIMEOUT_MS.
 */
export async function fetchMapStations(): Promise<{ status: number; payload: unknown }> {
  const baseUrl = cuubApiUrl();
  if (!baseUrl) {
    return {
      status: 503,
      payload: { success: false, error: "CUUB_API_URL is not configured" },
    };
  }

  const token = cuubApiToken();
  const inactivePins = token
    ? await fetchInactiveLocationPins(baseUrl, token)
    : [];

  if (token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LIVE_STATIONS_TIMEOUT_MS);
    try {
      // Same query shape as cuub-dashboard fetchAllStations({ includeLive: true }).
      // is_inventory=false keeps inventory cabinets off the map.
      const path =
        "/stations?include_live=true&is_inventory=false&limit=200";
      const res = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        signal: controller.signal,
      });

      const text = await res.text();
      const json = parseJsonResponse(text) as {
        success?: boolean;
        data?: FoundationStationRow[];
      } | null;

      if (res.ok && json?.success && Array.isArray(json.data)) {
        const live = mapFoundationStations(json.data);
        if (live.length > 0 || inactivePins.length > 0) {
          return stationsPayload(mergeStationsWithInactive(live, inactivePins));
        }
        console.warn(
          "[stations] live include_live returned 0 mappable stations; falling back to GET /map"
        );
      } else {
        console.warn(
          "[stations] live include_live fetch failed; falling back to GET /map:",
          res.status,
          text.slice(0, 200)
        );
      }
    } catch (err) {
      console.warn("[stations] live include_live network error; falling back to GET /map:", err);
    } finally {
      clearTimeout(timeout);
    }
  }

  const publicMap = await fetchPublicMapStations(baseUrl);
  if (publicMap.status !== 200) {
    if (inactivePins.length > 0) return stationsPayload(inactivePins);
    return { status: publicMap.status, payload: publicMap.payload };
  }

  return stationsPayload(mergeStationsWithInactive(publicMap.stations, inactivePins));
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
