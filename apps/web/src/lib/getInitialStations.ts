import type { Station } from "@cuub/shared";
import { fetchMapStations } from "./cuubApi";

// Map pins from cuub-api GET /map (DB only). Keep HTTP cache short in the route handler.
export const STATIONS_REVALIDATE_SECONDS = 60;

export async function getStationsResult() {
  return fetchMapStations();
}

export async function getInitialStations(): Promise<Station[]> {
  try {
    const { payload } = await getStationsResult();
    const data = (payload as { data?: Station[] } | null)?.data;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
