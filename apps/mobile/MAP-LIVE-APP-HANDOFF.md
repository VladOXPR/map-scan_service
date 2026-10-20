# Map live — consumer app handoff

**Base:** `https://platform.cuub.tech`  
**Do not** put `MACHINE_API_TOKEN` in the app. **Do not** call `/stations?include_live=true`.

| Endpoint | Use |
|----------|-----|
| `GET /map/live` | Preferred — pins + slot/online |
| `GET /map` | Fallback if `/map/live` HTTP fails |

Flow: try `/map/live` → on network/non-2xx use `/map` → always render pins; treat `live: null` as unknown (no count).

- No auth; no `manufactureId` / Stripe / host / inventory
- Energo down → still **200** with pins and `live: null`

Example row from `/map/live`:

```json
{
  "locationId": "…",
  "title": "…",
  "latitude": 41.9,
  "longitude": -87.6,
  "hasStation": true,
  "live": { "online": true, "batteryCount": 4, "openSlots": 2 }
}
```

App wiring: [`src/features/stations/api.ts`](src/features/stations/api.ts) + [`src/features/stations/mappers.ts`](src/features/stations/mappers.ts).
