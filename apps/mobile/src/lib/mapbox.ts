import Mapbox from '@rnmapbox/maps';

function readToken() {
  return (process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '').trim();
}

export function getMapboxTokenStatus() {
  const token = readToken();
  if (!token) {
    return { ok: false as const, reason: 'missing' as const, token: '' };
  }
  if (token.includes('your_mapbox') || token.includes('token_here')) {
    return { ok: false as const, reason: 'placeholder' as const, token };
  }
  if (!token.startsWith('pk.') || token.length < 60) {
    return { ok: false as const, reason: 'invalid' as const, token };
  }
  return { ok: true as const, reason: 'ok' as const, token };
}

export function hasMapboxToken() {
  return getMapboxTokenStatus().ok;
}

let configured = false;

export function configureMapbox() {
  if (configured) return;
  const { ok, token } = getMapboxTokenStatus();
  if (ok) {
    Mapbox.setAccessToken(token);
  }
  configured = true;
}

export { Mapbox };
