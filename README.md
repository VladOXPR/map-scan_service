# cuub-app

CUUB's consumer apps in one npm workspaces monorepo:

- `apps/mobile` — the Expo (React Native) app on the App Store / Google Play. Imported from `CUUB_User_App` with `git subtree`, so its history is preserved.
- `apps/web` — the Next.js website (map, sticker scan pages, `/s/<code>` station links). Every page pushes visitors to install the app.
- `packages/core` (`@cuub/core`) — station model, cuub-api row mappers, geo/camera math, map GeoJSON, API client, station/store links, analytics tracker.
- `packages/theme` (`@cuub/theme`) — colours, spacing, radii, typography; the website reads them as `--cuub-*` CSS variables.
- `packages/assets` (`@cuub/assets`) — station icons, illustrations and map art. The app `require`s them, the website serves them at `/assets/*`.

## Quick start

```bash
npm install                                  # from the repo root
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env

npm run web:dev                              # http://localhost:3000
npm run mobile:start                         # Expo dev server (dev client build required)
npm run core:test                            # shared logic tests
npm run typecheck                            # every workspace
```

## One station model

Both clients use `Station` from `@cuub/core`: one pin per venue, `id` = cuub-api `locationId`.

- The app reads public `GET /map/live` (fallback `GET /map`). It never holds operator secrets.
- The website's server reads machine-auth `GET /stations?include_live=true` plus inactive `GET /locations` (fallback public `GET /map`) and maps the rows with the same `@cuub/core` mappers.

## Station QR links

Each kiosk shows `https://<LINK_HOST>/s/<public_code>` (8-char Crockford base32 code from `stations.public_code`).

- App installed: iOS universal links / Android app links open the app on the station screen with an **Unlock** button.
- App not installed: the website's `/s/<code>` page shows the station and sends the visitor to the App Store or Google Play.
- `apps/web` serves `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` for the link host.

## Environment

Website (`apps/web/.env.local`, Cloud Run `map-scan-service`):

| Variable | Purpose |
|---|---|
| `MAPBOX_ACCESS_TOKEN` | Mapbox public token served via `/api/mapbox-token` |
| `CUUB_API_URL` | cuub-api base URL, no trailing slash |
| `CUUB_API_TOKEN` | cuub-api `MACHINE_API_TOKEN` (live pins, battery scans) |
| `CUUB_SUPPORT_PHONE` | SMS support number |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | Comma-separated Play signing cert fingerprints for `assetlinks.json` |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | PostHog project (optional) |

App: see `apps/mobile/.env.example`.

## Deployment

- **Website**: the root `Dockerfile` builds `apps/web` only; `cloudbuild.yaml` deploys it to Cloud Run.
- **App**: run EAS from `apps/mobile` (`eas build --platform ios|android --profile production`). EAS installs from the repo root using the workspace lockfile.

To regenerate station PNGs after editing the SVGs: `bash scripts/rasterize-station-icons.sh` (needs ImageMagick).
