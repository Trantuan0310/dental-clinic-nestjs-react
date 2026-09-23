# Production release runbook

## Cấu hình đã chuẩn bị

Topology demo VPS: Nginx phục vụ frontend và proxy API trên cùng HTTPS origin → một backend → PostgreSQL 16 nội bộ trong Docker có TLS. Backend không mở cổng trực tiếp ra host, PostgreSQL không publish cổng 5432. Rate limit hiện dùng bộ nhớ của một instance; chưa scale nhiều backend.

Docker Compose có release job `migrate`, backend chỉ chạy sau migrate thành công, web chỉ chạy sau readiness backend. `bootstrap` là profile chạy thủ công, không chạy lại seed mỗi lần deploy.

## Chuẩn bị máy chủ

1. Cài Docker/Compose, trỏ DNS domain, chuẩn bị chứng chỉ TLS hợp lệ gồm `fullchain.pem` và `privkey.pem` trong một thư mục. Nếu dùng Let's Encrypt live symlink, tạo thư mục riêng chứa bản sao thực của hai file hoặc mount cả cây certificate phù hợp; mount chỉ thư mục live có thể làm symlink bị đứt. Thiết lập tự gia hạn và reload Nginx sau gia hạn.
2. Dùng service PostgreSQL 16 trong `docker-compose.prod.yml`. Tạo `POSTGRES_CERT_DIR` và chứng chỉ nội bộ theo [VPS_LOCAL_POSTGRES_DEMO.md](./VPS_LOCAL_POSTGRES_DEMO.md). Các init script 01/02/03 tạo extensions, UUID v7 và sequences trên volume mới.
3. Copy `.env.production.example` thành `.env.production`, nhập domain, hai thư mục certificate, thông tin PostgreSQL nội bộ, JWT ngẫu nhiên và SMTP thật; file production đã được gitignore. Không đưa secret vào VITE_*.
4. Tài khoản migration cần quyền tạo schema/extensions hoặc nhờ DBA tạo extensions trước. Tài khoản ứng dụng cần CONNECT, USAGE schema, CRUD bảng, USAGE/SELECT sequences và EXECUTE UUID function. DBA phải thiết lập default privileges của chủ sở hữu migration cho các bảng/sequence mới. Chạy smoke test bằng đúng tài khoản ứng dụng sau khi cấp quyền.

## Triển khai lần đầu

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate
```

Release dùng Prisma CLI từ lockfile. Script cài 01/02/03, chạy migrate deploy, kiểm tra UUID và sequence. Không dùng migrate reset, db push hoặc seed dữ liệu demo.

Cấp `BOOTSTRAP_ADMIN_EMAIL` và `BOOTSTRAP_ADMIN_PASSWORD` qua môi trường shell/secret manager. Mật khẩu ít nhất 16 ký tự, riêng cho lần khởi tạo; không truyền trực tiếp trong command history. Sau đó:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml --profile bootstrap run --rm bootstrap
docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend web
```

Xóa secret bootstrap khỏi môi trường sau khi dùng; đăng nhập và đổi mật khẩu ngay. Seed không ghi mật khẩu ra log; seed chỉ chạy thủ công vì có cập nhật quyền hệ thống. Cần kiểm chứng luồng PENDING_SETUP trên staging trước khi mở truy cập công khai.

## Nghiệm thu trên staging

- Build Linux sạch; runner có smoke check load Argon2, Nodemailer, Prisma; kiểm thử login/hash thực tế sau đó.
- `/health` là liveness; `/health/ready` truy vấn DB và trả 503 khi DB lỗi. Container healthcheck dùng readiness và không bị throttle.
- HTTPS redirect, certificate, SPA deep link và reload; login/refresh/logout/reset mật khẩu qua SMTP thật.
- Hai client khác nhau không chia sẻ rate limit do IP proxy; backend chỉ tiếp nhận từ edge proxy tin cậy.
- Chạy lại Playwright ba vai trò và ba ca UI đang mở. Bộ API/database local hiện dùng chính release script để kiểm tra fresh install/re-run.
- Backup rồi restore vào DB riêng; đối chiếu dữ liệu và chạy smoke test. Chưa có kết quả restore/tải/SMTP production trong lần sửa này.

## Nâng phiên bản và rollback

Ghi lại commit/image digest release. Tạo backup kiểm chứng được trước migration. Dừng nhận ghi nếu migration yêu cầu cửa sổ bảo trì; chạy job migrate một lần, rồi cập nhật backend/web. Không deploy đồng thời hai release jobs.

Nếu app lỗi và schema tương thích ngược, dùng lại image release trước. Nếu schema không tương thích, dừng ghi và thực hiện kế hoạch phục hồi DB đã diễn tập; không tự động đảo SQL, xóa volume hay restore đè dữ liệu đang phát sinh.

## Kết quả kiểm chứng local ngày 17/09/2026

- Cài sạch dependency bằng `npm ci`: thành công; kiểm tra hash/verify Argon2 và load Nodemailer 9.1.1: thành công trên Windows local.
- Backend unit: **375/375**, 27 suites; bằng chứng `backend/test-results/production-unit.json`.
- API/database cô lập: **68/68**; release script đã chạy migration mới và chạy lại thành công. Bằng chứng `backend/test-results/backend-1789626502247_23880/`.
- Backend build, ESLint các file TypeScript của lần sửa production và Prettier các file backend liên quan: đạt.
- Seed production thiếu thông tin bootstrap: từ chối ngay với exit code 1, trước khi ghi database.
- Compose kiểm tra cấu hình bằng giá trị mẫu và YAML CI đọc hợp lệ. Đây chưa phải kết quả chạy container hay CI remote.
- Audit runtime sau cập nhật tương thích: **15 cảnh báo** (4 high, 10 moderate, 1 low). Chưa kết luận đủ điều kiện public production.

## Những việc vẫn chặn public production (cần nghiệm thu)

- Chưa có host/domain/certificate/DB/SMTP thực tế từ chủ dự án.
- Docker engine local chưa khởi động được, nên chưa xác nhận image Linux hoàn chỉnh. CI đã thêm build ba image và smoke runtime dependency; chưa có kết quả CI remote.
- Audit dependency còn cảnh báo, bao gồm high. Đã cập nhật các bản tương thích bằng npm audit fix trong lockfile; không force nâng major NestJS. Xem `backend/test-results/production-dependency-audit-after.json`, cần xử lý/đánh giá riêng trước release.
- Các hạng mục UI, backup/restore, upload nếu dùng, thanh toán gửi lại từng phần, tải và dịch vụ ngoài vẫn cần nghiệm thu như báo cáo readiness.
