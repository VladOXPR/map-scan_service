import type { Coords, Station } from "../types";

type LivePayload = {
  online?: boolean | null;
  batteryCount?: string | number | null;
  openSlots?: string | number | null;
} | null;

/** Public GET /map and GET /map/live row. */
export type MapLocationRow = {
  location_id?: string;
  locationId?: string;
  id?: string;
  title?: string;
  name?: string;
  address?: string;
  latitude?: string | number;
  longitude?: string | number;
  has_station?: boolean;
  hasStation?: boolean;
  /** Present on /map/live only; null = unknown availability. */
  live?: LivePayload;
};

/** Machine-auth GET /stations?include_live=true row. */
export type FoundationStationRow = {
  stationId?: string;
  id?: string;
  manufactureId?: string;
  type?: string;
  status?: string;
  currentLocation?: {
    locationId?: string;
    title?: string;
    address?: string;
    latitude?: string | number | null;
    longitude?: string | number | null;
    isInventory?: boolean;
    status?: string;
  } | null;
  currentLocationId?: string;
  live?: LivePayload;
};

/** Machine-auth GET /locations row (inactive venue merge). */
export type LocationRow = {
  locationId?: string;
  id?: string;
  title?: string;
  name?: string;
  address?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  isInventory?: boolean;
  status?: string;
  hasStation?: boolean;
  has_station?: boolean;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function hasValidCoordinates(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) > 0.01 &&
    Math.abs(lng) > 0.01
  );
}

/** SLOT_6_WHITE → 6, SLOT_24_BLACK → 24. */
export function slotCapacityFromType(type?: string | null): number | undefined {
  if (!type) return undefined;
  const match = type.match(/SLOT[_\s-]?(\d+)/i);
  if (!match) return undefined;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function mapMapLocation(row: MapLocationRow): Station | null {
  const latitude = toNumber(row.latitude);
  const longitude = toNumber(row.longitude);
  if (!hasValidCoordinates(latitude, longitude)) return null;

  const locationId = String(row.location_id ?? row.locationId ?? row.id ?? "");
  if (!locationId) return null;

  const hasStation = Boolean(row.has_station ?? row.hasStation ?? true);
  if (!hasStation) return null;

  const live = row.live ?? null;
  const hasLiveData = live != null;
  const online = hasLiveData ? Boolean(live.online) : true;
  const filled = hasLiveData ? Math.max(0, Math.round(toNumber(live.batteryCount, 0))) : 0;
  const open = hasLiveData ? Math.max(0, Math.round(toNumber(live.openSlots, 0))) : undefined;
  const slotCapacity =
    hasLiveData && open != null && filled + open > 0 ? filled + open : undefined;

  return {
    id: locationId,
    locationId,
    name: (row.title ?? row.name)?.trim() || "CUUB Station",
    address: row.address?.trim() || "Address unavailable",
    latitude,
    longitude,
    batteriesAvailable: filled,
    openSlots: open,
    slotCapacity,
    online,
    hasStation,
    hasLiveData,
    status: hasLiveData ? (online ? "open" : "closed") : "open",
    hours: !hasLiveData ? "Availability unknown" : online ? "Online now" : "Station offline",
  };
}

export function mapFoundationStation(row: FoundationStationRow): Station | null {
  const loc = row.currentLocation;
  if (!loc || loc.isInventory) return null;
  if (String(loc.status ?? "").toUpperCase() === "ARCHIVED") return null;

  const latitude = toNumber(loc.latitude);
  const longitude = toNumber(loc.longitude);
  if (!hasValidCoordinates(latitude, longitude)) return null;

  const stationId = String(row.stationId ?? row.id ?? "");
  const locationId = String(loc.locationId ?? row.currentLocationId ?? "");
  if (!stationId && !locationId) return null;

  const locationInactive = String(loc.status ?? "").toUpperCase() === "INACTIVE";
  const live = locationInactive ? null : row.live ?? null;
  const hasLiveData = live != null;
  const online = hasLiveData ? Boolean(live.online) : false;
  const filled = hasLiveData ? Math.max(0, Math.round(toNumber(live.batteryCount, 0))) : 0;
  const open = hasLiveData ? Math.max(0, Math.round(toNumber(live.openSlots, 0))) : undefined;
  const liveSum = hasLiveData && open != null && filled + open > 0 ? filled + open : undefined;
  const slotCapacity = liveSum ?? slotCapacityFromType(row.type) ?? 6;

  return {
    id: locationId || stationId,
    stationType: row.type,
    manufactureId: row.manufactureId,
    locationId: locationId || undefined,
    name: loc.title?.trim() || "CUUB Station",
    address: loc.address?.trim() || "Address unavailable",
    latitude,
    longitude,
    batteriesAvailable: filled,
    openSlots: open,
    slotCapacity,
    online,
    locationInactive,
    hasStation: true,
    hasLiveData,
    status: online && !locationInactive ? "open" : "closed",
    hours: locationInactive
      ? "Temporarily unavailable"
      : !hasLiveData
        ? "Availability unknown"
        : online
          ? "Online now"
          : "Station offline",
  };
}

export function mapInactiveLocation(row: LocationRow): Station | null {
  if (row.isInventory) return null;
  if (String(row.status ?? "").toUpperCase() !== "INACTIVE" && row.status != null) return null;
  const latitude = toNumber(row.latitude);
  const longitude = toNumber(row.longitude);
  if (!hasValidCoordinates(latitude, longitude)) return null;

  const locationId = String(row.locationId ?? row.id ?? "");
  if (!locationId) return null;

  return {
    id: locationId,
    locationId,
    name: (row.title ?? row.name)?.trim() || "CUUB Station",
    address: row.address?.trim() || "Address unavailable",
    latitude,
    longitude,
    batteriesAvailable: 0,
    openSlots: undefined,
    online: false,
    locationInactive: true,
    hasStation: Boolean(row.hasStation ?? row.has_station),
    hasLiveData: false,
    status: "closed",
    hours: "Temporarily unavailable",
  };
}

function compact<T>(rows: Array<T | null>): T[] {
  return rows.filter((row): row is T => row != null);
}

export function mapMapLocations(rows: MapLocationRow[]): Station[] {
  return compact(rows.map(mapMapLocation));
}

export function mapFoundationStations(rows: FoundationStationRow[]): Station[] {
  return compact(rows.map(mapFoundationStation));
}

export function mapInactiveLocations(rows: LocationRow[]): Station[] {
  return compact(rows.map(mapInactiveLocation));
}

/** Prefer live stations; append inactive locations not already represented. */
export function mergeStationsWithInactive(stations: Station[], inactive: Station[]): Station[] {
  const seen = new Set(stations.map((s) => s.locationId ?? s.id));
  const extras = inactive.filter((loc) => !seen.has(loc.locationId ?? loc.id));
  return [...stations, ...extras];
}

export function stationCoords(station: Station): Coords | null {
  const { latitude, longitude } = station;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

/** Offline cabinet or seasonally inactive venue. */
export function isStationUnavailable(station: Station): boolean {
  return station.online === false || station.locationInactive === true;
}

export interface StationDetails {
  coords: Coords | null;
  /** Live cabinet counts are present for this station. */
  hasLive: boolean;
  slotCount: number;
  powerbanks: number;
  slotsToReturn: number;
  unavailable: boolean;
}

export function getStationDetails(station: Station): StationDetails {
  const hasLive = station.hasLiveData === true && station.locationInactive !== true;
  const powerbanks = hasLive ? Math.max(0, Math.round(station.batteriesAvailable)) : 0;
  const open = hasLive ? station.openSlots : undefined;

  let slotCount = station.slotCapacity ?? 6;
  if (hasLive && open != null && powerbanks + open > 0) slotCount = powerbanks + open;

  return {
    coords: stationCoords(station),
    hasLive,
    slotCount,
    powerbanks,
    slotsToReturn: open ?? Math.max(0, slotCount - powerbanks),
    unavailable: isStationUnavailable(station),
  };
}
