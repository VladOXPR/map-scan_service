import type { DayWindow, LocationHours } from "@/lib/locationHours";

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export interface ChicagoNow {
  weekday: Weekday;
  /** Minutes since local midnight, 0–1439. */
  minutes: number;
}

const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const chicagoFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function chicagoNow(date: Date = new Date()): ChicagoNow {
  const parts = chicagoFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday").slice(0, 3).toLowerCase() as Weekday;
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return { weekday, minutes: hour * 60 + minute };
}

/** "HH:MM" → minutes since midnight; "24:00" → 1440. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function windowFor(hours: LocationHours, day: Weekday): DayWindow {
  if (day === "tue") return hours.tue;
  if (day === "wed") return hours.wed;
  return null;
}

export function isOpenNow(hours: LocationHours | null | undefined, now: ChicagoNow): boolean {
  if (!hours || hours.hours_unknown) return false;

  const today = windowFor(hours, now.weekday);
  if (today) {
    const open = toMinutes(today[0]);
    const close = toMinutes(today[1]);
    if (close > open ? open <= now.minutes && now.minutes < close : now.minutes >= open) {
      return true;
    }
  }

  const yesterdayIdx = (WEEKDAYS.indexOf(now.weekday) + 6) % 7;
  const yesterday = windowFor(hours, WEEKDAYS[yesterdayIdx]);
  if (yesterday) {
    const open = toMinutes(yesterday[0]);
    const close = toMinutes(yesterday[1]);
    if (close <= open && now.minutes < close) return true;
  }

  return false;
}

function to12Hour(hhmm: string): string {
  const minutes = toMinutes(hhmm) % 1440;
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatWindow(window: DayWindow): string {
  if (!window) return "Closed";
  if (window[0] === "00:00" && window[1] === "24:00") return "Open 24 hours";
  return `${to12Hour(window[0])} – ${to12Hour(window[1])}`;
}
