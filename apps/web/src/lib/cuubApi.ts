import type { Station } from "@cuub/shared";

interface ProxyOptions {
  path: string;
  method: "GET" | "POST" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
}

type CuubMapRow = {
  locationId: string;
  title: string;
  latitude: number;
  longitude: number;
  hasStation?: boolean;
};

type CuubLiveStationRow = {
  manufactureId?: string;
  status?: string;
  currentLocation?: {
    title?: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
    isInventory?: boolean;
    status?: string;
  } | null;
  live?: {
    online?: boolean;
    batteryCount?: number;
    openSlots?: number;
  } | null;
};

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

function hasValidCoords(
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined
): boolean {
  if (latitude == null || longitude == null) return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

/** Public GET /map pins only — no live slot/online data. */
async function fetchPublicMapStations(
  baseUrl: string
): Promise<{ status: number; payload: unknown }> {
  const res = await fetch(`${baseUrl}/map`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  const json = parseJsonResponse(text) as { success?: boolean; data?: CuubMapRow[] } | null;
  if (!res.ok || !json?.success || !Array.isArray(json.data)) {
    return {
      status: res.ok ? 502 : res.status,
      payload: {
        success: false,
        error: "Failed to fetch map locations from cuub-api",
      },
    };
  }

  const mapped: Station[] = json.data
    .filter((row) => row.hasStation !== false)
    .filter((row) => hasValidCoords(row.latitude, row.longitude))
    .map((row) => ({
      id: row.locationId,
      title: row.title,
      latitude: row.latitude,
      longitude: row.longitude,
      filled_slots: null,
      open_slots: null,
      online: null,
    }));

  return {
    status: 200,
    payload: { success: true, data: mapped, count: mapped.length },
  };
}

function adaptLiveStations(rows: CuubLiveStationRow[]): Station[] {
  return rows
    .map((row): Station | null => {
      const loc = row.currentLocation;
      if (!loc || loc.isInventory === true) return null;
      if (!hasValidCoords(loc.latitude, loc.longitude)) return null;
      if (!row.manufactureId) return null;

      const live = row.live ?? null;
      return {
        id: row.manufactureId,
        title: loc.title,
        latitude: loc.latitude as number | string,
        longitude: loc.longitude as number | string,
        filled_slots: live?.batteryCount ?? null,
        open_slots: live?.openSlots ?? null,
        online: live ? (live.online ?? false) : null,
      };
    })
    .filter((row): row is Station => row != null);
}

/**
 * Prefer live Energo enrichment via machine-auth stations list (same path as
 * dashboard). Fall back to public GET /map pins if auth/live call fails so
 * the map never blanks when the Energo token is down.
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
  if (token) {
    try {
      // Same query shape as cuub-dashboard fetchAllStations({ includeLive: true }).
      const path =
        "/stations?include_live=true&is_inventory=false&limit=200";
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
        data?: CuubLiveStationRow[];
      } | null;

      if (res.ok && json?.success && Array.isArray(json.data)) {
        const mapped = adaptLiveStations(json.data);
        if (mapped.length > 0) {
          return {
            status: 200,
            payload: { success: true, data: mapped, count: mapped.length },
          };
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
    }
  }

  return fetchPublicMapStations(baseUrl);
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

/** @deprecated Use fetchMapStations or proxyCuubBattery. Kept for grep visibility during cutover. */
export async function proxyCuub(options: ProxyOptions) {
  if (options.path === "/stations" && options.method === "GET") {
    return fetchMapStations();
  }
  return proxyCuubBattery(options);
}
