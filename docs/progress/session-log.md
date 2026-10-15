# Nhật ký tiến độ

Mục mới nhất ở trên cùng. Quy tắc ghi: xem `CLAUDE.md` ở thư mục gốc.

---

## 14/10/2026

### Đang chờ / bước tiếp theo

- PR #45 (lỗi cấu hình lịch), #46 (hướng dẫn sử dụng), #47 (giờ làm từ `CLINIC_HOURS`, bác sĩ mới bật đặt lịch online): đã merge vào `main`.
- PR "Nhận bệnh nhân mới" + cấu hình dev (nhánh `claude/project-thread-8oz60c`): chờ CI và người dùng merge, rồi deploy lại.
- Deploy lên VPS: người dùng tự chạy `bash scripts/deploy-vps.sh` trên VPS (môi trường của Claude không có quyền SSH).

### "Nhận bệnh nhân mới" ở đặt lịch online, sửa cấu hình dev

- Người dùng chọn cách "để lễ tân quyết". Bác sĩ tắt "Nhận bệnh nhân mới" vẫn hiện trên `/booking` (bệnh nhân cũ đặt được). Trang công khai không tiết lộ số điện thoại có phải bệnh nhân hay không.
- Hộp Yêu cầu đặt lịch gắn nhãn "BN mới, BS không nhận" cho yêu cầu đang mở mà số điện thoại chưa có lần khám hoàn tất với bác sĩ đó (`booking.service.ts`, `newPatientsForClosedDentists`).
- `backend/.env.example` dùng cổng 15432; `npm run db:up` / `db:reset` chỉ dựng PostgreSQL.
- Tài liệu: PHAN_QUYEN, RECEPTIONIST_GUIDE, QUICK_START.

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
- ~~Thẻ sẵn sàng đếm cả dịch vụ thuộc nhóm đã tắt.~~ Kiểm lại 14/10: không xảy ra, vì không tắt được nhóm còn dịch vụ đang bật và không bật được dịch vụ trong nhóm đang tắt (`catalog.service.ts:135, 312`).

Đã sửa sau đó (14/10, PR riêng):

- `clinic-setup.ts` đọc giờ làm từ `CLINIC_HOURS` / `CLINIC_SUNDAY_HOURS` (`prisma/clinic-setup/hours.ts`, cùng cách đọc với frontend). Giá trị sai thì script dừng trước khi ghi. `docker-compose.prod.yml` và `docker-compose.external-db.yml` truyền hai biến này vào container `migrate`.
- Bác sĩ tạo trên giao diện mặc định bật "Nhận đặt lịch online" (backend `employees.service.ts` và form), giống script.
- Còn mở: "Nhận bệnh nhân mới" chặn cả bệnh nhân cũ ở đặt lịch online (cần chốt cách nhận ra khách cũ); hai "thời lượng mặc định" chỉ cần ghi rõ trong tài liệu.

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

### Kiểm toán cấu hình nghiệp vụ phòng khám (14/10) — nhánh `claude/trusting-gauss-8544yk`

Phạm vi: nhân viên, hồ sơ bác sĩ, lịch làm việc, giờ làm, ngày nghỉ phòng khám, dịch vụ, giá, thông tin phòng khám. Kiểm bằng gọi API thật trên DB `auditrbac`.

**Hai lỗi đã sửa (2 commit trên nhánh này):**

1. `hireDate` không có giới hạn trên (`@IsDateString()` đơn thuần). Gõ nhầm năm (2099 thay vì 2019) thì hồ sơ **không thể cho nghỉ việc nữa**: `terminate()` từ chối ngày nghỉ trước ngày vào làm, kể cả khi không ghi ngày:
   ```
   cho nghỉ việc HÔM NAY          -> 400 Termination date is before the hire date
   cho nghỉ việc (không ghi ngày) -> 400 Termination date is before the hire date
   ```
   Sửa: `validateHireDate()` giới hạn tối đa 1 năm tới. Áp khi tạo mới; khi sửa thì chỉ kiểm nếu `dto.hireDate` được truyền, để hồ sơ cũ có ngày sai vẫn chỉnh được. Thêm 3 test trong `employees.service.spec.ts`.
2. `parseHourBlocks` ở frontend không kiểm giá trị (nhận cả `25:99`, giờ kết thúc trước giờ bắt đầu, khung chồng nhau). Sửa: bỏ qua khung sai thay vì ném lỗi — hàm chạy lúc nạp module, ném lỗi là trắng màn hình. Thêm `prisma/clinic-setup/hours.spec.ts` (13 test) và `roots` trong cấu hình Jest để quét `prisma/`.

**Đã kiểm, không có lỗi:**

- Cho nghỉ việc chặn khi bác sĩ còn hẹn phía trước (`DENTIST_HAS_FUTURE_APPOINTMENTS`, 50 ca chưa xong).
- Hồ sơ bác sĩ: chuyên khoa theo enum, màu `#RRGGBB`, thời lượng slot 15–120.
- Lịch làm việc: giờ kết thúc sau giờ bắt đầu, `dayOfWeek` 0–6, phút theo bội số 5, slot ≥15, `validTo` ≥ `validFrom`, `SCHEDULE_OVERLAP` cả khi chồng khít và chồng một phần. Lịch đang có hiệu lực không xoá được (ràng buộc lương).
- Ngày nghỉ phòng khám: thứ tự ngày và chồng nhau đều bị chặn.
- Dịch vụ: mã không trùng, giá âm bị chặn, thời lượng 5–480, nhóm phải tồn tại, chuyên khoa theo enum, `isFree` buộc giá 0.
- **Đổi giá dịch vụ không làm thay đổi hoá đơn đã phát hành** (kiểm: nhân đôi giá, tổng hoá đơn và `unit_price` giữ nguyên).
- Tắt dịch vụ có `/impact` (74 hẹn phía trước, 4 chỉ định đang mở) và giao diện gọi trước khi xác nhận.

**Kết quả kiểm tra:** backend `tsc` sạch, `lint` sạch, 1362 test/56 bộ xanh; frontend `typecheck`, `lint`, `build` sạch.

## Nhật ký hoạt động của lịch hẹn: hiện tên người thực hiện thay vì email

- `GET /appointments/:id/history` trả thêm `actorName` (họ tên người thực hiện, lấy từ quan hệ `actor` của `audit_logs`); `actorEmail` giữ nguyên.
- `AppointmentDetailDrawer` hiện tên; email chỉ hiện khi rê chuột. Sự kiện hệ thống (không có người làm) không hiện dòng nào.
- Test mới trong `appointments.service.spec.ts`. backend `tsc`, `lint`, 188 test của bộ này xanh; frontend `typecheck`, `lint` sạch.
- Chỗ khác còn hiện email (chưa đổi): cột "Tài khoản" ở Nhân sự, trang Người dùng, menu tài khoản.

## Lịch theo ngày: khối hẹn ngắn bị cắt chữ

- Khối hẹn thấp hơn 56px (≈ dưới 35 phút) xếp giờ và tên bệnh nhân **trên một dòng** thay vì hai dòng chồng nhau làm mất tên; dòng bác sĩ chỉ hiện từ 56px, dòng "Quá 15 phút chưa đến" từ 72px (biểu tượng cảnh báo vẫn có ở khối ngắn).
- Sửa trong `CalendarViews.tsx` (`AppointmentBlock`); dùng chung cho dạng ngày và tuần. Đã chụp lại trên dữ liệu demo: không còn khối bị cắt. frontend `typecheck`, `lint` sạch.

### Chỉnh lại lịch theo ngày cho vừa nhất

- Tăng chiều cao mỗi giờ 96 → 120px (`HOUR_HEIGHT_PX`): 20 phút = 40px, 30 phút = 60px, 45 phút = 90px.
- Ba mức theo chiều cao khối: dưới 36px (15 phút) một dòng "giờ tên"; 36–55px (20–29 phút) giờ trên, tên dưới; từ 56px (30 phút trở lên) thêm dòng bác sĩ; từ 72px thêm dòng "Quá 15 phút chưa đến".
- Đã chụp lại trên dữ liệu demo: không còn khối bị cắt. frontend `typecheck`, `lint` sạch.

### Nhật ký hệ thống (Quản trị → Nhật ký) hiện tên người thực hiện

- `GET /audit` trả thêm `actorName` (họ tên, từ quan hệ `actor`); cột "Người thực hiện" hiện tên, email nhỏ bên dưới. Ô tìm kiếm tìm được theo tên. CSV ghi "Tên (email)". Sự kiện hệ thống vẫn hiện "Hệ thống".
- 1 test mới ở `audit.controller.spec.ts` (56 test bộ audit xanh); backend `tsc`, `lint`, frontend `typecheck`, `lint` sạch.
- Thêm vào PR #51 (cùng nhánh).
