export interface RouteLocationBase {
  locationId: string;
  title: string;
  latitude: number;
  longitude: number;
  onCuubSoftware: boolean;
}

type CuubLocationRow = {
  locationId?: string;
  title?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  isInventory?: boolean;
  status?: string;
  stations?: Array<{ appVersion?: string | null }> | null;
};

type CuubMapRow = {
  locationId: string;
  title: string;
  latitude: number;
  longitude: number;
  hasStation?: boolean;
};

const PAGE_SIZE = 200;
const MAX_PAGES = 50;
const CUUB_SOFTWARE_MIN: [number, number, number] = [1, 0, 0];

function cuubApiUrl(): string | null {
  const url = process.env["CUUB_API_URL"]?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

function cuubApiToken(): string | null {
  const token =
    process.env["CUUB_API_TOKEN"]?.trim() ||
    process.env["MACHINE_API_TOKEN"]?.trim();
  return token || null;
}

function toCoord(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validCoords(lat: number | null, lng: number | null): lat is number {
  return lat != null && lng != null && !(lat === 0 && lng === 0);
}

/** "1.0.2-pilot" → true, "0.9.4" → false. Pre-release suffix is ignored. */
export function isCuubSoftwareVersion(version: string | null | undefined): boolean {
  const core = String(version ?? "").trim().split("-")[0];
  if (!core) return false;
  const parts = core.split(".");
  if (parts.some((p) => !/^\d+$/.test(p))) return false;
  const nums = [0, 1, 2].map((i) => Number(parts[i] ?? 0));
  for (let i = 0; i < 3; i++) {
    if (nums[i] !== CUUB_SOFTWARE_MIN[i]) return nums[i] > CUUB_SOFTWARE_MIN[i];
  }
  return true;
}

function adaptLocationRow(row: CuubLocationRow): RouteLocationBase | null {
  if (!row.locationId || row.isInventory === true) return null;
  const status = String(row.status ?? "").toUpperCase();
  if (status === "ARCHIVED") return null;
  const stations = row.stations ?? [];
  if (stations.length === 0 && status !== "INACTIVE") return null;
  const latitude = toCoord(row.latitude);
  const longitude = toCoord(row.longitude);
  if (!validCoords(latitude, longitude)) return null;
  return {
    locationId: row.locationId,
    title: row.title ?? "",
    latitude,
    longitude: longitude as number,
    onCuubSoftware: stations.some((s) => isCuubSoftwareVersion(s.appVersion)),
  };
}

async function fetchAuthedLocations(baseUrl: string, token: string): Promise<RouteLocationBase[]> {
  const rows: CuubLocationRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const path = `/locations?is_inventory=false&sort=title&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: CuubLocationRow[];
      count?: number;
    } | null;
    if (!res.ok || !json?.success || !Array.isArray(json.data)) {
      throw new Error(`GET /locations failed with ${res.status}`);
    }
    rows.push(...json.data);
    const total = typeof json.count === "number" ? json.count : rows.length;
    if (json.data.length < PAGE_SIZE || rows.length >= total) break;
  }
  return rows.map(adaptLocationRow).filter((r): r is RouteLocationBase => r != null);
}

async function fetchPublicLocations(baseUrl: string): Promise<RouteLocationBase[]> {
  const res = await fetch(`${baseUrl}/map`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: CuubMapRow[];
  } | null;
  if (!res.ok || !json?.success || !Array.isArray(json.data)) {
    throw new Error(`GET /map failed with ${res.status}`);
  }
  return json.data
    .filter((row) => row.hasStation !== false)
    .map((row): RouteLocationBase | null => {
      const latitude = toCoord(row.latitude);
      const longitude = toCoord(row.longitude);
      if (!validCoords(latitude, longitude)) return null;
      return {
        locationId: row.locationId,
        title: row.title,
        latitude,
        longitude: longitude as number,
        onCuubSoftware: false,
      };
    })
    .filter((r): r is RouteLocationBase => r != null);
}

/**
 * Every location that has a pin on the main map, with CUUB-software status
 * derived from live station app versions. Falls back to public GET /map
 * (all grey) when machine auth is unavailable.
 */
export async function fetchRouteLocations(): Promise<RouteLocationBase[]> {
  const baseUrl = cuubApiUrl();
  if (!baseUrl) {
    console.warn("[route] CUUB_API_URL is not configured");
    return [];
  }

  const token = cuubApiToken();
  if (token) {
    try {
      return await fetchAuthedLocations(baseUrl, token);
    } catch (err) {
      console.warn("[route] authed locations fetch failed; falling back to GET /map:", err);
    }
  } else {
    console.warn("[route] no CUUB_API_TOKEN; falling back to GET /map (software status unknown)");
  }

  try {
    return await fetchPublicLocations(baseUrl);
  } catch (err) {
    console.warn("[route] GET /map fallback failed:", err);
    return [];
  }
}
