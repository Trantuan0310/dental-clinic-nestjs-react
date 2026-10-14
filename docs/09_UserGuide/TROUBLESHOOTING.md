# Troubleshooting Guide

FAQ cho người dùng và developer.

---

## Người dùng — Lỗi thường gặp

### Không đăng nhập được

**Vấn đề:** Email/mật khẩu không đúng.

**Giải pháp:**
1. Kiểm tra Caps Lock đang tắt.
2. Thử reset mật khẩu: `Quên mật khẩu` → nhập email → kiểm tra hộp thư.
3. Máy chủ chưa gửi được email: nhờ quản trị **Cấp mật khẩu tạm** ở trang Người dùng.

**Vấn đề:** Tài khoản bị khóa (nhập sai mật khẩu 6 lần liên tiếp).

**Giải pháp:** Chờ 15 phút, hoặc nhờ quản trị **Cấp mật khẩu tạm** (thao tác này mở khóa luôn).

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

**Giải pháp:** Tài khoản cần quyền `appointment.create`. Bác sĩ phải có đủ: hồ sơ bác sĩ đang hành nghề, dịch vụ được phân công, lịch làm việc; không đang nghỉ phép hoặc tạm đình chỉ. Xem [CLINIC_SETUP.md](../08_Deployment/CLINIC_SETUP.md).

**Vấn đề:** Không thấy slot trống.

**Giải pháp:** Bác sĩ đã hết slot trong ngày. Thử ngày khác hoặc bác sĩ khác.

---

### Lỗi thanh toán

**Vấn đề:** "Không thể sửa hóa đơn ở trạng thái …" khi cố sửa hóa đơn.

**Giải pháp:** Chỉ hóa đơn **Nháp** mới sửa được. Hóa đơn đã phát hành hoặc đã thanh toán thì quản trị hủy rồi lập lại.

**Vấn đề:** "Số tiền … vượt quá số còn nợ …" khi thu tiền.

**Giải pháp:** Số tiền thanh toán không được lớn hơn số tiền còn nợ.

---

### Medical Record / Encounter

**Vấn đề:** Không thấy nút "Bắt đầu khám" trên lịch hẹn.

**Giải pháp:**
- Lịch hẹn phải **đã check-in** (`CHECKED_IN`). Lịch mới "Đã xác nhận" thì nhờ lễ tân check-in trước.
- User phải có permission `encounter.start` và là bác sĩ của lịch hẹn đó.

**Vấn đề:** Không lưu được ghi chú lâm sàng.

**Giải pháp:** Phiên khám phải đang khám (`IN_PROGRESS`). Phiên đã hoàn tất (`COMPLETED`) chỉ thêm được addendum, trong 30 ngày sau khi đóng.

---

## Developer — Lỗi thường gặp

### Database

**`P1001: Can't reach database server`**
```bash
# Docker chưa chạy (chỉ dựng PostgreSQL)
cd backend
docker compose up -d postgres
```
PostgreSQL trong Docker mở ở cổng **15432**: kiểm tra `DATABASE_URL` trong `backend/.env`.

**Migration chưa được áp dụng** (bảng hoặc cột không tồn tại)
```bash
cd backend
npx prisma migrate deploy
```

**`P3005: The schema is not empty`**
```bash
# Database đã có tables nhưng Prisma chưa track
cd backend
npm run db:baseline
```
Không dùng `prisma db push --accept-data-loss`: lệnh này có thể xóa dữ liệu.

---

### Backend

**`401 Unauthorized` trên Swagger**
- Kiểm tra `JWT_SECRET` trong `.env`
- Login lại và copy access token mới vào Swagger `Authorize` button

**`Cannot find module '@prisma/client`**
```bash
cd backend
npx prisma generate
```

**Tests fail với Prisma mock**
```bash
cd backend
npx prisma generate
npx jest --clearCache
```

---

### Frontend

**`Module not found: @/...`**
- Kiểm tra `tsconfig.json` có `@/*` alias đúng
- Kiểm tra path trong import

**Build fail**
```bash
cd frontend
npm run typecheck   # lỗi TypeScript thường là nguyên nhân
npm run build       # đọc lỗi đầu tiên trong output
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

1. Kiểm tra logs: `npm run start:dev` (xem query chậm)
2. Check database indexes: `EXPLAIN ANALYZE` trên query chậm
3. Enable Redis cache (nếu chưa): `REDIS_URL` trong `.env`

### Frontend chậm

1. Kiểm tra bundle size: `npm run build` → xem chunk sizes
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
    data: { passwordHash: hash, failedLoginAttempts: 0, lockedUntil: null }
  });
  console.log('Password updated');
  await prisma.\$disconnect();
})();
"
```

### Reset toàn bộ database (MẤT HẾT DỮ LIỆU)

```bash
cd backend
docker compose down -v
docker compose up -d postgres
npx prisma migrate deploy
npm run prisma:seed
```
