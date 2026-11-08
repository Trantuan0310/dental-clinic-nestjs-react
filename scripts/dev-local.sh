#!/usr/bin/env bash
# Chạy thử cục bộ để xem tính năng trên trình duyệt (chỉ cho máy phát triển, KHÔNG dùng cho VPS).
#   scripts/dev-local.sh start   Postgres + backend (dist) + vite 5173, DB demo `guidedemo`
#   scripts/dev-local.sh stop
# Cần: `cd backend && npm run build` trước khi start; DB `guidedemo` đã seed (clinic-setup.ts rồi seed-demo-clinic.ts).
# Tài khoản demo (chỉ dev): admin@clinic.local / Admin123!, hanh.le@clinic.local (lễ tân), an.nguyen@clinic.local (bác sĩ) / Password123!
# AI giả lập: đặt AI_BASE_URL/AI_API_KEY/AI_MODEL trước khi gọi (ví dụ trỏ tới một server giả ở cổng 4999).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${TMPDIR:-/tmp}/dental-dev"
mkdir -p "$LOG"

case "${1:-}" in
  start)
    (pg_ctlcluster 16 main start 2>/dev/null || true)
    [ -f "$ROOT/backend/dist/main.js" ] || { echo "Chưa build backend: cd backend && npm run build" >&2; exit 1; }
    (
      cd "$ROOT/backend"
      export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/guidedemo}" \
        NODE_ENV=development JWT_SECRET=dev-secret-at-least-32-characters-long-xx THROTTLE_LIMIT=100000 \
        CORS_ORIGIN=http://localhost:5173 EMAIL_MOCK=true REDIS_URL= GEMINI_API_KEY= \
        CLINIC_NAME="Nha khoa GenSmile" CLINIC_PHONE=0900000000
      setsid nohup node dist/main > "$LOG/backend.log" 2>&1 &
      echo $! > "$LOG/backend.pid"
    )
    (
      cd "$ROOT/frontend"
      setsid nohup npx vite --port 5173 > "$LOG/vite.log" 2>&1 &
      echo $! > "$LOG/vite.pid"
    )
    for _ in $(seq 1 40); do
      curl -fs -o /dev/null http://127.0.0.1:5173/ && grep -q "successfully started" "$LOG/backend.log" 2>/dev/null && break
      sleep 1
    done
    echo "Sẵn sàng: http://127.0.0.1:5173 (log ở $LOG)"
    ;;
  stop)
    # Dừng theo nhóm tiến trình (setsid), KHÔNG dùng `pkill -f "node dist/main"` (từng giết nhầm cả shell).
    for f in backend vite; do
      [ -f "$LOG/$f.pid" ] && kill -- "-$(cat "$LOG/$f.pid")" 2>/dev/null || true
      rm -f "$LOG/$f.pid"
    done
    echo "Đã dừng"
    ;;
  *) echo "Dùng: $0 start|stop" >&2; exit 2 ;;
esac
