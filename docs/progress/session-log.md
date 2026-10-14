# Nhật ký tiến độ

Mục mới nhất ở trên cùng. Quy tắc ghi: xem `CLAUDE.md` ở thư mục gốc.

---

## 14/10/2026

### Đang chờ / bước tiếp theo

- PR cập nhật hướng dẫn sử dụng: chờ người dùng xem và merge.
- PR sửa 2 lỗi cấu hình lịch (mục ngay dưới) cùng `CLAUDE.md` và nhật ký này: chờ CI xanh rồi người dùng merge.
- Deploy lên VPS: người dùng tự chạy `bash scripts/deploy-vps.sh` trên VPS (môi trường của Claude không có quyền SSH).

### Cập nhật hướng dẫn sử dụng (`docs/09_UserGuide/`)

- Đối chiếu 6 file với code. `PHAN_QUYEN.md` khớp; 5 file còn lại lệch khoảng 70 chỗ.
- Viết lại `ADMIN_GUIDE.md`, `RECEPTIONIST_GUIDE.md`, `DENTIST_GUIDE.md` theo giao diện hiện tại; phần quyền trỏ sang `PHAN_QUYEN.md`. Sửa `QUICK_START.md`, `TROUBLESHOOTING.md`.
- Chính: hóa đơn nháp tự tạo khi đóng phiên khám; chỉ quản trị hủy hóa đơn; gộp hồ sơ chưa có nút; bác sĩ không check-in; không có giới hạn đóng phiên 24 giờ; khóa đăng nhập 15 phút; bỏ gợi ý `prisma db push --accept-data-loss`.
- Chưa sửa (code, cần người dùng quyết): `backend/.env.example` dùng cổng 5432 nhưng `docker-compose.yml` mở 15432; `npm run db:up` dựng cả container backend ở cổng 3000.
- Chưa xác minh: thông tin liên hệ cuối `ADMIN_GUIDE.md`.

### Sửa 2 lỗi cấu hình lịch làm việc

1. **`clinic-setup.ts`, `RESET_SCHEDULES=1`:**
   - Lịch đang chạy giờ kết thúc vào hôm qua; chỉ lịch chưa bắt đầu mới bị xoá. Các ngày đã qua giữ nguyên giờ làm để tính lương.
   - Mỗi bác sĩ xử lý trong một transaction.
   - Script in ra bác sĩ có lịch hẹn sắp tới để kiểm tra ở tab "Lịch hẹn bị ảnh hưởng".
   - Kiểm chứng trên hai bản sao database giống nhau. Code cũ: lịch phủ thứ Hai 15/09 còn 0 dòng. Code mới: còn 1 dòng (lịch 01/04 → 13/10, lịch mới từ 14/10). Chạy reset lần hai không tạo dòng trùng.
   - Đã cập nhật `docs/08_Deployment/CLINIC_SETUP.md` và `scripts/clinic-setup-vps.sh`.
2. **`dentists.service.ts`:** bộ lọc lịch so `validTo` với `today` (ngày theo giờ phòng khám) thay vì `now`. Thêm test giả lập 10:00 ngày 14/10.
3. **Kiểm tra:** backend 1344/1344 test, `tsc` và ESLint sạch.

### Rà luồng cấu hình phòng khám (bác sĩ, dịch vụ, lịch làm việc)

Luồng để bác sĩ nhận lịch: nhân viên → tài khoản (vai trò `dentist`) → hồ sơ hành nghề → phân công dịch vụ → lịch làm việc cố định → điều chỉnh theo ngày (ca đăng ký, ngoại lệ, nghỉ phép, ngày phòng khám nghỉ, ngày nghỉ việc). Giờ trống tính ở một chỗ (`availability.service.ts` + `domain/day-calendar.ts`).

Lỗi:

1. **`RESET_SCHEDULES=1` xoá lịch quá khứ.** `seedSchedules()` đánh dấu xoá mọi dòng `working_schedules` của bác sĩ. Lương đọc lịch có `deletedAt: null` (`payroll.service.ts:1328`), nên tính lại một kỳ đang mở sẽ mất giờ làm theo lịch trước đó. Script cũng không báo lịch hẹn bị ảnh hưởng. Hướng sửa: kết thúc dòng đang chạy vào hôm qua, chỉ xoá dòng chưa bắt đầu.
2. **Lịch bị ẩn ngày cuối.** `dentists.service.ts:197` so `validTo` (cột ngày) với `now` (thời điểm). Hướng sửa: so với `today`.

Điểm thiết kế cần biết:

- `CLINIC_HOURS` chỉ là chữ build vào frontend (hiển thị và cảnh báo mềm). Backend không chặn.
- `clinic-setup.ts` viết cứng lịch T2–T7, 08:00–12:00 và 13:30–19:00, không đọc `CLINIC_HOURS`.
- "Nhận đặt lịch online" mặc định tắt khi tạo bác sĩ qua giao diện.
- "Nhận bệnh nhân mới" chỉ có tác dụng ở đặt lịch online, và áp cho cả bệnh nhân cũ.
- Có hai "thời lượng mặc định": hồ sơ bác sĩ và từng dòng lịch làm việc.
- Thẻ sẵn sàng đếm cả dịch vụ thuộc nhóm đã tắt.

### Sửa CI Playwright E2E: PR #44, đã merge vào `main`

- **Nguyên nhân CI đỏ:** commit 67e6658 (dark mode + tiếng Anh) đổi chữ giao diện nhưng không sửa test E2E. Lỗi bị nhân lên vì bộ test dùng chung một phiên admin (một test hỏng là phiên bị thu hồi). Test `logout works` trước đây không thực sự đăng xuất; sau khi header được làm lại thì nó đăng xuất phiên admin dùng chung.
- **Đã sửa:**
  - Cập nhật test E2E theo chữ mới ở 17 file.
  - `logout works` dùng tài khoản lễ tân trong phiên riêng.
  - Khôi phục 6 chữ giao diện bị dịch sai nghĩa: hộp khách vãng lai (3), câu hướng dẫn xin nghỉ, nhãn "Lý do" (tách khoá `visitReason`).
- **Kết quả:** E2E local 90/90; CI trên PR #44 xanh 10/10 job; đã merge (32f5dc0).

### Dọn dự án và viết lại README (nằm trong PR #44)

- README viết lại theo cấu trúc bài Viblo "Cách viết README chất".
- Bỏ `pnpm-lock.yaml`, `pnpm-workspace.yaml` và file rác `backend/=`. Tài liệu đổi sang lệnh npm.
- ESLint cho phép `console` trong `backend/prisma/` (hết 80 cảnh báo).
- Bỏ `@types/ioredis`.
- Vite tách chunk: file chính từ 542 kB xuống 182 kB.
- Chưa làm: nâng `argon2` (0.45 đổi API mã hoá mật khẩu), Jest 29 và ESLint 8.
