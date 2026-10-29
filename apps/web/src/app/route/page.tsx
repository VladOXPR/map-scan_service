import { RouteMapView } from "@/features/route/RouteMapView";
import type { RouteLocation } from "@/features/route/types";
import { getLocationHours } from "@/lib/locationHours";
import { fetchRouteLocations } from "@/lib/routeLocations";

export const dynamic = "force-dynamic";

export default async function RoutePage() {
  const [locations, hours] = await Promise.all([
    fetchRouteLocations(),
    getLocationHours(),
  ]);
  const joined: RouteLocation[] = locations.map((location) => ({
    ...location,
    hours: hours[location.locationId] ?? null,
  }));
  return <RouteMapView locations={joined} />;
}
