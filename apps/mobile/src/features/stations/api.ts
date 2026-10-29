import { apiGet, ApiError } from '@/lib/apiClient';
import type { Station } from '@/types/station';
import { mapMapLocations } from '@cuub/core';

function mapPins(data: unknown): Station[] {
  if (!Array.isArray(data)) return [];
  return mapMapLocations(data as Parameters<typeof mapMapLocations>[0]);
}

/** Public GET /map — pins only, no Energo. */
async function fetchPublicMapPins(): Promise<Station[]> {
  const { data } = await apiGet<unknown[]>('/map');
  return mapPins(data);
}

/**
 * Public GET /map/live — same pins + live { online, batteryCount, openSlots } | null.
 * No auth. Server-side Energo; live: null means unknown (still show pin).
 */
async function fetchPublicMapLive(): Promise<Station[]> {
  const { data } = await apiGet<unknown[]>('/map/live');
  return mapPins(data);
}

/**
 * Customer map:
 * 1. Prefer GET /map/live (pins + slot/online when live is non-null)
 * 2. On network / non-2xx → GET /map (pins without counts)
 *
 * Never send MACHINE_API_TOKEN or call GET /stations?include_live=true.
 */
export async function fetchNearbyStations(): Promise<Station[]> {
  try {
    return await fetchPublicMapLive();
  } catch (error) {
    if (!(error instanceof ApiError) && !(error instanceof TypeError)) {
      throw error;
    }
  }

  try {
    return await fetchPublicMapPins();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

export async function fetchStationById(id: string): Promise<Station | null> {
  const stations = await fetchNearbyStations();
  return stations.find((station) => String(station.id) === String(id)) ?? null;
}
