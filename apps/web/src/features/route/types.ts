import type { LocationHours } from "@/lib/locationHours";
import type { RouteLocationBase } from "@/lib/routeLocations";

export interface RouteLocation extends RouteLocationBase {
  hours: LocationHours | null;
}
