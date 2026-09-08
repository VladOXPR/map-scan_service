# Resubmit checklist — build 8

## Connect (manual)

- [ ] Wait for build **8** to finish processing in App Store Connect
- [ ] **Previews and Screenshots** — 6.5" (View All Sizes): real map UI only; no widget frames or marketing composites
- [ ] **Description / promotional text** — no mention of “widget” or “Home Screen widget”
- [ ] **App Review Information** — **Sign-in required** = **off**
- [ ] **Notes** — guest map flow; optional demo phone + OTP for account testing (see [APP_REVIEW_REPLY_BUILD8.md](./APP_REVIEW_REPLY_BUILD8.md))
- [ ] Select build **8** on the version (not build 7)
- [ ] Paste Resolution Center reply from [APP_REVIEW_REPLY_BUILD8.md](./APP_REVIEW_REPLY_BUILD8.md)
- [ ] Submit for review

## Apple Developer (manual audit)

- [ ] **Identifiers** — no orphan `tech.cuub.user.*` widget extension App ID
- [ ] **Profiles** — no Widget Extension provisioning profile attached to this app unless intentionally shipping widgets later

## Verified (build 7 IPA)

Build 7 IPA was inspected: **no** `PlugIns/*.appex` — no WidgetKit extension in the binary.
