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
- [x] When-In-Use location only (the app never asks for Always); `ITSAppUsesNonExemptEncryption: false`
- [x] Background location (`UIBackgroundModes: location`, status bar indicator; Android location foreground service) only for opt-in return alerts while a power bank is out, at most 24 h after unlock. Renting works the same without it
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

## OTA updates (EAS Update)

Builds made with `expo-updates` (1.1.0 and later; 1.0.0 and 1.0.1 can't update) download new JavaScript and images from EAS Update, so most changes ship without an App Store release.

- **Ships OTA:** screens, copy, styles, flows, API calls, bundled images and fonts.
- **Needs a store build:** adding or upgrading a package with native code, Expo SDK upgrades, and native `app.json` changes (permissions, plugins, icon, splash, associated domains, version). `runtimeVersion` is a fingerprint of the native side and an update only reaches builds with the same fingerprint, so older builds simply keep their current JS. Compare `npx expo-updates runtimeversion:resolve --platform ios` with the runtime version shown in `eas build:list`.
- **Publish** from `apps/mobile` after committing: `npm run update:production -- --message "Fix scan copy"`. The script bundles with the production profile's `env` in `eas.json` plus the production EAS environment, the same values as the store build; `.env` and shell `EXPO_PUBLIC_*` exports are ignored.
- **Try first:** `npm run update:preview` reaches preview builds; a development build can open any update from the dev launcher.
- **Rollout / rollback:** add `--rollout-percentage 10` and raise it with `eas update:edit`; undo with `eas update:rollback` or republish an older group with `eas update:republish --group <id>`.
- **When users get it:** release builds check on launch and when the app returns to the foreground (at most every 30 min). The update downloads in the background and runs from the next launch.
- Apple's developer agreement allows downloaded JavaScript as long as it keeps the app's reviewed purpose. Ship fixes and UI changes OTA; new major features go through review.

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
| App Privacy | Linked to the user, for App Functionality and Analytics: Precise Location, Product Interaction, Device ID, Crash Data, Other Diagnostic Data (battery level, charging, Low Power Mode); add Phone Number when login ships. Tracking = No: PostHog is first-party analytics, nothing is shared for ads or with data brokers. Return alerts check for nearby open slots on the phone; their background locations are never sent to CUUB, so they add nothing to App Privacy |
| Review notes | Map is public and does not require an account. Location explainer uses Continue and always presents the iOS prompt. Login returns with rent/pay. Background location is used only for **Return alerts**: after someone with a CUUB Pass unlocks a power bank, the map asks once (Turn on alerts / Not now). With it on, while the power bank is out (at most 24 hours after unlock), the app receives location updates about every 150 m with the location indicator showing, compares each update on the phone with the public station map and sends a notification when they go by a station with an open return slot (the background locations are not sent to our servers), and tapping the rental timer at the top of the map turns alerts off or on. While a power bank is out, the bottom button reads Return and finds the nearest station with an open slot. Updates stop when the power bank is returned. Renting works the same with alerts off. |

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
