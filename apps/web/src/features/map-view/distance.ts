import type { Coords } from "@cuub/shared";

const EARTH_RADIUS_MILES = 3958.8;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMiles(from: Coords, to: Coords): number {
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}

/** Same labels as the user app: "450 ft" under 0.1 mi, otherwise "0.7 mi". */
export function formatMiles(miles: number): string {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(1)} mi`;
}
