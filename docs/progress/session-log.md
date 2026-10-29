# Nhật ký tiến độ

Mục mới nhất ở trên cùng. Quy tắc ghi: xem `CLAUDE.md` ở thư mục gốc.

---

## 22/10/2026

### Sửa toàn bộ 32 điểm của báo cáo rà soát nghiệp vụ (xong)

Người dùng: "sửa hết". Với các điểm cần chủ phòng khám quyết, chọn phương án an toàn nhất (đổi được nếu chủ phòng khám muốn khác):

- 1.1 Đã check-in thì không "Hủy lịch", dùng "Đã về". 1.2 Check-in khi đang có lượt khác mở: chặn, cho "vẫn check-in" kèm xác nhận (giống walk-in).
- 2.1 Cho gộp hồ sơ khi còn lịch tương lai/hoá đơn mở (chỉ chặn khi đang khám), so tên bỏ dấu, thêm nút gộp cho admin. 2.3 Tự xác nhận bỏ qua khi cùng người có yêu cầu/lịch khác. 2.7 Tra cứu chỉ bằng SĐT không trả giờ hẹn.
- 3.1 Admin mở lại phiên khám đã đóng (bắt lý do, chỉ khi hoá đơn còn nháp/đã hủy, hoàn kho). 3.2 Thêm "điều chỉnh giảm / xoá nợ" cho hoá đơn đã phát hành (quyền riêng, chỉ admin, bắt lý do). 3.4 Giữ chặn khi thiếu tồn kho, nhưng cho sửa vật tư của thủ thuật khi phiên còn mở.
- 4.2 Không khoá/duyệt kỳ lương trước khi hết kỳ; tính lại khi duyệt. 4.4 Cộng lương đã trả (theo ngày trả) vào "Tổng chi".
- 5.1 Giảm giá trên 50% chỉ admin (đúng BR-BILL-025), ghi nhật ký, báo cáo có tổng giảm giá. 5.3 Hủy hoá đơn ghi bút toán âm vào ngày hủy, không sửa tháng đã chốt.

Làm theo đợt, mỗi đợt commit + push: (A) tiền và báo cáo;

- Xong đợt A (4.1, 4.4, 5.1, 5.3, 5.4, 5.5, 5.6): backend 1398 test xanh, frontend typecheck/lint/build xanh; migration 049 thêm quyền `invoice.discount.large` (chỉ admin).
- Xong đợt B (4.2, 4.3, 4.5, 4.6, kỳ điều chỉnh trả 2 lần, ngày UTC): backend 1404 test xanh; bỏ route trùng `/appointments/shift-registrations`; E2E `flow-payroll-period-cycle` đổi sang kỳ đã kết thúc. Quyền `shift_registration.*` giờ không dùng.
- Xong đợt C (3.1–3.6): backend 1417 test xanh; migration 050 (bảng `invoice_adjustments`, quyền `encounter.reopen`, `invoice.adjust`, chỉ admin). Điều chỉnh giảm không sửa `total` mà ghi dòng có ngày, để không sửa tháng đã chốt. E2E `flow-inventory-stock-out`, `flow-patient-to-payment` thêm ô lý do giá.
- Xong đợt D (1.1–1.6): backend 1417 test xanh; check-in có cờ `ignoreOpenVisit` khi xác nhận.
- Xong đợt E+F (2.1–2.7, 5.2, 5.7): nút gộp hồ sơ cho admin, giờ mở cửa dùng chung `src/common/clinic-hours.ts` (chưa xét ngày nghỉ của phòng khám), menu theo quyền.
- Kiểm tra cuối: backend 1432 test, lint, tsc xanh; frontend lint/build xanh; E2E trên DB mới (có migration 049, 050) **90/90**.
- Còn để ý: lễ tân sửa dị ứng (BR-PT-015 có vẻ cũ, chưa đổi); quyền `shift_registration.*` không còn dùng; deploy cần chạy migration 049, 050.
 (B) lương; (C) phiên khám, hoá đơn, kho; (D) lịch hẹn; (E) đặt lịch, bệnh nhân; (F) menu theo quyền.

## 21/10/2026

### Rà soát nghiệp vụ các luồng (xong)

- Làm lần lượt 5 mảng; báo cáo: `docs/audits/2026-10-21/BUSINESS_FLOW_REVIEW.md`. Chỉ rà soát, chưa sửa code.
- 32 phát hiện: 7 Cao, 8 Trung bình, 17 Thấp. Phát hiện mức Cao đã kiểm lại trực tiếp trong code.
- Nên sửa trước: giảm giá 100% không dấu vết (5.1), "Tổng chi" bỏ sót khoản đã hoàn (4.1), duyệt lương sớm mất hoa hồng (4.2), không đổi được tỷ lệ hoa hồng giữa chừng (4.3), hoá đơn đã phát hành không điều chỉnh được (3.2), không mở lại phiên khám đã đóng (3.1), hồ sơ trùng không gộp được (2.1).

**Bước tiếp theo:** chờ chủ phòng khám chọn hướng cho các mục cần quyết định (danh sách ở đầu báo cáo); các mục không cần quyết định có thể sửa ngay theo thứ tự ưu tiên.

### Sửa 3 lỗi của lượt kiểm tra (nhánh `claude/admiring-keller-933rkp`, PR vào `main`)

**Đã làm:**

1. Lễ tân hết 403: `Header.tsx` chỉ tải ca chờ duyệt khi có `shift.approve` (`useShiftRegistrations` nhận `enabled`).
2. Thanh "Răng đã điều trị" bỏ răng rỗng/0/trùng (`EncounterDetailPage.tsx`).
3. Giao diện tiếng Anh: chuyển chữ cứng sang khóa dịch ở 44 file (Điều phối, Hôm nay, Hàng đợi, phiên khám và các tab, sơ đồ răng, dịch vụ, ảnh trang chủ, kho, người dùng, nhân sự, đặt lịch công khai, lịch làm việc).
   - Thêm `translatedLabels()` (`frontend/src/locales/labels.ts`) cho bảng mã → nhãn; `check-ui-locales.mjs` kiểm cả khóa trong các bảng này.
   - Giữ nguyên chữ tiếng Việt (trừ tên thứ trong cảnh báo lịch làm việc: "Thứ hai"). Dữ liệu lưu vào hồ sơ không đổi.
   - Sửa thêm: `{{unit}` trong cảnh báo kho, "N ca" ở biểu đồ nguồn doanh thu; xóa 25 khóa `uiScheduling` không dùng; test `tests/clinical-data.test.mjs` stub import locale.
   - Drawer lịch hẹn: giữ nhãn lý do nhanh như cũ (E2E bấm "Chờ quá lâu").

**Kết quả:**

- frontend `typecheck`, `typecheck:e2e`, `lint`, `build`, `check-ui-locales` qua.
- E2E trên DB mới: **90/90** (5,3 phút).
- Quét lại 281 lượt mở trang: không 5xx, lỗi JS, khóa thô; request 403 tới `/shifts/registrations` từ 92 → 0. 4xx còn lại là giới hạn phạm vi (bác sĩ mở bệnh nhân/hoá đơn không thuộc mình, admin không có phiếu lương).
- Chữ tiếng Việt lộ ở giao diện tiếng Anh: 75 → 21 mẫu; 21 mẫu còn lại đều là dữ liệu (tên dịch vụ, người, vai trò, đơn thuốc, chẩn đoán, tiêu đề email) hoặc câu tóm tắt AI do backend viết.

**PR #64:** CI xanh 10/10 (gồm Playwright E2E); Codex có 1 nhận xét (select nhân sự giữ nhãn ngôn ngữ cũ) — không tái hiện được vì mọi chỗ dùng đều dịch lại nhãn lúc render, đã trả lời và đóng. Đã merge vào `main` (1d0055e) theo yêu cầu.

**Bước tiếp theo:** nếu muốn tiếng Anh cho thẻ tóm tắt AI thì backend (`ai.service.ts`) phải trả mã + tham số thay vì câu tiếng Việt.

**Ghi chú môi trường:** container khởi động lại thì PostgreSQL mất cấu hình `trust`; đã đặt mật khẩu `postgres` cho user `postgres` (chỉ DB thử local) và dùng trong `DATABASE_URL` của E2E.

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

## Rà soát đợt A–D của báo cáo nghiệp vụ 21–22/10 và hai chỗ đã sửa

- Rà bằng cách đọc mã và chạy lại toàn bộ test backend (57 bộ, 1432 test xanh, khớp ghi chú của phiên kia). Không thấy lỗi sai tiền hay lộ dữ liệu. Hai điểm cần sửa:
- **Duyệt kỳ lương tính lại số liệu (đợt B):** `approvePeriod` tính lại kỳ trước khi duyệt, nên số được duyệt có thể khác số người duyệt vừa xem. Nay so thực nhận từng bác sĩ trước/sau khi tính lại; nếu có ai đổi (hoặc phiếu lương thêm/mất) thì giữ số mới, KHÔNG duyệt, trả 409 nêu tên và số cũ → mới, ghi nhật ký `PERIOD_APPROVE_RECOMPUTED`; duyệt lần nữa sẽ qua nếu không còn gì đổi. Giao diện (`useApprovePeriod`) tải lại số liệu kỳ cả khi bị từ chối (`onSettled`), nếu không bấm duyệt lần hai sẽ duyệt số người duyệt chưa từng thấy.
- **Tổng giảm giá trong báo cáo doanh thu (đợt A):** cộng cả giảm giá của hóa đơn đã hủy; nay bỏ hóa đơn VOIDED (test mới: 225.000 → 125.000).
- backend `tsc`, `lint`, 204 test payroll + reports xanh; frontend `build`, `lint` sạch. Chưa chạy E2E đầy đủ ở máy này (CI chạy).

## 22/10 — Phần 1 của kế hoạch (`plan-2026-10-22.md`): rà đợt E–F và giao diện A–D

- 1.1 Gộp hồ sơ: chuyển đủ mọi bảng tham chiếu bệnh nhân (lịch hẹn, phiên khám, hóa đơn, yêu cầu đặt lịch, lịch sử SĐT, giấy tờ; đối chiếu toàn bộ schema); khóa hai hồ sơ theo thứ tự, Serializable; quyền `patient.merge` cả API và giao diện. **Sửa:** email của hồ sơ nguồn bị bỏ cả khi hồ sơ đích không có email → nay giữ sang (như SĐT), không ghi đè email đã có; nhật ký gộp ghi đúng email giữ/bỏ. +1 test.
- 1.2 Giờ mở cửa dùng chung: máy chủ đọc cùng `CLINIC_HOURS`/`CLINIC_SUNDAY_HOURS` với giao diện (đã truyền vào container). Chưa tính ngày phòng khám nghỉ → việc 2.3.
- 1.3 Đặt lịch đợt E: tự xác nhận bỏ qua người có yêu cầu/lịch khác, tra cứu chỉ SĐT không trả giờ — đúng.
- 1.4 Menu theo quyền: Playwright đăng nhập admin (20 mục), lễ tân (12), bác sĩ (12) trên DB demo, mở từng mục: không 403/5xx/lỗi JS.
- 1.5 Giao diện A–D trên demo: điều chỉnh giảm hóa đơn qua giao diện (còn nợ 3,5tr → 3tr, hiện dòng điều chỉnh có ngày/lý do/người); mở lại phiên khám qua giao diện (về "đang khám", hóa đơn nháp bị hủy); giảm giá: lễ tân 40% được, 60% bị chặn 403 `DISCOUNT_LARGE_FORBIDDEN`, admin 60% được, đều ghi `INVOICE_DISCOUNT_UPDATED`.
- 1.6 Migration 049, 050 trên DB demo có dữ liệu (1.721 hóa đơn): chạy sạch, số liệu hóa đơn không đổi, 3 quyền mới chỉ gán `clinic_admin`. (DB demo cục bộ: đặt lại mật khẩu admin về mặc định để kiểm; sao lưu `guidedemo_bak`.)

## 22/10 — Phần 2 của kế hoạch: dọn việc tồn đọng

- 2.1 Dị ứng / BR-PT-015: đặc tả cũ ghi lễ tân không thấy medical history, nhưng thực tế lễ tân ghi dị ứng khi tiếp nhận — giữ cách làm này (thông tin an toàn cần có trước khi khám), sửa đặc tả. Thêm nhật ký: mọi lần sửa dị ứng / bệnh nền / thuốc đang dùng (lễ tân qua `PATCH /patients/:id`, bác sĩ qua `/medical-history`) ghi `medicalChanges` = mục thêm/bớt từng danh sách (`medicalListChanges` trong `patient-rules.ts`), để truy được ai xoá một dị ứng. +2 test.
- 2.2 Gỡ quyền `shift_registration.read/write/approve` (không route nào dùng): migration 051 xoá quyền và gán vai trò; `seed.ts` không tạo nữa.
- 2.3 Giờ mở cửa tính ngày phòng khám nghỉ: `nextClinicOpening(at, hours, closed)` bỏ qua khoảng nghỉ (`closureIntervals` từ `clinic_closures`, ngày đầu có thể từ `startTime`). Đặt lịch đọc ngày nghỉ (bộ đệm 60 giây) trước khi tính báo trước và giữ chỗ. +3 test.
- 2.4 Ticket PAY-006/007/012 đã xong từ trước, PAY-011 không còn áp dụng (trang đã thay) → chuyển `docs/Tickets/done/`, cập nhật `INDEX.md`.
- 2.5 Nhắc lễ tân khi yêu cầu chờ quá 30 phút (đúng lời hứa trên trang khách, `BOOKING_RESPONSE_MINUTES`): cron 5 phút, tính từ giờ mở cửa kế tiếp (có ngày nghỉ), gửi một lần qua email danh sách nhận báo của lễ tân; migration 052 thêm `booking_requests.staff_reminded_at`, chiếm quyền gửi bằng ghi có điều kiện. +3 test.
- 2.6 Nhật ký hiển thị "Hệ thống" khi không có người thực hiện — đã có sẵn, không sửa.
- backend `tsc`, lint sạch, toàn bộ 1444 test xanh; migration 051, 052 chạy sạch trên DB demo.

## 22/10 — Phần 3 của kế hoạch: kiểm từng module

- Báo cáo: `docs/audits/2026-10-22/MODULE_REVIEW.md`. Đối chiếu 192 BR của 7 đặc tả; 108 BR không có mã trong code được kiểm thực tế từng cái. Đăng nhập, Bệnh nhân, Hoá đơn, Lương khớp; 6 điểm lệch ở Hồ sơ khám, Kho, Lịch hẹn — đã sửa:
  - M1 (BR-MR-013): kết thúc phiên khám cần lý do khám hoặc chẩn đoán (ghi chú hoặc phiên khám), 422 `CLINICAL_NOTE_REQUIRED`. Bắt đầu khám tự chép lý do khám đặt lịch vào ghi chú, nên đa số ca không phải gõ thêm. E2E `flow-inventory-stock-out`, `flow-patient-to-payment` thêm bước ghi lý do khám (`addChiefComplaint` trong `flow-helpers.ts`); đã chạy thử các bước này trên giao diện demo (bị từ chối khi thiếu, đóng được sau khi thêm).
  - M2 (BR-MR-008): sơ đồ răng chỉ nhận 7 trạng thái giao diện dùng, ghi chú ≤ 1000 ký tự (400 `DENTAL_CHART_INVALID_STATUS`); sửa danh sách trong đặc tả.
  - M3 (BR-INV-006/008): xuất kho thủ công và điều chỉnh tồn bắt buộc lý do ≥ 3 ký tự (DTO + nút xác nhận trên giao diện).
  - M4 (BR-INV-023): điều chỉnh bằng đúng số đang có không ghi gì.
  - M5 (BR-APPT-020): không check-in khi bác sĩ có nghỉ phép đã duyệt trùng giờ lịch (409 `DENTIST_ON_TIME_OFF`).
  - M6 (BR-INV-001): không tạo/đổi tên vật tư trùng tên vật tư đang dùng (409 `ITEM_NAME_EXISTS`).
- backend `tsc`, lint sạch, 1453 test xanh (thêm 10). Một test sẵn có (`A1-13`, dời lịch hàng loạt) đỏ 1 lần khi chạy toàn bộ rồi xanh khi chạy lại — không liên quan thay đổi này, đã tạo việc riêng để tìm nguyên nhân. frontend `typecheck`, `typecheck:e2e`, lint, build sạch.

## 22/10 — PR #68: test Postgres đỏ sau M1

- Job "Release migrations and PostgreSQL API tests" đỏ ở "rejects competing payments…": lịch hẹn trong fixture không có lý do khám nên phiên khám không đóng được sau M1 (BR-MR-013). Sửa fixture (thêm `chiefComplaint`), chạy lại `npm run test:isolated` trên Postgres cục bộ: xanh.

## 22/10 — Phần 4.1: kế hoạch điều trị nhiều buổi

- Đặc tả: `docs/03_Specification/TreatmentPlans/SPEC.md` (BR-TP-001…011). Migration 053: bảng `treatment_plans`, `treatment_plan_items`, cột `treatments.plan_item_id`, quyền `treatment_plan.read/write/accept` (admin và bác sĩ đủ ba, lễ tân xem + ghi nhận đồng ý).
- Backend `src/treatment-plans/`: lập, sửa (chống sửa đè bằng `expectedUpdatedAt`), báo giá, đồng ý, thêm/bỏ qua/làm lại mục, huỷ; mục đã báo giá khoá sau khi khách đồng ý; bác sĩ chỉ ghi kế hoạch của mình. Thủ thuật nhận `planItemId` (giá kế hoạch là giá chốt); đóng phiên khám đánh dấu mục đã làm và tính lại trạng thái kế hoạch, mở lại phiên khám trả về.
- Giao diện: tab "Kế hoạch điều trị" trong hồ sơ bệnh nhân; trang `/treatment-plans/:id` (soạn mục từ danh mục dịch vụ của bác sĩ hoặc nhập tay, tổng tiền, báo giá, đồng ý, bỏ qua, thêm mục, huỷ, in báo giá, đặt lịch buổi tiếp); trong phiên khám chọn "Từ kế hoạch điều trị" khi thêm thủ thuật, nút "Lập kế hoạch". Ma trận quyền và `PHAN_QUYEN.md` cập nhật.
- Kiểm: backend `tsc`, lint, 1471 test xanh (+18); `test:isolated` xanh với migration 053. Frontend `typecheck`, lint, build, `check-ui-locales` sạch. Playwright trên demo: bác sĩ lập → báo giá → đồng ý → làm 1 mục trong phiên khám (răng/giá điền sẵn, ô răng khoá) → đóng phiên → mục "Đã làm", kế hoạch "Đang điều trị" → bỏ qua mục còn lại → "Hoàn thành"; lễ tân chỉ thấy nút In. E2E mới `flow-treatment-plan.spec.ts` chạy đạt trên demo (bản thay tài khoản demo).
- Sửa lỗi gặp khi chạy thử: sau khi lưu kế hoạch mới, trang vẫn ở chế độ soạn (React giữ component giữa hai route) → gắn `key` riêng cho hai route.
- Gộp hồ sơ bệnh nhân chuyển cả kế hoạch điều trị của hồ sơ nguồn (+ kiểm trong test gộp).

## 23/10 — Phần 4.2: nhắc tái khám định kỳ

- Đặc tả `docs/03_Specification/Recalls/SPEC.md` (BR-RC-001…009). Migration 054: `services.recall_interval_months`, `patients.recall_opt_out_at`, bảng `recalls` (một lượt mở mỗi bệnh nhân + dịch vụ), quyền `recall.read/manage` (admin, lễ tân).
- Đóng phiên khám có dịch vụ có chu kỳ: lượt cũ → `DONE`, tạo lượt mới đến hạn ngày khám + chu kỳ; mở lại phiên khám thì hoàn tác. Gộp hồ sơ chuyển lượt nhắc (trùng dịch vụ đang mở thì đóng của hồ sơ nguồn), giữ từ chối nhận email.
- Cron 09:10 giờ phòng khám: một email mỗi bệnh nhân đến hạn (gộp dịch vụ), bỏ qua người đã có lịch / từ chối / không có email; link đặt lịch và link ngừng nhận (mã ngẫu nhiên, lưu băm). Máy chủ thư không nhận thì nhả ra cho hôm sau.
- Giao diện: ô "Nhắc tái khám sau (tháng)" trong form dịch vụ; menu "Nhắc tái khám" cho lễ tân (cần gọi / đã đặt lịch / đã xong; ghi kết quả: đã đặt lịch, hẹn gọi lại, không liên lạc được, bỏ nhắc có lý do; bật/tắt email nhắc; mở lại); trang công khai `/recall/unsubscribe`.
- Kiểm: backend `tsc`, lint, 1487 test (+16); `test:isolated` xanh với migration 054. Frontend typecheck, lint, build, `check-ui-locales` sạch. Playwright trên demo: admin đặt chu kỳ qua giao diện; lễ tân thấy 3 bệnh nhân (14 ngày) / 2 (đến hôm nay), lịch sắp tới hiện kèm; hẹn gọi lại → rời danh sách; bỏ nhắc cần lý do → sang tab đã xong; link ngừng nhận đúng / sai mã. Đóng phiên khám có cạo vôi → lượt mới đến hạn +6 tháng; mở lại → xoá; đóng lại → tạo lại.

## 23/10 — Phần 4.3: PDF hoá đơn và phiếu lương

- Sinh PDF phía máy chủ bằng `pdfkit` (không cần trình duyệt), font DejaVu Sans nhúng (tiếng Việt, giấy phép tự do) trong `backend/src/pdf/fonts`, `nest-cli.json` chép font vào `dist` nên ảnh Docker có sẵn. Đầu trang lấy `CLINIC_NAME`, `CLINIC_ADDRESS`, `CLINIC_PHONE` như email.
- Hoá đơn: `GET /billing/invoices/:id/pdf` (quyền như xem hoá đơn; bác sĩ chỉ hoá đơn của mình), `POST /billing/invoices/:id/email` (`invoice.payment.create`: gửi PDF đính kèm tới email bệnh nhân; không gửi nháp/đã huỷ; ghi `INVOICE_EMAILED`). `EmailService` nhận tệp đính kèm.
- Phiếu lương: `GET /payroll/me/payslip/:periodId/pdf` (bác sĩ, kỳ đã duyệt), `GET /payroll/periods/:id/payslips/:dentistId/pdf` và `/payslips/pdf` cả kỳ, mỗi người một trang (`payroll.read.any`).
- Giao diện: nút PDF và Gửi email trên hoá đơn; "Tải phiếu lương (PDF)" và PDF từng dòng trong kỳ lương; nút PDF trong phiếu lương của tôi.
- Kiểm: backend 1495 test (+8: mẫu PDF, nhiều trang, gửi email); frontend typecheck, lint, build, locales sạch. Trên demo: tải PDF hoá đơn (lễ tân), gửi email (bản giả lập ghi đính kèm 25 KB), PDF cả kỳ 16 trang, từng phiếu, phiếu của bác sĩ; xem ảnh kết xuất (dấu tiếng Việt đúng). Quyền: bác sĩ / lễ tân lấy PDF cả kỳ → 403; bác sĩ lấy PDF hoá đơn của bác sĩ khác → 404, gửi email → 403.

## 23/10 — Phần 4.4: lớp nhắn tin SMS / Zalo (chế độ giả lập)

- Migration 055: bảng `message_logs` (kênh, nhà cung cấp, người nhận, nội dung, trạng thái SENT / MOCKED / FAILED / SKIPPED, `dedupe_key` duy nhất), quyền `message_log.read` (admin).
- `backend/src/messaging/`: cấu hình bằng env (`SMS_PROVIDER` off|mock|esms, `ZALO_PROVIDER` off|mock|zns, mặc định tắt); bộ chuyển đổi eSMS.vn (brandname, không dấu) và Zalo ZNS (mẫu đã duyệt, số 84…); Zalo thử trước, lỗi thì sang SMS; mỗi `dedupe_key` gửi một lần (giành trước bằng khoá duy nhất); số không phải di động VN → SKIPPED.
- Cron: nhắc lịch khám mỗi giờ (cùng khung 24 giờ như email, không cho lịch vừa đặt), nhắc tái khám 09:15 (bỏ người đã có lịch / từ chối); không gửi 21:00–07:00.
- Trang **Quản trị → Tin nhắn SMS / Zalo**: kênh đang bật, cấu hình còn thiếu, gửi tin thử, nhật ký. `docker-compose.prod.yml` và `.env.production.example` có các biến mới; hướng dẫn cho chủ phòng khám: `docs/08_Deployment/SMS_ZALO.md`.
- Kiểm: backend 1508 test (+13: số điện thoại, bỏ dấu, thiếu cấu hình, gửi một lần, chuyển Zalo → SMS, eSMS / ZNS gửi đúng định dạng, nhắc lịch / tái khám); `test:isolated` xanh với migration 055. Frontend typecheck, lint, build, locales sạch. Trên demo (SMS mock, Zalo zns thiếu mẫu): 8 lịch được nhắc, chạy lại không gửi trùng; tin thử chuyển sang SMS kèm lý do Zalo lỗi; trang quản trị hiện đúng.
- **Còn chờ chủ phòng khám:** chọn nhà cung cấp SMS, đăng ký Zalo OA + mẫu ZNS, cung cấp khoá API (xem hướng dẫn).

## 23/10 — Rà lại Phần 4 sau khi gộp (#69–#71)

Đọc lại toàn bộ code kế hoạch điều trị, nhắc tái khám, PDF, nhắn tin; 4 điểm sửa:
- Nhắc tái khám: mở lại rồi đóng lại một phiên khám **cũ** làm lượt nhắc của lần khám **sau** bị đóng và thay bằng mốc sớm hơn. Nay giữ lượt nhắc đang mở nếu nó đến hạn muộn hơn. +1 test.
- Kế hoạch điều trị: huỷ được kế hoạch khi một mục đang được ghi trong phiên khám chưa đóng, rồi đóng phiên thì mục của kế hoạch đã huỷ thành "đã làm". Nay chặn huỷ (409) cho tới khi xoá thủ thuật đó hoặc đóng phiên. +1 test.
- Nhắn tin: tin SMS/Zalo gửi lỗi (nhà cung cấp tạm hỏng, token hết hạn) không bao giờ được gửi lại vì khoá chống trùng đã bị chiếm. Migration 056 thêm `message_logs.attempts`; lần chạy sau lấy lại tin FAILED và thử tiếp, tối đa 3 lần (như email nhắc lịch), mỗi lần một mã theo dõi mới. Trang Tin nhắn hiện số lần thử. +1 test; trên DB demo: 3 lần FAILED (attempts 1→3), lần thứ 4 không thử nữa.
- Tải PDF bị từ chối (403/404) chỉ hiện câu chung chung: lỗi trả về dạng blob nay được đọc lại để hiện đúng lời máy chủ.
- Kiểm: backend 1511 test, `test:isolated` (migration 056) xanh; frontend typecheck, lint, build, locales sạch.

## 23/10 — Rà lỗi toàn hệ thống (ngoài Phần 4)

- Dò menu cả 3 vai trò trên demo (admin 22, lễ tân 13, bác sĩ 12 mục + trang chi tiết): không lỗi 4xx/5xx/JS.
- Quét tĩnh mọi controller: endpoint công khai chỉ là đăng nhập, đặt lịch công khai, ảnh trang chủ/bác sĩ, link ngừng nhận nhắc tái khám — đúng thiết kế.
- Thử truy cập chéo bằng bác sĩ 1 trên bệnh nhân / phiên khám / hoá đơn / lịch hẹn / kế hoạch của bác sĩ khác: đọc và ghi đều bị chặn. **Sửa:** 3 endpoint proxy `patients/:id/encounters|invoices|dental-chart` trả danh sách rỗng (hoặc 403) cho bệnh nhân bác sĩ không được xem nhưng 404 cho bệnh nhân không tồn tại — dò được id có phải bệnh nhân hay không. Nay trả 404 như bệnh nhân không tồn tại. Test cập nhật + 1 test.
- Thử dữ liệu sai vào 265 endpoint (admin) và các endpoint công khai: **sửa** 3 chỗ trả 500 thay vì 400 — `GET /inventory/movements` (from/to không phải ngày), `GET /patients` (pageSize không phải số), `GET /payroll/periods` (status sai). Chạy lại: 0 lỗi 500.
- Múi giờ: **sửa** các chỗ lấy ngày theo UTC / theo máy thay cho giờ phòng khám — tóm tắt AI (ngày khám), ngày trả lương mặc định, ngày tối thiểu đăng ký ca, tên file xuất nhật ký, ngày mặc định trên form bệnh nhân / nhân sự / chi phí, và tuổi (`isMinor`) / ngày sinh hợp lệ (`isValidDob`) tính theo ngày tại phòng khám (+2 test).
- Kiểm: backend 1514 test, `test:isolated` xanh; frontend typecheck, lint, build, locales sạch.

## 27/10 — Tự động deploy khi merge vào main

- Thêm `.github/workflows/deploy.yml`: sau khi CI xanh trên `main` (push/merge), SSH vào VPS chạy `scripts/deploy-vps.sh origin/main`; chạy tay được ở tab Actions. Một lượt mỗi lúc, không huỷ giữa chừng. Hướng dẫn: `docs/08_Deployment/AUTO_DEPLOY.md`.
- Chủ phòng khám đã tạo deploy key, khoá SSH và 4 secret (`VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY`).

## 27/10 — Gỡ tự động deploy

- Deploy tự động (#74) chưa chạy được: lần 1 secret `VPS_PORT` có dấu xuống dòng; lần 2–3 `VPS_SSH_KEY` không đọc được (`ssh: no key found`). Theo yêu cầu chủ phòng khám, gỡ `.github/workflows/deploy.yml` và `docs/08_Deployment/AUTO_DEPLOY.md`; deploy lại bằng tay (`scripts/deploy-vps.sh`). Secrets / deploy key trên GitHub và khoá trên VPS do chủ phòng khám tự dọn nếu không dùng.

## 27/10 — Làm đẹp giao diện, phần 1: thanh menu

Theo yêu cầu: nâng cấp bộ UI dùng chung, giữ nhận diện GENSMILE, chia nhỏ từng phần (mỗi phần một PR, ảnh trước/sau bằng Playwright).
- Mục menu thấp hơn (py-2), nhóm sát hơn: màn 900px thấy thêm Báo cáo và đầu nhóm Quản trị. Nút "Thu gọn" chuyển xuống đáy menu để menu bắt đầu ngang header.
- Phần tiếp theo dự kiến: (2) trang Tổng quan — tiêu đề lặp, ô trạng thái lệch; (3) thẻ số liệu — nhãn chữ hoa xuống dòng, "↑0%" khi chưa có dữ liệu; (4) nhãn trạng thái + bảng (số thẳng cột); (5) Card / Modal.

## 28/10 — Làm đẹp giao diện, phần 2: trang Tổng quan

- Tiêu đề "Tổng quan" cùng kiểu với các trang khác (bỏ chữ to màu teal và nhãn "TỔNG QUAN" lặp lại).
- Ô trạng thái "Lịch khám — Hôm nay" đều nhau, phủ kín lưới (trước rộng hẹp lệch do tooltip bọc inline), nền nhạt, số thẳng cột.
- Kiểm: typecheck, eslint, build; ảnh Playwright desktop + mobile, không lỗi JS.

## 28/10 — Làm đẹp giao diện, phần 3: thẻ số liệu

- `KpiCard`: nhãn viết thường (chữ hoa dài xuống dòng khó đọc), số căn thẳng cột, không ngắt dòng ("916.650.000 ₫" từng tách "₫" xuống dòng).
- Mức thay đổi 0% hiện xám với dấu "–" thay vì "↑0%" xanh; tăng xanh, giảm đỏ như cũ.
- Nhãn "Mới / Cũ" của thẻ Bệnh nhân không ngắt dòng, có màu cho chế độ tối.
- Kiểm: typecheck, eslint, build; ảnh Playwright khoảng "Hôm nay" và "6 tháng", không lỗi JS.

## 28/10 — Làm đẹp giao diện, phần 4: nhãn trạng thái và bảng

- `StatusBadge`: chấm màu theo trạng thái trước chữ (nhìn lướt cả cột), không ngắt dòng. Chữ không đổi.
- Mọi `<table>`: chữ số cùng độ rộng (`tabular-nums`) — tiền, ngày, mã thẳng cột.
- Kiểm: typecheck, eslint, build; ảnh Playwright 13 trang, không lỗi JS.

## 28/10 — Làm đẹp giao diện, phần 5: hộp thoại và thẻ (hết đợt)

- `Modal`: nút đóng ✕ chỉ hiện viền khi dùng bàn phím (`focus-visible`) — trước đây mở bằng chuột cũng hiện viền xanh vì focus tự đặt vào nút; góc bo `rounded-xl`.
- `Card`: tiêu đề `text-base`, khoảng đệm `p-5` / `px-5` — gọn, cân với các trang.
- Kiểm: typecheck, eslint, build; ảnh Playwright 13 trang, không lỗi JS.
- Đợt làm đẹp 5 phần: #76 menu, #77 Tổng quan, #78 thẻ số liệu, #79 nhãn trạng thái + bảng, phần 5 này.

## 28/10 — Phần 6: chuông thông báo thật

- Backend `GET /notifications/summary` (mọi người đã đăng nhập; mỗi mục chỉ tính khi có quyền của trang đích): yêu cầu đặt lịch online chờ xử lý (`booking_request.read`), đăng ký ca chờ duyệt từ hôm nay (`shift.approve`), nhắc tái khám đến hạn hôm nay (`recall.read`), hoá đơn nháp (`invoice.issue` + `invoice.read.any`), phiên khám còn mở từ hôm trước (`encounter.read.any` tất cả / `encounter.read.own` của mình), vật tư ≤ mức tối thiểu (`inventory.update` / `inventory.stock_in`). +4 test.
- Frontend `layouts/NotificationBell.tsx` thay link chuông cũ (chỉ đếm ca chờ duyệt): bấm mở danh sách thả xuống — biểu tượng màu, tên, mô tả, số lượng, bấm tới đúng trang; ẩn mục 0; trạng thái trống "Không có việc nào đang chờ"; tự cập nhật mỗi phút; Esc / bấm ra ngoài để đóng; trên điện thoại hiện thành tấm ngang màn hình. Locale `uiNotifications`.
- Kiểm: backend tsc, eslint, 1518 test; frontend typecheck, eslint, build, locales; API thử 3 vai trò (admin 6 mục, lễ tân 4, bác sĩ 1); ảnh Playwright desktop + mobile + bác sĩ (trạng thái trống), không lỗi JS.

## 28/10 — Thông báo nổi (toast) làm lại

- Lỗi: `AppToaster` dùng hàm render riêng nên nền / viền / bóng trong `toastOptions.style` không áp dụng — thông báo trong suốt, chữ đè lên trang; cảnh báo và thông tin cùng biểu tượng (kiểu `blank`); không có nút đóng, không hiệu ứng.
- Nay: thẻ có nền (sáng / tối), bo góc, bóng, vạch màu bên trái, biểu tượng trong vòng tròn màu theo loại (thành công / lỗi / cảnh báo / thông tin), nút ✕ đóng, hiện ra / ẩn đi mượt; tối đa 3 thông báo trên màn hình. Lỗi vẫn `role="alert"`, còn lại `role="status"` (e2e dùng `[role="alert"]` vẫn khớp). Cảnh báo hiện 7 giây, lỗi 8 giây.
- Kiểm: typecheck, eslint, build; ảnh Playwright 4 loại sáng / tối / điện thoại, nút đóng hoạt động, không lỗi JS.

## 28/10 — Thông báo: đã đọc, lịch sử; sửa link cha bị 404; typecheck frontend

- Migration 057 `notifications` (mỗi người một dòng, `read_at`, khoá chống trùng `(user_id, dedupe_key)`, xoá sau 90 ngày). `InboxService`: quét mỗi 2 phút sự kiện mới trong 24 giờ (yêu cầu đặt lịch online, đăng ký ca chờ duyệt, hoá đơn nháp) gửi cho người có quyền trang xử lý; tổng hợp 07:31 (bệnh nhân cần gọi tái khám, vật tư sắp hết, phiên khám còn mở — bác sĩ nhận phần của mình). API `GET /notifications`, `/unread-count`, `POST /notifications/:id/read`, `/read-all` (chỉ của chính mình). +7 test.
- Chuông: số đỏ = chưa đọc; 2 tab "Thông báo" (8 mới nhất, bấm = đã đọc + mở trang) và "Việc cần xử lý"; "Đánh dấu tất cả đã đọc"; "Xem tất cả" → trang `/notifications` (lọc Tất cả / Chưa đọc, tải thêm).
- `/admin` báo "Không tìm thấy trang" (breadcrumb "Quản trị" trỏ tới). Rà mọi đường dẫn cha: thêm 8 chỗ tương tự (`/billing/invoices`, `/encounters`, `/inventory/items`, `/treatment-plans`, `/shifts`, `/payroll/shifts`, `/admin/shifts`, `/my-payroll/payslip`) → chuyển tới trang đầu tiên người dùng được xem.
- `npm run typecheck` của frontend không kiểm tra file nào (`tsconfig.json` có `files: []`) → nay chạy `tsconfig.app.json`, `node`, `e2e` (đều sạch).
- Kiểm: backend tsc, eslint, 1525 test; frontend typecheck (thật), lint, build, locales; Playwright: 9 link cha × 2 vai trò, chuông 2 tab, mở thông báo (4 → 3 chưa đọc), đánh dấu tất cả (→ 0), trang lịch sử, không lỗi JS.

## 28/10 — Trang chủ mới (gensmile.online)

- Làm lại `features/landing/LandingPage.tsx` theo bản thiết kế đã duyệt (trắng + xanh ngọc như production):
  - thanh thông tin trên cùng (giờ, địa chỉ, hotline);
  - logo đầy đủ "GENSMILE / Nha khoa thẩm mỹ";
  - phần đầu trang có 4 cam kết và khung ảnh. Ảnh lấy từ ảnh admin tải lên; chưa có ảnh thì hiện logo;
  - ô "Đăng ký khám" (họ tên, số điện thoại, dịch vụ) chuyển sang `/booking`. Họ tên và số điện thoại đi qua router state, không nằm trên URL; `PublicBookingPage` điền sẵn;
  - số liệu (số bác sĩ, số dịch vụ, đặt online 24/7, phí đặt lịch 0đ);
  - 6 dịch vụ nổi bật, bảng giá dạng bảng có lọc nhóm, bác sĩ khung ảnh 3:4, quy trình 3 bước, hỏi đáp;
  - chân trang xanh có bản đồ; nút Zalo/gọi nổi (máy tính) và thanh "Gọi · Zalo · Đặt lịch" (điện thoại).
- Hiệu ứng: chữ phần đầu trượt lên, khối trượt lên khi cuộn tới, vệt sáng trên nút chính, nút gọi lan sóng. Máy bật giảm chuyển động thì tắt.
- Giữ nguyên `#top`, `#dich-vu`, nhãn `Đặt lịch …` và các tiêu đề mà e2e `landing` / `site-media` dùng.
- Kiểm: typecheck, eslint, build, locales. Playwright với API thật: các ý của e2e landing đều đúng, ô đăng ký điền sẵn sang trang đặt lịch. Trên điện thoại ban đầu bị tràn ngang, đã sửa (chữ ẩn trong ô tiêu đề bảng), không tràn ngang nữa.

## 29/10 — Giao diện mới, đợt 1: trang chủ (ghép hướng A "Lịch ghế" + B "Sơ đồ răng")

- Người dùng duyệt cả hai hướng trong bản mẫu và chọn ghép lại. Kế hoạch các đợt:
  1. trang chủ (đợt này);
  2. màn hình Hôm nay dạng bảng ghế theo bác sĩ, kèm hàng chờ;
  3. hồ sơ bệnh nhân với sơ đồ răng theo cung hàm và kế hoạch điều trị;
  4. rà các trang nội bộ còn lại.
- Phông chữ: trước đây khai báo `Inter` nhưng không tải file nào, nên máy khách hiện phông mặc định của hệ thống. Nay tải từ Google Fonts trong `index.html`: Be Vietnam Pro (chữ chính, cho cả ứng dụng), Bricolage Grotesque (`font-display`, tiêu đề lớn), JetBrains Mono (`font-mono`, giờ, giá, mã răng).
- Trang chủ:
  - `ToothArch.tsx` vẽ sơ đồ 32 răng đánh số FDI. Mỗi răng là một nút, dùng được bằng bàn phím.
  - Chọn răng thì hiện dịch vụ hợp với răng đó lấy từ bảng giá thật (so theo tên dịch vụ; răng khôn so "răng khôn", vì "không" chứa chữ "khôn").
  - "Đặt lịch khám răng này" điền sẵn lý do khám sang `/booking` qua router state.
  - Khối "Giờ trống": 6 ngày tới theo dịch vụ và bác sĩ, gọi `/public/booking/slots` cho từng ngày; mỗi ngày tối đa 6 giờ, kèm link "+N giờ khác".
  - Bấm một giờ mở `/booking?service&dentist&date&time`. `PublicBookingPage` nhận thêm `dentist`, `date`, `time` (giờ chỉ chọn sẵn nếu còn trống) và `reason`.
  - Bảng giá dạng danh sách chia theo nhóm. Bác sĩ có ảnh 3:4 hoặc chữ viết tắt tên. Quy trình 1/3, 2/3, 3/3. Hỏi đáp và chân trang không dùng thẻ.
- Bỏ: thẻ bo góc xếp lưới, icon trong vòng tròn, tiêu đề căn giữa có gạch màu, vệt sáng, vật bay, trượt lên khi cuộn, khối số liệu, thẻ dịch vụ nổi bật dùng logo thay ảnh. Xoá CSS `lp-*`.
- E2E: `landing.spec` chờ tiêu đề "Đau răng nào?"; `site-media.spec` sau khi xoá ảnh kiểm tra không còn ảnh trong `#top`.
- Kiểm: typecheck, eslint, locales, build. Playwright với API thật:
  - răng 18 hiện "Nhổ răng khôn" và "Chụp X-quang";
  - bấm một giờ thì trang đặt lịch chọn sẵn đúng bác sĩ và giờ;
  - "Đặt lịch khám răng này" điền sẵn lý do khám;
  - các ý của e2e landing đều đúng;
  - điện thoại 390px không tràn ngang, không lỗi JS.
- Người dùng muốn sơ đồ giống hàm răng thật nên `ToothArch` được vẽ lại:
  - hai cung hàm hình chữ U nhìn từ mặt nhai, có viền nướu;
  - răng đặt theo bề rộng thật (mm) của từng răng, co giãn cho vừa cung hàm;
  - hình mặt nhai theo loại răng: răng cửa dẹt có bờ cắn, răng nanh nhọn về phía má, răng cối nhỏ có rãnh giữa, răng cối lớn vuông có rãnh chữ thập;
  - men răng màu ngà. Số răng đặt phía ngoài cung hàm.
