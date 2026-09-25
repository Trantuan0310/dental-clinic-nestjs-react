# VPS demo với PostgreSQL nội bộ

Cấu hình `docker-compose.prod.yml` chạy PostgreSQL 16 cùng VPS trong service `postgres`. Database chỉ nằm trên mạng Docker, không publish cổng 5432 ra Internet. Volume `postgres_data` giữ dữ liệu qua các lần restart.

## Tạo chứng chỉ TLS cho PostgreSQL

Chạy trên VPS trước lần khởi động đầu tiên:

```sh
mkdir -p /opt/dental-clinic/postgres-certs
openssl req -new -x509 -nodes -days 3650 \
  -subj "/CN=postgres" \
  -out /opt/dental-clinic/postgres-certs/server.crt \
  -keyout /opt/dental-clinic/postgres-certs/server.key
chown 999:999 /opt/dental-clinic/postgres-certs/server.crt /opt/dental-clinic/postgres-certs/server.key
chmod 644 /opt/dental-clinic/postgres-certs/server.crt
chmod 600 /opt/dental-clinic/postgres-certs/server.key
```

`sslmode=require` mã hóa kết nối giữa backend/migration và PostgreSQL. Chứng chỉ này dùng nội bộ Docker; không đưa file `.crt` hoặc `.key` vào Git.

## Môi trường

Copy `.env.production.example` thành `.env.production`, sau đó đặt:

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` — dùng mật khẩu chỉ gồm ký tự hex được tạo bằng `openssl rand -hex 24` để tránh lỗi URL.
- `POSTGRES_CERT_DIR=/opt/dental-clinic/postgres-certs`.
- `DOMAIN=www.gensmile.online` và `TLS_CERT_DIR=/opt/dental-clinic/certs`.
- JWT. Demo để `EMAIL_MOCK=true`; chỉ điền SMTP và đổi thành `EMAIL_MOCK=false` khi cần gửi email thật.

Compose tự tạo connection URL nội bộ `postgresql://...@postgres:5432/...?...sslmode=require`; không đặt `localhost` trong URL của backend.

## Khởi tạo

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate
docker compose --env-file .env.production -f docker-compose.prod.yml --profile bootstrap run --rm bootstrap
docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend web
```

Không chạy `down -v` trên database có dữ liệu. Backup volume/PostgreSQL trước khi migration hoặc nâng phiên bản.