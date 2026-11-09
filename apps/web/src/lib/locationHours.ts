import type { WeeklyHours } from "@cuub/core";
import hoursFile from "@/data/location-hours.json";

/**
 * One venue in location-hours.json: `[[open, close], ...]` per day in 24-hour
 * local time, `[]` = closed that day, missing day = unknown. Also the input to
 * cuub-api `npm run import:location-hours`.
 */
export type LocationHours = WeeklyHours & {
  name: string;
  /** IANA timezone; America/Chicago when missing. */
  timezone?: string;
  hours_unknown?: boolean;
  note?: string;
};

export type LocationHoursMap = Record<string, LocationHours>;

/** Hours keyed by location_id. Async so the static file can become a DB table. */
export async function getLocationHours(): Promise<LocationHoursMap> {
  return hoursFile as unknown as LocationHoursMap;
}
