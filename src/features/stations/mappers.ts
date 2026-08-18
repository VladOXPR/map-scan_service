import type { Station } from '@/types/station';

type LegacyStationRow = {
  id?: string | number;
  title?: string;
  address?: string;
  latitude?: string | number;
  longitude?: string | number;
  filled_slots?: string | number | null;
  open_slots?: string | number | null;
  online?: boolean | null;
};

type LivePayload = {
  online?: boolean | null;
  batteryCount?: string | number | null;
  openSlots?: string | number | null;
} | null;

/** Public GET /map and GET /map/live row. */
type MapLocationRow = {
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

/** GET /stations?include_live=true row (foundation API). */
type FoundationStationRow = {
  stationId?: string;
  id?: string;
  manufactureId?: string;
  type?: string;
  status?: string;
  currentLocation?: {
    locationId?: string;
    title?: string;
    address?: string;
    latitude?: string | number;
    longitude?: string | number;
    isInventory?: boolean;
    status?: string;
  } | null;
  currentLocationId?: string;
  live?: LivePayload;
};

/** GET /locations row (inactive merge). */
type LocationRow = {
  locationId?: string;
  id?: string;
  title?: string;
  name?: string;
  address?: string;
  latitude?: string | number;
  longitude?: string | number;
  isInventory?: boolean;
  status?: string;
  hasStation?: boolean;
  has_station?: boolean;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
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

/** Parse SLOT_6_WHITE → 6, SLOT_8_* → 8, etc. */
export function slotCapacityFromType(type?: string | null): number | undefined {
  if (!type) return undefined;
  const match = type.match(/SLOT[_\s-]?(\d+)/i);
  if (!match) return undefined;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function mapLegacyStation(row: LegacyStationRow): Station | null {
  const latitude = toNumber(row.latitude);
  const longitude = toNumber(row.longitude);
  if (!hasValidCoordinates(latitude, longitude)) return null;

  const id = String(row.id ?? '');
  if (!id) return null;

  const filled = Math.max(0, Math.round(toNumber(row.filled_slots, 0)));
  const open = Math.max(0, Math.round(toNumber(row.open_slots, 0)));
  const online = Boolean(row.online);

  return {
    id,
    manufactureId: id,
    name: row.title?.trim() || 'CUUB Station',
    address: row.address?.trim() || 'Address unavailable',
    latitude,
    longitude,
    batteriesAvailable: filled,
    openSlots: open,
    slotCapacity: filled + open > 0 ? filled + open : 6,
    online,
    hasStation: true,
    hasLiveData: true,
    status: online ? 'open' : 'closed',
    hours: online ? 'Online now' : 'Station offline',
  };
}

export function mapMapLocation(row: MapLocationRow): Station | null {
  const latitude = toNumber(row.latitude);
  const longitude = toNumber(row.longitude);
  if (!hasValidCoordinates(latitude, longitude)) return null;

  const locationId = String(row.location_id ?? row.locationId ?? row.id ?? '');
  if (!locationId) return null;

  const hasStation = Boolean(row.has_station ?? row.hasStation ?? true);
  if (!hasStation) return null;

  const live = row.live ?? null;
  const hasLiveData = live != null;
  const online = hasLiveData ? Boolean(live.online) : true;
  const filled = hasLiveData
    ? Math.max(0, Math.round(toNumber(live.batteryCount, 0)))
    : 0;
  const open = hasLiveData
    ? Math.max(0, Math.round(toNumber(live.openSlots, 0)))
    : undefined;
  const slotCapacity =
    hasLiveData && open != null && filled + open > 0
      ? filled + open
      : undefined;

  return {
    id: locationId,
    locationId,
    name: (row.title ?? row.name)?.trim() || 'CUUB Station',
    address: row.address?.trim() || 'Address unavailable',
    latitude,
    longitude,
    batteriesAvailable: filled,
    openSlots: open,
    slotCapacity,
    online,
    hasStation,
    hasLiveData,
    status: hasLiveData ? (online ? 'open' : 'closed') : 'open',
    hours: !hasLiveData
      ? 'Availability unknown'
      : online
        ? 'Online now'
        : 'Station offline',
  };
}

export function mapFoundationStation(row: FoundationStationRow): Station | null {
  const loc = row.currentLocation;
  if (!loc || loc.isInventory) return null;

  const latitude = toNumber(loc.latitude);
  const longitude = toNumber(loc.longitude);
  if (!hasValidCoordinates(latitude, longitude)) return null;

  const stationId = String(row.stationId ?? row.id ?? '');
  const locationId = String(loc.locationId ?? row.currentLocationId ?? '');
  if (!stationId && !locationId) return null;

  const live = row.live ?? null;
  const hasLiveData = live != null;
  const online = hasLiveData ? Boolean(live.online) : false;
  const filled = hasLiveData
    ? Math.max(0, Math.round(toNumber(live.batteryCount, 0)))
    : 0;
  const open = hasLiveData
    ? Math.max(0, Math.round(toNumber(live.openSlots, 0)))
    : undefined;
  const liveSum =
    hasLiveData && open != null && filled + open > 0 ? filled + open : undefined;
  const slotCapacity = liveSum ?? slotCapacityFromType(row.type) ?? 6;

  const locationInactive = String(loc.status ?? '').toUpperCase() === 'INACTIVE';

  return {
    id: stationId || locationId,
    stationType: row.type,
    manufactureId: row.manufactureId,
    locationId: locationId || undefined,
    name: loc.title?.trim() || 'CUUB Station',
    address: loc.address?.trim() || 'Address unavailable',
    latitude,
    longitude,
    batteriesAvailable: filled,
    openSlots: open,
    slotCapacity,
    online,
    locationInactive,
    hasStation: true,
    hasLiveData,
    status: online && !locationInactive ? 'open' : 'closed',
    hours: locationInactive
      ? 'Temporarily unavailable'
      : !hasLiveData
        ? 'Availability unknown'
        : online
          ? 'Online now'
          : 'Station offline',
  };
}

export function mapInactiveLocation(row: LocationRow): Station | null {
  if (row.isInventory) return null;
  const latitude = toNumber(row.latitude);
  const longitude = toNumber(row.longitude);
  if (!hasValidCoordinates(latitude, longitude)) return null;

  const locationId = String(row.locationId ?? row.id ?? '');
  if (!locationId) return null;

  return {
    id: `inactive:${locationId}`,
    locationId,
    name: (row.title ?? row.name)?.trim() || 'CUUB Station',
    address: row.address?.trim() || 'Address unavailable',
    latitude,
    longitude,
    batteriesAvailable: 0,
    openSlots: undefined,
    online: false,
    locationInactive: true,
    hasStation: Boolean(row.hasStation ?? row.has_station),
    hasLiveData: false,
    status: 'closed',
    hours: 'Temporarily unavailable',
  };
}

export function mapLegacyStations(rows: LegacyStationRow[]): Station[] {
  return rows
    .map(mapLegacyStation)
    .filter((station): station is Station => station != null);
}

export function mapMapLocations(rows: MapLocationRow[]): Station[] {
  return rows
    .map(mapMapLocation)
    .filter((station): station is Station => station != null);
}

export function mapFoundationStations(rows: FoundationStationRow[]): Station[] {
  return rows
    .map(mapFoundationStation)
    .filter((station): station is Station => station != null);
}

export function mapInactiveLocations(rows: LocationRow[]): Station[] {
  return rows
    .map(mapInactiveLocation)
    .filter((station): station is Station => station != null);
}

/** Prefer live stations; append inactive locations not already represented. */
export function mergeStationsWithInactive(
  stations: Station[],
  inactive: Station[],
): Station[] {
  const seen = new Set(
    stations
      .map((s) => s.locationId)
      .filter((id): id is string => Boolean(id)),
  );
  const extras = inactive.filter(
    (loc) => loc.locationId && !seen.has(loc.locationId),
  );
  return [...stations, ...extras];
}
