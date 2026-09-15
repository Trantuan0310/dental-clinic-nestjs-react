# Báo cáo rà soát hệ thống nha khoa

Ngày kiểm tra: 2026-09-14.
Repository local: C:/Users/tuans/OneDrive/Desktop/ĐATN.
Commit nền: abded406616a3679a789c3755cf1e51337c57398, nhánh main.
Phạm vi thay đổi: chỉ thêm báo cáo và script kiểm chứng; chưa sửa nghiệp vụ, commit hoặc push.

## Kết luận và cách đọc

Ghi nhận 40 phát hiện: 18 P1 và 22 P2, ảnh hưởng phân quyền, tính lương, tính toàn vẹn bệnh án, tồn kho, lịch hẹn, báo cáo tài chính và kiểm thử. Build thành công và unit test xanh không loại trừ những lỗi này.

- P1: nên sửa trước khi dùng với dữ liệu vận hành hoặc trước khi nghiệm thu luồng liên quan.
- P2: lỗi chức năng, dữ liệu hoặc kiểm thử cần sửa trong đợt tiếp theo.
- R: tái hiện trên hàm/DTO thực tế bằng script dữ liệu giả lập.
- S: xác định qua đường đi code, schema, frontend và/hoặc đặc tả; chưa tái hiện trên hệ thống chạy thật.
- C: có đường chạy đồng thời không được bảo vệ. Nếu có probe R, probe chỉ mô phỏng thứ tự thao tác; chưa chứng minh bằng hai transaction PostgreSQL thực.

Các probe trong reproduce.cjs cố ý khẳng định hành vi SAI đang tồn tại. “REPRODUCED” không có nghĩa chức năng đúng. Sau khi sửa, probe liên quan phải không còn tái hiện được và cần chuyển thành regression test khẳng định hành vi đúng.

## Phạm vi thực tế

Đã lập danh mục 324 file .ts/.tsx trong backend/src và frontend/src, khoảng 46.185 dòng không rỗng, bao gồm test. Kiểm tra TypeScript/build/lint áp dụng rộng theo cấu hình dự án. Đọc sâu các service, controller, DTO, schema/migrations và đường gọi frontend liên quan đến các lỗi bên dưới. Đối chiếu PROJECT_RULES.md và đặc tả Patients, Appointments, MedicalRecords, Billing, Payroll, Inventory, Auth khi liên quan.

Đây là rà soát tĩnh diện rộng kết hợp kiểm chứng có mục tiêu, KHÔNG phải xác nhận đã đọc thủ công từng dòng trong 324 file hoặc đã bấm mọi màn hình. Chưa kiểm tra đầy đủ Playwright, responsive/a11y, mọi role tùy biến, SMTP thật, Gemini thật, tải lớn, deadlock và database được dựng mới từ migrations. Không coi những phần chưa kiểm tra là đạt.

| Nhóm | Phần đã kiểm tra | Giới hạn |
| --- | --- | --- |
| Auth / Users / Roles | Login, refresh, reset password, quyền hiện tại, vai trò, khóa tài khoản | Chưa thử toàn bộ race token, SMTP và nhiều tab |
| Patients | Tạo/sửa, liên hệ, xóa mềm, lookup, scope, merge, proxy | Chưa chạy merge/restore trên DB thật |
| Appointments / Schedule | Tạo, availability, check-in, start, cancel, no-show, reschedule, ca làm | Chưa stress test booking và time-off |
| MedicalRecords | Đóng, ghi chú, addendum, điều trị, đơn thuốc, sơ đồ răng | Có probe DTO/service; chưa click toàn bộ UI |
| Billing / Reports | Đọc hóa đơn, phát hành, giảm giá, thu tiền, void, tổng hợp | Chưa thực hiện thu/hoàn tiền thật |
| Inventory | Nhập/xuất, điều chỉnh, xóa, low-stock, nhật ký | Race được phân tích/mô phỏng, chưa thử DB |
| Expense | CRUD, duyệt, hoàn ứng, tổng hợp tài chính | Chưa đối soát sổ chi thực tế |
| Payroll | Compensation, kỳ lương, compute, adjustments, approval, paid, cron | Công thức đối chiếu spec, không phải thẩm định luật thuế |
| AI | Phân quyền, dữ liệu đầu vào, cache/fallback | Không gọi dịch vụ AI ngoài |
| Frontend / QA | Routes, API adapters, auth, booking, bệnh án, build/lint, test code | Chưa chạy trọn bộ browser E2E |

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Backend npm test -- --silent | 24 suite, 324 test pass |
| Backend npx tsc --noEmit --incremental false | Pass |
| Backend npx prisma validate | Pass |
| Backend ESLint không dùng --fix | 67 lỗi prettier/prettier |
| Frontend npm run typecheck | Exit 0; cấu hình gốc chỉ có project references, nên dùng kết quả build bên dưới làm bằng chứng chắc hơn |
| Frontend npm run build | Pass: tsc -b và Vite, 3210 module; có cảnh báo import động/tĩnh trùng |
| Frontend npm run lint | 6 lỗi: 1 ban-types trong fixtures và 5 no-explicit-any trong payrollApi |
| Backend npm run test:e2e -- --silent | Jest báo 4 suite / 14 test pass; không coi là 14 luồng đã chạy vì QA-01 |
| node docs/audits/2026-09-14/reproduce.cjs | 21/21 tình huống lỗi tái hiện |

Lưu ý: bộ backend E2E dùng server từ E2E_API_URL hoặc localhost:3000, không tự dựng server từ commit đang kiểm tra. Một test có thể tạo expense nếu đăng nhập thành công; đầu ra lần chạy này không xác định nhánh đó có thực thi hay không. Không reset hoặc dọn dữ liệu server đang chạy.

## Lỗi ưu tiên P1

### BILL-01 [P1, R/S] Đọc hóa đơn theo encounter bỏ qua giới hạn bác sĩ

Vị trí: [backend/src/billing/billing.controller.ts:130](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/billing/billing.controller.ts:130>), [backend/src/billing/billing.service.ts:278](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/billing/billing.service.ts:278>).

GET /billing/invoices/by-encounter/:encounterId cho phép invoice.read.own nhưng không nhận actor và service chỉ tìm theo encounterId. Bác sĩ A có ID encounter của B có thể đọc hóa đơn và các dòng điều trị, trong khi GET hóa đơn theo ID lại có kiểm tra owner.

Probe BILL-01 chứng minh controller/service trả invoice mà không có bước nhận diện owner. Cần truyền actor, kiểm tra encounter.dentistId và deletedAt trước khi trả dữ liệu; test cả đường theo ID và theo encounter.

### AI-01 [P1, S] API tóm tắt bệnh nhân không áp dụng phạm vi bác sĩ

Vị trí: [backend/src/ai/ai.controller.ts:22](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/ai/ai.controller.ts:22>), [backend/src/ai/ai.service.ts:31](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/ai/ai.service.ts:31>), [backend/prisma/seed.ts:262](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/prisma/seed.ts:262>).

Bác sĩ được cấp ai.summary.read. API chỉ nhận patientId, không nhận actor; service lấy dị ứng, bệnh nền, thuốc, các encounter và số hóa đơn của bệnh nhân bất kỳ chưa xóa. Có thể dùng đường này để đọc thông tin của bệnh nhân mà PatientsService từ chối theo BR-PT-014.

Cần áp dụng policy quyền bệnh nhân trước cả việc trả cache. Việc reception được phép dùng AI không đồng nghĩa bác sĩ được phép xem mọi bệnh nhân.

### MR-01 [P1, R/S] Sửa/xóa điều trị sau khi bệnh án hoàn tất

Vị trí: [backend/src/medical-records/medical-records.service.ts:759](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:759>), [backend/src/medical-records/medical-records.service.ts:786](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:786>).

updateTreatment và deleteTreatment kiểm tra owner nhưng không kiểm tra trạng thái encounter. Sau close, invoice đã chụp giá và kho đã trừ; sửa giá hoặc xóa điều trị làm bệnh án hiện tại khác hóa đơn, đồng thời có thể thay đổi dữ liệu đầu vào tính hoa hồng kỳ sau.

Probe MR-01 sửa giá 500.000 thành 1 rồi xóa điều trị của encounter COMPLETED thành công. Các hàm upsert/update/deletePrescription và snapshotDentalChart cũng thiếu kiểm tra trạng thái ở service. Cần bảo vệ trạng thái tại thời điểm ghi, không chỉ ẩn nút UI.

### MR-03 [P1, R/C] Hai yêu cầu close có thể trừ kho hai lần

Vị trí: [backend/src/medical-records/medical-records.service.ts:381](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:381>), [backend/src/medical-records/medical-records.service.ts:459](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:459>).

closeEncounter dùng transaction mặc định, đọc IN_PROGRESS rồi trừ vật tư, cuối cùng update encounter chỉ theo id. Hai transaction cùng đọc IN_PROGRESS đều có thể hoàn tất khi còn đủ kho. Guard quantityOnHand chỉ ngăn âm kho, không ngăn tiêu hao hai lần cho cùng encounter.

Probe MR-03 mô phỏng stock 10, usage 2, hai close: còn 6 thay vì 8 và phát hai event. Cần khóa/claim encounter trong cùng transaction trước khi tiêu hao, rồi test bằng hai kết nối DB.

### MR-04 [P1, R/S] Validation làm mất toàn bộ dữ liệu sơ đồ răng

Vị trí: [backend/src/medical-records/dto/medical-record.dto.ts:261](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/dto/medical-record.dto.ts:261>), [backend/src/main.ts:45](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/main.ts:45>), [frontend/src/features/medical-records/imperativeApi.ts:215](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/src/features/medical-records/imperativeApi.ts:215>).

SnapshotDentalChartDto.teeth chỉ có ApiProperty, không có decorator validation; whitelist: true loại bỏ teeth trước khi đến service. Gửi patientType hợp lệ vẫn mất teeth. Tạo mới có thể lỗi vì Prisma thiếu JSON bắt buộc; cập nhật có thể trả thành công nhưng giữ nguyên răng cũ.

Adapter snapshotDentalChart ở frontend còn chỉ gửi teeth mà thiếu patientType bắt buộc. Probe MR-04 tái hiện việc strip bằng ValidationPipe thật. Cần validate object teeth và thống nhất payload giữa client/server.

### MR-06 [P1, R/S] Số lượng thuốc bị bỏ khỏi đơn thuốc khi lưu

Vị trí: [frontend/src/features/medical-records/PrescriptionsTab.tsx:200](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/src/features/medical-records/PrescriptionsTab.tsx:200>), [backend/src/medical-records/dto/medical-record.dto.ts:224](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/dto/medical-record.dto.ts:224>), [backend/src/medical-records/medical-records.service.ts:839](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:839>).

UI cho nhập quantity và gửi trong lines nhưng PrescriptionLineInputDto, dữ liệu create và schema PrescriptionLine không lưu trường này. Validation strip quantity; đọc lại đơn không có số lượng, UI hiển thị dấu “-”. Field “Thời gian” của form còn gửi duration dạng chuỗi trong khi DTO nhận durationDays dạng số; duration cũng bị loại, service lưu thời gian rỗng nếu không nhận durationDays.

Probe MR-06 gửi quantity=20 và kết quả DTO mất field. Cần thống nhất số lượng, đơn vị và thời gian dùng trên form, DTO, schema, response. Đây là lỗi mất dữ liệu đơn thuốc, không chỉ lỗi hiển thị.

### PAY-01 [P1, R] Hợp đồng chưa có ngày kết thúc được trả đủ tháng dù bắt đầu giữa kỳ

Vị trí: [backend/src/payroll/domain/prorate-calculator.ts:62](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/domain/prorate-calculator.ts:62>).

Nhánh openEnded trả monthlySalary ngay khi có bất kỳ overlap. Lương 30 triệu, bắt đầu 16/9, kỳ 1-30/9: code trả 30 triệu thay vì 15 triệu theo BR-PAY-013.

Probe PAY-01 xác nhận kết quả. Open-ended chỉ bỏ giới hạn ngày cuối, không bỏ việc chia theo số ngày bắt đầu thực tế.

### PAY-02 [P1, R/S] Bỏ doanh thu sau 00:00 của ngày cuối kỳ lương

Vị trí: [backend/src/payroll/domain/payroll-state.ts:119](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/domain/payroll-state.ts:119>), [backend/src/payroll/payroll.service.ts:577](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:577>), [backend/src/payroll/payroll.listener.ts:32](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.listener.ts:32>).

periodEnd là DATE, computePeriodBounds tạo midnight ngày cuối. Query encounter.closedAt dùng lte: payPeriod.end; encounter hoàn tất trưa ngày cuối không được chọn. Listener cũng so closedAt <= periodEnd nên không cập nhật khoản đó.

Probe PAY-02 xác nhận ngày 30/9 lúc 05:00Z lớn hơn end=30/9 00:00Z. Cần định nghĩa thống nhất khoảng thời gian, ví dụ [đầu kỳ, đầu ngày kế tiếp sau ngày cuối), kèm timezone phòng khám.

### PAY-05 [P1, R/S] Chỉ dùng một compensation cho cả kỳ và toàn bộ doanh thu

Vị trí: [backend/src/payroll/payroll.service.ts:543](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:543>), [backend/src/payroll/payroll.service.ts:561](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:561>), [backend/src/payroll/payroll.service.ts:619](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:619>).

findFirst orderBy effectiveFrom desc lấy phiên bản mới nhất, bỏ phiên bản cũ cùng kỳ. Base salary thiếu phần kỳ cũ; commission mới bị áp cho encounter xảy ra trước ngày hiệu lực, trái BR-PAY-006/007.

Probe PAY-05 đặt bản mới 40 triệu từ 16-30/9: chỉ tính 20 triệu base, không tải phần lương 1-15/9, và lấy rate mới 20% cho encounter ngày 5/9. Cần cộng các đoạn compensation và chọn rate theo thời điểm encounter.

### PAY-03 [P1, R] Tính ca định kỳ ngoài thời gian hiệu lực

Vị trí: [backend/src/payroll/payroll.service.ts:759](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:759>).

Query chỉ yêu cầu WorkingSchedule có giao với kỳ; vòng lặp từng ngày lại chỉ so dayOfWeek, không so validFrom/validTo tại ngày đó. Một ca chỉ có hiệu lực thứ Hai 21/9 được tính cho cả bốn thứ Hai của tháng.

Probe PAY-03 cho ra 32 giờ thay vì 8 giờ. Cần kiểm tra hiệu lực trên từng ngày và xử lý TimeOff theo policy đã thống nhất.

### PAY-06 [P1, R/C] Compute có thể sửa bảng lương đã được duyệt

Vị trí: [backend/src/payroll/payroll.service.ts:391](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:391>), [backend/src/payroll/payroll.service.ts:454](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:454>).

Trạng thái DRAFT/REVIEWING được đọc trước transaction. Admin khác có thể approve sau đọc, trước khi transaction compute bắt đầu; transaction không đọc/khóa period và vẫn xóa, tạo lại line items. Serializable không bảo vệ một lần đọc nằm ngoài transaction.

Probe PAY-06 mô phỏng phê duyệt trong khoảng đó và quan sát deleteMany khi trạng thái đã APPROVED. Cần kiểm tra/khóa period trong transaction, đồng bộ với approve/paid.

### PAY-07 [P1, S] Đóng bệnh án tự động xóa điều chỉnh lương đã nhập

Vị trí: [backend/src/payroll/payroll.listener.ts:45](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.listener.ts:45>), [backend/src/payroll/payroll.service.ts:454](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:454>), [backend/src/payroll/payroll.service.ts:634](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:634>).

Listener gọi computePeriod cho toàn kỳ kể cả REVIEWING. Compute deleteMany line items; FK cascade xóa adjustments; bonus/penalty được tạo lại bằng 0. Admin đã nhập thưởng/phạt, một bệnh án mới hoàn tất trong kỳ có thể làm mất các khoản đó mà không qua thao tác tính lại chủ động.

BR-PAY-022 có nói DRAFT compute tạo lại, nhưng không làm cho việc tự động mất adjustment ở REVIEWING trở thành hành vi an toàn. Cần bảo toàn/reapply adjustments theo dentist+period hoặc tách update doanh thu khỏi dữ liệu điều chỉnh.

### APPT-03 [P1, R/S] Frontend dùng giờ địa phương, backend diễn giải lịch làm việc là UTC

Vị trí: [frontend/src/features/appointments/AppointmentFormModal.tsx:57](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/src/features/appointments/AppointmentFormModal.tsx:57>), [backend/src/appointments/appointments.service.ts:1387](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:1387>).

UI chuyển 09:00 Việt Nam thành 02:00Z. Backend ghép lịch 08:00 thành 08:00Z, tức 15:00 Việt Nam. Chọn giờ hợp lệ trên form có thể bị báo ngoài giờ; availability trả chuỗi giờ không có timezone nên không phát hiện chênh lệch này.

Probe APPT-03 xác nhận sự lệch trong phép chuyển đổi. Cần định nghĩa giờ lịch làm việc là giờ phòng khám và chuyển sang instant nhất quán, kể cả dayOfWeek, today và ranh giới ngày.

### APPT-01 [P1, R/C] Cron no-show ghi đè check-in đang diễn ra

Vị trí: [backend/src/appointments/appointments.service.ts:434](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:434>), [backend/src/appointments/appointments.service.ts:450](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:450>).

Cron tìm các ID SCHEDULED/CONFIRMED, sau đó updateMany chỉ theo ID. Nếu reception check-in giữa hai bước, cron vẫn đổi thành NO_SHOW, khiến bệnh nhân đang chờ biến mất khỏi queue.

Probe APPT-01 tái hiện thứ tự này. Cần giữ điều kiện trạng thái và thời gian trong câu UPDATE, không chỉ SELECT. Ngoài ra cần rà soát policy cutoff: cron hiện +15 phút trong khi check-in thông thường cho tới +30 phút.

### SHIFT-01 [P1, R/S] Đường API ca làm cũ cho bác sĩ đăng ký hộ người khác

Vị trí: [backend/src/appointments/appointments.service.ts:993](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:993>), [backend/src/appointments/appointments.controller.ts:142](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.controller.ts:142>), [backend/prisma/seed.ts:222](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/prisma/seed.ts:222>).

POST /appointments/shift-registrations dùng trực tiếp dto.dentistId; bác sĩ có shift_registration.write có thể tạo ca cho bác sĩ B. API ShiftRegistrationService mới lại ép requestorId với non-admin, nhưng đường cũ vẫn public.

Probe SHIFT-01: actor A tạo bản ghi dentistId B thành công. Cần cùng một policy cho cả hai endpoint hoặc bỏ đường cũ sau khi chuyển client.

### EXP-01 [P1, R/S] Chi phí biến mất khỏi tổng chi sau khi hoàn ứng

Vị trí: [backend/src/expense/expense.service.ts:326](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/expense/expense.service.ts:326>), [backend/src/billing/billing.service.ts:1107](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/billing/billing.service.ts:1107>).

aggregateApproved chỉ cộng status APPROVED. Sau markReimbursed chuyển thành REIMBURSED, khoản đã chi thực tế bị loại, làm totalExpense giảm và số liệu tài chính sai.

Probe EXP-01 xác nhận filter bỏ REIMBURSED. Cần định nghĩa rõ báo cáo theo phát sinh hay dòng tiền và bao gồm các trạng thái tương ứng; tối thiểu không để khoản đã hoàn ứng biến mất.

### BILL-02 [P1, S] Thu tiền không có cơ chế chống ghi nhận lặp cùng yêu cầu

Vị trí: [backend/src/billing/billing.controller.ts:111](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/billing/billing.controller.ts:111>), [backend/src/billing/billing.service.ts:285](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/billing/billing.service.ts:285>), [backend/src/billing/dto/billing.dto.ts:17](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/billing/dto/billing.dto.ts:17>).

Không đọc/lưu Idempotency-Key và payment không có unique request key. Hóa đơn còn nợ 1 triệu: cùng một yêu cầu trả 200 nghìn gửi lại sau response thất lạc sẽ tạo hai payment nếu vẫn còn nợ. Version guard chống xung đột đồng thời nhưng không chống lần gửi lại sau commit.

Cần key duy nhất cùng transaction với payment, lưu kết quả để trả lại khi retry; test mất response và duplicate request. Đây là kiểm tra tính toàn vẹn dữ liệu theo PROJECT_RULES §9, không phải khuyến nghị về phương thức thanh toán.

### BILL-04 [P1, S] Bệnh án đã đóng có thể không bao giờ có hóa đơn

Vị trí: [backend/src/medical-records/medical-records.service.ts:533](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:533>), [backend/src/billing/encounter-closed.listener.ts:22](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/billing/encounter-closed.listener.ts:22>).

closeEncounter commit bệnh án/kho rồi gọi events.emit, không đợi việc tạo invoice. Listener bất đồng bộ bắt lỗi và chỉ log. Nếu database tạm lỗi hoặc process dừng giữa commit và xử lý event, bệnh án đã COMPLETED nhưng không có invoice. Gọi close lại bị từ chối; không thấy outbox, retry job hoặc endpoint khôi phục invoice trong code đã rà soát.

Cần bảo đảm việc tạo hóa đơn được ghi nhận bền vững cùng lần đóng, bằng cùng transaction hoặc outbox/retry có idempotency. Test fail tại ranh giới commit/event và kiểm tra phục hồi sau restart.


## Lỗi ưu tiên P2


### MR-02 [P2, R] Chặn addendum đúng lúc người dùng cần bổ sung bệnh án đã khóa

Vị trí: [backend/src/medical-records/medical-records.service.ts:680](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:680>), [docs/03_Specification/MedicalRecords/SPEC.md:399](<C:/Users/tuans/OneDrive/Desktop/ĐATN/docs/03_Specification/MedicalRecords/SPEC.md:399>).

BR-MR-005 cho bổ sung trong 30 ngày sau đóng. Code lại throw khi clinicalNote.isLocked và encounter không còn IN_PROGRESS. Vì close khóa note, bệnh án vừa đóng cũng không thêm được addendum. Ngược lại không có kiểm tra giới hạn 30 ngày.

Probe MR-02 xác nhận từ chối bệnh án vừa đóng. Cần kiểm tra owner và closedAt thay vì cấm mọi note locked.

### MR-05 [P2, R] Không thể tạo điều trị cho răng sữa hợp lệ

Vị trí: [backend/src/medical-records/dto/medical-record.dto.ts:90](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/dto/medical-record.dto.ts:90>), [docs/03_Specification/MedicalRecords/SPEC.md:400](<C:/Users/tuans/OneDrive/Desktop/ĐATN/docs/03_Specification/MedicalRecords/SPEC.md:400>).

toothNumbers bị giới hạn 11-48; răng sữa 51-55, 61-65, 71-75, 81-85 bị từ chối. Range 11-48 còn cho qua các mã không phải răng như 19 hoặc 29. Probe MR-05 xác nhận từ chối răng 55.

Cần validate tập FDI thực tế, phân biệt người lớn/trẻ em; xử lý Palmer đúng policy nếu vẫn nằm trong scope.

### MR-07 [P2, R/S] Xóa đơn thuốc nhưng vẫn hiện đơn cũ và không tạo lại được

Vị trí: [backend/src/medical-records/medical-records.service.ts:217](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:217>), [backend/src/medical-records/medical-records.service.ts:821](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:821>), [backend/src/medical-records/medical-records.service.ts:917](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:917>).

deletePrescription chỉ set deletedAt. getEncounter vẫn include và format đơn đã xóa. upsertPrescription tìm mọi bản theo encounterId và throw nếu tồn tại, kể cả đã xóa; unique encounterId cũng chặn tạo mới.

Probe MR-07 xác nhận bản deletedAt chặn tạo. Cần quyết định restore/revision hay chỉ một bản bất biến, và thống nhất read/write/schema.

### MR-08 [P2, S] Bắt đầu khám qua hai request dễ kẹt ở trạng thái không có bệnh án

Vị trí: [frontend/src/features/appointments/appointmentApi.ts:614](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/src/features/appointments/appointmentApi.ts:614>), [backend/src/appointments/appointments.service.ts:242](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:242>), [backend/src/medical-records/medical-records.service.ts:93](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:93>).

Frontend gọi chuyển appointment IN_PROGRESS rồi gọi tạo Encounter. Nếu request thứ hai lỗi, bước đầu đã commit; bấm lại flow sẽ bị bước đầu từ chối vì không còn CHECKED_IN. API tạo Encounter trực tiếp từ CHECKED_IN thì lại không chuyển trạng thái appointment.

Cần một endpoint thực hiện cả hai trong transaction, idempotent khi đã tồn tại. Kiểm tra cả việc hủy encounter: cancelEncounter hiện không đồng bộ trạng thái appointment.

### APPT-02 [P2, R/S] Có lịch sáng và chiều nhưng chỉ đặt được trong một lịch

Vị trí: [backend/src/appointments/appointments.service.ts:1320](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:1320>), [backend/src/appointments/appointments.service.ts:559](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:559>).

Availability duyệt tất cả schedules, còn ensureSlotAvailable dùng findFirst. Nếu lịch đầu tiên 08-12 và lịch thứ hai 13-17, availability có slot chiều nhưng booking chiều bị so với lịch sáng rồi từ chối. Không có orderBy nên lịch được chọn còn không xác định.

Probe APPT-02 xác nhận nhánh từ chối khi chọn nhầm lịch sáng. Cần tìm lịch thực sự chứa khoảng appointment.

### APPT-04 [P2, S] Hủy lịch không giải phóng được đúng slot trong DB

Vị trí: [backend/prisma/schema.prisma:448](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/prisma/schema.prisma:448>), [backend/prisma/migrations/001_init/migration.sql:807](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/prisma/migrations/001_init/migration.sql:807>), [backend/src/appointments/appointments.service.ts:1305](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:1305>).

Service bỏ qua CANCELLED/NO_SHOW khi check conflict, nhưng unique (dentistId,startAt) áp dụng toàn bảng. Đặt lại cùng bác sĩ và giờ vừa hủy vượt qua check rồi vướng P2002. Migrations hiện có không chuyển index này sang partial index.

Cần migration đồng bộ với định nghĩa slot active; xác minh trên DB mới và DB nâng cấp. Chưa xác nhận catalog của DB local có chỉnh tay khác migrations hay không.

### APPT-05 [P2, S] Cho đổi giờ/bác sĩ khi bệnh án đã bắt đầu

Vị trí: [backend/src/appointments/appointments.service.ts:478](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:478>), [backend/src/appointments/appointments.service.ts:506](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:506>).

reschedule chỉ cấm CANCELLED/NO_SHOW/COMPLETED, vẫn nhận IN_PROGRESS. Nó đổi dentistId của appointment nhưng không đổi dentistId của Encounter đã tạo. Kết quả lịch, quyền bệnh án và đối tượng tính hoa hồng có thể chỉ tới hai bác sĩ khác nhau. Cũng không gọi validateDentist cho newDentistId.

Cần khóa reschedule theo state machine hoặc có luồng chuyển bác sĩ riêng, đồng bộ nghiệp vụ.

### APPT-06 [P2, S] Ca đăng ký đã duyệt không được dùng để đặt lịch

Vị trí: [backend/src/appointments/appointments.service.ts:554](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:554>), [backend/src/appointments/appointments.service.ts:1320](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/appointments/appointments.service.ts:1320>), [backend/src/payroll/shift-registration.service.ts:162](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/shift-registration.service.ts:162>).

Availability và ensureSlotAvailable chỉ đọc WorkingSchedule/TimeOff/Appointment. Một ngày chỉ có ShiftRegistration APPROVED vẫn báo không có working schedule, dù ca được payroll đọc tính công. maxEncounters của registration cũng không được dùng ở kiểm tra slot.

Cần thống nhất ý nghĩa ca bổ sung giữa lịch khám và payroll, đưa ca đã duyệt vào availability nếu ca dùng để tiếp nhận bệnh nhân.

### PAY-04 [P2, R] Nhiều ca trong cùng ngày bị tính thiếu

Vị trí: [backend/src/payroll/payroll.service.ts:739](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:739>), [backend/src/payroll/payroll.service.ts:759](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:759>).

workingSchedules.find chỉ lấy ca đầu tiên cùng thứ. Cặp 08-12 và 13-17 chỉ tính 4 giờ. Map approvedByDate cũng giữ một registration/ngày, trong khi API cũ cho tạo nhiều ca không overlap cùng ngày.

Probe PAY-04 xác nhận 4 giờ thay vì 8. Cần tổng hợp khoảng ca hợp lệ và giải quyết khác biệt policy hai API registration.

### PAY-08 [P2, S/C] Không có ràng buộc DB chống trùng kỳ lương như comment mô tả

Vị trí: [backend/src/payroll/payroll.service.ts:309](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:309>), [backend/prisma/schema.prisma:1067](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/prisma/schema.prisma:1067>), [backend/prisma/migrations/001_init/migration.sql:921](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/prisma/migrations/001_init/migration.sql:921>).

createPeriod kiểm tra overlap rồi create ngoài transaction. Hai request/cron có thể cùng qua check. Schema comment nói partial unique được enforce bằng migration, nhưng thư mục Prisma migrations hiện tại không có index/EXCLUDE cho khoảng period. Unique ngày bắt đầu/kết thúc, nếu có, cũng chưa đủ chống hai khoảng khác nhau mà giao nhau.

Cần migration thật, phân biệt kỳ điều chỉnh và kỳ thường, đồng thời test concurrent create trên DB. Đây là kết luận về code/migrations trong repo, không khẳng định DB đang chạy thiếu index nếu từng sửa tay.

### PAY-09 [P2, S] Sửa compensation bỏ qua kiểm tra ngày và overlap

Vị trí: [backend/src/payroll/payroll.service.ts:216](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:216>), [backend/src/payroll/payroll.service.ts:173](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/payroll/payroll.service.ts:173>).

create có pre-check overlap nhưng update chỉ ghi effectiveTo. Có thể kéo ngày kết thúc bản cũ chồng lên bản mới, hoặc đặt ngày kết thúc trước ngày bắt đầu. Migrations Prisma không có EXCLUDE/CHECK tương ứng như comment create mô tả.

Cần validate khoảng, kiểm tra các bản khác khi update và có constraint DB để bảo vệ race.

### BILL-03 [P2, S] Danh sách hóa đơn bị cắt và không có cách lấy phần còn lại

Vị trí: [backend/src/billing/billing.service.ts:135](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/billing/billing.service.ts:135>), [backend/src/billing/dto/billing.dto.ts:118](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/billing/dto/billing.dto.ts:118>), [backend/src/common/dto/pagination.dto.ts:42](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/common/dto/pagination.dto.ts:42>).

listInvoices take mặc định 100; DTO không có page/cursor; controller wrap mảng thành pagination có hasMore=false. Khi >100 hóa đơn trong bộ lọc, dữ liệu cũ bị ẩn mà response báo hết. Inventory cũng hard-cap 200.

Cần pagination thật, count/nextCursor và frontend tiêu thụ đúng, kiểm tra trên dữ liệu vượt ngưỡng.

### INV-01 [P2, R] Lọc thiếu hàng sau giới hạn 200 làm bỏ sót hàng cần nhập

Vị trí: [backend/src/inventory/inventory.service.ts:166](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/inventory/inventory.service.ts:166>), [backend/src/inventory/inventory.service.ts:173](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/inventory/inventory.service.ts:173>), [backend/src/inventory/inventory.service.ts:427](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/inventory/inventory.service.ts:427>).

DB chỉ lọc minStockLevel>0; so quantityOnHand<=minStockLevel diễn ra sau take. Nếu item thiếu hàng nằm ngoài 200 dòng đầu, không được trả về. Comment nói filter tại DB nhưng phép so quan trọng vẫn ở ứng dụng.

Probe INV-01 đặt item thiếu hàng ở dòng 201 và nhận danh sách rỗng. Cần field-to-field comparison tại DB trước pagination.

### INV-02 [P2, S/C] Nhật ký tồn kho có quantityBefore sai khi thao tác đồng thời

Vị trí: [backend/src/inventory/inventory.service.ts:185](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/inventory/inventory.service.ts:185>), [backend/src/inventory/inventory.service.ts:207](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/inventory/inventory.service.ts:207>), [backend/src/inventory/inventory.service.ts:263](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/inventory/inventory.service.ts:263>).

stockIn/stockOut đọc item trước atomic update. Hai người cùng đọc 10, cùng nhập 2: tồn cuối có thể đúng 14, nhưng movement thứ hai ghi before=10, after=14, diff=2, vi phạm after-before=diff.

Cần lấy before từ trạng thái đã khóa hoặc suy ra từ giá trị trả về của atomic write. Test chain các stock movement dưới concurrency.

### EXP-02 [P2, S/C] Xóa chi phí có thể chạy qua bước duyệt

Vị trí: [backend/src/expense/expense.service.ts:212](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/expense/expense.service.ts:212>), [backend/src/expense/expense.service.ts:228](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/expense/expense.service.ts:228>), [backend/src/expense/expense.service.ts:295](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/expense/expense.service.ts:295>).

delete đọc DRAFT rồi update chỉ theo id, không guard status/version. Một request approve có thể commit ở giữa, sau đó delete xóa mềm expense APPROVED. delete còn không increment version nên transition đang chạy cũng có thể cập nhật bản đã xóa.

Cần guarded write thống nhất trên status, version, deletedAt.

### PT-01 [P2, R/S] Sửa bệnh nhân bỏ qua điều kiện liên hệ và người giám hộ

Vị trí: [backend/src/patients/patients.service.ts:95](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/patients/patients.service.ts:95>), [backend/src/patients/patients.service.ts:173](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/patients/patients.service.ts:173>).

Create kiểm tra cần ít nhất một liên hệ và trẻ dưới 12 phải có người liên hệ; update không kiểm tra dữ liệu sau khi gộp patch. Có thể xóa cả contactPersonName/contactPersonPhone của trẻ mà primaryPhone đang null.

Probe PT-01 xác nhận mất mọi thông tin liên hệ. Cần dùng cùng rule trên trạng thái cuối, kể cả khi đổi DOB.

### AUTH-01 [P2, S] Gửi thư mời/reset mật khẩu mới chỉ ghi log

Vị trí: [backend/src/users/users.service.ts:173](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/users/users.service.ts:173>), [backend/src/users/users.service.ts:414](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/users/users.service.ts:414>).

UsersService không gọi EmailService cho sendInvite/sendEmail; chỉ log MOCK EMAIL. Reset có sendEmail=true đổi mật khẩu thật, sau đó trả {} mà không giao mật khẩu cho người dùng. Invite còn ghi mật khẩu tạm vào log không phụ thuộc EMAIL_MOCK.

Cần gửi email thật qua service, xử lý lỗi gửi và không log mật khẩu. Chưa thử SMTP ngoài.

### AUTH-02 [P2, S] Link khôi phục mật khẩu dẫn tới route frontend không tồn tại

Vị trí: [backend/src/auth/auth.service.ts:421](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/auth/auth.service.ts:421>), [frontend/src/routes/AppRoutes.tsx:76](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/src/routes/AppRoutes.tsx:76>).

Email tạo URL /auth/reset-password?token=..., nhưng routes chỉ có /login và các trang bảo vệ; không có trang reset tương ứng. Người chưa đăng nhập đi vào protected wildcard sẽ bị chuyển về login thay vì form đặt lại mật khẩu.

Cần route public reset-password và form gọi endpoint reset, kiểm tra token hết hạn/đã dùng.

### AUTH-03 [P2, S] Refresh thất bại trong interceptor không đăng xuất state giao diện

Vị trí: [frontend/src/lib/api.ts:114](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/src/lib/api.ts:114>), [frontend/src/stores/authStore.ts:57](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/src/stores/authStore.ts:57>), [frontend/src/features/auth/ProtectedRoute.tsx:25](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/src/features/auth/ProtectedRoute.tsx:25>).

Interceptor chỉ clear tokenStore; user/isAuthenticated trong Zustand vẫn true. Khi phiên hết hạn trong lúc đang dùng app, ProtectedRoute vẫn cho vào trang, các query tiếp tục lỗi 401 và UI không về login. authApi.refresh có clearSession nhưng interceptor không dùng chung đường đó.

Cần một cơ chế cập nhật/clear session thống nhất giữa boot, interceptor và logout.

### AI-02 [P2, S] AI đọc ghi chú từ bảng khác nơi UI đang lưu

Vị trí: [backend/src/ai/ai.service.ts:105](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/ai/ai.service.ts:105>), [backend/src/medical-records/medical-records.service.ts:621](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/src/medical-records/medical-records.service.ts:621>).

UI ghi chiefComplaint/diagnosis/treatmentPlan vào ClinicalNote qua upsertClinicalNote. AI lại select encounter.chiefComplaint/diagnosis/treatmentPlanText, không include clinicalNote. Ghi chú vừa lưu có thể không xuất hiện trong tóm tắt, nhất là fallback “lần tới”.

Cần chọn nguồn ClinicalNote đã chuẩn hóa. Ngoài ra cache theo patientId có TTL 1 giờ và không có invalidate tại các mutation đã rà soát; cần xác định yêu cầu độ mới, nhất là dị ứng.

### QA-01 [P2, S] E2E có thể “pass” dù không thực thi hành vi cần kiểm tra

Vị trí: [backend/test/e2e/billing.e2e.spec.ts:31](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/test/e2e/billing.e2e.spec.ts:31>), [backend/test/e2e/appointments.e2e.spec.ts:26](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/test/e2e/appointments.e2e.spec.ts:26>), [backend/test/e2e/expense.e2e.spec.ts:25](<C:/Users/tuans/OneDrive/Desktop/ĐATN/backend/test/e2e/expense.e2e.spec.ts:25>).

beforeAll nuốt lỗi login; nhiều test if (!token) return. Jest tính return là test thành công. Một số test còn coi 403 là kết quả hợp lệ của thao tác đáng lẽ cần thành công. Vì thế 14/14 pass không chứng minh luồng đúng.

Cần fail setup khi thiếu server/token, hoặc skip rõ ràng toàn suite theo cấu hình, và bắt đúng status/body. Tạo fixture độc lập và cleanup thay vì để test dùng dữ liệu server đang chạy.

### QA-02 [P2, kiểm tra trực tiếp] Lint chưa đạt và script typecheck frontend dễ gây hiểu nhầm

Vị trí: [frontend/src/features/payroll/payrollApi.ts:294](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/src/features/payroll/payrollApi.ts:294>), [frontend/e2e/fixtures.ts:93](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/e2e/fixtures.ts:93>), [frontend/tsconfig.json:2](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/tsconfig.json:2>), [frontend/package.json:13](<C:/Users/tuans/OneDrive/Desktop/ĐATN/frontend/package.json:13>).

Frontend lint có 6 lỗi; backend lint read-only có 67 lỗi định dạng. npm run typecheck frontend gọi tsc --noEmit ở tsconfig chỉ có files:[] và references; nó không thay thế việc kiểm tra đầy đủ các project như tsc -b. Trong lần rà soát này, build thực tế đã chạy và qua nên không kết luận có lỗi biên dịch ẩn.

Cần script typecheck phù hợp project references, lint sạch và CI kiểm tra không tự che mất format diff.

## Chức năng còn thiếu / điểm cần xác minh riêng

- SettingsPage thông báo đang phát triển, các field bị disabled và không lưu. Đây là tính năng chưa hoàn thiện được UI công khai, không tính là lỗi “lưu thành công giả”.
- Nút in trong PrescriptionsTab chưa có handler; cần xác nhận luồng in chính thức nằm ở đâu trước khi nghiệm thu.
- SPEC có reopen bệnh án, cửa sổ addendum, quyền theo từng trạng thái và các đường API khác với implementation. Cần lập ma trận acceptance theo phiên bản spec thống nhất.
- Chưa kiểm chứng migrations trên database trống. Prisma validate chỉ xác nhận schema DSL hợp lệ, không xác nhận migrations tạo đủ index, extension, uuid_generate_v7 và dữ liệu seed.
- Chưa stress test các race đã đánh dấu C. Không suy từ mô phỏng mock rằng PostgreSQL đã được kiểm thử.
- Chưa thử trọn vòng patient -> appointment -> check-in -> encounter -> invoice -> payment -> payroll bằng browser trên DB fixture riêng.

## Thứ tự xử lý đề xuất

1. Chặn đường đọc vượt quyền BILL-01/AI-01/SHIFT-01 và bảo vệ tính bất biến bệnh án, close idempotent.
2. Sửa sai lương PAY-01/02/03/05/06/07 và kiểm tra bằng dữ liệu mẫu có kết quả tính tay.
3. Sửa timezone, unique slot, nhiều working schedules và quy trình bắt đầu khám nguyên tử.
4. Sửa DTO/schema đơn thuốc/sơ đồ răng, chi phí hoàn ứng, idempotency thu tiền và pagination.
5. Sửa E2E fail-open, chuẩn hóa fixture riêng rồi chạy acceptance theo role và stress test concurrency.
6. Hoàn thiện reset email, auth state, AI source, phần UI còn thiếu và lint.

Mỗi lỗi cần regression test đúng điều kiện gây lỗi trước khi đánh dấu đã sửa. Không dùng việc các test cũ vẫn xanh làm tiêu chí duy nhất.

## Chạy lại kiểm chứng

Tại thư mục gốc repository:

```powershell
node docs/audits/2026-09-14/reproduce.cjs
```

Script chỉ tải code và dependency local; database, audit logger và event bus được thay bằng object giả lập. Không dùng kết quả script như tỷ lệ test coverage hay danh sách đầy đủ mọi lỗi còn lại.
