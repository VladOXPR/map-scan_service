export interface Coords {
  latitude: number;
  longitude: number;
}

export type StationStatus = "open" | "closed";

/**
 * One map pin per venue. `id` is always the cuub-api `locationId`, on the app
 * and on the website, so a pin means the same thing everywhere.
 */
export interface Station {
  id: string;
  locationId?: string;
  manufactureId?: string;
  stationType?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  /** Power banks in the cabinet right now (live.batteryCount). */
  batteriesAvailable: number;
  openSlots?: number;
  /** Cabinet capacity when known (6 from SLOT_6_*). */
  slotCapacity?: number;
  online?: boolean;
  /** Venue is seasonally inactive (location.status === INACTIVE). */
  locationInactive?: boolean;
  hasStation?: boolean;
  /** Live cabinet counts were present on the row. */
  hasLiveData?: boolean;
  status: StationStatus;
  hours: string;
  imageUri?: string;
}

export interface BatteryData {
  duration?: string;
  amountPaid?: number | string;
  manufacture_id?: string;
  sticker_id?: string;
  startTime?: string | null;
  returnTime?: string | null;
  type?: string;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  count?: number;
  error?: string;
  message?: string;
}

export type StationsResponse = ApiEnvelope<Station[]>;
export type BatteryResponse = ApiEnvelope<BatteryData>;
export type MapboxTokenResponse = { token: string } | { error: string };
