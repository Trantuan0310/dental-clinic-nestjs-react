# Nâng cấp VPS gensmile.online

Tài liệu này áp dụng cho máy đang chạy `docker-compose.prod.yml` (PostgreSQL nội bộ, xem [VPS_LOCAL_POSTGRES_DEMO.md](./VPS_LOCAL_POSTGRES_DEMO.md)). Thư mục dự án là `/opt/dental-clinic/production`, là một git checkout. Tên project compose lấy theo tên thư mục (`production`), nên volume dữ liệu `production_postgres_data` được giữ nguyên qua các lần nâng cấp.

## Lần nâng cấp đầu tiên: từ nhánh `vps-local-postgres-demo-2026-09-23` lên `main`

Máy này từng chạy nhánh demo. Nhánh đó có migration 018–020 riêng, và database đang ghi nhận các migration này. Khi chạy `main`:

- `prisma migrate deploy` bỏ qua 3 migration đó (chúng không có trong repo) rồi chạy tiếp 018–025 của `main`. Việc này đã được thử trên bản sao database dựng từ đúng nhánh demo.
- Migration 025 chuyển dữ liệu cũ sang mô hình mới:
  - `clinic_services` → danh mục `services`, **giữ nguyên ID**.
  - `doctor_services` → `dentist_services`.
  - `doctor_profiles` → `dentist_profiles`.
  - Cột `appointments.service_id` → dòng dịch vụ của lịch hẹn.
  - Các yêu cầu đặt lịch online cũ được giữ nguyên, bệnh nhân vẫn tra cứu được bằng mã cũ. Chi tiết: [online-booking.md](../04_Database/schema-per-module/online-booking.md).
- Thời lượng dịch vụ được làm tròn về bội số 5 phút (5–480). Giá bỏ phần lẻ.
- Chuyên môn, bằng cấp và số năm kinh nghiệm dạng chữ tự do được ghi vào **tiểu sử** của bác sĩ. Sau khi nâng cấp, admin cần chọn lại mã chuyên môn trên từng hồ sơ bác sĩ.
- Các bảng cũ (`clinic_services`, `doctor_services`, `doctor_profiles`) được giữ lại, có ghi chú "safe to drop". Chỉ xóa sau khi đã đối chiếu xong.

## Chạy nâng cấp

```sh
cd /opt/dental-clinic/production
git status --short          # không được có file đã theo dõi bị sửa tay
git fetch origin
# Lần đầu, khi máy chưa có script: lấy script từ origin/main ra file tạm
git show origin/main:scripts/deploy-vps.sh > /tmp/deploy-vps.sh
bash /tmp/deploy-vps.sh     # mặc định lên origin/main
# Các lần sau: bash scripts/deploy-vps.sh [ref]
```

Luôn chạy script khi đang đứng trong thư mục dự án.

Script dừng ngay ở bước đầu tiên bị lỗi. Các bước:

1. **Kiểm tra trước:**
   - có `.env.production`;
   - không có file đã theo dõi bị sửa tay;
   - service `postgres` đang chạy.
2. **Backup:** `pg_dump -Fc` từ container `postgres`, lưu vào `/opt/dental-clinic/backups/db-<thời gian>-<commit cũ>.dump`. Commit cũ được ghi vào `previous-commit-<thời gian>`.
3. **Lấy code mới:** `git fetch`, rồi `git checkout --detach <ref>`.
4. **Build:** `docker compose … build migrate backend web`.
5. **Migrate:** `docker compose … run --rm migrate`.
6. **Khởi động lại:** `docker compose … up -d backend web`. Postgres không bị khởi động lại.
7. **Chờ backend healthy:** tối đa khoảng 2 phút. Nếu hết giờ, script in log backend, commit cũ và file backup.

`.env.production` giữ nguyên. Bản này không cần biến môi trường mới.

## Kiểm tra sau nâng cấp

```sh
curl -fsS https://gensmile.online/health/ready
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 backend
```

Trên giao diện:

1. **Đăng nhập admin:** các mục Nhân sự, Bác sĩ và Dịch vụ đều mở được.
2. **Dịch vụ:** danh mục cũ nằm trong các nhóm `LEGACY_…`. Có thể đổi tên nhóm hoặc chuyển dịch vụ sang nhóm khác.
3. **Bác sĩ:** trên từng hồ sơ, xem lại tiểu sử, chọn mã chuyên môn, và kiểm tra các mục "Nhận đặt lịch online" và "Màu lịch".
4. **Đặt lịch online:** trang `/booking` liệt kê đúng dịch vụ và bác sĩ nhận đặt online. Mục **Yêu cầu đặt lịch** hiện các yêu cầu cũ.

## Rollback

Chỉ quay lại khi bản mới lỗi nặng. Lấy commit cũ và tên file backup từ output của script.

```sh
cd /opt/dental-clinic/production
C="docker compose --env-file .env.production -f docker-compose.prod.yml"
git checkout --detach "$(cat /opt/dental-clinic/backups/previous-commit-<thời gian>)"
$C stop backend web
# Khôi phục database về thời điểm backup (xóa mọi thay đổi sau đó):
$C exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < /opt/dental-clinic/backups/db-<thời gian>-<commit>.dump
$C build backend web
$C up -d backend web
```

Nên khôi phục database khi quay về nhánh demo cũ, vì code cũ không biết các bảng mới. Mọi dữ liệu nhập sau thời điểm backup sẽ mất. Nếu đã có dữ liệu thật phát sinh, hãy xuất riêng phần đó trước khi khôi phục.

Không chạy `docker compose down -v`: lệnh này xóa volume database.
