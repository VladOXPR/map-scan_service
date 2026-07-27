# CUUB Monorepo

Migrated from Express + vanilla JS to a monorepo:

- `apps/web` — Next.js 14 App Router (replaces the old Express server + static HTML/JS)
- `apps/mobile` — Expo (React Native) iOS + Android app
- `packages/shared` — Shared TypeScript types, geo utilities, API client, directions/SMS helpers

The legacy files (`server.js`, `map_view.js`, `map_blank.js`, `scan_service.js`, `lib/`, `*.html`) are kept at the repo root for reference and can be deleted once the new apps are validated in production.

## Quick Start

```bash
npm install
cp .env.example .env                # legacy
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env

# Web (Next.js, port 3000)
npm run web:dev

# Mobile (Expo)
npm run mobile:start
# then press `i` for iOS Simulator or `a` for Android emulator
```

## Architecture

```
                +---------------------+
                |   Next.js (apps/web)|
   Mobile <-->  |  /api/* proxy routes| <----> cuub-api
                +---------------------+              |
                          ^                          +-- GET /map (pin fallback)
                          |                          +-- GET /stations?include_live=true
                  packages/shared                    +-- GET/POST /battery/:id
                  (CuubClient, geo, types)
```

- `MAPBOX_ACCESS_TOKEN` lives only on the Next.js server and is fetched by clients via `/api/mapbox-token`.
- The mobile app reads `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` from its own env so it can initialize the native Mapbox SDK without a token round-trip.
- All CUUB battery/station calls go through Next API routes for both clients.
- Station pins prefer live Energo enrichment from cuub-api (`include_live=true`, same token path as the dashboard). Online stations show `Icon0`–`Icon6` from filled slot count; offline stations use the same icon at 40% opacity. If the live call fails, the map falls back to public `GET /map` pins without slot counts.

## Routes

Web (`apps/web`):
- `/` and `/map` — full map view with station modal + support button + nearest-station feature
- `/blank` — minimal map view
- `/:sticker_id` — full map view + scan modal (battery info)
- `?embed=1` — hides the built-in nearest-station trigger and disables auto-prompt (for iframe parents)

Mobile (`apps/mobile`):
- `/` — full map screen
- `/blank` — minimal map screen
- `/:sticker_id` — full map screen + scan modal

## Notes

- Mobile station markers render the same per-slot icons as web. The native Mapbox SDK does not consume SVG, so `assets/stations/Icon0..Icon6.svg` are pre-rasterized to PNGs at 1x/2x/3x in `assets/stations/` and registered via `<Mapbox.Images>` in `MapScreen.tsx`. To regenerate after editing the SVGs run `bash scripts/rasterize-station-icons.sh` (requires `brew install imagemagick`).
- The legacy Express server is still runnable via `npm run legacy:start` until the Next deployment fully replaces it.

## Environment Variables

| Variable | Example | Purpose |
|---|---|---|
| `MAPBOX_ACCESS_TOKEN` | `pk.…` | Mapbox public token (served via `/api/mapbox-token`) |
| `CUUB_API_URL` | `https://cuub-api-….run.app` | cuub-api base URL, no trailing slash |
| `CUUB_API_TOKEN` | same as cuub-api `MACHINE_API_TOKEN` | Bearer for battery + live stations |
| `CUUB_SUPPORT_PHONE` | `+14642377449` | SMS support number |

Set these in `apps/web/.env.local` for local Next.js, or on Cloud Run for production.

**Live station slots:** `/api/stations` calls `GET /stations?include_live=true` (cuub-api holds the Energo token). If that fails, it falls back to public `GET /map` so pins still render without counts.

## Deployment

- **Web**: Deploy `apps/web` to Cloud Run / Vercel / any Next.js host. The included root `Dockerfile` is set up for the Next app.
- **Mobile**: `cd apps/mobile && eas build --platform ios|android` (after configuring EAS) or `expo run:ios|android` for local development builds.
