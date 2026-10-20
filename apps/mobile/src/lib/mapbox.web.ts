export function configureMapbox() {
  // Mapbox native SDK is not used on web.
}

export function getMapboxTokenStatus() {
  return { ok: false as const, reason: 'missing' as const, token: '' };
}

export function hasMapboxToken() {
  return false;
}

export const Mapbox = null;
