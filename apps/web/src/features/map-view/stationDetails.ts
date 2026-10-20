import type { Coords, Station } from "@cuub/shared";

export interface StationDetails {
  coords: Coords | null;
  /** Live Energo counts are present for this station. */
  hasLive: boolean;
  slotCount: number;
  powerbanks: number;
  slotsToReturn: number;
  /** Offline cabinet or seasonally inactive venue. */
  unavailable: boolean;
}

function toCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

export function stationCoords(station: Station): Coords | null {
  const latitude = Number(station.latitude);
  const longitude = Number(station.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export function isStationUnavailable(station: Station): boolean {
  return station.online === false || station.inactive === true;
}

export function getStationDetails(station: Station): StationDetails {
  const filled = toCount(station.filled_slots);
  const open = toCount(station.open_slots);
  const hasLive = station.inactive !== true && (filled != null || open != null);

  let slotCount = station.slot_capacity ?? 6;
  if (hasLive && open != null && (filled ?? 0) + open > 0) {
    slotCount = (filled ?? 0) + open;
  }

  const powerbanks = filled ?? 0;
  return {
    coords: stationCoords(station),
    hasLive,
    slotCount,
    powerbanks,
    slotsToReturn: open ?? Math.max(0, slotCount - powerbanks),
    unavailable: isStationUnavailable(station),
  };
}
