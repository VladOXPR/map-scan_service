# App Store & production checklist

First submission scope: **map** (find stations). SMS OTP is in the repo but **not in the user flow** until Phase 4 rent/pay. Do not market rent/pay until shipped.

## App changes (done in this repo)

- [x] Consumer map uses public `GET /map/live` + `GET /map` fallback (no client machine token)
- [x] Map opens without registration (5.1.1(v)); auth screens parked
- [x] Location explainer uses **Continue** and always proceeds to the system prompt (no Not now)
- [x] OTP length = 4 (must match Twilio Verify service) — parked until login returns
- [x] In-app Delete Account → `DELETE /app/me` (Bearer JWT only; leftover sessions only)
- [x] Privacy / Terms / Support links (env-overridable URLs)
- [x] Test low-battery alert gated to `__DEV__`
- [x] When-In-Use location only; `ITSAppUsesNonExemptEncryption: false`
- [x] Mapbox logo + attribution enabled
- [x] Empty station list banner + load error retry
- [x] `eas.json` + `ios.buildNumber`

## Backend / ops (required before submit)

- [x] `DELETE /app/me` for signed-in `app_users` (Bearer JWT; see [API.md](./API.md))
- [ ] Rotate GCP `machine-api-token` if it was ever in a client `.env` or git history
- [ ] Confirm Twilio Verify sends **4-digit** codes
- [ ] Production: `APP_DEV_AUTH` off; OTP + `/map` healthy
- [ ] Host https pages for privacy, terms, and support (drafts in [legal/](./legal/))

## EAS / Apple (manual)

1. Install CLI: `npm i -g eas-cli` and `eas login`
2. `eas init` — replace `extra.eas.projectId` in `app.json`
3. Set EAS Secrets for production builds (never machine token):

   ```bash
   eas secret:create --name EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN --value 'pk....' --scope project
   eas secret:create --name EXPO_PUBLIC_PRIVACY_POLICY_URL --value 'https://cuub.tech/privacypolicy' --scope project
   eas secret:create --name EXPO_PUBLIC_SUPPORT_URL --value 'https://cuub.tech/contact' --scope project
   eas secret:create --name EXPO_PUBLIC_TERMS_URL --value 'https://cuub.tech/termsandconditions' --scope project
   ```

4. Fill `submit.production.ios` placeholders in `eas.json` (Apple ID email, App Store Connect app id, Team ID)
5. Build: `eas build --platform ios --profile production`
6. Internal TestFlight: map, location Continue → system prompt, Support, station sheet (no login wall)
7. Submit: `eas submit --platform ios --profile production` (or upload via Connect)

## App Store Connect metadata

| Field | Guidance |
|---|---|
| Name | CUUB |
| Bundle ID | `tech.cuub.user` |
| Subtitle / description | Find nearby CUUB battery stations. Do not claim in-app rent/pay until shipped |
| Privacy Policy URL | `https://cuub.tech/privacypolicy` (or your hosted URL) |
| Support URL | `https://cuub.tech/contact` |
| Category | Travel or Lifestyle |
| Age rating | Answer for location; no account/phone collection in this binary; no UGC/payments in v1 |
| App Privacy | Precise Location, Product Interaction; omit Phone Number while login is parked; tracking = No if no ad/analytics SDKs |
| Review notes | Map is public and does not require an account. Location explainer uses Continue and always presents the iOS prompt. Login returns with rent/pay. |

### Screenshots

Capture on a physical device or simulator **the app in use**. In App Store Connect use **View All Sizes in Media Manager** for 6.5-inch iPhone (and 6.7" / other required sizes).

Majority of frames: map with station pins, station bottom sheet / directions, nearest-location bar. Splash and login are not “app in use.” Do not use marketing composites.

## Phase 4 — after first ship (deferred)

Documented product track — **not** required for v1.0:

- Re-enable SMS OTP in the user flow (`app/(auth)/`, splash + profile Sign in)
- QR scan / rent / return
- Payments (Stripe / Apple Pay as product decides)
- Active rental UI + history
- Remote push via `PUT /app/me/push-token`
- Authenticated consumer stations API with live slots (replaces any operator-token shortcut)

See [context.md](../context.md).
