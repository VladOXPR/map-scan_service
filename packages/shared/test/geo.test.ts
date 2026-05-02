import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDistance, haversineMeters, nearestStation } from "../src/geo";
import { pickNearestStation } from "../src/nearest";
import {
  buildDirectionsUrl,
  buildSupportSmsUrl,
  detectWebPlatform,
} from "../src/directions";

test("haversineMeters: zero between same point", () => {
  const d = haversineMeters(
    { latitude: 41.9295, longitude: -87.65 },
    { latitude: 41.9295, longitude: -87.65 }
  );
  assert.equal(d, 0);
});

test("haversineMeters: ~111km per degree of latitude near equator", () => {
  const d = haversineMeters(
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 }
  );
  assert.ok(d > 110000 && d < 112000, `expected ~111km, got ${d}`);
});

test("nearestStation: returns nearest by haversine", () => {
  const stations = [
    { id: "a", latitude: 41.85, longitude: -87.65 },
    { id: "b", latitude: 41.93, longitude: -87.65 },
    { id: "c", latitude: 42.05, longitude: -87.65 },
  ];
  const result = nearestStation({ latitude: 41.9295, longitude: -87.65 }, stations);
  assert.ok(result);
  assert.equal(result?.station.id, "b");
});

test("nearestStation: returns null on empty list", () => {
  assert.equal(nearestStation({ latitude: 0, longitude: 0 }, []), null);
});

test("pickNearestStation: marks far stations and formats distance text", () => {
  const stations = [
    { id: "near", latitude: 41.93, longitude: -87.65 },
    { id: "far", latitude: 0, longitude: 0 },
  ];
  const result = pickNearestStation(
    { latitude: 41.9295, longitude: -87.65 },
    stations
  );
  assert.ok(result);
  assert.equal(result?.station.id, "near");
  assert.equal(result?.isFar, false);
  assert.match(result!.distanceText, /\b(m|km)\b/);
});

test("formatDistance: meters under 1km, km otherwise", () => {
  assert.equal(formatDistance(450), "450 m");
  assert.equal(formatDistance(2500), "2.5 km");
  assert.equal(formatDistance(15500), "16 km");
});

test("detectWebPlatform: classifies UAs", () => {
  assert.equal(detectWebPlatform("Mozilla iPhone Safari"), "ios");
  assert.equal(
    detectWebPlatform("Mozilla Linux Android Chrome"),
    "android"
  );
  assert.equal(detectWebPlatform("Mozilla Macintosh Safari"), "web");
});

test("buildDirectionsUrl: per-platform schemes", () => {
  assert.equal(
    buildDirectionsUrl(41.9, -87.65, "ios"),
    "maps://maps.google.com/maps?daddr=41.9,-87.65"
  );
  assert.equal(
    buildDirectionsUrl(41.9, -87.65, "android"),
    "google.navigation:q=41.9,-87.65"
  );
  assert.equal(
    buildDirectionsUrl(41.9, -87.65, "web"),
    "https://maps.google.com/maps?daddr=41.9,-87.65"
  );
});

test("buildSupportSmsUrl: encodes sticker id into body", () => {
  assert.equal(buildSupportSmsUrl("+14642377449"), "sms:+14642377449");
  assert.equal(
    buildSupportSmsUrl("+14642377449", "ABC123"),
    "sms:+14642377449?body=The%20number%20on%20my%20battery%20is%20ABC123"
  );
});
