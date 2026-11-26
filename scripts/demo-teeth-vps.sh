#!/usr/bin/env bash
# Sửa dữ liệu demo đã nạp trên VPS cho đúng chuyên môn (bản nạp trước 25/11/2026):
# người lớn không còn điều trị răng sữa, trẻ em không còn implant/mão sứ/tẩy trắng,
# số răng khớp loại dịch vụ, lý do khám và chẩn đoán khớp điều trị, người dị ứng
# Penicillin không còn đơn Amoxicillin; rồi dựng lại sơ đồ răng mẫu.
# Chỉ đụng bệnh nhân demo và lần khám do dữ liệu mẫu tạo. Chạy lại an toàn.
#
#   cd /opt/dental-clinic/production
#   bash scripts/demo-teeth-vps.sh
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
  node node_modules/ts-node/dist/bin.js --transpile-only prisma/seed-demo-fix-teeth.ts
