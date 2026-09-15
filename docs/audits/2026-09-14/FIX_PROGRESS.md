# Tiến độ sửa lỗi — tiếp tục ngày 15/09/2026

Mã nguồn hiện tại: `C:/Users/tuans/OneDrive/Desktop/ĐATN`. Đường dẫn cũ `Desktop/Đồ án tốt nghiệp` không còn tồn tại.

## Đợt sửa đang có trong working tree

| Mã | Thay đổi |
| --- | --- |
| BILL-01 | Truyền actor vào truy vấn hóa đơn theo encounter, giới hạn theo bác sĩ khi thiếu `invoice.read.any`. |
| AI-01 | Kiểm tra phạm vi bệnh nhân trước khi đọc cache hoặc tạo tóm tắt. |
| SHIFT-01 | Chặn bác sĩ đăng ký ca cho người khác qua API cũ; giữ quyền quản trị duyệt ca. |
| MR-01 | Kiểm tra quyền và trạng thái IN_PROGRESS trong transaction có khóa encounter trước khi sửa dữ liệu lâm sàng. |
| MR-03 | Close và các thao tác ghi dùng cùng khóa hàng encounter, tránh hai yêu cầu close cùng trừ kho. |
| MR-02 | Cho thêm ghi chú bổ sung trong 30 ngày sau khi hoàn tất; từ chối từ đúng mốc 30 ngày và với encounter hủy. Giữ kiểm tra quyền sở hữu, không sửa note gốc. Form gửi `content`, giữ lý do trong nội dung, tải lại và hiển thị các bổ sung đã lưu. |
| MR-04 | Validate `teeth` bằng `IsObject`, giữ dữ liệu qua whitelist. Frontend gửi map theo mã FDI và `patientType` ở cả adapter chính và imperative API. |

MR-02 theo SPEC MedicalRecords, BR-MR-005 và acceptance scenarios về cửa sổ 30 ngày. Hành vi thêm bổ sung khi encounter đang mở được giữ nguyên.

## Kiểm chứng

- Trước sửa tiếp: 25 test suites, 355 tests đạt.
- Sau sửa backend: 26 test suites, 367 tests đạt (`npm test -- --silent`).
- Backend build đạt (`npm run build`).
- Kiểm thử adapter frontend đạt: `node --test tests/clinical-data.test.mjs`, xác nhận JSON giữ mã răng, trạng thái và ghi chú khi lưu/đọc lại.
- Build frontend đạt; TypeScript được kiểm tra lại sau thay đổi adapter cuối cùng.
- ESLint đạt trên toàn bộ file backend đã sửa; formatter đã chạy, `git diff --check` đạt.
- Frontend lint còn 6 lỗi ngoài phần sửa: 1 `ban-types` ở `e2e/fixtures.ts:93`, 5 `no-explicit-any` ở `src/features/payroll/payrollApi.ts`. Không tính toàn bộ lint frontend là đạt (QA-02 vẫn mở).
- Kiểm thử đồng thời MR-03 mô phỏng khóa transaction; chưa kiểm tra hai transaction PostgreSQL thực.

## Phần còn lại

Không coi toàn bộ 40 phát hiện trong REPORT.md đã được xử lý. Các mã ngoài bảng trên vẫn cần sửa/kiểm chứng, đặc biệt mất số lượng/thời gian dùng thuốc (MR-06), tính lương (PAY-*), lịch hẹn, thanh toán và tồn kho.

Chưa nghiệm thu giao diện trên trình duyệt hoặc chạy E2E với cơ sở dữ liệu thật. DentalChartPanel hiện vẫn dành cho bộ răng người lớn, truyền ADULT; sửa payload không đồng nghĩa đã hoàn thiện giao diện răng trẻ em. Chưa commit hoặc push.
