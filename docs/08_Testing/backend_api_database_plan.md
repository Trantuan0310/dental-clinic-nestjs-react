# Kiểm thử backend, API và PostgreSQL — 2026-09-17

Mục tiêu: chứng minh luồng bệnh nhân → lịch hẹn → bệnh án → đơn thuốc → hóa đơn → thanh toán bằng HTTP, phân quyền thật và PostgreSQL thật. Unit test bổ trợ quy tắc và các nhánh biên. Không coi việc bỏ qua do thiếu server/token là đạt.

## Môi trường và cách chạy

Chạy `npm run test:isolated` từ `backend`. Runner tạo database `dental_clinic_test_<timestamp>_<pid>` trên PostgreSQL localhost, cài UUID v7 và các sequence từ script init có sẵn, áp dụng toàn bộ migrations rồi áp dụng lại, seed quyền, chạy NestJS/Supertest và xóa đúng database đã tạo khi kết thúc. Không sao chép dữ liệu demo. Các service, guard, transaction và Prisma đều thật; cấu hình test tăng hạn mức tổng API, giữ hạn mức riêng của auth, tắt dịch vụ AI/cache bên ngoài.

Kết quả và log nằm trong `backend/test-results/backend-<run-id>/`. Database chính được đối chiếu số bản ghi bệnh nhân/lịch/bệnh án/hóa đơn/thanh toán trước và sau. Không dùng `db:reset`, `migrate reset` hoặc `db push` với database chính.

## Ma trận nghiệm thu

| Nhóm | Bằng chứng cần có |
|---|---|
| Migrations | Database trống áp dụng được tất cả migration; chạy lại không thay đổi; nâng sequence hóa đơn khi đã có mã lớn |
| Auth | Đăng nhập/refresh cookie thật, token sai/hết hạn, token reuse và logout, tài khoản vô hiệu hóa, response không lộ hash |
| API | Validation 400; 401/403/404 đúng trường hợp; cấu trúc lỗi; tìm kiếm, cursor và nhiều trạng thái |
| Quyền | Lễ tân không sửa bệnh án; bác sĩ không đọc/sửa bản ghi của bác sĩ khác, kể cả đổi ID và dentistId |
| Bệnh nhân | Ngày sinh tương lai, ranh giới 12 tuổi, thiếu/sai liên hệ; khóa đổi DOB sau có bệnh án; soft delete |
| Lịch | Giờ Việt Nam, nhiều ca, lịch trùng và hai yêu cầu cạnh tranh; nghỉ phép; check-in ngoài cửa sổ; hủy và dùng lại giờ |
| Bệnh án | Bắt đầu lặp; ghi chú/điều trị/đơn thuốc đọc lại từ DB; completed/cancelled khóa ghi; addendum quá hạn |
| Tiền | Đóng khám tạo một hóa đơn; discount/version; trả từng phần/đủ/vượt nợ; hai yêu cầu thu tiền đồng thời; đối chiếu báo cáo |
| Tính toàn vẹn | UUID v7, khóa ngoại, unique, partial unique; transaction rollback khi bước sau lỗi; không cập nhật tiền/tồn kho dở dang |
| Module phụ | Xuất kho không âm và cạnh tranh; duyệt/reimburse chi phí; kỳ lương chồng lấn và chuyển trạng thái |

## Cổng hoàn thành

Unit test, build, lint/formatter phần thay đổi và bộ API/database chạy được. Các lỗi phát hiện phải có bước tái hiện, mức độ, bằng chứng trước/sau sửa. Báo cáo nêu rõ những ca đã chạy và ca chưa chạy; không đánh đồng coverage với sự đúng đắn của toàn hệ thống.

## Quy ước phản hồi đã kiểm chứng

- `POST /medical-records/encounters/start` trả `data.encounterId` và đồng bộ appointment → `IN_PROGRESS` trong cùng giao dịch, khóa row để xử lý yêu cầu bắt đầu lặp.
- Xung đột giao dịch PostgreSQL/Prisma `P2034` trả HTTP 409, mã `TRANSACTION_CONFLICT`, thông báo tải lại. Không tự động gửi lại yêu cầu thu tiền.
- Ngày/UUID chi phí hoặc status lịch hẹn không hợp lệ trả HTTP 400 trước khi truy cập Prisma.
- Ngày kỳ lương đảo ngược trả HTTP 400; kỳ lương chồng lấn hoặc chuyển trạng thái không hợp lệ trả HTTP 409.
- JWT của tài khoản xóa mềm hoặc vô hiệu hóa bị từ chối; tài khoản `PENDING_SETUP` giữ luồng thiết lập mật khẩu hiện có.
- E2E live cũ báo lỗi khi thiếu server/token thay vì tự bỏ qua. Bộ isolated là lệnh nghiệm thu; không chạy E2E live lên database demo để thay thế kiểm thử này.
