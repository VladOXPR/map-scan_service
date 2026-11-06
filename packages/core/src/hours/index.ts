/** Venue opening hours from cuub-api `locations.hours` / `locations.timezone`. */

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
/** `[open, close]` as 24-hour "HH:MM" venue-local time; close ≤ open runs past midnight. */
export type HoursWindow = [string, string];
/** Per day: windows, `[]` = closed all day, missing = unknown. */
export type WeeklyHours = Partial<Record<Weekday, HoursWindow[]>>;

export const WEEKDAYS: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DEFAULT_TIMEZONE = "America/Chicago";

const SHORT_DAY: Record<Weekday, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

export interface LocalTime {
  /** 0 = Sunday. */
  day: number;
  /** Minutes since local midnight, 0–1439. */
  minutes: number;
}

export function localTime(date: Date, timezone: string = DEFAULT_TIMEZONE): LocalTime {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = formatterFor(timezone);
  } catch {
    formatter = formatterFor(DEFAULT_TIMEZONE);
  }
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = WEEKDAYS.indexOf(get("weekday").slice(0, 3).toLowerCase() as Weekday);
  const minutes = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  return { day, minutes };
}

/** "HH:MM" → minutes since midnight; "24:00" → 1440. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function windowsFor(hours: WeeklyHours, day: number): HoursWindow[] | undefined {
  const windows = hours[WEEKDAYS[(day + 7) % 7]];
  return Array.isArray(windows) ? windows : undefined;
}

function isOvernight([open, close]: HoursWindow): boolean {
  return toMinutes(close) <= toMinutes(open);
}

/** true/false when the venue's hours say so; null when hours for right now are unknown. */
export function isOpenAt(
  hours: WeeklyHours | null | undefined,
  timezone: string | null | undefined,
  date: Date = new Date()
): boolean | null {
  if (!hours) return null;
  const { day, minutes } = localTime(date, timezone || DEFAULT_TIMEZONE);

  const yesterday = windowsFor(hours, day - 1);
  if (yesterday?.some((w) => isOvernight(w) && minutes < toMinutes(w[1]))) return true;

  const today = windowsFor(hours, day);
  if (!today) return null;
  return today.some((w) => {
    const open = toMinutes(w[0]);
    return isOvernight(w) ? minutes >= open : open <= minutes && minutes < toMinutes(w[1]);
  });
}

export interface NextOpening {
  weekday: Weekday;
  /** 0 = later today, 1 = tomorrow, … */
  daysAhead: number;
  /** "HH:MM" venue-local. */
  time: string;
}

/** Next time the venue opens within the coming week, skipping days with unknown hours. */
export function nextOpening(
  hours: WeeklyHours | null | undefined,
  timezone: string | null | undefined,
  date: Date = new Date()
): NextOpening | null {
  if (!hours) return null;
  const { day, minutes } = localTime(date, timezone || DEFAULT_TIMEZONE);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const windows = windowsFor(hours, day + ahead);
    if (!windows) continue;
    const opens = windows
      .map((w) => toMinutes(w[0]))
      .filter((open) => ahead > 0 || open > minutes)
      .sort((a, b) => a - b);
    if (opens.length > 0) {
      const open = opens[0];
      const time = `${String(Math.floor(open / 60)).padStart(2, "0")}:${String(open % 60).padStart(2, "0")}`;
      return { weekday: WEEKDAYS[(day + ahead) % 7], daysAhead: ahead, time };
    }
  }
  return null;
}

/** "16:00" → "4:00 PM". */
export function to12Hour(hhmm: string): string {
  const minutes = toMinutes(hhmm) % 1440;
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "4:00 PM – 2:00 AM", "Open 24 hours", "Closed", or "Hours unknown" for one day's windows. */
export function formatDayHours(windows: HoursWindow[] | null | undefined): string {
  if (!windows) return "Hours unknown";
  if (windows.length === 0) return "Closed";
  return windows
    .map(([open, close]) =>
      open === "00:00" && (close === "24:00" || close === "00:00")
        ? "Open 24 hours"
        : `${to12Hour(open)} – ${to12Hour(close)}`
    )
    .join(", ");
}

/** "Opens 4:00 PM", "Opens tomorrow 11:30 AM", "Opens Mon 7:00 AM"; null if unknown. */
export function formatOpensLabel(next: NextOpening | null): string | null {
  if (!next) return null;
  const time = to12Hour(next.time);
  if (next.daysAhead === 0) return `Opens ${time}`;
  if (next.daysAhead === 1) return `Opens tomorrow ${time}`;
  return `Opens ${SHORT_DAY[next.weekday]} ${time}`;
}
