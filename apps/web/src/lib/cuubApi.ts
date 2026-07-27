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
    locationId?: string;
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

type CuubLocationRow = {
  locationId?: string;
  title?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  isInventory?: boolean;
  status?: string;
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

function locationStatus(value: string | undefined | null): string {
  return String(value ?? "").toUpperCase();
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
  const json = parseJsonResponse(text) as { success?: boolean; data?: CuubMapRow[] } | null;
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
      inactive: false,
    }));

  return {
    status: 200,
    payload: { success: true, data: mapped, count: mapped.length },
    stations: mapped,
  };
}

type AdaptedLive = {
  stations: Station[];
  /** Location IDs already represented by a station pin (for inactive merge dedupe). */
  coveredLocationIds: Set<string>;
};

function adaptLiveStations(rows: CuubLiveStationRow[]): AdaptedLive {
  const coveredLocationIds = new Set<string>();
  const stations = rows
    .map((row): Station | null => {
      const loc = row.currentLocation;
      if (!loc || loc.isInventory === true) return null;
      const status = locationStatus(loc.status);
      // Never show inventory (above) or archived venues.
      if (status === "ARCHIVED") return null;
      if (!hasValidCoords(loc.latitude, loc.longitude)) return null;
      if (!row.manufactureId) return null;

      if (loc.locationId) coveredLocationIds.add(String(loc.locationId));

      const live = row.live ?? null;
      const inactive = status === "INACTIVE";
      return {
        id: row.manufactureId,
        title: loc.title,
        latitude: loc.latitude as number | string,
        longitude: loc.longitude as number | string,
        filled_slots: inactive ? null : live?.batteryCount ?? null,
        open_slots: inactive ? null : live?.openSlots ?? null,
        online: inactive ? null : live ? (live.online ?? false) : null,
        inactive,
      };
    })
    .filter((row): row is Station => row != null);

  return { stations, coveredLocationIds };
}

function adaptInactiveLocations(rows: CuubLocationRow[]): Station[] {
  return rows
    .map((row): Station | null => {
      if (!row.locationId) return null;
      if (row.isInventory === true) return null;
      if (locationStatus(row.status) !== "INACTIVE") return null;
      if (!hasValidCoords(row.latitude, row.longitude)) return null;

      return {
        id: row.locationId,
        title: row.title,
        latitude: row.latitude as number | string,
        longitude: row.longitude as number | string,
        filled_slots: null,
        open_slots: null,
        online: null,
        inactive: true,
      };
    })
    .filter((row): row is Station => row != null);
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
      data?: CuubLocationRow[];
    } | null;
    if (!res.ok || !json?.success || !Array.isArray(json.data)) {
      console.warn(
        "[stations] inactive locations fetch failed:",
        res.status,
        text.slice(0, 200)
      );
      return [];
    }
    return adaptInactiveLocations(json.data);
  } catch (err) {
    console.warn("[stations] inactive locations network error:", err);
    return [];
  }
}

function mergeInactivePins(
  stations: Station[],
  inactivePins: Station[],
  coveredLocationIds: Set<string>
): Station[] {
  const extras = inactivePins.filter(
    (pin) => !coveredLocationIds.has(String(pin.id))
  );
  return [...stations, ...extras];
}

function stationsPayload(stations: Station[]) {
  return {
    status: 200,
    payload: { success: true, data: stations, count: stations.length },
  };
}

/**
 * Prefer live Energo enrichment via machine-auth stations list (same path as
 * dashboard). Always merge inactive (non-inventory) locations when auth is
 * available. Fall back to public GET /map pins if live call fails.
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
      });

      const text = await res.text();
      const json = parseJsonResponse(text) as {
        success?: boolean;
        data?: CuubLiveStationRow[];
      } | null;

      if (res.ok && json?.success && Array.isArray(json.data)) {
        const adapted = adaptLiveStations(json.data);
        if (adapted.stations.length > 0 || inactivePins.length > 0) {
          const merged = mergeInactivePins(
            adapted.stations,
            inactivePins,
            adapted.coveredLocationIds
          );
          return stationsPayload(merged);
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

  const publicMap = await fetchPublicMapStations(baseUrl);
  if (publicMap.status !== 200) {
    if (inactivePins.length > 0) return stationsPayload(inactivePins);
    return { status: publicMap.status, payload: publicMap.payload };
  }

  const covered = new Set(publicMap.stations.map((s) => String(s.id)));
  return stationsPayload(
    mergeInactivePins(publicMap.stations, inactivePins, covered)
  );
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
