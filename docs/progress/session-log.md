# Nhật ký tiến độ

Mục mới nhất ở trên cùng. Quy tắc ghi: xem `CLAUDE.md` ở thư mục gốc.

---

## 21/10/2026

### Đang chờ / bước tiếp theo

- Chờ người dùng chọn sửa các lỗi trong mục "Kiểm tra toàn bộ chức năng" bên dưới (chưa sửa gì).

### Kiểm tra toàn bộ chức năng (`main` = f1e64ae)

**Tự động — đều qua:**

- Backend: `tsc`, ESLint (0 cảnh báo), Jest 1390/1390.
- API trên PostgreSQL thật (`npm run test:isolated`): 107/107; migration chạy lại lần hai không lỗi; seed chạy; DB nguồn không đổi.
- Playwright E2E trên DB mới (giống CI): **90/90**, 5,3 phút.

**Quét từng màn hình:** 46 trang × 3 vai trò (admin, lễ tân, bác sĩ) × 2 ngôn ngữ, cộng 5 trang công khai. Script ở scratchpad của phiên (`smoke.cjs`, `en-leak.cjs`, không đưa vào repo).

- Không có 5xx, lỗi JavaScript, khung "Đã có lỗi xảy ra", khoá dịch lộ ra (`ui*.xxx`, `{{...}}`).
- Quyền khớp hoàn toàn: trang có quyền thì mở được, không có quyền thì vào `/403`.

**Lỗi tìm thấy:**

1. **Lễ tân bị 403 trên mọi trang.**
   - `Header.tsx` luôn gọi `GET /shifts/registrations?status=PENDING` để hiện số ca chờ duyệt, nhưng số đó chỉ hiện khi có `shift.approve`.
   - Lễ tân không có quyền đọc ca nên lần nào cũng 403 (92 lần trong lượt quét). Bác sĩ thì tải ca của mình mà không dùng.
   - Sửa: chỉ gọi khi có `shift.approve`.
2. **Thanh "Răng đã điều trị" ở chi tiết phiên khám hiện nút "0".**
   - Thủ thuật không gắn răng (cạo vôi…) có `tooth_numbers` rỗng. Backend trả `toothNumber: ''`, frontend đổi thành `0`.
   - Phiên mẫu có 4 thủ thuật như vậy → 4 nút "0", cảnh báo React trùng key, sơ đồ răng nhận `[0,0,0,0]` để tô sáng.
   - Sửa: bỏ răng rỗng/không hợp lệ và trùng lặp.
3. **Giao diện tiếng Anh còn sót tiếng Việt viết cứng.** Khoảng 370 dòng trong 25 file ngoài `locales/`. Đã đối chiếu thực tế các trang lộ:
   - Điều phối (`/dispatch`), Ảnh trang chủ (`/admin/site-media`): gần như cả trang;
   - Hôm nay (`/today`): ô số liệu, tiêu đề, ngày "Thứ Tư, 21/10/2026";
   - Hàng đợi của tôi (`/my-queue`);
   - chi tiết phiên khám: "Lý do khám:", "Răng đã điều trị:", chú thích sơ đồ răng, "Toàn hàm / Chung", trạng thái răng;
   - chi tiết bác sĩ: thẻ dịch vụ thực hiện, thẻ ảnh;
   - Kho: "Nhập kho/Xuất kho"; trang chủ: trạng thái hàng chờ.

**Không phải lỗi (đã kiểm):**

- Bác sĩ mở hoá đơn của bác sĩ khác → 404 (giới hạn theo bệnh nhân của mình).
- Phiếu lương của kỳ `DRAFT` → 409 (chỉ xem sau khi duyệt).
- Yêu cầu đặt lịch không có email → cờ "gọi khách" (đúng thiết kế).

**Giới hạn:** quét chỉ mở trang, không bấm từng nút/hộp thoại; các luồng thao tác do E2E phủ.

### Kiểm tra phiên bản mới nhất (`main` = f1e64ae)

- Không có commit mới sau khi merge PR #63. So với d8c6538 (đã kiểm tra đầy đủ ngày 20/10), chỉ khác 3 file tài liệu, nên không chạy lại test local.
- CI của f1e64ae trên `main` đang chạy lúc kiểm tra. Cùng nội dung này đã xanh 10/10 trên PR #63.

## 20/10/2026

### Đang chờ / bước tiếp theo

- PR #63 (sửa 3 chỗ lệch tài liệu, mục ngay dưới): CI xanh 10/10, Codex không góp ý, đã merge vào `main` ngày 21/10 (f1e64ae).
- Deploy lên VPS: người dùng tự chạy `bash scripts/deploy-vps.sh` (không có migration mới; biến `BOOKING_*` đã có mặc định trong compose).

### Sửa 3 chỗ lệch tài liệu

- README: kết quả test 1390/1390 (56 bộ), ngày 20/10.
- `docs/08_Deployment/ENVIRONMENT_VARIABLES.md`: chuyển các biến đặt lịch online và email sang bảng. Thêm 4 biến chưa có: `BOOKING_MIN_LEAD_MIN`, `BOOKING_MAX_DAYS_AHEAD`, `BOOKING_HOLD_MINUTES`, `BOOKING_AUTO_CONFIRM`. Mặc định và giới hạn đối chiếu với `booking.service.ts`; cả 7 biến có trong hai file compose.
- Nhật ký: bổ sung PR #49 và #52–#62 (mục bên dưới).

### PR đã merge 15–16/10 nhưng chưa có trong nhật ký (ghi bổ sung từ lịch sử git)

- **#49** (15/10): báo cáo hiện đủ số tiền, biểu đồ cột/xu hướng; sửa nốt chế độ tối ở Hôm nay, bệnh nhân, lịch hẹn, đặt lịch.
- **#52** (15/10): sửa 4 lỗi giao diện khi chụp ảnh hướng dẫn: mã yêu cầu hiện `{{reference}}`, tiêu đề phiên khám, nút sơ đồ răng tiếng Anh, nút hủy hóa đơn bị khóa.
- **#53–#55** (15/10), lịch hẹn:
  - lọc bác sĩ bằng nút bấm; dạng Tuần mặc định theo một bác sĩ; hiện giờ kết thúc;
  - lịch tuần/tháng vừa bề rộng, không cuộn ngang;
  - thu gọn còn 64px/giờ, khung 08–18;
  - lịch tuần mỗi lịch hẹn một dòng, quá 3 dòng gộp "+N" mở danh sách.
- **#56** (15/10): thanh trên, trang chủ, favicon dùng logo gốc; bỏ công tắc "Zalo giữ chỗ" chưa có chức năng.
- **#57** (15/10): `DEMO_REPAIR` chuyển hoặc xóa lịch demo nằm ngoài giờ làm của bác sĩ; thêm script chạy trên VPS.
- **#58** (16/10): đặt lịch online tự khớp hồ sơ khách cũ (tên gõ không dấu, thiếu tên đệm, trẻ em qua SĐT phụ huynh, chỉ với trẻ vị thành niên); chặn tạo hồ sơ trùng cả ở máy chủ.
- **#59** (16/10): yêu cầu chờ duyệt giữ chỗ tạm (`BOOKING_HOLD_MINUTES`), hứa mốc phản hồi, lễ tân thấy thời gian chờ.
- **#60** (16/10): tự xác nhận khách cũ khớp chắc chắn (`BOOKING_AUTO_CONFIRM`, tắt mặc định).
- **#61** (16/10): form đặt lịch điền sẵn từ lần đặt trước trên cùng thiết bị (chỉ lưu ở máy khách).
- **#62** (16/10): nhập SĐT + ngày sinh để điền sẵn hồ sơ cũ; người liên hệ khẩn cấp của người lớn không đọc được thông tin người đó.

### Kiểm tra phiên bản mới nhất (`main` = d8c6538, PR #62)

- **Từ 14/10 (ed3efe2) đến nay, `main` có thêm PR #46–#62**, sửa 91 file:
  - hướng dẫn sử dụng;
  - giờ làm lấy từ `CLINIC_HOURS`;
  - "Nhận bệnh nhân mới" để lễ tân quyết;
  - lịch tuần/tháng gọn hơn, logo gốc;
  - đặt lịch online: tự khớp khách cũ, giữ chỗ tạm, tự xác nhận khách cũ (tắt mặc định), điền sẵn hồ sơ theo SĐT + ngày sinh.
- **CI trên `main`:** xanh ở 8 lần chạy gần nhất, gồm d8c6538.
- **Local:**
  - backend: `tsc`, ESLint (0 cảnh báo), Jest **1390/1390** (56 bộ);
  - frontend: `typecheck`, `tsc -p tsconfig.e2e.json`, ESLint, `vite build` (9,6 giây), `check-ui-locales` đều sạch.
- **Deploy:**
  - Không có migration mới.
  - Biến mới `BOOKING_HOLD_MINUTES` (mặc định 120) và `BOOKING_AUTO_CONFIRM` (mặc định `false`) đã có trong `.env.production.example` và hai file docker-compose, nên deploy không cần sửa `.env.production`.
- **Lệch nhỏ** (đã sửa, mục "Sửa 3 chỗ lệch tài liệu"):
  - README còn ghi 1344 test (thực tế 1390).
  - `docs/08_Deployment/ENVIRONMENT_VARIABLES.md` thiếu biến `BOOKING_*`.
  - Nhật ký chưa có mục cho PR #52–#62.

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

## Bỏ công tắc Zalo (giữ chỗ) khỏi Dashboard

- Gỡ công tắc "Zalo — Sắp ra mắt" ở `DashboardHeader.tsx` (chỉ là hình giữ chỗ, chưa có backend/cài đặt Zalo OA) cùng chữ `zaloTooltip`, `launchingSoon` không còn dùng (vi, en) và import `Megaphone`.
- Không đụng nút "Nhắn Zalo" ở trang tra cứu yêu cầu đặt lịch (liên kết `CLINIC_ZALO`, chạy thật).
- Chụp Dashboard: không còn chữ Zalo, bộ chọn khoảng thời gian giữ nguyên. frontend `build`, `lint` sạch; không có test E2E nhắc Zalo.

## Dữ liệu mẫu: lịch hẹn nằm ngoài giờ làm việc của bác sĩ

- Mail "Lịch hẹn cần gọi khách" báo "Bác sĩ không có lịch làm việc ngày này" (lịch 15:00 thứ Sáu 16/10 của BS Bs1). Quy tắc: lịch hẹn không nằm trong giờ làm việc của bác sĩ thì nhắc lịch bị chặn.
- Đo trên bản demo vừa nạp mới: 0/211 lịch sắp tới nằm ngoài giờ — bộ nạp hiện tại đặt lịch đúng trong giờ từng bác sĩ. Nguyên nhân với VPS (chưa xem được dữ liệu VPS): dữ liệu nạp bởi bản cũ, hoặc giờ làm việc đã sửa sau khi nạp; lệnh `DEMO_REPAIR=1` cũ chỉ bổ sung lịch cho bác sĩ chưa có lịch nào, không xử lý bác sĩ đã có lịch riêng.
- Bổ sung vào `DEMO_REPAIR=1` (`prisma/seed-demo-clinic.ts`, hàm `fixVisitsOutsideHours`): lịch hẹn demo sắp tới (SCHEDULED/CONFIRMED, bệnh nhân demo) nằm ngoài giờ của bác sĩ → chuyển cho bác sĩ đang làm giờ đó và rảnh; không có thì xóa mềm. Chỉ xét lịch tuần cố định (không xét ngày điều chỉnh, nghỉ phép, ca đã duyệt).
- Thử trên bản demo: xóa lịch thứ Sáu của 1 bác sĩ → 6 lịch ngoài giờ; chạy repair → 3 chuyển, 3 xóa, còn 0 lịch ngoài giờ. Thêm `scripts/demo-repair-vps.sh` để chạy trên VPS bằng một lệnh.

## Đặt lịch online: tự khớp hồ sơ khách cũ (đợt (a))

- Đánh giá luồng đặt lịch (xem hội thoại): khách cũ đặt online thường không tự khớp hồ sơ, lễ tân phải chọn tay, dễ tạo hồ sơ trùng. Đo trên bản demo trước khi sửa: chỉ ca gõ đúng hoàn toàn họ tên + ngày sinh + SĐT chính mới tự khớp; tên không dấu, bỏ tên đệm, trẻ em đặt bằng SĐT phụ huynh đều bị chặn.
- `booking.service.ts`: thêm `foldName`, `similarName` (bỏ dấu/hoa thường/đ→d; một bên bỏ tên đệm vẫn cùng người nếu trùng họ và tên, từ ngắn nằm đúng thứ tự trong từ dài; một từ chỉ bằng chính nó). `resolvePatient` tự khớp khi đúng một hồ sơ cùng ngày sinh + tên tương tự (ưu tiên hồ sơ viết giống hệt), và SĐT hợp lệ: SĐT chính của hồ sơ trùng SĐT yêu cầu, HOẶC hồ sơ trẻ không có SĐT riêng mà SĐT phụ huynh trên hồ sơ là số yêu cầu. Từ hai hồ sơ giống nhau trở lên: vẫn để lễ tân chọn. Đổi số điện thoại: vẫn bắt lễ tân xác minh.
- `patientMatches`/`sameNameAndDobPatients` dùng so sánh tương tự (danh sách gợi ý đầy đủ hơn); giới hạn số yêu cầu mở mỗi người (dòng 605) giữ so sánh chặt như cũ.
- Giao diện lễ tân (`BookingRequestsPage.tsx`): gợi ý rõ hồ sơ được chọn sẵn; khi chọn "Tạo hồ sơ mới" mà đã có hồ sơ cùng họ tên + ngày sinh thì hiện cảnh báo và phải tích "đã kiểm tra, đây là người khác" mới xác nhận được.
- Thử trên bản demo sau khi sửa: 4/5 tình huống tự khớp (gõ có dấu cách, không dấu chữ thường, bỏ tên đệm, trẻ em qua SĐT phụ huynh), ca đổi số vẫn chặn; không sinh hồ sơ trùng. backend `tsc`, `lint`, test booking 179 xanh (thêm 8 test); frontend `build`, `lint` sạch.
- Việc tiếp theo trong kế hoạch: (b) hứa mốc phản hồi + giữ chỗ tạm cho yêu cầu chờ duyệt; (c) công tắc tự xác nhận có điều kiện; phía khách: điền sẵn thông tin cho khách cũ (cần chọn cách xác minh).

### Sửa theo review Codex của PR #58

- Chỉ khớp qua số phụ huynh khi hồ sơ là **trẻ vị thành niên** (`isMinor`): người lớn chỉ có số liên hệ khẩn cấp vẫn để lễ tân xác nhận.
- Cảnh báo "tạo hồ sơ mới khi đã có hồ sơ trùng" nay được chốt **cả phía máy chủ**: `confirm` với `createNewPatient` mà có hồ sơ cùng họ tên + ngày sinh thì trả 409 `PATIENT_DUPLICATE_UNCONFIRMED` trừ khi gửi `confirmDistinctPerson: true`. Giao diện chặn cả khi danh sách gợi ý chưa tải xong hoặc tải lỗi (trước đó lỗi/đang tải làm mất cảnh báo).
- Thêm 2 test; chỉnh test cũ "tạo hồ sơ mới không tra theo số điện thoại". backend `tsc`, `lint`, 181 test booking xanh; frontend `build`, `lint` sạch.

## Đặt lịch online: giữ chỗ tạm + hứa mốc phản hồi (đợt (b))

- Backend (`booking.service.ts`): `heldIntervals` — giờ của yêu cầu đang chờ lễ tân (PENDING_REVIEW/NEEDS_INFORMATION, trong `BOOKING_HOLD_MINUTES`, mặc định 120, `0` = tắt) và giờ phòng khám đã đề xuất mà khách chưa trả lời/đã đồng ý được giữ, nên `publicDay` ẩn các giờ đó với khách khác (cả `createPublic` vì kiểm tra lại qua `publicDay`). Hết hạn giữ thì giờ tự mở lại. Hết giờ vì bị giữ trả `emptyReason: 'HELD'`. Lễ tân xác nhận vẫn không bị chặn bởi giữ chỗ (chỉ kiểm tra lịch hẹn thật).
- Giao diện khách: câu giải thích `HELD`; trang kết quả sau khi gửi ghi "giờ được giữ" và "lễ tân phản hồi trong 30 phút trong giờ làm việc (giờ của phòng khám)".
- Giao diện lễ tân: nhãn "Chờ N phút" (từ 5 phút), đỏ "Chờ quá lâu" sau 30 phút ở yêu cầu chờ duyệt.
- backend `tsc`, `lint`, 186 test booking xanh (thêm 5 test giữ chỗ; spec mặc định tắt giữ chỗ); frontend `build` sạch.
- Tiếp theo: (c) công tắc tự xác nhận có điều kiện (mặc định tắt).

### Sửa theo review Codex của PR #59

- Giữ chỗ tính theo kế hoạch khám thật (`planVisit`: thời lượng riêng của bác sĩ + đệm trước/sau) thay vì thời lượng mặc định của dịch vụ; so sánh với khoảng có đệm của giờ ứng viên.
- `createPublic`: khi giữ chỗ bật, khóa lịch bác sĩ trong giao dịch tạo yêu cầu rồi kiểm tra lại giữ chỗ (hai khách khác SĐT cùng gửi một lúc không còn cùng giữ được một giờ) → 409.
- Trạng thái công khai trả `holdUntil`; trang kết quả chỉ nói "giờ được giữ" khi còn hạn giữ.
- backend 187 test booking xanh, `tsc`/`lint` sạch; frontend `build`/`lint` sạch.

## Đặt lịch online: tự xác nhận cho khách cũ khớp chắc chắn (đợt (c))

- Công tắc `BOOKING_AUTO_CONFIRM` (mặc định tắt; đã thêm vào `.env.production*.example` và hai file compose, cùng `BOOKING_HOLD_MINUTES` trước đó chưa được truyền vào container). Không cần xác minh SMS theo quyết định của chủ phòng khám.
- `createPublic`: sau khi lưu yêu cầu, nếu bật thì gọi `tryAutoConfirm` → `confirm(id, AUTO_CONFIRM_ACTOR, {}, { accessToken })`. Chỉ thành công khi `resolvePatient` tự khớp đúng một hồ sơ có sẵn (cùng ngày sinh + tên tương tự + số điện thoại; trẻ qua SĐT phụ huynh) và giờ vẫn đặt được. Chế độ `matchOnly` không bao giờ tạo hồ sơ mới; khách mới, đổi số, nghi ngờ hồ sơ trùng hay lỗi gì khác đều giữ nguyên PENDING_REVIEW cho lễ tân (ghi log).
- Người thực hiện là actor hệ thống (`sub` rỗng, các cột `created_by/confirmed_by/actor_user_id` đều cho phép null); audit thêm `BOOKING_REQUEST_AUTO_CONFIRMED`. Link quản lý khách đang cầm không bị đổi (không xoay token), email xác nhận gửi như thường. Lễ tân vẫn được báo "Lịch hẹn đã tự động xác nhận".
- Giao diện: trang kết quả hiện "Lịch hẹn đã được xác nhận" thay vì "Đã nhận yêu cầu" khi trạng thái là CONFIRMED.
- Thử trên DB demo (bật công tắc): khách cũ gõ tên không dấu → CONFIRMED có lịch hẹn thật; khách mới → PENDING_REVIEW; không lỗi khóa ngoại. backend `tsc`, `lint`, 190 test booking xanh (thêm 3); frontend `build`, `lint` sạch.

### Sửa theo review Codex của PR #60

- `tryAutoConfirm`: nếu `confirm()` lỗi sau khi đã đặt lịch (ghi chú thông báo, audit), đọc lại trạng thái; đã CONFIRMED có lịch hẹn thì coi là thành công, không báo nhầm "chờ duyệt" và không gửi thông báo "yêu cầu mới" cho lễ tân.
- Trang kết quả chỉ ghi "Lịch hẹn đã được xác nhận" ngay khi lần gửi đó trả `CONFIRMED` (cờ `auto=1` trong URL), không suy từ trạng thái hiện tại, để lễ tân xác nhận tay sau đó không bị nhầm là tự xác nhận.
- `notificationSent` của lần tự xác nhận là kết quả email xác nhận (không còn bị email "đã nhận yêu cầu" che lỗi).

## Đặt lịch online: điền sẵn thông tin cho khách quay lại (phía khách)

- Không tra cứu theo số điện thoại trên máy chủ (không có xác minh thì sẽ làm lộ họ tên, ngày sinh, email bệnh nhân cho bất kỳ ai gõ số). Thay vào đó, sau khi gửi yêu cầu thành công, form lưu họ tên, ngày sinh, giới tính, SĐT, email, người liên hệ vào `localStorage` của chính thiết bị (`savedProfile.ts`, khóa `gensmile.bookingProfile`; không lưu lý do khám và đồng ý), lần sau điền sẵn.
- `PublicBookingPage.tsx`: dải thông báo "Đã điền sẵn thông tin từ lần đặt trước trên thiết bị này (tên). Đặt cho người khác?" kèm nút "Xóa và nhập lại" (xóa form và dữ liệu đã lưu); ô "Ghi nhớ thông tin trên thiết bị này (không dùng máy công cộng)" mặc định bật, bỏ chọn thì xóa dữ liệu đã lưu khi gửi.
- Kết hợp với tự xác nhận (đợt (c)): khách quay lại điền sẵn đúng thông tin cũ sẽ khớp hồ sơ và được xác nhận ngay.
- Thử trên trình duyệt thật (bản demo): đặt dữ liệu đã lưu → form điền sẵn và hiện dải thông báo; bấm xóa → form trống, dữ liệu đã lưu bị xóa. frontend `build`, `lint` sạch.

## Đặt lịch online: nhập số điện thoại + ngày sinh để điền sẵn hồ sơ cũ

- Yêu cầu của chủ phòng khám: khách nhập số điện thoại trước rồi khớp thông tin cũ ngay. Không dùng SMS.
- Backend: `POST /public/booking/returning-patient` (`ReturningPatientLookupDto`: phone + dob, trong body). Khớp hồ sơ còn dùng số đó (số riêng, hoặc số phụ huynh của trẻ) VÀ đúng ngày sinh thì trả họ tên, giới tính, email; người liên hệ chỉ trả cho trẻ vị thành niên (số liên hệ khẩn cấp của người lớn không lộ). Số lạ và sai ngày sinh trả cùng một kết quả rỗng (không dò được ai là bệnh nhân). Sai quá 5 lần/giờ cho một số điện thoại thì bị khóa (`LOOKUP_MISS_LIMIT`, trong bộ nhớ, chỉ đếm lần sai), thêm giới hạn 6 lần/phút theo địa chỉ mạng.
- Khác với đề xuất ban đầu: không có bước trả tên che (ví dụ "N*** V** A"), vì để lộ ít thông tin hơn khi chỉ trả kết quả sau khi khớp cả số và ngày sinh.
- Giao diện: ô số điện thoại và ngày sinh lên đầu phần thông tin bệnh nhân, nút "Tìm hồ sơ cũ"; khớp một hồ sơ thì điền họ tên, giới tính, email (và người giám hộ nếu là trẻ); khớp nhiều hồ sơ (cùng số, cùng ngày sinh) thì chọn; không khớp thì báo nhập như bình thường.
- Kết hợp tự xác nhận: thông tin điền từ hồ sơ khớp đúng hồ sơ nên được xác nhận ngay khi `BOOKING_AUTO_CONFIRM` bật.
- Thử trên DB demo: đúng → điền "Hoàng Đức Phúc"; sai ngày sinh → trống; dồn lần → bị giới hạn. backend `tsc`, `lint`, 195 test booking xanh (thêm 5); frontend `build`, `lint` sạch.

### Sửa theo review Codex của PR #62

- Lỗi bảo mật (P1): tra cứu theo số điện thoại + ngày sinh trước đây cũng khớp khi số nhập là số liên hệ khẩn cấp của một người lớn, nên người liên hệ biết ngày sinh có thể đọc họ tên, giới tính, email của người đó. Nay số phải là số riêng của bệnh nhân; số người giám hộ chỉ dùng cho trẻ vị thành niên chưa có số riêng (cùng quy tắc khớp hồ sơ khi xác nhận). Thêm test cho trường hợp người lớn; 196 test booking xanh.
