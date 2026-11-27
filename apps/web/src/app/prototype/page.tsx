import type { Coords } from "@cuub/core";
import { MapView } from "@/features/map-view/MapView";
import { getInitialStations } from "@/lib/getInitialStations";

export const dynamic = "force-dynamic";

/**
 * Fullerton just west of Halsted, the east edge of DePaul's Lincoln Park campus:
 * on a walkway, so the route to the nearest station (Corcoran Hall) is direct.
 */
const DEPAUL: Coords = { latitude: 41.92505, longitude: -87.650205 };

function parseCoord(value: string | undefined, limit: number): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

/** Website demo: a mock user near DePaul with the walking route to the nearest station. */
export default async function Prototype({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string; lat?: string; lng?: string }>;
}) {
  const { embed, lat, lng } = await searchParams;
  const latitude = parseCoord(lat, 90);
  const longitude = parseCoord(lng, 180);
  const mockLocation = latitude != null && longitude != null ? { latitude, longitude } : DEPAUL;
  const initialStations = await getInitialStations();
  return (
    <MapView
      variant="full"
      embedMode={embed === "1"}
      initialStations={initialStations}
      mockLocation={mockLocation}
    />
  );
}
