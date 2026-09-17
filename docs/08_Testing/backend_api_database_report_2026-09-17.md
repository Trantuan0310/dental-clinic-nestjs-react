# Báo cáo kiểm thử backend, API và PostgreSQL — 2026-09-17

## Kết quả

- Unit test: **373/373**, 27 suites. Sau sửa validation kỳ lương, chạy lại **22/22** ca payroll liên quan thành công.
- HTTP/API + PostgreSQL thật: **67/67**, không mock service, Prisma, guard hay transaction.
- Database mới áp dụng **9 migrations**, deploy lặp không có migration chờ.
- Prisma schema validation, backend build và lint/formatter phần thay đổi đã kiểm tra.
- Môi trường: Node.js cài sẵn, PostgreSQL **18.1** local tại cổng 5433. NestJS dùng cùng URI versioning, prefix, cookie parser và ValidationPipe như ứng dụng thật.

## Phạm vi đã chạy

| Nhóm | Ca có bằng chứng HTTP/database |
|---|---|
| Auth | Bốn tài khoản đăng nhập thật; cookie HttpOnly/SameSite Strict; không trả refresh token trong JSON; token sai/hết hạn; sai mật khẩu; giới hạn login; refresh rotation/reuse; logout; từ chối user xóa mềm |
| Phân quyền | Lễ tân không đọc payroll config/ghi clinical note; bác sĩ không đọc lịch, bệnh án, hóa đơn bác sĩ khác; đổi dentistId không mở rộng dữ liệu; tự duyệt chi phí bị chặn |
| Bệnh nhân | UUID v7/mã duy nhất; DOB tương lai; guardian cho trẻ; ranh giới sinh nhật 12 tuổi; số điện thoại sai; khóa DOB sau có bệnh án; soft delete/restore; 404 và UUID sai |
| Lịch hẹn | Booking → check-in → bắt đầu khám; gọi bắt đầu lặp đồng thời; hai booking cạnh tranh; hủy và đặt lại cùng giờ; giờ Việt Nam ở ranh giới UTC; phân trang cursor; nhiều status; ca sáng/chiều; nghỉ trưa; time-off; check-in ngoài cửa sổ |
| Bệnh án | Ghi chú và giá điều trị lưu DB; quantity/unit đơn thuốc; đóng khám khóa note và hoàn tất lịch; đóng lặp bị chặn; note không sửa sau đóng; addendum không sửa bản gốc/quá 30 ngày bị chặn; bệnh án hủy khóa ghi |
| Hóa đơn/tiền | Một hóa đơn khi đóng khám; giá tổng đúng; version sai; discount phần trăm và version; DRAFT không được thu tiền; trả từng phần/đủ/vượt công nợ; ledger khớp paidAmount; hai khoản thu cạnh tranh không thu hai lần; doanh thu nhóm theo ngày Việt Nam |
| Database | Foreign key P2003; unique P2002; partial unique email hoạt động; slot được giải phóng sau hủy; transaction lỗi bước sau rollback bệnh nhân; thiếu vật tư rollback cả stock đã giảm trước đó; sequence mã hóa đơn vượt dữ liệu mã cũ |
| Module phụ | Nhập/xuất kho có movement; xuất kho cạnh tranh không âm; chi phí create/approve/reimburse qua hai người; kỳ lương create/compute/lock/approve/paid, khóa compute sau paid; kỳ chồng lấn/ngày đảo ngược bị chặn |

Luồng chính từ tạo bệnh nhân đến trả đủ hóa đơn chạy hoàn toàn qua API. Một số ca biên tạo fixture trực tiếp bằng Prisma để chuẩn bị trạng thái đặc biệt, sau đó gọi HTTP thật và đối chiếu dữ liệu. Ca payroll xác nhận chu trình với kỳ không có dữ liệu lương; công thức thuế, commission, bảo hiểm và prorate được kiểm tra trong unit test, chưa được chứng minh bằng một kỳ lương có đầy đủ nhân sự/dữ liệu qua HTTP.

## Lỗi phát hiện và sửa

| Lỗi | Tái hiện trước sửa | Kết quả sau sửa |
|---|---|---|
| Migration chi phí lệch Prisma enum | Database mới migrate deploy xong; POST expense hợp lệ trả 500 vì thiếu ExpenseStatus | Migration 016 tạo/đồng bộ enum status/type, giữ lịch sử migration 012; create/approve/reimburse thành công |
| Slot hủy vẫn bị unique index chặn | POST appointment; cancel; POST lại cùng dentist/startAt → 500 P2002 | Migration 017 dùng partial index, POST đặt lại → 201 |
| Bắt đầu khám không đồng bộ lịch | POST medical-records/encounters/start → có Encounter nhưng Appointment vẫn CHECKED_IN | Khóa row lịch, chuyển IN_PROGRESS và tạo/tái sử dụng Encounter trong cùng transaction; gọi lặp không tạo bản ghi thứ hai |
| Xung đột thanh toán trả 500 | Hai POST payments đồng thời cho toàn bộ công nợ; một request thất bại P2034 | HTTP 409 TRANSACTION_CONFLICT, một payment được ghi, balance không âm |
| Tài khoản xóa mềm vẫn dùng JWT | Xóa mềm user sau login; GET auth/me với token cũ → 200 | JwtStrategy kiểm tra deletedAt/deactivatedAt/status DEACTIVATED → 401 |
| Dữ liệu đầu vào chạy vào Prisma | Expense date sai → 500; status lịch không thuộc enum có thể gây lỗi query | DTO kiểm tra date/UUID/status → 400 |
| Ngày kỳ lương đảo ngược dùng lỗi trạng thái | periodEnd trước periodStart → 409 | PayrollValidationException → 400; overlap vẫn 409 |
| E2E cũ có kết quả đạt giả | Login lỗi bị nuốt; `if (!token) return` bỏ nội dung; admin 403 vẫn được chấp nhận | Setup phải login thành công, bỏ nhánh skip, kiểm tra status thành công chính xác; sửa src module mapper |

Các migration mới có BEGIN/COMMIT. Không sửa migration đã triển khai và không dùng db push để che lỗi migration.

## Bằng chứng và an toàn dữ liệu

Lượt nghiệm thu cuối: `backend/test-results/backend-1789609929642_23308/`.

- `jest-results.json`: tên, kết quả và thời gian từng ca.
- `api-tests.log`: log NestJS và tổng kết Jest.
- `migrations.log`, `migrations-repeat.log`: triển khai mới và lặp lại.
- `summary.json`: trạng thái triển khai/test/cleanup và số bản ghi database chính trước/sau.
- `backend/test-results/unit-final.json`: unit test toàn bộ trước thay đổi validation kỳ lương; ca payroll chạy lại sau thay đổi đã đạt 22/22.
- `backend/test-results/live-e2e-failfast.json`: thử có chủ đích với URL không có server (`127.0.0.1:1`); cả 3 ca appointments báo lỗi kết nối và lệnh trả exit 1. Đây là kiểm chứng harness không tạo kết quả đạt giả, không phải lỗi nghiệp vụ trong bộ 67 ca isolated.

Số bản ghi database chính giữ nguyên: **98 patients, 150 appointments, 135 encounters, 130 invoices, 138 payments**. Runner chỉ ghi dữ liệu nghiệp vụ vào database test được tạo riêng và xóa đúng database này khi kết thúc. Đối chiếu count không phải checksum nội dung toàn bộ database.

Database demo còn hai migration chờ: **016, 017**. Hai migration đã được kiểm thử trong database tách biệt; chưa áp dụng thay đổi schema vào database demo trong đợt kiểm thử này.

## Giới hạn

Chưa chạy tải kéo dài, backup/restore, phụ thuộc AI/Redis thật, upload file, mọi biến thể void/refund/merge, toàn bộ tổ hợp permission và kiểm thử bảo mật chuyên sâu. Kiểm thử thu tiền cạnh tranh chứng minh không vượt công nợ; chưa chứng minh idempotency cho hai lần gửi lại khoản thanh toán từng phần có cùng khóa yêu cầu. Đây là hạng mục cần kiểm thử bổ sung trước khi sử dụng với tiền thật.

## Chạy lại

```powershell
cd backend
npm run test:isolated
```

Yêu cầu PostgreSQL localhost và tài khoản có quyền CREATE/DROP DATABASE. Nếu thiếu quyền/kết nối hoặc setup thất bại, lệnh trả lỗi; không coi là test đạt. Thư mục bằng chứng được giữ sau cleanup database.
