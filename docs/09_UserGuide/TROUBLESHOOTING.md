# Troubleshooting Guide

FAQ cho người dùng và developer.

---

## Người dùng — Lỗi thường gặp

### Không đăng nhập được

**Vấn đề:** Email/mật khẩu không đúng.

**Giải pháp:**
1. Kiểm tra Caps Lock đang tắt.
2. Thử reset mật khẩu: `Quên mật khẩu` → nhập email → kiểm tra hộp thư.
3. Liên hệ admin để reset account.

**Vấn đề:** Tài khoản bị khóa (too many attempts).

**Giải pháp:** Chờ 30 phút hoặc liên hệ admin để unlock.

---

### Không thấy dữ liệu (empty state)

**Dashboard trống:**
- Kiểm tra đã có dữ liệu chưa (appointments, invoices).
- Thử thay đổi khoảng thời gian (date range filter).
- Kiểm tra quyền hạn (role của bạn có được xem không).

**Danh sách bệnh nhân trống:**
- Kiểm tra quyền `patient.read`.
- Thử tìm kiếm với từ khóa khác.

---

### Lỗi "Không có quyền truy cập" (403)

**Nguyên nhân:** Role hiện tại không có permission cần thiết.

**Giải pháp:**
1. Kiểm tra sidebar — những mục không hiển thị là những mục bạn không có quyền.
2. Liên hệ admin để được cấp thêm quyền.

---

### Không tạo được lịch hẹn

**Vấn đề:** Không thấy bác sĩ trong danh sách.

**Giải pháp:** Kiểm tra `schedule.write` permission. Bác sĩ phải có lịch làm việc (working schedule) được cấu hình.

**Vấn đề:** Không thấy slot trống.

**Giải pháp:** Bác sĩ đã hết slot trong ngày. Thử ngày khác hoặc bác sĩ khác.

---

### Lỗi thanh toán

**Vấn đề:** "Invoice not editable" khi cố sửa hóa đơn.

**Giải pháp:** Chỉ hóa đơn ở trạng thái `DRAFT` mới sửa được. Hóa đơn `ISSUED`/`PAID` không sửa được.

**Vấn đề:** "Payment exceeds outstanding" khi ghi nhận thanh toán.

**Giải pháp:** Số tiền thanh toán không được lớn hơn số tiền còn nợ.

---

### Medical Record / Encounter

**Vấn đề:** Không thấy nút "Bắt đầu khám" trên lịch hẹn.

**Giải pháp:**
- Lịch hẹn phải ở trạng thái `CONFIRMED` hoặc `CHECKED_IN`.
- User phải có permission `encounter.start`.

**Vấn đề:** Không lưu được ghi chú lâm sàng.

**Giải pháp:** Encounter phải đang ở trạng thái `IN_PROGRESS`. Encounter `CLOSED` không sửa được.

---

## Developer — Lỗi thường gặp

### Database

**`P1001: Can't reach database server`**
```bash
# Docker chưa chạy
docker-compose up -d
sleep 5
```

**`P3005: Migration has not yet been applied`**
```bash
cd backend
pnpm exec prisma migrate deploy
```

**`P3005: The schema is not empty`**
```bash
# Database đã có tables nhưng Prisma chưa track
pnpm exec prisma migrate resolve --applied 001_init
pnpm exec prisma db push --accept-data-loss
```

---

### Backend

**`401 Unauthorized` trên Swagger**
- Kiểm tra `JWT_SECRET` trong `.env`
- Login lại và copy access token mới vào Swagger `Authorize` button

**`Cannot find module '@prisma/client`**
```bash
cd backend
pnpm exec prisma generate
```

**Tests fail với Prisma mock**
```bash
cd backend
pnpm exec prisma generate
pnpm test -- --clearCache
```

---

### Frontend

**`Module not found: @/...`**
- Kiểm tra `tsconfig.json` có `@/*` alias đúng
- Kiểm tra path trong import

**Build fail với Tailwind**
```bash
cd frontend
pnpm exec tailwindcss -i ./src/index.css -o ./dist/styles.css --watch
```

**Dark mode không hoạt động**
- Kiểm tra `tailwind.config.js` có `darkMode: 'class'`
- Kiểm tra `themeStore.ts` có persist middleware

---

### E2E Tests

**Playwright timeout**
```bash
# Tăng timeout trong playwright.config.ts
timeout: 60_000
```

**`page.waitForURL` timeout**
- Kiểm tra backend đang chạy
- Kiểm tra `PLAYWRIGHT_BASE_URL` đúng

---

## Performance Issues

### Backend chậm

1. Kiểm tra logs: `pnpm run start:dev` (xem query chậm)
2. Check database indexes: `EXPLAIN ANALYZE` trên query chậm
3. Enable Redis cache (nếu chưa): `REDIS_URL` trong `.env`

### Frontend chậm

1. Kiểm tra bundle size: `pnpm run build` → xem chunk sizes
2. Dashboard chunk > 30kB: sử dụng `React.lazy()`
3. Kiểm tra network tab — có query chậm > 1s?

---

## Emergency Recovery

### Quên mật khẩu admin

```bash
cd backend
# Chạy script reset password
node -e "
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const prisma = new PrismaClient();
(async () => {
  const hash = await argon2.hash('NewPassword123!');
  await prisma.user.update({
    where: { email: 'admin@clinic.local' },
    data: { passwordHash: hash }
  });
  console.log('Password updated');
  await prisma.\$disconnect();
})();
"
```

### Reset toàn bộ database

```bash
cd backend
docker-compose down -v
docker-compose up -d
sleep 10
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
```
