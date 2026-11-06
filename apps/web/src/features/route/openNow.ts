import { formatDayHours, isOpenAt, type Weekday } from "@cuub/core";
import type { LocationHours } from "@/lib/locationHours";

/** Unknown hours count as closed on the route map. */
export function isOpenNow(hours: LocationHours | null | undefined, now: Date): boolean {
  if (!hours || hours.hours_unknown) return false;
  return isOpenAt(hours, hours.timezone, now) === true;
}

export function formatWindow(hours: LocationHours, day: Weekday): string {
  return formatDayHours(hours[day]);
}
