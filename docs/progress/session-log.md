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

## Sửa 4 lỗi giao diện phát hiện khi chụp ảnh hướng dẫn

- Cửa sổ xử lý yêu cầu đặt lịch: dòng "Bệnh nhân đang ở quầy lễ tân, mã …" truyền `reference` (trước đó hiện nguyên `{{reference}}`).
- Trang phiên khám: tiêu đề "Hồ sơ khám — {{tên bệnh nhân}}" (phiên khám không có trường mã nên trước đó chỉ hiện "Hồ sơ khám #"). Ngày giờ và bác sĩ vẫn ở dòng phụ.
- Sơ đồ răng: nút "Bulk"/"Reset" đưa vào bản dịch ("Hàng loạt"/"Đặt lại"); sửa chữ Việt hóa còn sót trong chú thích.
- Hóa đơn: nút hủy ẩn hẳn với người không có quyền `invoice.void` (trước đó hiện nút bị khóa).
- frontend `typecheck`, `lint`, `build` sạch.

## Lịch tuần/tháng: bỏ thanh cuộn ngang khi phóng to

- Dạng Tuần: bỏ `minWidth` theo số làn; 7 cột chia đều bề rộng (`minmax(0, 1fr)`). Trước đó cột rộng tối thiểu 96–420px nên phóng to trình duyệt là phải kéo ngang. Bỏ luôn `LANE_MIN_WIDTH_PX`.
- Dạng Tháng: lưới 7 cột `minmax(0, 1fr)` + `min-w-0` ở ô, để nội dung dài không đẩy ô rộng ra.
- Kiểm tra ở cửa sổ 900px: không còn vùng cuộn ngang ở cả hai dạng; typecheck, lint, build sạch.
- Đánh đổi: ngày có nhiều lịch trùng giờ (nhiều bác sĩ) bị chia thành cột mảnh, tên cắt ngắn, xem đủ bằng tooltip hoặc lọc theo bác sĩ.

### Lịch Tuần thiết kế lại: giới hạn số làn theo bề rộng, phần dư gộp "+N"

- `calendarLayout.ts`: tách `clusterLanes`, thêm `layoutLanesCapped(appointments, minMinutes, maxLanes)` — mỗi cụm lịch trùng giờ chỉ có tối đa `maxLanes` làn; các làn dư gộp thành một chip "+N" ở làn cuối.
- `CalendarViews.tsx`: `WeekView` đo bề rộng bằng `ResizeObserver` (`useElementWidth`), số làn = cột rộng / 64px; chip `OverflowChip` bấm để mở dạng Ngày của ngày đó (`onDayClick`). Bỏ biểu tượng đồng hồ trong khối dạng Tuần để giờ không bị cắt.
- Dạng Ngày giữ nguyên (không giới hạn làn). Thêm chữ `dayOverflowChip`/`dayOverflowHint` (vi, en).
- Kiểm tra ở 900px và 1440px: không có cuộn ngang, giờ đọc được, chip "+N" hiện ở cụm đông. frontend `typecheck`, `lint`, `build` sạch.

### Lịch hẹn: lọc bác sĩ bằng nút bấm, Tuần mặc định theo một bác sĩ

- Ô chọn bác sĩ (dropdown) đổi thành thanh nút "Tất cả bác sĩ" + từng bác sĩ (chấm màu theo `calendarColor`), đặt phía trên lưới lịch; `aria-pressed` cho trạng thái chọn. Trang "Lịch của tôi" (`mine`) không có thanh này.
- Chuyển sang dạng Tuần khi đang "Tất cả bác sĩ" thì tự chọn một bác sĩ (chính bác sĩ đang đăng nhập nếu có, không thì bác sĩ đầu danh sách), để các lịch của một người nằm dọc theo thời lượng như thời khóa biểu thay vì xếp cạnh nhau. Bấm "Tất cả bác sĩ" để quay lại xem cả phòng khám (cột có chip "+N").
- Khối dạng Tuần đủ cao hiện cả giờ kết thúc ("08:30 – 09:00").
- Lưu ý kiểm tra: `npm run typecheck` (`tsc --noEmit`) của frontend KHÔNG bắt được lỗi (tsconfig gốc dùng references); phải dùng `npm run build` (`tsc -b`) — đã dính lỗi thiếu import `cn` và khóa chữ trùng vì tin vào typecheck.
- Không có test E2E nào dùng dạng Tuần hay ô chọn bác sĩ cũ của trang lịch.

## Khung nội dung: trải kín chiều ngang ở màn hình rộng

- `AppShell.tsx`: nội dung bị giới hạn `max-w-7xl` (1280px) và căn giữa nên màn hình ~1900px dư hai dải trống mỗi bên trong khi lịch co lại ở giữa.
- Các trang dạng lưới (`/appointments`, `/my-appointments`, `/dispatch`, `/schedule`) nay dùng hết bề rộng; các trang khác nới giới hạn lên 1600px.
- Kiểm tra ở cửa sổ 1900px: nội dung lịch rộng từ 248 đến 1876px (kín khung); trang Bệnh nhân 262–1862px. frontend `build`, `lint` sạch.

### Lịch thu gọn để nhìn tổng quan không phải cuộn

- `calendarLayout.ts`: mỗi giờ cao 64px (trước 120px), khối tối thiểu 16px (giữ tỉ lệ 4 khối 15 phút/giờ), khung giờ mặc định 08:00–18:00 (trước 07:00–19:00; vẫn tự mở rộng khi có lịch ngoài khung). Cả ngày 640px nằm vừa một màn hình.
- Khối dưới 36px (≤ 30 phút) một dòng "giờ tên"; 45–50 phút hai dòng; từ 53 phút thêm dòng bác sĩ.
- Chụp ở 1900×950: dạng Ngày thấy trọn 08:00–18:00 không cuộn; dạng Tuần gần trọn. frontend `build`, `lint` sạch.

## Lịch Tuần: mỗi lịch hẹn một dòng, quá 3 thì "+N" mở danh sách

- Lịch dạng Tuần bỏ kiểu khối đặt theo thời lượng xếp so le nhiều làn. Nay là lưới: mỗi giờ một hàng, mỗi ngày một cột; các lịch bắt đầu trong giờ đó liệt kê **mỗi lịch một dòng** ("giờ tên" + chấm màu bác sĩ), tối đa 3 dòng; nhiều hơn thì 2 dòng đầu + nút "+N" bấm mở hộp (Modal) liệt kê tất cả, bấm một dòng để mở chi tiết lịch hẹn.
- Chiều cao hàng theo số lịch của giờ đông nhất tuần (giờ trống chỉ 28px) nên cả tuần gọn; vẫn giữ nền giờ làm việc của bác sĩ, ngày nghỉ, tô ngày hôm nay, bấm ô trống để tạo lịch.
- Dạng Ngày giữ kiểu khối theo thời lượng. Bỏ `layoutLanesCapped`, `OverflowChip`, `useElementWidth` (làm ở PR trước, không còn dùng); tách `appointmentTooltip` dùng chung.
- Chụp ở 1900×950: một bác sĩ và tất cả bác sĩ đều gọn, "+N" mở hộp đúng; không cuộn ngang. frontend `build`, `lint` sạch.

## Logo: thanh trên và tab trình duyệt dùng đúng logo gốc

- Nguyên nhân: trang đăng nhập dùng logo gốc (`logo-full.png`, răng nét vẽ + 2 ngôi sao) còn thanh trên, trang đặt lịch, trang chủ và favicon dùng `logo-icon.svg`/`favicon.svg` là hình răng khác tự vẽ lại.
- Cắt phần hình răng (không có chữ) từ `logo-full.png`, bỏ nền sáng thành trong suốt, xuất: `logo-icon.png` (256), `favicon-32.png`, `favicon-48.png`, và nền trắng `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`. Script tạo nằm ngoài repo (Chromium canvas).
- Đổi `Logo.tsx` (variant icon), `PublicTopBar`, `LandingPage` sang `/logo-icon.png`; `index.html` dùng favicon/apple-touch PNG; `manifest.webmanifest` dùng PNG 192/512. Xóa `public/logo-icon.svg`, `public/favicon.svg`. Kích thước icon cỡ `sm` 28 → 36px để nét rõ hơn.
- Tài liệu thương hiệu trong `docs/00_Vision/branding` vẫn nhắc tên file SVG cũ (chưa cập nhật). Trình duyệt giữ favicon cũ trong cache một thời gian.
- frontend `build`, `lint` sạch; chụp thanh trên và trang đăng nhập.
