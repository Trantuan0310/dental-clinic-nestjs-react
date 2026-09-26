#!/usr/bin/env bash
# Load the opening-day configuration (services, prices, dentist assignments,
# working hours, inventory, expense categories and staff accounts) into the
# VPS database. Safe to run again: it only adds what is missing.
#
#   cd /opt/dental-clinic/production
#   bash scripts/clinic-setup-vps.sh /opt/dental-clinic/staff.json
#
# The staff file is optional (without it no accounts are created); copy
# backend/prisma/clinic-setup/staff.example.json and fill in real people.
# RESET_SCHEDULES=1 replaces dentists' existing working hours with the
# standard Mon–Sat 08:00–12:00 / 13:30–19:00 schedule.
# RESET_PASSWORDS=a@x,b@y issues new temporary passwords for those accounts.
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found in $(pwd)"
args=()
if [ -n "${1:-}" ]; then
  [ -f "$1" ] || die "staff file $1 not found"
  args+=(-v "$(realpath "$1"):/tmp/clinic-staff.json:ro" -e CLINIC_STAFF_FILE=/tmp/clinic-staff.json)
fi
if [ "${RESET_SCHEDULES:-}" = 1 ]; then args+=(-e RESET_SCHEDULES=1); fi
if [ -n "${RESET_PASSWORDS:-}" ]; then args+=(-e "RESET_PASSWORDS=$RESET_PASSWORDS"); fi

# The migrate image carries prisma/ and ts-node; rebuild it so it has the
# current setup data.
compose build migrate
compose run --rm ${args[@]+"${args[@]}"} migrate \
  node node_modules/ts-node/dist/bin.js --transpile-only prisma/clinic-setup.ts
