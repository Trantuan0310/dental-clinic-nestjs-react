#!/usr/bin/env bash
# =============================================================================
# perf-benchmark.sh — measure p95 latency of representative list endpoints.
#
# Requires:
#   - jq (https://stedolan.github.io/jq/)
#   - curl, awk, sort
#   - A running backend with $API_BASE_URL (default http://localhost:3000)
#
# Usage:
#   API_BASE_URL=http://localhost:3000 N=20 ./scripts/perf-benchmark.sh
#
# The script logs in with a default seed user (admin@dental.local / admin123),
# then hits each endpoint N times and reports p50/p95/max timings in ms.
# Run before and after the optimization changes; the delta is the impact.
# =============================================================================

set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
API="${API_BASE_URL}/api/v1"
N="${N:-20}"
EMAIL="${EMAIL:-admin@dental.local}"
PASSWORD="${PASSWORD:-admin123}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required (apt-get install jq / brew install jq)" >&2
  exit 1
fi

echo "Authenticating as ${EMAIL}..."
LOGIN=$(curl -s -X POST "${API}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")
TOKEN=$(echo "$LOGIN" | jq -r '.data.accessToken')
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: login failed" >&2
  echo "$LOGIN" | jq . >&2
  exit 1
fi

ENDPOINTS=(
  "/patients?page=1&pageSize=20"
  "/appointments?from=$(date -u -d 'today' +%FT00:00:00Z)&to=$(date -u -d 'tomorrow' +%FT00:00:00Z)"
  "/invoices?status=ISSUED"
  "/admin/roles"
  "/admin/users?page=1&pageSize=20"
)

echo ""
printf '%-50s | %8s | %8s | %8s\n' 'endpoint' 'p50ms' 'p95ms' 'maxms'
printf '%-50s-+-%8s-+-%8s-+-%8s\n' "$(printf '%.0s-' {1..50})" '--------' '--------' '--------'

for EP in "${ENDPOINTS[@]}"; do
  TIMES_FILE=$(mktemp)
  for i in $(seq 1 "$N"); do
    curl -s -o /dev/null \
      -w '%{time_total}\n' \
      -H "Authorization: Bearer ${TOKEN}" \
      "${API}${EP}" >> "$TIMES_FILE"
  done
  # Convert seconds -> ms (float), sort, compute percentiles.
  STATS=$(awk '{ printf("%.0f\n", $1*1000) }' "$TIMES_FILE" \
    | sort -n \
    | awk -v n="$N" '
        { a[NR]=$1 }
        END {
          p50 = a[int(NR*0.50 + 0.5)]
          p95 = a[int(NR*0.95 + 0.5)]
          mx  = a[NR]
          printf "%-50s | %8d | %8d | %8d\n", ENVIRON["EP"], p50, p95, mx
        }' EP="$EP")
  echo "$STATS"
  rm "$TIMES_FILE"
done

echo ""
echo "Done. Compare against previous run to see the optimization impact."