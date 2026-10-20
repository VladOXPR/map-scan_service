# CUUB Foundation API — Contract

This document is the authoritative inventory of the new API's endpoints. It is written **before** the code; Phase 4 output is graded against it. Read alongside `ARCHITECTURE.md` (Section 7 defines the conventions this doc assumes; Section 6 defines the service functions referenced here). Do not add, remove, or rename endpoints without updating this document first.

---

## 1. Global conventions (summary — full rules in ARCHITECTURE.md §7)

- Base URL: `https://platform.cuub.tech` (consumer/platform API). `https://api.cuub.tech` is the Energo token extractor — do not use it for app auth or `/map`. All routes below are relative.
- Success: `{ "success": true, "data": ..., "count": N }` (`count` on list responses; `message` on mutations).
- Error: `{ "success": false, "error": "human-readable message" }`. Status codes: 400 validation, 401 missing auth, 403 bad auth, 404 not found, 409 invariant refusal, 503 dependency/config failure.
- Timestamps ISO 8601 UTC. IDs are UUIDs unless noted.
- **State changes are verb sub-routes** (`POST /stations/:id/move`), never generic PATCHes to status/location fields. A route per door; no route may bypass a service function.
- Every handler is thin: validate → call the named service function → format envelope. If an endpoint here cannot name its service function, stop and flag it.
- Pagination on list endpoints: `?limit=` (default 50, max 200) and `?offset=`. Include `count` = total matching rows.

## 2. Auth tiers

| Tier | Mechanism (now) | Mechanism (later) | Used by |
|---|---|---|---|
| `public` | none | none | customer map, app config |
| `machine` | shared-secret bearer (`Authorization: Bearer <token>` or `x-api-key`) — 401 missing, 403 mismatch, 503 unconfigured | same | scan recording, legacy passthroughs, POS |
| `operator` | shared-secret bearer (same token, TEMPORARY) | JWT with `aud: operator` once email+password login ships (decided — ARCHITECTURE §13) | everything else |
| `app_user` | **planned** — JWT with `aud: app_user` after phone SMS OTP | same (+ future Apple/Google/email) | consumer mobile app (`/app/*` except public config) |

Build the middleware per-route so swapping `operator` from shared-secret to JWT touches no route code. **Never** authenticate app users via the `accounts` table or operator shared secret — see `CONSUMER-APP-MVP-PLAN.md`.

---

## 3. Endpoints

### Accounts — `accountService`

| Method & Path | Purpose | Auth | Service function |
|---|---|---|---|
| `POST /admins` | Create admin account | operator | `createAdmin` |
| `POST /hosts` | Create host (unclaimed: name, email, phone; no password) | operator | `createHost` |
| `POST /distributors` | Create distributor (unclaimed) | operator | `createDistributor` |
| `POST /runners` | Create runner (unclaimed). Dashboard: Maintenance-only access | operator | `createRunner` |
| `GET /accounts` | List accounts. Query: `role`, `status` | operator | list query |
| `GET /accounts/:id` | Single account (never returns `password_hash`) | operator | get query |
| `PATCH /accounts/:id` | Update contact fields only: `name`, `email`, `phone`. Nothing else is PATCHable | operator | `updateContactInfo` |
| `POST /accounts/:id/suspend` | ACTIVE → SUSPENDED | operator | `suspend` |
| `POST /accounts/:id/reactivate` | SUSPENDED → ACTIVE | operator | `reactivate` |
| `POST /accounts/:id/archive` | any → ARCHIVED (409 if account hosts non-archived locations) | operator | `archive` |
| `POST /accounts/:id/location-access` | Set host/distributor Performance visibility. Body `{ viewScope: "ALL" \| "SELECTED", locationIds?: string[] }`. `ALL` = every non-inventory ACTIVE location (same network set as admin deployable venues); `locationIds` must be empty. `SELECTED` = replace ACL with `locationIds` (may be empty → no locations). 409 if account is not HOST/DISTRIBUTOR, or a location is inventory/archived. Response includes `viewScope` + `locationIds` | operator | `setLocationAccess` |
| `POST /hosts/:id/assign-distributor` | Body `{ distributorId }`; 409 on role mismatch | operator | `assignHostToDistributor` |

Notes: no self-signup routes exist in this phase. `setCredentials` (account claiming) is deliberately **not** exposed until the invite-token flow is designed (ARCHITECTURE §6 security note); do not scaffold it. Account reads (`GET /accounts`, `GET /accounts/:id`) include `viewScope` and `locationIds` (ACL ids; empty when `viewScope` is `ALL`).

### Locations — `locationService`

| Method & Path | Purpose | Auth | Service function |
|---|---|---|---|
| `POST /locations` | Create. Body: `title`, `address`, `latitude`, `longitude`, `isInventory`, optional `hostId`, `distributorId`, `notes` | operator | `createLocation` |
| `GET /locations` | List. Query: `status`, `is_inventory`, `host_id`, `distributor_id`, `has_station` (derived filter: joins current stations) | operator | list query |
| `GET /locations/:id` | Single location, including current station (if any) and host contact | operator | get query |
| `PATCH /locations/:id` | Update: `title`, `address`, coords (pair required together), `hostId`, `distributorId` | operator | update |
| `POST /locations/:id/notes` | Append a timestamped note line. Body `{ note }` | operator | `addNote` |
| `POST /locations/:id/deactivate` | ACTIVE → INACTIVE (seasonal pause) | operator | `markInactive` |
| `POST /locations/:id/reactivate` | INACTIVE → ACTIVE | operator | reactivate |
| `POST /locations/:id/archive` | any → ARCHIVED; 409 if a station is currently at the location | operator | `archiveLocation` |

### Stations — `stationService`

| Method & Path | Purpose | Auth | Service function |
|---|---|---|---|
| `POST /stations` | Register one. Body: `manufactureId`, `type`, `stripeReaderId`. Actor from auth context. 409 duplicate manufacture_id. Lands at default inventory location, status OPERATIONAL, with a movement row | operator | `registerStation` |
| `POST /stations/batch` | Register many (pallet unboxing). Body: array of the above. One transaction | operator | `registerStations` |
| `GET /stations` | List. Query: `status`, `location_id`, `is_inventory` (of current location), `type`, `manufacture_id`, `include_live` (when `true`, each row includes Energo `live` enrichment via **one bulk** `/api/cabinet?sort=isOnline` list joined by manufacture id, with per-id fallback for misses; failures → `"live": null` per row) | operator | list query (+ optional `energo` client) |
| `GET /stations/by-manufacture/:manufactureId` | Single station looked up by manufacture serial (e.g. `CUBT062510000029`) with live data. **Use this from the dashboard when the UI still has legacy manufacture IDs.** 404 if unknown | operator | get by manufacture + `energo` client |
| `GET /stations/:id` | Single station by internal UUID (`stationId`). DB fields + live data (online, battery count, open slots) enriched via the Energo client. Live-data failure does not 500 — return DB fields with `"live": null` | operator | get + `energo` client |
| `GET /stations/:id/movements` | Movement history, newest first. Query: `from`, `to` | operator | `getMovementHistory` |
| `POST /stations/:id/move` | Body `{ toLocationId, description }`. 409: station RETIRED, destination ARCHIVED, or venue occupied | operator | `moveStation` |
| `POST /stations/swap` | Body `{ stationAId, stationBId, description }`. Atomic two-way exchange | operator | `swapStation` |
| `POST /stations/:id/status` | Body `{ status }` ∈ OPERATIONAL/FLAGGED/RETIRED. The only way status changes | operator | `changeStatus` |
| `POST /stations/:id/stripe-reader` | Body `{ stripeReaderId }` — must be a Terminal reader id (`tmr_…`). 409 if that reader is already on another station | operator | `updateStripeReaderId` |

### Revenue — `revenueService`

| Method & Path | Purpose | Auth | Service function |
|---|---|---|---|
| `GET /revenue/stations` | Per-station Terminal revenue for an inclusive date range. Query: `from=YYYY-MM-DD`, `to=YYYY-MM-DD` (America/Chicago boundaries). Pages Stripe charges, groups by `payment_method_details.card_present.reader` (`tmr_…`), joins `stations.stripeReaderId`. Response: `{ success, count, data[], unmatched[] }`. `data[]` rows: `station_id`, `manufacture_id`, `station_title`, `money` (cents), `currency`, `charge_count`. `unmatched[]`: `tmr_` totals with no station row | operator | `getStationRevenueByDateRange` |
| `GET /revenue/daily` | Account-wide daily revenue for an inclusive date range. Query: `from=YYYY-MM-DD`, `to=YYYY-MM-DD` (America/Chicago). Sums all Stripe charges by day (`amount_captured − amount_refunded`); no per-reader grouping. Response matches legacy MTD chart envelope: `{ success, range, positive, negative, ppositive, pnegative, data[] }` with `data[]` rows `date`, `rents`, `money`, `prents`, `pmoney` | operator | `getDailyChargeRevenue` |
| `GET /revenue/today` | Account-wide revenue for today (America/Chicago, start of day → now). Response: `{ success, data: { date, money_cents, charge_count } }` | operator | `getTodayRevenue` |
| `GET /revenue/performance` | **Preferred for the Performance page.** Crawls Stripe charges for the selected range (and today when outside the range), then derives stations + daily + today. Query: `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, optional `include_prior=1` (also crawls the prior-month window for chart comparison; deferred by the dashboard after first paint), optional `account_id` (interim host/distributor scope until JWT carries the subject). Without `account_id`, or when the account is ADMIN: full network. HOST/DISTRIBUTOR: stations whose **current** location is in the account's location scope (`viewScope` ALL → non-inventory ACTIVE locations; SELECTED → ACL). Empty scope → zeroed stations/daily/today (no unmatched). Response: `{ success, from, to, stations, daily, today, include_prior, account_id }` | operator | `getPerformanceRevenue` |

### Batteries — `batteryService`

| Method & Path | Purpose | Auth | Service function |
|---|---|---|---|
| `POST /batteries` | Register. Body: `manufactureId`, optional `cuubId`, `variant` (free-form; normalized — trimmed, case-folded to existing spelling) | operator | `registerBattery` |
| `GET /batteries` | List. Query: `variant`, `cuub_id` (exact) | operator | list query |
| `GET /batteries/:id` | Single battery with current station | operator | get query |
| `POST /batteries/:id/reassign-cuub-id` | Body `{ newCuubId, variant? }`. 409 if cuub_id taken; variant normalized as on register. Response includes the replaced value | operator | `reassignCuubId` |

### Movements — read-only (writes happen only via station move/swap)

| Method & Path | Purpose | Auth | Service function |
|---|---|---|---|
| `GET /movements` | Global movement log. Query: `station_id`, `location_id` (matches from OR to), `moved_by`, `from`, `to` (time window) | operator | list query |

### Site visits — `siteVisitService`

| Method & Path | Purpose | Auth | Service function |
|---|---|---|---|
| `GET /battery/:cuubId` | Map-scan rental readout. Looks up battery by `cuubId`, fetches latest Energo lease order by `manufactureId`, returns `{ manufacture_id, sticker_id, type?, startTime, returnTime, duration, amountPaid }` (`duration` is `HH:MM:SS` or `"Battery returned"`; `amountPaid` from Energo (`policyInfo.deposit` while out; `realAmount`/`totalPay`/`amount` after return)). Missing Energo token → **503**. Unknown sticker → **404** | machine | `getBatteryRentalInfo` |
| `POST /battery/:cuubId` | **Legacy wire contract preserved** (ARCHITECTURE §9.3, verified from legacy code): success **201**, `data` = visit row including static `"sizl": false`; request body ignored; optional `manufacture_id` header accepted; unknown cuubId → **404, no row**. Server-side at insert: resolve battery, snapshot variant, resolve current rental via the Energo client, stamp `order_id` + `duration_after_rent`; Energo failure/no rental still records the visit (NULL enrichment, 201). No PATCH route exists — do not scaffold it | machine | `recordVisit` |
| `GET /visits` | List. Query: `variant`, `battery_id`, `resolved` (has battery_id), `from`, `to` | operator | list query |
| `GET /visits/stats` | The variant-effectiveness metric. Query: `from`, `to`, `group_by=variant`. Returns per-variant: visit count, converted count (order_id present), conversion rate | operator | stats query |

### Tickets — `ticketService`

| Method & Path | Purpose | Auth | Service function |
|---|---|---|---|
| `POST /tickets` | Body: `stationId`, `tasks` (array; single string accepted for legacy clients), `description?`. Legacy Title-Case task values accepted and normalized to SCREAMING_SNAKE; 400 on unknown task value | machine + operator | `createTicket` |
| `GET /tickets` | Query: `status`, `station_id`, `task` (any-overlap match) | operator | list query |
| `POST /tickets/:id/resolve` | OPEN → RESOLVED, sets `resolved_at`. Idempotent | operator | `resolveTicket` |

### Public

| Method & Path | Purpose | Auth | Service function |
|---|---|---|---|
| `GET /map` | Customer-facing map pins: locations where `NOT is_inventory AND status='ACTIVE'`, each with coordinates, title, and whether a station is currently present. **Never includes inventory locations, notes, host/account data, or internal IDs beyond location_id**. No Energo. | public | map query |
| `GET /map/live` | Same pins as `/map` plus `live: { online, batteryCount, openSlots } \| null` per row. Energo enrichment is server-side. Energo down → still **200** with pins and `live: null`. No `manufactureId` / Stripe / host / inventory. | public | map query + energo |
| `GET /health` | Liveness: checks DB connectivity. `{ success, data: { db: true } }` | public | — |

**Consumer app map:** prefer `GET /map/live`; fall back to `GET /map` on network/non-2xx. Treat `live: null` as unknown availability (still show pin). Never ship `MACHINE_API_TOKEN` or call operator `GET /stations?include_live=true` from the app.

### Consumer app (`CONSUMER-APP-MVP-PLAN.md`, UML `AppUser`)

App customers live in table **`app_users`**, not `accounts`. No rentals / Cuub Card / subscriptions in MVP. Low-battery proximity alerts run **on-device**; the API does not receive phone battery %.

Auth response envelope uses `{ success, data }` / `{ success: false, error }`. JWT claims: `aud: "app_user"`, `sub: userId`, `exp` ~30 days. Client hydrate: stored token → `GET /app/me`; on **401/403** clear token and show login.

| Method & Path | Purpose | Auth | Service function |
|---|---|---|---|
| `POST /app/auth/request-otp` | **Live.** Body `{ phone }` — Twilio Verify SMS; rate-limited 20s. Response `{ phone, status, sendAttempts }` | public | `requestOtp` |
| `POST /app/auth/verify-otp` | **Live.** Body `{ phone, code }` — returns `{ token, user, isNewUser }` | public | `verifyOtp` |
| `POST /app/auth/dev-login` | **Internal only** when `APP_DEV_AUTH=true`. Same session shape as verify-otp. Not used by production app UI | public | `devLogin` |
| `GET /app/me` | Current app user profile | app_user | `getMe` |
| `PUT /app/me/push-token` | Body `{ expoPushToken }` — store Expo push token | app_user | `setPushToken` |
| `DELETE /app/me` | **Required for App Store (Apple 5.1.1v).** Hard-delete the signed-in `app_users` row (Bearer JWT only; no body, no machine token). Writes an anonymous deletions tombstone, clears OTP rate limit for that phone. Same phone may register again as a new `userId` (`isNewUser: true`). Old JWT → **404** on `/app/me`. Never call `POST /app-users/:id/status` from the app. | app_user | `deleteAppUser` |

### Passthroughs — preserved as-is (ARCHITECTURE §9.3), thin wrappers over clients

| Method & Path | Purpose | Auth |
|---|---|---|
| `GET /pop/:station/:slot` and `/pop/:station/all` | Manufacturer slot ejection | machine |
| `GET /token`, `GET /token/health` | Energo token service | machine |
| `GET /stripe/charges`, `GET /stripe/balance-transactions` | Stripe passthroughs | machine |

---

## 4. Dashboard integration (cuub-dashboard)

The operator dashboard is a separate Next.js app. It talks to **this API only** — no business logic in the Next proxy layer. Point it at cuub-api with one base-URL env var.

### 4.1 Dashboard environment variables

| Variable | Example (local) | Example (production) | Purpose |
|---|---|---|---|
| `CUUB_API_URL` | `http://localhost:3001` | `https://<cuub-api-cloud-run-url>` | Base URL for all API calls. No trailing slash. |
| `MACHINE_API_TOKEN` | same value as cuub-api `.env` | Secret Manager injection | Operator-tier auth until JWT login ships. Send on every operator request. |

**cuub-api** (backend) — Energo token (cutover: **read-only** from legacy):

| Variable | Purpose |
|---|---|
| `ENERGO_TOKEN_DATABASE_URL` or `LEGACY_DATABASE_URL` | **Preferred.** Connection string to legacy Cloud SQL **`postgres`** DB (not `cuub`). cuub-api runs `SELECT value FROM token LIMIT 1` — **no Puppeteer**. Legacy `api.cuub.tech` keeps writing that row. |
| `ENERGO_OID` | Required Energo header. Set to `3526` unless told otherwise. |

Optional / fallbacks (avoid for cutover if you want zero extraction on cuub-api):

| Variable | Purpose |
|---|---|
| `ENERGO_API_TOKEN` | Static bearer (local debug only) |
| `ENERGO_TOKEN_ENDPOINT` | Deprecated HTTP fetch (often hits legacy `GET /token` which **re-extracts**) |
| `ENERGO_USERNAME` / `ENERGO_PASSWORD` / `OPENAI_API_KEY` | Puppeteer extraction on cuub-api — leave **unset** while legacy owns extraction |
| `PUPPETEER_EXECUTABLE_PATH` | Only if cuub-api does extraction |

Optional: `TOKEN_HEALTH_PROBE_STATION_ID`, `TOKEN_REFRESH_URL`, `ENERGO_TOKEN_TTL_MS`.

When `ENERGO_TOKEN_DATABASE_URL` / `LEGACY_DATABASE_URL` is set, `GET /token` re-reads `postgres.token` into the in-memory cache (does not log in). The Puppeteer scheduler on cuub-api stays off unless extraction env vars are set.

### 4.2 Auth header (every operator request)

```
Authorization: Bearer <MACHINE_API_TOKEN>
```

Alternative accepted by the API: `x-api-key: <MACHINE_API_TOKEN>`.

### 4.3 Station live data — endpoints for the dashboard

**Recommended for station list + online/slot columns:**

```
GET /stations?include_live=true&limit=200
```

Returns every station with `currentLocation` joined and a `live` object per row.

**Recommended for station detail when the UI has a manufacture serial (legacy IDs):**

```
GET /stations/by-manufacture/CUBT062510000029
```

**For mutations** (`move`, `swap`, `status`, `movements`): use the internal UUID `stationId` from list/detail responses — not the manufacture serial.

```
POST /stations/{stationId}/move
POST /stations/{stationId}/status
GET  /stations/{stationId}/movements
```

### 4.4 Response shapes

**Single station with live data** (`GET /stations/:id` or `GET /stations/by-manufacture/:manufactureId`):

```json
{
  "success": true,
  "data": {
    "stationId": "459b0695-26ba-487d-a042-88f5fede317b",
    "manufactureId": "CUBT062510000029",
    "type": "SLOT_6_WHITE",
    "status": "OPERATIONAL",
    "stripeReaderId": "cus_TeYJ78uzshxpCu",
    "currentLocationId": "...",
    "createdAt": "2026-...",
    "updatedAt": "2026-...",
    "live": {
      "online": true,
      "batteryCount": 4,
      "openSlots": 2
    }
  }
}
```

When Energo is down, token is missing, or the probe fails: `"live": null` (HTTP 200 — never 500).

**List with live** (`GET /stations?include_live=true`):

cuub-api fetches Energo's cabinet **list** once (`/api/cabinet?sort=isOnline,desc`, paginated) and joins by `manufactureId`. Stations missing from that list use the single-cabinet lookup. Wire shape unchanged — each row still has `live: { online, batteryCount, openSlots } | null`.

```json
{
  "success": true,
  "count": 34,
  "data": [
    {
      "stationId": "...",
      "manufactureId": "CUBT062510000029",
      "type": "SLOT_6_WHITE",
      "status": "OPERATIONAL",
      "currentLocation": {
        "locationId": "...",
        "title": "Annoyance Theater",
        "address": "851 W Belmont Ave, Chicago, IL 60657",
        "latitude": 41.93985,
        "longitude": -87.65132,
        "isInventory": false,
        "status": "ACTIVE"
      },
      "live": { "online": true, "batteryCount": 4, "openSlots": 2 }
    }
  ]
}
```

### 4.5 Legacy → cuub-api field mapping

The old `api.cuub.tech` station object conflated venue + hardware. The new API separates **locations** and **stations**. Use this mapping when updating dashboard fetch code:

| Legacy (`api.cuub.tech`) | cuub-api |
|---|---|
| `data.id` (manufacture serial) | `data.manufactureId` |
| `data.title`, `address`, `latitude`, `longitude` | `data.currentLocation.title`, `.address`, `.latitude`, `.longitude` |
| `data.online` | `data.live?.online` |
| `data.filled_slots` | `data.live?.batteryCount` |
| `data.open_slots` | `data.live?.openSlots` |
| URL `/stations/CUBT...` | `GET /stations/by-manufacture/CUBT...` |
| (n/a) | `data.stationId` — **required for move/swap/status routes** |

### 4.6 Local full-stack setup (dashboard + cuub-api)

Three terminals:

1. **DB proxy:** `cloud-sql-proxy keyextract-482721:us-central1:cuub-db --port 5434`
2. **cuub-api:** export `DATABASE_URL`, `MACHINE_API_TOKEN`, `ENERGO_USERNAME`, `ENERGO_PASSWORD`, `OPENAI_API_KEY`, `ENERGO_OID`, then `npm run dev` (port `3001`)
3. **cuub-dashboard:** set `CUUB_API_URL=http://localhost:3001` and `MACHINE_API_TOKEN=<same token>`, then `npm run dev`

Verify from the dashboard machine:

```bash
curl http://localhost:3001/health
curl -H "Authorization: Bearer $MACHINE_API_TOKEN" "http://localhost:3001/stations?include_live=true&limit=5"
```

### 4.7 Other dashboard screens (existing endpoints)

| Screen | Endpoint(s) |
|---|---|
| Locations | `GET /locations`, `GET /locations/:id`, `POST /locations`, verb sub-routes |
| Accounts / hosts | `GET /accounts`, `POST /hosts`, `POST /distributors`, etc. |
| Batteries | `GET /batteries`, `POST /batteries`, reassign-cuub-id route |
| Movements log | `GET /movements` |
| Visits / stats | `GET /visits`, `GET /visits/stats` |
| Tickets | `GET /tickets`, `POST /tickets`, `POST /tickets/:id/resolve` |
| Customer map (public) | `GET /map` — no auth |

### 4.8 Production cutover

1. Deploy cuub-api to Cloud Run with Energo env vars configured.
2. Set dashboard `CUUB_API_URL` to the Cloud Run URL.
3. Keep legacy `api.cuub.tech` running as rollback until soak completes.
4. Deploy cuub-api with Energo extraction secrets (`ENERGO_USERNAME`, `ENERGO_PASSWORD`, `OPENAI_API_KEY`, `ENERGO_OID`). Legacy `api.cuub.tech` is not required for token refresh.

---

## 5. Rules for the implementing session

1. Every route in this document, no routes not in this document. Ambiguity → ask, don't invent.
2. Route files contain zero SQL and zero Prisma calls — services only.
3. The legacy-shape endpoint (`POST /battery/:cuubId`) must match the legacy wire contract as captured and annotated in `reference/legacy-api-examples.md` — where the old documentation and the old code disagree, the code wins (the reference notes each case). Test by replaying those exchanges verbatim. `PATCH /battery/:cuubId` must NOT exist (404).
4. `GET /map` is the only unauthenticated data endpoint; treat its field list as a security boundary, not a formatting choice.
5. Integration tests per route: the success case, each documented 4xx, and the envelope shape.
