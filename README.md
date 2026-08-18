# CUUB User App

Battery-sharing mobile app built with Expo, Expo Router, TypeScript, Mapbox, NativeWind, React Query, and Zustand.

## Product goal

Help a user find and rent a battery in under 30 seconds. The map is the core experience.

**v1.0 App Store scope:** SMS login + find nearby stations on the map. Rent / return / payment ship later.

## Setup

```bash
npm install
cp .env.example .env
```

Required in `.env`:

```
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk....
EXPO_PUBLIC_CUUB_API_URL=https://platform.cuub.tech
```

Optional legal URL overrides:

```
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://cuub.tech/privacypolicy
EXPO_PUBLIC_SUPPORT_URL=https://cuub.tech/contact
EXPO_PUBLIC_TERMS_URL=https://cuub.tech/termsandconditions
```

Do **not** put `MACHINE_API_TOKEN` (or any operator secret) in the app. The consumer map uses public `GET /map/live` (preferred) with `GET /map` fallback — see [MAP-LIVE-APP-HANDOFF.md](MAP-LIVE-APP-HANDOFF.md).

Start the app:

```bash
npm start
```

Typecheck:

```bash
npm run typecheck
```

## Auth

Phone login uses live SMS OTP against the platform API:

1. Enter a phone number (US 10-digit → `+1…`)
2. `POST /app/auth/request-otp` sends a Twilio Verify code (**4 digits** — must match Twilio Verify service settings)
3. `POST /app/auth/verify-otp` returns a JWT session stored in SecureStore
4. On launch, `GET /app/me` revalidates; 401/403 clears the session

Account → **Delete account** calls `POST /app/me/archive` with the app-user JWT, then clears the session (see [docs/API.md](docs/API.md)).

## App flow

Splash → Location permission (once) → Phone → OTP → Home map

Tap a station pin for the bottom sheet. Primary action opens Apple Maps directions.

## Production / App Store

See [docs/APP_STORE.md](docs/APP_STORE.md) for EAS build, Connect checklist, privacy questionnaire, and post-v1 rental track.

Draft legal page copy to host at the URLs above: [docs/legal/](docs/legal/).

**Ops:** if `EXPO_PUBLIC_MACHINE_API_TOKEN` was ever committed or shared, rotate GCP Secret Manager `machine-api-token` immediately.

## Project structure

- `app/` — Expo Router screens
- `src/components/` — reusable UI, map, sheets, overlays
- `src/features/` — auth, stations, location logic
- `src/store/` — Zustand stores
- `src/theme/` — design tokens
- `assets/` — branding, map markers, illustrations
