#!/usr/bin/env bash
# Hồ sơ công khai và đánh giá mẫu cho các bác sĩ demo (trang đặt lịch online):
# chỉ điền trường hồ sơ còn trống, chỉ thêm đánh giá cho lần khám mẫu chưa có. Chạy lại an toàn.
#
#   cd /opt/dental-clinic/production
#   bash scripts/demo-profiles-vps.sh
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
compose run --rm migrate \
  node node_modules/ts-node/dist/bin.js --transpile-only prisma/seed-demo-profiles.ts
