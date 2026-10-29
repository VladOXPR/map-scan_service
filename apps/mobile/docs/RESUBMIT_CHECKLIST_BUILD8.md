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

## Verified (build 7 and 8 IPA)

| Build | IPA check | EAS build |
|---|---|---|
| **7** | No `PlugIns/*.appex` | [0bc65e67…](https://expo.dev/accounts/cuub/projects/cuub-user-app/builds/0bc65e67-6728-4056-8b67-6e3a033ec6d7) |
| **8** | No `PlugIns/*.appex` | [37b82071…](https://expo.dev/accounts/cuub/projects/cuub-user-app/builds/37b82071-fbeb-40bc-95fb-16f6f3e08389) |

Submission: [65923b13…](https://expo.dev/accounts/cuub/projects/cuub-user-app/submissions/65923b13-98ed-48ca-bdf4-cbb396f05d12) — commit `3824771`.
