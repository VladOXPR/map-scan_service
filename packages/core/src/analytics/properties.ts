import {
  FORBIDDEN_PROPERTY_KEYS,
  MAX_PROPERTY_BYTES,
  MAX_PROPERTY_KEYS,
  MAX_STRING_LENGTH,
  type EventProperties,
  type PropertyValue,
} from "./events";

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATION_CODE_SEGMENT = /^[0-9A-HJKMNP-TV-Z]{8}$/i;
const SERIAL_SEGMENT = /^[A-Z]{2,6}\d{6,}$/i;
const NUMERIC_SEGMENT = /^\d+$/;

function byteLength(value: string): number {
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(value).length : value.length;
}

/**
 * Flattens and trims properties the way cuub-api will accept them: forbidden
 * keys dropped, strings capped, at most 32 keys (earlier keys win), at most
 * 4 KB. `priority` keys (the event's own properties) are placed first.
 */
export function sanitizeProperties(
  priority: EventProperties | undefined,
  context: EventProperties | undefined = undefined
): Record<string, PropertyValue> {
  const out: Record<string, PropertyValue> = {};
  let count = 0;
  const add = (source: EventProperties | undefined) => {
    if (!source) return;
    for (const [key, raw] of Object.entries(source)) {
      if (count >= MAX_PROPERTY_KEYS) return;
      if (raw === undefined || key in out || FORBIDDEN_PROPERTY_KEYS.has(key)) continue;
      let value: PropertyValue;
      if (typeof raw === "string") value = raw.length > MAX_STRING_LENGTH ? raw.slice(0, MAX_STRING_LENGTH) : raw;
      else if (typeof raw === "number") {
        if (!Number.isFinite(raw)) continue;
        value = raw;
      } else if (typeof raw === "boolean" || raw === null) value = raw;
      else continue;
      out[key] = value;
      count += 1;
    }
  };
  add(priority);
  add(context);

  const keys = Object.keys(out);
  while (keys.length > 0 && byteLength(JSON.stringify(out)) > MAX_PROPERTY_BYTES) {
    delete out[keys.pop() as string];
  }
  return out;
}

function templateSegment(segment: string): string {
  if (!segment) return segment;
  if (UUID_SEGMENT.test(segment)) return ":id";
  if (NUMERIC_SEGMENT.test(segment)) return ":n";
  if (SERIAL_SEGMENT.test(segment)) return ":serial";
  if (STATION_CODE_SEGMENT.test(segment) && /\d/.test(segment)) return ":code";
  return segment;
}

/** `/app/rentals/4f1c…?x=1` → `/app/rentals/:id`; ids, codes and serials never reach analytics. */
export function routeTemplate(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] || "/";
  let pathname = withoutQuery;
  if (/^[a-z]+:\/\//i.test(withoutQuery)) {
    try {
      pathname = new URL(withoutQuery).pathname;
    } catch {
      pathname = withoutQuery;
    }
  }
  return pathname.split("/").map(templateSegment).join("/") || "/";
}

/** Screen names from the router pathname, with dynamic segments templated. */
export function screenName(pathname: string): string {
  const template = routeTemplate(pathname).replace(/\/\([^/]+\)/g, "");
  if (template === "" || template === "/") return "/";
  return template.replace(/\/+$/, "");
}
