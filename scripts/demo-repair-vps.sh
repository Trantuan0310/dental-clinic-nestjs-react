#!/usr/bin/env bash
# Repair demo visits that sit outside their dentist's working hours — the
# cause of the clinic inbox mail "Lịch hẹn cần gọi khách ... Bác sĩ không có
# lịch làm việc ngày này". Upcoming visits of demo patients whose dentist does
# not work at that time move to a dentist who does (and is free); when none is
# free the visit is removed (soft delete). Also gives dentists with demo visits
# but no hours a schedule, and clears the pending reminder flags.
#
#   cd /opt/dental-clinic/production
#   bash scripts/demo-repair-vps.sh
#
# Only touches visits of demo patients (the ones seed-demo-clinic.ts created).
# Safe to run again.
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found in $(pwd)"

# The migrate image carries prisma/ and ts-node; rebuild it so it has the
# current script.
compose build migrate
compose run --rm -e DEMO_REPAIR=1 migrate \
  node node_modules/ts-node/dist/bin.js --transpile-only prisma/seed-demo-clinic.ts
