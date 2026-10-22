# Rà soát nghiệp vụ các luồng (21–22/10/2026)

Chỉ rà soát, chưa sửa code. Mỗi mảng do một lượt đọc code riêng, đối chiếu đặc tả (`docs/03_Specification`, `docs/ADR`) và báo cáo 14/09; các phát hiện chính đã được kiểm lại trực tiếp trong code.

Mức: **Cao** (sai tiền/dữ liệu/quyền, chặn việc hằng ngày) · **Trung bình** · **Thấp** (bất tiện, hiếm).

## Tóm tắt

32 phát hiện: **9 Cao**, 9 Trung bình, 14 Thấp.

### Nên sửa trước (sai tiền, sai số liệu, không có đường xử lý)

| # | Vấn đề | Mục | Cần chủ phòng khám quyết? |
| --- | --- | --- | --- |
| 1 | Lễ tân giảm giá tới 100% không dấu vết | 5.1 | Ngưỡng giảm giá |
| 2 | "Tổng chi" bỏ sót khoản chi đã hoàn tiền | 4.1 | Không |
| 3 | Duyệt kỳ lương sớm làm mất hoa hồng | 4.2 | Có cho trả lương sớm không |
| 4 | Không đổi được tỷ lệ hoa hồng/lương giữa chừng | 4.3 | Không |
| 5 | Hoá đơn đã phát hành không điều chỉnh/xoá nợ được | 3.2 | Chọn cách (a) hoặc (b) |
| 6 | Phiên khám đã đóng không mở lại được | 3.1 | Có làm "mở lại" không |
| 7 | Hồ sơ trùng không gộp được trước buổi khám | 2.1 | Nới quy tắc gộp |

### Cần chủ phòng khám chọn hướng

- Hủy lịch sau check-in (1.1); chặn hay cảnh báo check-in trùng (1.2); thiếu tồn kho có cho đóng phiên (3.4); lương bác sĩ trong "Thu – Chi" (4.4); tự xác nhận khi khách đặt nhiều lần (2.3); tra cứu bằng SĐT có trả giờ hẹn (2.7); hủy hoá đơn có sửa doanh thu tháng cũ (5.3).

### Sửa nhỏ, không cần quyết định

- 1.3, 1.4, 1.5, 1.6 (sửa đặc tả), 2.4, 2.5, 2.6, 3.3, 3.5, 3.6, 4.5, 4.6, 5.2, 5.4, 5.5, 5.6, 5.7; và mục 2.2 (giữ chỗ theo giờ mở cửa).

## 1. Lịch hẹn và luồng trong ngày

1. **[Trung bình] "Hủy lịch" vẫn mở cho bệnh nhân đã check-in, song song với "Đã về"** — trái ADR-0009 D2 (LEFT thay cho hủy CHECKED_IN).
   - `backend/src/appointments/appointments.service.ts:835-919` (`cancel()` nhận CHECKED_IN, cờ `lateCheckedInCancel`); `frontend/src/features/appointments/AppointmentDetailDrawer.tsx:1411` (`canCancel` gồm `checked_in`).
   - Cùng một việc "bệnh nhân bỏ về" bị ghi thành CANCELLED hoặc LEFT tùy người bấm → báo cáo "về trước khi khám" đếm thiếu; CANCELLED không hoàn tác được. Bệnh nhân check-in sớm rồi bị hủy vẫn nhận email "đã bị hủy" (`backend/src/booking/appointment-notices.service.ts:105`).
   - Đề xuất: CHECKED_IN không cho hủy, dùng "Đã về" (giữ ngoại lệ "phòng khám hủy" nếu cần); bỏ `checked_in` khỏi `canCancel`; sửa BR-APPT-010/025. **Cần chủ phòng khám xác nhận.**
2. **[Thấp] Check-in không chặn bệnh nhân đang có lượt khác mở trong ngày** — `checkIn()` (`appointments.service.ts:486-620`) không kiểm tra, trong khi walk-in (`PATIENT_ALREADY_IN_CLINIC`) và `undoLeft` có kiểm tra. Hai lịch cùng ngày với hai bác sĩ → bệnh nhân nằm hai hàng chờ cùng lúc. Đề xuất: chặn hoặc cảnh báo như walk-in (chủ phòng khám chọn).
3. **[Thấp] Nút "Hoàn tác check-in" bị ẩn khi phiên khám đã hủy** — backend cho phép (`appointments.service.ts:660-672`), frontend đòi `!appointment.encounterId` (`AppointmentDetailDrawer.tsx:546-551`). Đề xuất: dựa vào trạng thái phiên khám. (Cần xác nhận API trả `encounterId` cho phiên đã hủy.)
4. **[Thấp] Walk-in bị cảnh báo bởi mọi lịch hẹn tương lai** — `appointments.service.ts:4170-4180` chỉ lọc `startAt >= dayStart`, không có cận trên → bệnh nhân có lịch tái khám 2 tháng sau, hôm nay đến cấp cứu vẫn bị 409. Đề xuất: chỉ xét lịch hôm nay (có thể thêm ngày mai).
5. **[Thấp] "Thay bác sĩ cả ngày" đóng lịch bác sĩ vắng sau khi chuyển lượt** — `backend/src/appointments/dispatch.service.ts:482-570`; lịch đặt chen vào giữa hai bước bị bỏ sót. Đề xuất: đóng lịch trước rồi mới chuyển.
6. **[Thấp] Đặc tả cũ hơn code** — BR-APPT-006/012 (`SPEC.md:452,458`) chưa ghi 60 phút ân hạn của cron vắng mặt và check-in muộn từ NO_SHOW trong ngày. Đề xuất: cập nhật SPEC theo code.

Đã kiểm, thấy hợp lý: check-in đồng thời (ghi có điều kiện), check-in sớm/muộn, vắng mặt thủ công và tự động, các thao tác hoàn tác, đóng lượt cuối ngày, bắt đầu khám trong transaction, đổi lịch, chuyển bác sĩ, chống tạo trùng lịch.

## 2. Đặt lịch online và hồ sơ bệnh nhân

1. **[Cao] Hồ sơ trùng sinh từ đặt lịch online không gộp được trước buổi khám** → bác sĩ khám trên hồ sơ mới, thiếu dị ứng/tiền sử.
   - Gộp bị chặn khi hồ sơ nguồn còn lịch SCHEDULED/CONFIRMED/CHECKED_IN tương lai hoặc hoá đơn DRAFT/ISSUED/PARTIAL (`backend/src/patients/patients.service.ts:1025-1050`); tên phải trùng khớp (chỉ bỏ qua hoa/thường, `:1016`), trong khi đặt lịch coi "Nguyen Van An" = "Nguyễn Văn An" (`backend/src/booking/booking.service.ts:224-252`). Frontend không có màn hình gộp (không gọi `POST /patients/merge`); lịch hẹn không đổi được `patientId`.
   - Muốn gộp trước giờ khám phải hủy lịch (khách nhận email hủy) rồi đặt lại.
   - Đề xuất: cho gộp khi còn lịch tương lai/hoá đơn mở (code đã chuyển hết khoá ngoại sang hồ sơ đích, `:1052-1071`), chỉ chặn khi đang có phiên khám IN_PROGRESS; so tên bằng `foldName`; thêm nút gộp cho admin. **Cần chủ phòng khám quyết (BR-PT-010).**
2. **[Trung bình] Báo trước và giữ chỗ tính theo đồng hồ, không theo giờ mở cửa** — báo trước 120 phút từ `Date.now()` (`booking.service.ts:587-591`), giữ chỗ hết 120 phút sau khi gửi (`:675`). Khách đặt 21:00 cho 08:00 sáng mai: giữ chỗ hết lúc 23:00, người khác đặt chồng được; nếu chưa ai duyệt, khách đứng ở quầy vẫn nhận email "quá hạn" và không bấm "Khách đã đến" được với yêu cầu EXPIRED (`:2800-2806`).
   - Đề xuất: tính theo giờ làm việc (hoặc không mở các giờ đầu sáng mai cho yêu cầu gửi sau giờ đóng cửa); cho "Khách đã đến" với yêu cầu EXPIRED cùng ngày.
3. **[Trung bình, quyết định cần xem lại] Bật tự xác nhận thì một khách đặt nhiều lần được xác nhận hết** — `tryAutoConfirm` không xét yêu cầu mở/lịch sắp tới của cùng hồ sơ (`booking.service.ts:2323-2340`). Đề xuất: có yêu cầu/lịch khác của cùng người thì để lễ tân duyệt. (Công tắc `BOOKING_AUTO_CONFIRM` mặc định tắt.)
4. **[Thấp] Hồ sơ đã lưu trữ bị bỏ qua khi xác nhận yêu cầu** → tạo hồ sơ mới, tách lịch sử (trái BR-PT-018). `patientsByPhone` (`:2612`), `sameNameAndDobPatients` (`:1744`) lọc `deleted_at IS NULL`. Đề xuất: báo lễ tân khi khớp hồ sơ đã lưu trữ.
5. **[Thấp] Gộp hồ sơ bỏ SĐT nguồn khỏi lịch sử SĐT** (`patients.service.ts:1076`) → lần sau khách đặt bằng số đó không khớp. Đề xuất: ghi một dòng `patientPhoneHistory` cho hồ sơ đích.
6. **[Thấp] Nhãn "BN mới, BS không nhận" xét nhầm bác sĩ sau khi khách từ chối giờ đề xuất** (`booking.service.ts:1121-1124`, `:1444`). Đề xuất: dùng `effectiveDentistId(r)`.
7. **[Thấp, quyết định cần xem lại] Tra cứu chỉ bằng SĐT vẫn trả giờ hẹn** (`booking.service.ts:3065-3080`), trái comment trong code. Ai biết số (kể cả số bị cấp lại) thấy lịch khám của cả nhà. Đề xuất: bỏ giờ hẹn khỏi kết quả hoặc chủ phòng khám xác nhận chủ ý.

Chưa xác nhận: `PATCH /patients/:id` có thể sửa hồ sơ đã lưu trữ/gộp; lễ tân sửa được dị ứng (lệch BR-PT-015).

Đã kiểm, thấy hợp lý: chống gửi trùng, hai lễ tân cùng xác nhận, khách đổi SĐT, trẻ em do phụ huynh đặt, đồng ý/từ chối giờ đề xuất, khách tự hủy, gộp hồ sơ chuyển đủ các bảng, xoá mềm có chặn, danh sách "cần gọi".

## 3. Phiên khám → hoá đơn → thanh toán → kho

1. **[Cao] Phiên khám đã đóng không mở lại được**, dù đặc tả có BR-MR-024 và `POST /encounters/:id/reopen` (`docs/03_Specification/MedicalRecords/SPEC.md:418,663-670`), và đặc tả Billing dặn "admin reopen" khi đổi thủ thuật. Controller không có route reopen; `reopenCancelledEncounter` chỉ mở lại phiên đã **hủy**; mọi thao tác sửa đòi IN_PROGRESS (`backend/src/medical-records/medical-records.service.ts:196-198`); hoá đơn chỉ sửa/bỏ dòng có sẵn, không thêm được (`backend/src/billing/billing.service.ts:1191-1312`). Còn mở từ báo cáo 14/09.
   - Bác sĩ bấm "Kết thúc" mà quên ghi một thủ thuật → không thêm được vào bệnh án, hoá đơn, kho. Đóng nhầm cả phiên → kho đã trừ, hủy hoá đơn không hoàn kho.
   - Đề xuất: reopen cho admin (bắt lý do, audit `REOPENED`), chỉ khi hoá đơn còn DRAFT hoặc đã hủy; khi mở lại thì hủy hoá đơn nháp và nhập lại kho các dòng STOCK_OUT của phiên. Nếu không làm reopen thì phải sửa đặc tả Billing. **Cần chủ phòng khám quyết.**
2. **[Cao] Hoá đơn đã phát hành không điều chỉnh được mà giữ đúng số đã thu** — giảm giá/sửa dòng chỉ khi DRAFT (`billing.service.ts:1122-1128, 1205-1210`); hủy hoá đơn đòi số đã thu = 0 (`:1390-1410`), nên phải "hủy phiếu thu ghi nhầm" (dù đã thu thật) hoặc "hoàn tiền" (dù không trả thật). Không có chuyển phiếu thu sang hoá đơn lập lại, không có xoá nợ.
   - Ví dụ: implant 30 triệu, khách đã trả 10 triệu, phát hiện tính sai giá hoặc khách ngưng điều trị → sổ quỹ sai, hoặc 20 triệu treo mãi trong công nợ.
   - Đề xuất (**chủ phòng khám chọn**): (a) "điều chỉnh giảm/xoá nợ" cho hoá đơn ISSUED/PARTIAL, quyền riêng, bắt lý do; hoặc (b) khi lập lại hoá đơn thì chuyển phiếu thu của hoá đơn cũ sang.
3. **[Trung bình] "Lập lại hoá đơn" làm mất chỉnh sửa và giảm giá đã duyệt** — `reissue` dựng lại từ thủ thuật gốc (`billing.service.ts:316-320, 233-249`), không chép giảm giá (`:177-197`). Khách có thể bị tính dư. Đề xuất: lập lại từ các dòng còn hiệu lực của hoá đơn cũ + chép giảm giá, tối thiểu cảnh báo.
4. **[Trung bình, quyết định cần xem lại] Thiếu tồn kho trên sổ thì không đóng được phiên khám** → không có hoá đơn, bệnh nhân đứng chờ ở quầy (`medical-records.service.ts:593-646`, đúng ADR-0008/BR-INV-005). Không sửa được vật tư của thủ thuật đã ghi. Đề xuất (**chủ phòng khám chọn**): cho tồn âm kèm cảnh báo/nhật ký, hoặc trừ kho tách riêng để đối soát; tối thiểu cho sửa vật tư khi phiên còn mở.
5. **[Thấp] Vẫn chọn được vật tư ngừng dùng (DISCONTINUED)** — `createTreatment` chỉ lọc `deletedAt` (`medical-records.service.ts:1138-1152`), trái BR-INV-014.
6. **[Thấp] Thủ thuật nhập tay không có giá niêm yết và không cần lý do giá** (`medical-records.service.ts:1116-1134`). Đề xuất: bắt nhập lý do.

Chưa xác nhận / ngoài phạm vi đặc tả: giao diện có báo rõ lỗi thiếu tồn kho khi đóng phiên không; chưa có quản lý lô và hạn dùng; chưa có kế hoạch điều trị nhiều buổi (lấy tuỷ, implant) — buổi sau chọn lại dịch vụ thì tính lại đủ giá.

Đã kiểm, thấy hợp lý: hủy rồi mở lại phiên đã hủy, không tạo trùng hoá đơn, thu nhiều lần (chống bấm lặp, không thu quá nợ), hủy phiếu thu và hoàn tiền có kiểm soát, đổi giá danh mục không ảnh hưởng hoá đơn cũ, phiên không có thủ thuật không tạo hoá đơn 0đ.

## 4. Nhân sự, lịch làm, danh mục dịch vụ, lương, chi phí

1. **[Cao] "Tổng chi" bỏ sót khoản chi đã hoàn tiền (REIMBURSED)** — `backend/src/expense/expense.service.ts:323-334` chỉ cộng `APPROVED`, mà APPROVED → REIMBURSED là bước cuối; số này lên thẻ "Thu chi" (`reports.service.ts:868-875`). Dữ liệu mẫu: 8 khoản, 111.483.932đ bị bỏ sót → chủ phòng khám thấy lãi cao hơn thật. Đề xuất: cộng cả `APPROVED` và `REIMBURSED`.
2. **[Cao] Duyệt kỳ lương trước ngày cuối kỳ thì hoa hồng của hoá đơn phát hành sau đó mất hẳn** — `lockPeriod`/`approvePeriod` (`backend/src/payroll/payroll.service.ts:1772-1840`) không kiểm `periodEnd`; listener chỉ ghi vào kỳ còn mở chứa `issuedAt` (`payroll.listener.ts:71-75`). Duyệt lương tháng 3 ngày 25/3 → hoá đơn 26–31/3 không vào kỳ nào. Duyệt kỳ cũng không bắt tính lại (đổi nghỉ phép, ca, chế độ lương không cập nhật phiếu lương).
   - Đề xuất: chặn khoá/duyệt khi kỳ chưa hết; tự tính lại khi duyệt; nếu muốn trả sớm thì hoá đơn rơi vào kỳ đã đóng chuyển sang kỳ mở kế tiếp.
3. **[Cao] Không đổi được tỷ lệ hoa hồng/lương cơ bản giữa chừng trên giao diện** — `frontend/src/features/payroll/CompensationListPage.tsx:30-52` chỉ tạo chế độ mới (không có ngày kết thúc), backend từ chối chồng ngày với chế độ đang mở vô hạn (`payroll.service.ts:452-470`) → lỗi 409, không có nút kết thúc chế độ cũ. API sửa tại chỗ thì áp tỷ lệ mới ngược về đầu chế độ; xoá thì lương và hoa hồng cả kỳ về 0.
   - Đề xuất: tạo chế độ mới thì tự kết thúc chế độ cũ vào `effectiveFrom − 1`; bỏ sửa tỷ lệ tại chỗ; "ngưng" chỉ đặt `effectiveTo`.
4. **[Trung bình, cần chủ phòng khám chọn] Lương bác sĩ không có trong "Thu – Chi"** (`reports.service.ts:868-875`; danh mục chi mẫu "Lương nhân viên" ghi "ngoài bác sĩ"). Đề xuất: (a) cộng lương kỳ đã trả vào "Tổng chi" theo ngày trả, hoặc (b) đánh dấu kỳ đã trả thì tự sinh khoản chi "Lương bác sĩ".
5. **[Thấp] Đăng ký ca có hai bản với luật và quyền khác nhau** — `payroll/shift-registration.service.ts:80-180` (chặn mọi ca thứ hai trong ngày) và `appointments.service.ts:3795-3960` (chỉ chặn khi chồng giờ). Đề xuất: giữ một bản.
6. **[Thấp] Truy thu hoa hồng chỉ xảy ra khi bác sĩ còn được tính lương** (`payroll.service.ts:1068-1075, 798-860`) → hoá đơn bị hủy sau khi bác sĩ nghỉ thì không ghi nhận khoản trả thừa.

Chưa xác nhận: kỳ điều chỉnh chép nguyên `netPayVnd` của kỳ gốc (`payroll.service.ts:2010-2035`) — có thể trả hai lần nếu đánh dấu đã trả theo tổng; `softDeleteCompensation` lấy "hôm nay" theo UTC.

Đã kiểm, thấy hợp lý: hoa hồng tính trên dòng hoá đơn sau giảm giá/hoàn tiền, tỷ lệ theo ngày khám, truy thu khi hoá đơn bị hủy, lập lại hoá đơn không trả hai lần; bác sĩ nghỉ việc bị chặn khi còn lịch; đổi giá dịch vụ không ảnh hưởng lịch đã đặt; không tự duyệt khoản chi của mình.

## 5. Phân quyền, báo cáo, trang chủ, tóm tắt AI

1. **[Cao] Lễ tân giảm giá tới 100% một mình, không để lại dấu vết cho chủ phòng khám** — `PUT invoices/:id/discount` chỉ đòi `invoice.update` (`backend/src/billing/billing.controller.ts:81-82`), lễ tân có quyền này; `updateDiscount` chỉ chặn 0–100% (`billing.service.ts:1118-1141`) và không ghi nhật ký hệ thống (các thao tác tiền khác đều ghi). Báo cáo không có dòng tổng giảm giá. Trái BR-BILL-025 (giảm >50% chỉ admin, phải audit rõ).
   - Tình huống: khách trả tiền mặt, lễ tân giảm 100%, phát hành hoá đơn 0đ và giữ tiền.
   - Đề xuất: ngưỡng giảm giá lớn cần quyền riêng chỉ admin có; ghi `INVOICE_DISCOUNT_UPDATED` vào nhật ký; thêm "Tổng giảm giá" theo người giảm vào báo cáo. **Ngưỡng do chủ phòng khám chọn.**
2. **[Trung bình] Vai trò tự tạo không có menu** — `frontend/src/lib/nav.ts:54-61` chọn nhóm menu theo mã vai trò (`dentist|receptionist|clinic_admin`), không theo quyền (trái ADR-0004); vai trò hệ thống lại không sửa được quyền. Vai trò "Lễ tân ca tối" tự tạo không thấy Lịch hẹn, Bệnh nhân, Điều phối. Đề xuất: lọc từng mục chỉ theo `permission`.
3. **[Trung bình] Hủy hoá đơn làm đổi doanh thu của tháng đã chốt** — doanh thu lọc theo trạng thái hiện tại (`backend/src/reports/revenue-basis.ts:16-31`): hoá đơn tháng 9 bị hủy ngày 5/10 làm doanh thu tháng 9 giảm theo, lệch với lúc chốt và lúc tính hoa hồng. Đề xuất: ghi bút toán âm vào ngày hủy, giống cách xử lý hoàn tiền.
4. **[Thấp] Hai bảng "theo dịch vụ" ra số khác nhau** — `revenueReport.byService` không trừ hoàn tiền (`reports.service.ts:322-332`), bảng trên trang chủ có trừ (`:780-805`).
5. **[Thấp] Trang Thanh toán: "Tổng theo bộ lọc" cộng cả hoá đơn nháp và đã hủy, lọc theo ngày tạo** (`billing.service.ts:424-433, 480-500`) → khác số báo cáo.
6. **[Thấp] Tóm tắt AI đếm hoá đơn nháp là "chưa thanh toán" và giữ cache cũ 1 giờ sau khi khách trả** (`backend/src/ai/ai.service.ts:161-163, 19, 139-146`) → lễ tân có thể đòi tiền lần nữa. Đề xuất: chỉ đếm ISSUED/PARTIAL; xoá cache khi có thanh toán/hoàn/hủy.
7. **[Thấp] Quyền menu và API lệch nhau ở Vai trò, Nhật ký** (`role.read`/`audit.read` ở frontend, `role.upsert`/`system.audit.read` ở API → vào được menu nhưng 403); nhật ký đổi vai trò/quyền không lưu danh sách cũ.

Chưa xác nhận: hoá đơn từ phiên khám không có lịch hẹn bị bỏ khỏi doanh thu theo nguồn (inner join); đặt lại mật khẩu cho tài khoản đã khoá; chi tiết hoá đơn trả lịch sử thay đổi cho người không có `invoice.audit.read`.

Đã kiểm, thấy hợp lý: quyền nạp lại mỗi request, chặn xoá admin cuối cùng, lễ tân không hoàn tiền/hủy phiếu/hủy hoá đơn, không tự hủy phiếu mình thu, bác sĩ chỉ xem hoá đơn của mình và không xem doanh thu, giá ngoài bảng giá cần quyền và lý do, tóm tắt AI không lộ chẩn đoán cho lễ tân, các bảng doanh thu chính dùng chung một định nghĩa.
