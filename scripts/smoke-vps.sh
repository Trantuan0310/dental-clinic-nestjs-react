#!/usr/bin/env bash
# Kiểm tra nhanh một hệ thống đang chạy (VPS hoặc máy dev) sau khi deploy. Chỉ ĐỌC, không ghi dữ liệu.
#   scripts/smoke-vps.sh https://gensmile.online            (kiểm tra công khai)
#   SMOKE_EMAIL=... SMOKE_PASSWORD=... scripts/smoke-vps.sh https://gensmile.online   (thêm kiểm tra sau đăng nhập)
# Thoát mã 0 nếu mọi bước đạt, mã 1 nếu có bước hỏng. Mật khẩu chỉ đọc từ biến môi trường, không in ra.
set -uo pipefail
BASE="${1:-http://127.0.0.1:3000}"
BASE="${BASE%/}"
API="$BASE/api/v1"
out=$(mktemp) || exit 1
trap 'rm -f "$out"' EXIT
fail=0
pass() { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
bad()  { printf '  \033[31mLỖI\033[0m %s\n' "$1"; fail=1; }
get()  { curl -sS -m 20 -o "$out" -w '%{http_code}' "$@" 2>/dev/null || echo 000; }

echo "Kiểm tra $BASE"
code=$(get "$BASE/health")
commit=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("commit",""))' "$out" 2>/dev/null)
if [[ "$code" == 200 && "$commit" =~ ^[0-9a-f]{7,40}$ && "$commit" == "${EXPECTED_COMMIT:-$commit}" ]]; then
  pass "health 200 — commit $commit"
else
  bad "health trả $code, commit ${commit:-thiếu} (mong đợi ${EXPECTED_COMMIT:-git SHA})"
fi
code=$(get "$BASE/health/ready"); [ "$code" = 200 ] && pass "database sẵn sàng" || bad "health/ready trả $code (database?)"
code=$(get "$BASE/"); [ "$code" = 200 ] && pass "trang chủ 200" || bad "trang chủ trả $code"
code=$(get "$API/appointments/dentists"); [ "$code" = 401 ] && pass "API cần đăng nhập (401, đúng)" || bad "API không đăng nhập trả $code (mong đợi 401)"

if [ -n "${SMOKE_EMAIL:-}" ] && [ -n "${SMOKE_PASSWORD:-}" ]; then
  body=$(printf '{"email":"%s","password":"%s"}' "$SMOKE_EMAIL" "$SMOKE_PASSWORD")
  code=$(get -X POST "$API/auth/login" -H 'content-type: application/json' -d "$body")
  TOKEN=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));d=d.get('data',d);print(d.get('accessToken',''))" "$out" 2>/dev/null || true)
  if [ "$code" = 200 ] && [ -n "$TOKEN" ]; then
    pass "đăng nhập"
    auth=(-H "authorization: Bearer $TOKEN")
    for path in appointments/today patients billing/invoices billing/reports/scorecard billing/reports/patient-funnel treatment-plans/pending; do
      code=$(get "${auth[@]}" "$API/$path"); [ "$code" = 200 ] && pass "GET /$path" || bad "GET /$path trả $code"
    done
    code=$(get -X POST "${auth[@]}" "$API/ai/assistant/chat" -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"ai đang chờ khám"}]}')
    if [ "$code" = 200 ]; then
      src=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));d=d.get('data',d);print(d.get('source'))" "$out" 2>/dev/null)
      if [ "$src" != llm ]; then bad "bot chat chạy nhưng ở chế độ dự phòng (AI chưa dùng được: kiểm tra AI_MODEL/khóa, xem log backend)"; else pass "bot chat dùng AI ($src)"; fi
    else bad "bot chat trả $code"; fi
  else
    bad "đăng nhập thất bại ($code)"
  fi
else
  echo "  (bỏ qua kiểm tra sau đăng nhập: đặt SMOKE_EMAIL và SMOKE_PASSWORD để bật)"
fi
[ "$fail" = 0 ] && echo "Tất cả đạt" || echo "Có bước lỗi"
exit "$fail"
