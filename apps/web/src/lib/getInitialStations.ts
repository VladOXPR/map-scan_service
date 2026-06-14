import { unstable_cache } from "next/cache";
import type { Station } from "@cuub/shared";
import { proxyCuub } from "./cuubApi";

// Battery slot counts change on minute timescales — 5 min is a sane upper
// bound for staleness while keeping cache hits the common case. The upstream
// CUUB API takes ~1.4s per call (HAR-confirmed); cached hits return in <5ms.
export const STATIONS_REVALIDATE_SECONDS = 300;

export const getCachedStationsResult = unstable_cache(
  () => proxyCuub({ path: "/stations", method: "GET" }),
  ["stations"],
  { revalidate: STATIONS_REVALIDATE_SECONDS, tags: ["stations"] }
);

// Server-side helper for Server Components. Returns [] on any failure so a
// flaky upstream never blocks the page render — the client-side refresh in
// MapView will retry.
export async function getInitialStations(): Promise<Station[]> {
  try {
    const { payload } = await getCachedStationsResult();
    const data = (payload as { data?: Station[] } | null)?.data;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
