export type StationStatus = 'open' | 'closed';

export type Station = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  /** Batteries currently in the cabinet (maps to filled_slots / live.batteryCount). */
  batteriesAvailable: number;
  openSlots?: number;
  /** Cabinet capacity when known (e.g. 6 from SLOT_6_*). */
  slotCapacity?: number;
  online?: boolean;
  /** Venue is seasonally inactive (location.status === INACTIVE). */
  locationInactive?: boolean;
  hasStation?: boolean;
  /** True when live Energo enrichment was present on the row. */
  hasLiveData?: boolean;
  status: StationStatus;
  hours: string;
  imageUri?: string;
  manufactureId?: string;
  locationId?: string;
  stationType?: string;
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};
