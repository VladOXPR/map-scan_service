#!/usr/bin/env node
// Read-only: lists /route pins that have no usable hours in location-hours.json.
// Usage: CUUB_API_URL=https://platform.cuub.tech [CUUB_API_TOKEN=...] node scripts/list-missing-hours.mjs
// Without a token only public GET /map pins (active venues with a station) are checked.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const hours = JSON.parse(
  readFileSync(join(root, "apps/web/src/data/location-hours.json"), "utf8")
);

const IGNORED_NAME = /^CSU Long Beach/i;
const baseUrl = process.env.CUUB_API_URL?.trim().replace(/\/$/, "");
const token = process.env.CUUB_API_TOKEN?.trim() || process.env.MACHINE_API_TOKEN?.trim();

if (!baseUrl) {
  console.error("Set CUUB_API_URL");
  process.exit(1);
}

const validCoords = (lat, lng) =>
  lat != null && lng != null && Number.isFinite(+lat) && Number.isFinite(+lng) && !(+lat === 0 && +lng === 0);

async function authedPins() {
  const rows = [];
  for (let offset = 0; offset < 10_000; offset += 200) {
    const res = await fetch(
      `${baseUrl}/locations?is_inventory=false&sort=title&limit=200&offset=${offset}`,
      { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }
    );
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(`GET /locations ${res.status}`);
    rows.push(...json.data);
    if (json.data.length < 200 || rows.length >= (json.count ?? rows.length)) break;
  }
  return rows.filter((r) => {
    const status = String(r.status ?? "").toUpperCase();
    if (r.isInventory || status === "ARCHIVED") return false;
    if ((r.stations ?? []).length === 0 && status !== "INACTIVE") return false;
    return validCoords(r.latitude, r.longitude);
  });
}

async function publicPins() {
  const res = await fetch(`${baseUrl}/map`, { headers: { Accept: "application/json" } });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(`GET /map ${res.status}`);
  return json.data.filter((r) => r.hasStation !== false && validCoords(r.latitude, r.longitude));
}

const pins = token ? await authedPins() : await publicPins();
const missing = pins
  .filter((p) => !IGNORED_NAME.test(p.title ?? ""))
  .map((p) => {
    const entry = hours[p.locationId];
    if (!entry) return { ...p, reason: "not in file" };
    if (entry.hours_unknown) return { ...p, reason: "hours_unknown" };
    return null;
  })
  .filter(Boolean)
  .sort((a, b) => String(a.title).localeCompare(String(b.title)));

console.log(`Source: ${token ? "GET /locations (authed)" : "GET /map (public)"} — ${pins.length} pins`);
console.log(`${missing.length} pinned location(s) need hours:`);
for (const m of missing) console.log(`  ${m.locationId}  ${m.title}  (${m.reason})`);
