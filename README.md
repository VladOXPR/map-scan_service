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
   Mobile <-->  |  /api/* proxy routes| <----> api.cuub.tech
                +---------------------+
                          ^
                          |
                  packages/shared
                  (CuubClient, geo, types)
```

- `MAPBOX_ACCESS_TOKEN` lives only on the Next.js server and is fetched by clients via `/api/mapbox-token`.
- The mobile app reads `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` from its own env so it can initialize the native Mapbox SDK without a token round-trip.
- All CUUB battery/station calls go through Next API routes for both clients.

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

- Mobile station markers currently use color-coded circle layers as a clean stand-in for the SVG icons used on web. Drop PNG-rasterized versions of `Icon0..Icon6` into `apps/mobile/assets/` and switch `MapScreen.tsx` back to `SymbolLayer` + `Mapbox.Images` if pixel-perfect parity is required.
- The legacy Express server is still runnable via `npm run legacy:start` until the Next deployment fully replaces it.

## Deployment

- **Web**: Deploy `apps/web` to Cloud Run / Vercel / any Next.js host. The included root `Dockerfile` is set up for the Next app.
- **Mobile**: `cd apps/mobile && eas build --platform ios|android` (after configuring EAS) or `expo run:ios|android` for local development builds.
