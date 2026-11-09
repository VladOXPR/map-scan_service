import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDayHours, formatOpensLabel, isOpenAt, nextOpening, type WeeklyHours } from "../src/hours";
import { getStationDetails, isStationUnavailable, mapMapLocation } from "../src/stations";
import { stationsToGeoJSON } from "../src/map";

const CHI = "America/Chicago";
// Friday 2026-11-06, Chicago is UTC-6 (CST).
const fri9am = new Date("2026-11-06T15:00:00Z");
const fri3pm = new Date("2026-11-06T21:00:00Z");
const fri5pm = new Date("2026-11-06T23:00:00Z");
const sat1am = new Date("2026-11-07T07:00:00Z");
const sat3am = new Date("2026-11-07T09:00:00Z");

test("overnight hours spill into the next morning", () => {
  const hours: WeeklyHours = { fri: [["16:00", "02:00"]], sat: [["16:00", "02:00"]] };
  assert.equal(isOpenAt(hours, CHI, fri9am), false);
  assert.equal(isOpenAt(hours, CHI, fri5pm), true);
  assert.equal(isOpenAt(hours, CHI, sat1am), true);
  assert.equal(isOpenAt(hours, CHI, sat3am), false);
});

test("closing at midnight, split shifts and 24h", () => {
  assert.equal(isOpenAt({ fri: [["14:00", "00:00"]] }, CHI, fri5pm), true);
  const split: WeeklyHours = { fri: [["07:00", "14:00"], ["17:00", "22:00"]] };
  assert.equal(isOpenAt(split, CHI, fri9am), true);
  assert.equal(isOpenAt(split, CHI, fri3pm), false);
  assert.equal(formatOpensLabel(nextOpening(split, CHI, fri3pm)), "Opens 5:00 PM");
  assert.equal(isOpenAt({ fri: [["00:00", "24:00"]] }, CHI, fri9am), true);
});

test("unknown hours are null, never closed", () => {
  assert.equal(isOpenAt(null, CHI, fri9am), null);
  assert.equal(isOpenAt({ mon: [["09:00", "17:00"]] }, CHI, fri9am), null);
  assert.equal(isOpenAt({ fri: [] }, CHI, fri9am), false);
});

test("uses the venue timezone, including across DST", () => {
  const nineToFive: WeeklyHours = { fri: [["09:00", "17:00"]] };
  assert.equal(isOpenAt(nineToFive, CHI, fri9am), true);
  assert.equal(isOpenAt(nineToFive, "America/Los_Angeles", fri9am), false);
  // 2026-03-08 15:30Z is 10:30 CDT (UTC-5) on the day DST starts.
  assert.equal(isOpenAt({ sun: [["10:00", "18:00"]] }, CHI, new Date("2026-03-08T15:30:00Z")), true);
});

test("next opening skips closed and unknown days", () => {
  assert.equal(
    formatOpensLabel(nextOpening({ fri: [], sat: [["11:30", "22:00"]] }, CHI, fri9am)),
    "Opens tomorrow 11:30 AM"
  );
  assert.equal(
    formatOpensLabel(nextOpening({ fri: [], sat: [], mon: [["07:00", "15:00"]] }, CHI, fri9am)),
    "Opens Mon 7:00 AM"
  );
  assert.equal(nextOpening({ fri: [] }, CHI, fri9am), null);
});

test("a closed venue is unavailable and dimmed like an inactive one", () => {
  const station = mapMapLocation({
    locationId: "loc-1",
    title: "Bar",
    latitude: 41.9295,
    longitude: -87.65,
    hours: { fri: [["16:00", "02:00"]] },
    timezone: CHI,
    live: { online: true, batteryCount: 4, openSlots: 2 },
  })!;

  assert.equal(isStationUnavailable(station, fri9am), true);
  assert.equal(stationsToGeoJSON([station], null, fri9am).features[0].properties.dimmed, 1);
  const details = getStationDetails(station, fri9am);
  assert.equal(details.unavailable, true);
  assert.equal(details.closedNow, true);
  assert.equal(details.opensLabel, "Opens 4:00 PM");

  assert.equal(isStationUnavailable(station, fri5pm), false);
  assert.equal(stationsToGeoJSON([station], null, fri5pm).features[0].properties.dimmed, 0);
  assert.equal(getStationDetails(station, fri5pm).opensLabel, null);
});

test("hours are ignored unless the caller passes now (app keeps old behavior)", () => {
  const station = mapMapLocation({
    locationId: "loc-3",
    latitude: 41.9295,
    longitude: -87.65,
    hours: { fri: [] },
    timezone: CHI,
    live: { online: true, batteryCount: 4, openSlots: 2 },
  })!;
  assert.equal(isStationUnavailable(station), false);
  assert.equal(stationsToGeoJSON([station]).features[0].properties.dimmed, 0);
  assert.equal(getStationDetails(station).closedNow, false);
  assert.equal(stationsToGeoJSON([station], null, fri9am).features[0].properties.dimmed, 1);
});

test("formats one day's hours", () => {
  assert.equal(formatDayHours([["16:00", "02:00"]]), "4:00 PM – 2:00 AM");
  assert.equal(formatDayHours([["07:00", "14:00"], ["17:00", "22:00"]]), "7:00 AM – 2:00 PM, 5:00 PM – 10:00 PM");
  assert.equal(formatDayHours([["00:00", "24:00"]]), "Open 24 hours");
  assert.equal(formatDayHours([]), "Closed");
  assert.equal(formatDayHours(undefined), "Hours unknown");
});

test("stations without hours are never dimmed for being closed", () => {
  const station = mapMapLocation({
    locationId: "loc-2",
    latitude: 41.9295,
    longitude: -87.65,
    live: { online: true, batteryCount: 4, openSlots: 2 },
  })!;
  assert.equal(station.openingHours, null);
  assert.equal(isStationUnavailable(station, fri9am), false);
});
