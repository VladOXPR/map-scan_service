import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getStationDetails,
  mapFoundationStation,
  mapInactiveLocation,
  mapMapLocation,
  mergeStationsWithInactive,
} from "../src/stations";
import { stationsToGeoJSON } from "../src/map";
import { encodeGeohash } from "../src/geo";

const chicago = { latitude: 41.9295, longitude: -87.65 };

test("pins from /map/live, /stations and /locations all key on locationId", () => {
  const fromMap = mapMapLocation({
    locationId: "loc-1",
    title: "Bar",
    ...chicago,
    live: { online: true, batteryCount: 4, openSlots: 2 },
  });
  const fromStations = mapFoundationStation({
    stationId: "st-1",
    manufactureId: "DTN00001",
    type: "SLOT_6_WHITE",
    currentLocation: { locationId: "loc-1", title: "Bar", ...chicago, status: "ACTIVE" },
    live: { online: true, batteryCount: 4, openSlots: 2 },
  });
  const fromLocations = mapInactiveLocation({ locationId: "loc-1", ...chicago, status: "INACTIVE" });
  assert.equal(fromMap?.id, "loc-1");
  assert.equal(fromStations?.id, "loc-1");
  assert.equal(fromLocations?.id, "loc-1");
});

test("inventory, archived and 0,0 venues never become pins", () => {
  assert.equal(
    mapFoundationStation({ currentLocation: { locationId: "a", ...chicago, isInventory: true } }),
    null
  );
  assert.equal(
    mapFoundationStation({ currentLocation: { locationId: "a", ...chicago, status: "ARCHIVED" } }),
    null
  );
  assert.equal(mapMapLocation({ locationId: "a", latitude: 0, longitude: 0 }), null);
});

test("inactive venues drop live counts and merge without duplicating a live pin", () => {
  const inactive = mapFoundationStation({
    currentLocation: { locationId: "loc-2", ...chicago, status: "INACTIVE" },
    live: { online: true, batteryCount: 5, openSlots: 1 },
  });
  assert.equal(inactive?.hasLiveData, false);
  assert.equal(inactive?.locationInactive, true);

  const live = mapMapLocation({ locationId: "loc-1", ...chicago, live: null })!;
  const extra = mapInactiveLocation({ locationId: "loc-1", ...chicago })!;
  const other = mapInactiveLocation({ locationId: "loc-3", ...chicago })!;
  assert.deepEqual(
    mergeStationsWithInactive([live], [extra, other]).map((s) => s.id),
    ["loc-1", "loc-3"]
  );
});

test("station details: live counts win over the type capacity", () => {
  const station = mapFoundationStation({
    type: "SLOT_24_BLACK",
    currentLocation: { locationId: "loc", ...chicago },
    live: { online: true, batteryCount: 3, openSlots: 3 },
  })!;
  const details = getStationDetails(station);
  assert.equal(details.slotCount, 6);
  assert.equal(details.powerbanks, 3);
  assert.equal(details.slotsToReturn, 3);
  assert.equal(details.unavailable, false);
});

test("geojson: unknown availability uses icon 6 and never emits null properties", () => {
  const station = mapMapLocation({ locationId: "loc", ...chicago })!;
  const [feature] = stationsToGeoJSON([station], "loc").features;
  assert.equal(feature.properties.filled_slots, 6);
  assert.equal(feature.properties.open_slots, -1);
  assert.equal(feature.properties.selected, 1);
  assert.equal(feature.properties.dimmed, 0);
});

test("geohash precision 6 matches the reference encoding", () => {
  assert.equal(encodeGeohash(57.64911, 10.40744, 11), "u4pruydqqvj");
  assert.equal(encodeGeohash(41.9295, -87.65).length, 6);
});
