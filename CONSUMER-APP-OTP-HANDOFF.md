# Consumer app — phone OTP login handoff

**Who this is for:** the mobile app engineer (and Cursor) implementing SMS login against `cuub-api`.

**Status:** Backend OTP is live on `main`. Phone-only `dev-login` already works; OTP replaces that for real users with a 2-step SMS flow. The JWT session afterward is identical.

**Base URL:** `https://platform.cuub.tech`  
(Local: whatever host your API runs on, e.g. `http://localhost:3001`.)

---

## Part 1 — Plain English (read this first)

### What we’re building

Today the app can log someone in with **just a phone number** (no text message). That was a temporary shortcut for development.

Now we want the real flow:

1. User types their phone number.
2. App asks our server to text them a code.
3. User types the code from the SMS.
4. App asks our server to check the code.
5. If it’s correct, the user is logged in — same as before.

The text message is sent by **Twilio**. The **mobile app never talks to Twilio directly**. It only talks to our API. You do **not** need Twilio passwords, SIDs, or an SDK in the app.

### What stays the same after login

Once login succeeds, you get a **token** (a long string). Save it and send it on later requests like you already do for `dev-login`:

```
Authorization: Bearer <token>
```

Use that for “who am I?” (`GET /app/me`) and saving a push notification token. Profile fields are still: `userId`, `phone`, `notifsEnabled` (no `status` in the app profile).

### Phone numbers

Always send phones in **international format** starting with `+` and country code, digits only after cleanup. Example US: `+15551234567`.

- Good: `+15551234567`, `+1 (555) 123-4567` (server cleans spaces/dashes)
- Bad: `5551234567` (missing `+` and country code) → error

### Important UX details

| Situation | What to do in the app |
|---|---|
| User taps “Send code” | Call request-otp, then show the code screen |
| User enters wrong code | Show an error; **do not** assume a new SMS was sent |
| User taps “Resend” | Call request-otp again |
| Resend too quickly | Wait **20 seconds** between successful sends (server returns 429) |
| User is blocked / suspended | Show that the account isn’t active (403) |
| Server says Twilio isn’t set up | That’s a backend/ops issue (503), not an app bug |

### What you do **not** need

- Twilio Account SID, Auth Token, or Verify Service SID
- Operator dashboard tokens (`MACHINE_API_TOKEN`)
- Any knowledge of how we store rate limits in the database
- Rentals / Cuub Card / subscriptions (out of scope for this MVP)

### Quick checklist for the login screens

- [ ] Phone screen → `POST /app/auth/request-otp`
- [ ] Code screen → `POST /app/auth/verify-otp` with same phone + code
- [ ] On success, store `data.token` and `data.user` the same way as `dev-login`
- [ ] Resend button disabled ~20 seconds after a successful send
- [ ] On app launch, if a token exists, call `GET /app/me`; if 401/403, clear session and show login
- [ ] Optionally keep `dev-login` behind a **dev build flag** only; production should use OTP

---

## Part 2 — Cursor / implementation context

Paste this section (or the whole file) into Cursor when implementing auth in the mobile repo.

### Goal

Replace (or sit beside) `POST /app/auth/dev-login` with Twilio Verify OTP:

1. `POST /app/auth/request-otp` `{ phone }` → SMS sent; no code in response
2. `POST /app/auth/verify-otp` `{ phone, code }` → `{ token, user }` identical to `dev-login`

Auth after login is unchanged: `Authorization: Bearer <jwt>` on `/app/*` user routes.

### Conventions

- Base: `https://platform.cuub.tech` (no trailing slash)
- JSON bodies; `Content-Type: application/json`
- Success: `{ "success": true, "data": ..., "message"?: string }`
- Error: `{ "success": false, "error": "human-readable message" }`
- Phone: E.164. Normalize client-side if possible; server also strips spaces/dashes/parens and requires `/^\+[1-9]\d{6,14}$/`
- Code: trimmed string matching `/^\d{4,10}$/` (typically 6 digits from Twilio)
- App JWTs use audience `app_user`, TTL ~30 days — still prefer `GET /app/me` as source of truth
- Never send operator machine token or `x-api-key` for consumer routes

### Endpoints

#### 1) Request SMS code

`POST /app/auth/request-otp` — **public** (no auth header)

```http
POST /app/auth/request-otp
Content-Type: application/json

{ "phone": "+15551234567" }
```

**200 example:**

```json
{
  "success": true,
  "message": "Verification code sent",
  "data": {
    "phone": "+15551234567",
    "status": "pending",
    "sendAttempts": 1
  }
}
```

Notes:

- `sendAttempts` may be a number or `null` — optional to display
- Rate limit: **1 successful send / 20 seconds / phone** → `429`
- Does not create a login session by itself
- Wrong-code attempts on verify-otp do **not** trigger a new SMS

#### 2) Verify code → login session

`POST /app/auth/verify-otp` — **public**

```http
POST /app/auth/verify-otp
Content-Type: application/json

{ "phone": "+15551234567", "code": "123456" }
```

**200 example (same shape as `dev-login`):**

```json
{
  "success": true,
  "message": "Logged in",
  "data": {
    "token": "<jwt>",
    "user": {
      "userId": "<uuid>",
      "phone": "+15551234567",
      "notifsEnabled": true
    }
  }
}
```

Persist `token`. Use for:

#### 3) Session / profile (unchanged)

```http
GET /app/me
Authorization: Bearer <token>
```

```json
{
  "success": true,
  "data": {
    "userId": "<uuid>",
    "phone": "+15551234567",
    "notifsEnabled": true
  }
}
```

```http
PUT /app/me/push-token
Authorization: Bearer <token>
Content-Type: application/json

{ "expoPushToken": "ExponentPushToken[...]" }
```

```http
POST /app/me/archive
Authorization: Bearer <token>
```

No body. **App Store requirement (Apple 5.1.1v):** archive / deactivate the signed-in `app_users` row. Client uses Bearer JWT only (never `POST /app-users/:id/status`, machine token, or `x-api-key`). On **200** or **401/403**, clear stored JWT/profile and show login.


### Error table (handle in UI)

| HTTP | Typical cause | Example `error` |
|---|---|---|
| `400` | Bad phone/code format; no pending verification | `phone must be E.164 format (e.g. +15551234567)`, `code is required`, `code must be a numeric verification code`, `No pending verification for this phone. Request a new code.` |
| `401` | Wrong or expired code | `Invalid or expired verification code` |
| `401` | Missing Bearer on `/app/me` | (auth middleware) |
| `403` | Suspended/archived user; bad JWT | `Account is not active` |
| `404` | `dev-login` when `APP_DEV_AUTH` ≠ `true` | route missing |
| `429` | Resend cooldown (20s) or Twilio send limits | `Please wait before requesting another code` (or Twilio max-attempts message) |
| `503` | Missing `TWILIO_*` or `APP_JWT_SECRET` on server | dependency / config failure |

### Suggested client flow (pseudocode)

```text
onSubmitPhone(phone):
  res = POST /app/auth/request-otp { phone }
  if 200 → navigate to CodeScreen(phone); startResendCooldown(20s)
  if 429 → show "wait a few seconds"
  if 403 → show account inactive
  if 400/503 → show error.error

onSubmitCode(phone, code):
  res = POST /app/auth/verify-otp { phone, code }
  if 200 → save data.token; set user = data.user; go Home
  if 401 → show invalid/expired code (stay on screen; offer Resend)
  if 400 → show error; maybe return to phone if "No pending verification"

onResend(phone):
  same as onSubmitPhone; respect 20s cooldown

onAppLaunch:
  if token → GET /app/me
  if 200 → hydrate user
  if 401/403 → clear token; show Login
```

### Dev-login (optional keep for internal builds)

`POST /app/auth/dev-login` `{ "phone": "+15551234567" }` → same `{ token, user }` as verify-otp.

- Only registered when server env `APP_DEV_AUTH=true`
- Otherwise `404`
- Do not ship as the primary production login UI

### Smoke test

```bash
BASE=https://platform.cuub.tech

curl -s -X POST "$BASE/app/auth/request-otp" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+1YOURNUMBER"}'

# then enter the SMS code:
curl -s -X POST "$BASE/app/auth/verify-otp" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+1YOURNUMBER","code":"123456"}'
```

### Out of scope / do not invent

- No `/app/config`, `/app/nearest`, or rental/payment APIs for this MVP
- Map data: existing public `GET /map`
- Low-battery proximity alerts: on-device only (app constants + map data)
- Support phone number: app constant, not from API
- Twilio credentials: server-only (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`)

### If production returns 503 on request-otp

OTP code is on `main`, but Cloud Run must have Twilio env/secrets configured. Until then, test against a backend that has those vars set (local or a staging service). Treat 503 as backend config, not a mobile bug.

### Canonical backend docs

- `API.md` — Consumer app section
- `ARCHITECTURE.md` — base URL / envelopes
- `CONSUMER-APP-MVP-PLAN.md` — product scope

Backend implementation references (API repo): `src/routes/app.ts`, `src/services/appUserService.ts`, `src/clients/twilioVerify.ts`, `src/middleware/appUserAuth.ts`.
