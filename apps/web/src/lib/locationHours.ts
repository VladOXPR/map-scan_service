import hoursFile from "@/data/location-hours.json";

/** [open, close] in 24-hour America/Chicago time; null = closed that day. */
export type DayWindow = [string, string] | null;

export interface LocationHours {
  name: string;
  tue: DayWindow;
  wed: DayWindow;
  hours_unknown?: boolean;
  note?: string;
}

export type LocationHoursMap = Record<string, LocationHours>;

/** Hours keyed by location_id. Async so the static file can become a DB table. */
export async function getLocationHours(): Promise<LocationHoursMap> {
  return hoursFile as unknown as LocationHoursMap;
}
