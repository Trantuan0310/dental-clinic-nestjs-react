#!/usr/bin/env bash
# Sơ đồ răng mẫu cho dữ liệu demo đã có trên VPS: mỗi lần khám đã đóng của
# bệnh nhân demo được ghi sơ đồ răng theo các điều trị đã làm (trám, bọc sứ,
# implant, nhổ), để sơ đồ có màu và mỗi răng có lịch sử. Chỉ ghi lần khám
# chưa có sơ đồ, chỉ đụng bệnh nhân demo. Chạy lại an toàn.
#
#   cd /opt/dental-clinic/production
#   bash scripts/demo-charts-vps.sh
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
  node node_modules/ts-node/dist/bin.js --transpile-only prisma/seed-demo-charts.ts
