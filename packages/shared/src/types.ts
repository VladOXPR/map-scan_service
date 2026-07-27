export interface Station {
  id: string | number;
  title?: string;
  latitude: string | number;
  longitude: string | number;
  filled_slots?: number | string | null;
  open_slots?: number | string | null;
  /** true/false when Energo live data is present; null when unknown / token down */
  online?: boolean | null;
  /** true when the venue location is INACTIVE (shown at reduced opacity) */
  inactive?: boolean;
}

export interface Coords {
  latitude: number;
  longitude: number;
}

export interface BatteryData {
  duration?: string;
  amountPaid?: number | string;
  manufacture_id?: string;
  type?: string;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type StationsResponse = ApiEnvelope<Station[]>;
export type BatteryResponse = ApiEnvelope<BatteryData>;
export type MapboxTokenResponse = { token: string } | { error: string };
