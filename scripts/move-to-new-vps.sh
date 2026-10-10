#!/usr/bin/env bash
# Move the clinic from the old VPS to THIS (new) VPS. Run on the NEW VPS as root:
#
#   bash move-to-new-vps.sh IP_MAY_CU            # trial run: the old VPS keeps working
#   FINAL=1 bash move-to-new-vps.sh IP_MAY_CU    # real move: stops the old app first
#
# It installs Docker, copies .env.production and the certificate folders from
# the old VPS, copies the database (pg_dump -> pg_restore), builds, migrates
# and starts the app. Safe to run again: each run reloads the latest data from
# the old VPS. The old VPS is never deleted; DNS is changed by hand afterwards.
set -euo pipefail

OLD="${1:-}"
BASE=/opt/dental-clinic
APP=$BASE/production
REPO=https://github.com/trantuan0310/dental-clinic-nestjs-react.git
DUMP=$BASE/move.dump

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mLỖI: %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$OLD" ] || die "Thiếu IP máy cũ. Cách chạy: bash move-to-new-vps.sh IP_MAY_CU"
[ "$(id -u)" = 0 ] || die "Hãy chạy bằng tài khoản root"

say "1/9 Cài phần mềm cần thiết (vài phút)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null
apt-get install -y git curl rsync ufw openssh-client >/dev/null
timedatectl set-timezone Asia/Ho_Chi_Minh 2>/dev/null || true
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
docker compose version >/dev/null || die "Không cài được Docker Compose"

# Building the images needs memory: add 4 GB swap on small machines.
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 3500 ] && [ -z "$(swapon --show)" ]; then
  say "Máy có ${mem_mb} MB RAM: tạo thêm 4 GB swap"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "2/9 Mở tường lửa (SSH, web)"
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

say "3/9 Kết nối tới máy cũ $OLD"
[ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519 -q
if ! ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "root@$OLD" true 2>/dev/null; then
  echo "Nhập MẬT KHẨU ROOT CỦA MÁY CŨ (gõ sẽ không hiện chữ, gõ xong bấm Enter):"
  ssh-copy-id -o StrictHostKeyChecking=accept-new "root@$OLD" >/dev/null \
    || die "Không đăng nhập được máy cũ. Kiểm tra lại IP và mật khẩu root của máy cũ."
fi
OLDSSH=(ssh -o BatchMode=yes "root@$OLD")
"${OLDSSH[@]}" "test -f $APP/.env.production" || die "Máy cũ không có $APP/.env.production"

say "4/9 Lấy mã nguồn"
mkdir -p "$BASE"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q origin
  git -C "$APP" checkout -q --detach origin/main
else
  git clone -q "$REPO" "$APP"
fi

say "5/9 Chép cấu hình và chứng chỉ từ máy cũ"
rsync -a "root@$OLD:$APP/.env.production" "$APP/.env.production"
envval() { grep -E "^$1=" "$APP/.env.production" | tail -1 | cut -d= -f2- | tr -d "\"'"; }
TLS_DIR=$(envval TLS_CERT_DIR)
PG_DIR=$(envval POSTGRES_CERT_DIR)
[ -n "$TLS_DIR" ] && [ -n "$PG_DIR" ] || die "Thiếu TLS_CERT_DIR hoặc POSTGRES_CERT_DIR trong .env.production"
for d in "$TLS_DIR" "$PG_DIR"; do
  mkdir -p "$d"
  rsync -aL "root@$OLD:$d/" "$d/"   # -L: copy real files behind Let's Encrypt symlinks
done
# The key must belong to the user PostgreSQL runs as in the image we use.
PG_IMAGE=$(awk '/^  postgres:/{f=1} f && /image:/{print $2; exit}' "$APP/docker-compose.prod.yml")
PG_UID=$(docker run --rm --entrypoint id "${PG_IMAGE:-postgres:16-alpine}" -u postgres)
PG_GID=$(docker run --rm --entrypoint id "${PG_IMAGE:-postgres:16-alpine}" -g postgres)
chown "$PG_UID:$PG_GID" "$PG_DIR"/server.crt "$PG_DIR"/server.key
chmod 644 "$PG_DIR"/server.crt
chmod 600 "$PG_DIR"/server.key

OLDDC="cd $APP && docker compose --env-file .env.production -f docker-compose.prod.yml"
if [ "${FINAL:-}" = 1 ]; then
  say "6/9 CHUYỂN THẬT: dừng phần mềm trên máy cũ (database máy cũ vẫn giữ nguyên)"
  "${OLDSSH[@]}" "$OLDDC stop backend web"
else
  say "6/9 Chạy thử: máy cũ vẫn hoạt động bình thường"
fi

say "7/9 Sao lưu database máy cũ và chép sang"
"${OLDSSH[@]}" "$OLDDC exec -T postgres sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Fc'" > "$DUMP"
[ -s "$DUMP" ] || die "File sao lưu rỗng"
echo "Đã sao lưu: $(du -h "$DUMP" | cut -f1)"

cd "$APP"
DC=(docker compose --env-file .env.production -f docker-compose.prod.yml)
say "8/9 Nạp dữ liệu vào máy mới"
"${DC[@]}" up -d postgres
for _ in $(seq 1 30); do
  "${DC[@]}" exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1 && break
  sleep 2
done
"${DC[@]}" stop backend web >/dev/null 2>&1 || true
# A fresh, empty database each run, so nothing from a trial run can remain.
"${DC[@]}" exec -T postgres sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""' >/dev/null \
  || die "Không tạo lại được database trên máy mới"
RESTORE_LOG=$BASE/restore.log
"${DC[@]}" exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < "$DUMP" > "$RESTORE_LOG" 2>&1 || true
# Only "already exists" (e.g. the public schema) is expected; anything else stops here.
if grep -E 'error:' "$RESTORE_LOG" | grep -v 'already exists' | grep -v 'errors ignored on restore' | grep -q .; then
  cat "$RESTORE_LOG"
  die "Nạp dữ liệu có lỗi (xem ở trên, lưu tại $RESTORE_LOG). Máy cũ không bị ảnh hưởng."
fi
users=$("${DC[@]}" exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM users"' | tr -d '[:space:]')
[ "${users:-0}" -gt 0 ] 2>/dev/null || die "Nạp dữ liệu không thành công (không thấy tài khoản nào)"
echo "Dữ liệu đã nạp: $users tài khoản"

say "9/9 Build và khởi động (lần đầu 5-15 phút)"
"${DC[@]}" build migrate backend web
"${DC[@]}" run --rm migrate
"${DC[@]}" up -d backend web
for _ in $(seq 1 40); do
  "${DC[@]}" ps backend | grep -q '(healthy)' && break
  sleep 5
done
"${DC[@]}" ps backend | grep -q '(healthy)' || { "${DC[@]}" logs --tail 80 backend; die "Backend chưa chạy được, xem log ở trên"; }

DOMAIN=$(envval DOMAIN)
NEW_IP=$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
say "XONG. Máy mới đang chạy với dữ liệu mới nhất."
CERT=$(ls "$TLS_DIR"/fullchain.pem "$TLS_DIR"/*.crt 2>/dev/null | head -1 || true)
if [ -n "$CERT" ]; then
  EXPIRES=$(openssl x509 -enddate -noout -in "$CERT" | cut -d= -f2)
  printf '\n\033[1;33mLƯU Ý: script chỉ chép chứng chỉ HTTPS hiện tại, CHƯA cài tự gia hạn trên máy mới.\nChứng chỉ hết hạn: %s. Trước ngày đó phải cài gia hạn (hỏi lại người hỗ trợ).\033[0m\n' "$EXPIRES"
fi
if [ "${FINAL:-}" = 1 ]; then
  cat <<EOF

Việc còn lại: vào trang quản lý tên miền, đổi bản ghi A của "${DOMAIN}" (và của tên miền gốc nếu có)
sang IP: ${NEW_IP}

Máy cũ đã dừng phần mềm nhưng còn nguyên dữ liệu. Nếu máy mới có sự cố, quay lại máy cũ bằng:
  ssh root@${OLD} "${OLDDC} up -d backend web"
rồi trỏ tên miền về lại ${OLD}.
EOF
else
  cat <<EOF

Đây là CHẠY THỬ. Để xem thử trên máy tính của bạn, thêm dòng sau vào file hosts:
  ${NEW_IP}  ${DOMAIN}
rồi mở https://${DOMAIN}. Kiểm tra xong nhớ XÓA dòng đó.

Khi muốn chuyển thật, chạy lại trên máy mới:
  FINAL=1 bash $BASE/move-to-new-vps.sh ${OLD}
EOF
fi
