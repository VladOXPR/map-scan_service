# Rollout & Parity Checklist

This is the operational plan for taking the new Next.js + Expo apps to production
and retiring the legacy Express server.

## 0. Local sanity (already verified during migration)

- `npm install` from the repo root (workspaces) → green.
- `npm run --workspace=@cuub/shared test` → 9/9 pass for geo, nearest, directions, SMS helpers.
- `npm run web:build` → Next.js build succeeds with all routes:
  - `/`, `/blank`, `/[sticker_id]`
  - `/api/mapbox-token`, `/api/stations`, `/api/battery/[sticker_id]` (GET/POST/PATCH), `/api/support-phone`
- `bash scripts/smoke-api-parity.sh` against a running `npm run web:dev` exercises the live endpoints.

## 1. API parity (Express → Next API routes)

| Endpoint | Method | Legacy (`server.js`) | Next (`apps/web/src/app/api/...`) | Notes |
| --- | --- | --- | --- | --- |
| `/api/mapbox-token` | GET | `{ token }` or 503 | identical | Server-only env, never exposed at build |
| `/api/stations` | GET | proxies `api.cuub.tech/stations` | identical | Status code passed through |
| `/api/battery/:sticker_id` | GET | proxies CUUB battery | identical | Same JSON envelope |
| `/api/battery/:sticker_id` | POST | sends `manufacture_id` + `sticker_type` | identical | Headers forwarded |
| `/api/battery/:sticker_id` | PATCH | sends `{ sizl: true }` | identical | Headers forwarded |

`scripts/smoke-api-parity.sh` runs the smoke checks. Set `LEGACY_URL=http://...` to also diff response envelopes against the live legacy server during the cutover window.

## 2. Web behavior parity

Functional checklist for `apps/web` (run against `npm run web:dev` or a deployed build):

- `/` and `/map` and `/map.html` all render the full map view (cluster + station icons + station modal + support button + nearest-station feature).
- `/blank` renders the minimal map with only the nearest-station feature.
- `/<sticker_id>` (e.g. `/CUBT062510000005`) renders the full map AND the battery scan modal at the top, with live duration timer counting up unless `duration === "battery returned"`.
- `?embed=1` hides the built-in nearest-station trigger button and disables the auto-prompt; postMessage bridge still works (`{source:"cuub", type:"findNearest"}` opens the modal, `type:"requestLocation"` skips the prompt, `type:"ping"` replies with `pong`).
- `Content-Security-Policy: frame-ancestors *` and `Permissions-Policy: geolocation=*` are present so Framer iframes still work.
- Get Directions opens the right OS deep-link (`maps://` on iOS, `google.navigation:` on Android, `https://maps.google.com/maps?daddr=` elsewhere).
- "Text Support" SMS deep-link uses `+14642377449` (or whatever `CUUB_SUPPORT_PHONE` is set to) and prefills the body when on a sticker route.

## 3. Mobile parity (Expo)

Run from `apps/mobile`:

- `npm run mobile:start`, then press `i` (iOS Simulator) or `a` (Android emulator). For native modules (`@rnmapbox/maps`, `expo-location`) you need a development build, not Expo Go: `npx expo prebuild` once, then `npm run mobile:ios` / `mobile:android`.
- Set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (mobile uses native Mapbox SDK directly), `EXPO_PUBLIC_CUUB_API_BASE` (point at deployed Next app), and optionally `EXPO_PUBLIC_SUPPORT_PHONE`.
- Routes mirror the web: `/`, `/blank`, `/<sticker_id>`.
- Mobile station markers render the same per-slot icons as web. The native Mapbox SDK does not consume SVG, so `Icon0..Icon6.svg` are pre-rasterized to PNGs at 1x/2x/3x in `apps/mobile/assets/stations/` and registered via `<Mapbox.Images>` in `MapScreen.tsx`. To regenerate the assets after editing the source SVGs run `bash scripts/rasterize-station-icons.sh` (requires `brew install imagemagick`).
- Verify: nearest-station prompt + card, station tap → bottom sheet, Directions deep-links via `Linking.openURL`, support SMS via `Linking.openURL("sms:...")`.

## 4. Deployment

### Web (Cloud Run)

The repo `Dockerfile` is now a multi-stage Next.js build. Deploy with the same `gcloud run deploy ...` command as before; it now runs `next start` on `$PORT` (default `8080`). Required env in Cloud Run:

- `MAPBOX_ACCESS_TOKEN` (server-only)
- `CUUB_API_BASE` (defaults to `https://api.cuub.tech`)
- `CUUB_SUPPORT_PHONE` (defaults to `+14642377449`)

### Mobile (EAS / native)

- `cd apps/mobile && npx expo install` to pull native modules.
- Configure EAS: `eas build:configure`.
- iOS: `eas build --profile production --platform ios`, then submit via `eas submit -p ios`.
- Android: `eas build --profile production --platform android`, then `eas submit -p android`.

## 5. Cutover steps

1. Deploy `apps/web` to a staging URL, run `WEB_URL=https://staging.cuub.tech bash scripts/smoke-api-parity.sh` and the manual web checklist above.
2. Repoint the existing Cloud Run service (`map-service`) at the new image. The Express service can stay deployed under a different tag for rollback.
3. Submit mobile internal-testing builds (TestFlight + Internal App Sharing) and run the mobile checklist on at least one iOS device and one Android device.
4. Once mobile beta is signed off, promote both web and mobile to production. The legacy Express server can then be decommissioned (`server.js`, `map_view.html`, `map_blank.html`, `map_view.js`, `map_blank.js`, `scan_service.js`, `lib/geo.js`, `lib/nearest_feature.js` at the repo root are kept for reference and may be deleted after a stability window).

## 6. Rollback

- Web: Cloud Run revision rollback to the previous Express-based image.
- Mobile: keep the old store version live until the new one is verified; submit a hotfix or rollback by promoting the previous build.
- API: clients still hit the same `/api/...` paths, so DNS/load-balancer rollback to the legacy Express deployment is sufficient if needed.
