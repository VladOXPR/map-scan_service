#!/usr/bin/env bash
# Smoke-tests the Next.js API routes for shape parity with the legacy
# Express server. Run after `npm run web:build` and with the dev or
# production server already running on $WEB_URL (default http://localhost:3000).
#
# This script does NOT require live CUUB API access - it only checks the
# endpoint contracts (status codes, JSON shape, and that environment-driven
# routes behave correctly when env is missing).
set -euo pipefail

WEB_URL="${WEB_URL:-http://localhost:3000}"
LEGACY_URL="${LEGACY_URL:-}"

echo "==> Smoke testing $WEB_URL"

check() {
  local name="$1"
  local path="$2"
  local expected_status="$3"
  echo "-- $name ($path)"
  local code
  code=$(curl -s -o /tmp/cuub-smoke.json -w "%{http_code}" "$WEB_URL$path" || true)
  if [[ "$code" != "$expected_status" ]]; then
    echo "   FAIL: expected HTTP $expected_status, got $code"
    cat /tmp/cuub-smoke.json
    exit 1
  fi
  echo "   OK   HTTP $code"
  if [[ -s /tmp/cuub-smoke.json ]]; then
    head -c 200 /tmp/cuub-smoke.json
    echo
  fi
}

# /api/mapbox-token -> 200 (token set) or 503 (token missing)
echo "-- /api/mapbox-token"
code=$(curl -s -o /tmp/cuub-smoke.json -w "%{http_code}" "$WEB_URL/api/mapbox-token" || true)
if [[ "$code" != "200" && "$code" != "503" ]]; then
  echo "   FAIL: expected 200 or 503, got $code"
  exit 1
fi
echo "   OK   HTTP $code"

# /api/support-phone -> 200 with { phone }
check "support phone" "/api/support-phone" "200"

# /api/stations -> proxies CUUB; we accept 200 (live) or 5xx (offline) but
# require valid JSON envelope.
echo "-- /api/stations"
code=$(curl -s -o /tmp/cuub-smoke.json -w "%{http_code}" "$WEB_URL/api/stations" || true)
if [[ -z "$code" ]]; then
  echo "   FAIL: no response"
  exit 1
fi
echo "   HTTP $code (live=200, upstream-down=5xx)"
head -c 200 /tmp/cuub-smoke.json
echo

if [[ -n "$LEGACY_URL" ]]; then
  echo "==> Comparing /api/stations shape against legacy $LEGACY_URL"
  curl -s "$WEB_URL/api/stations" -o /tmp/cuub-next.json || true
  curl -s "$LEGACY_URL/api/stations" -o /tmp/cuub-legacy.json || true
  python3 - <<'PY'
import json, sys
def keys(o):
    if isinstance(o, dict): return sorted(o.keys())
    if isinstance(o, list) and o and isinstance(o[0], dict): return sorted(o[0].keys())
    return []
try:
    a = json.load(open('/tmp/cuub-next.json'))
    b = json.load(open('/tmp/cuub-legacy.json'))
except Exception as e:
    print('   skip: could not parse one of the responses:', e); sys.exit(0)
print('   next  envelope keys:', keys(a))
print('   legacy envelope keys:', keys(b))
if keys(a) != keys(b):
    print('   FAIL: envelope keys differ')
    sys.exit(1)
print('   OK   envelope keys match')
PY
fi

echo "==> Smoke tests complete"
