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

## Kiểm chứng lại ngày 14/10/2026 (lương, thanh toán, tồn kho)

Đối chiếu từng mã với code trên `main`:

| Mã | Trạng thái | Ghi chú |
|---|---|---|
| PAY-01 | Đã sửa trước đó | Lương chia theo số ngày thực trong kỳ (`prorate-calculator.ts`). |
| PAY-02 | Đã sửa trước đó | Truy vấn dùng `[đầu kỳ, đầu ngày sau ngày cuối)` theo giờ phòng khám. |
| PAY-03 | Đã sửa trước đó | Hiệu lực ca được kiểm tra trên từng ngày. |
| PAY-04 | Đã sửa trước đó | Lịch ngày dựng từ mọi ca (`buildDayCalendar`). |
| PAY-05 | Đã sửa trước đó | Cộng lương mọi chế độ trong kỳ; hoa hồng theo chế độ tại thời điểm. |
| PAY-06 | **Sửa 14/10** | Đọc lại trạng thái kỳ trong giao dịch Serializable trước khi ghi. |
| PAY-07 | Đã sửa trước đó | Thưởng/phạt lưu ở `payroll_adjustments`, tính lại không mất. |
| PAY-08 | **Sửa 14/10** | Tạo kỳ lương và chế độ lương dưới advisory lock (không có constraint DB). |
| PAY-09 | **Sửa 14/10** | Sửa ngày kết thúc: không trước ngày bắt đầu, không chồng chế độ khác. |
| BILL-01 | Đã sửa trước đó | Xem bảng phía trên. |
| BILL-02 | **Sửa 14/10** | `payments.request_key` (migration 048) + key từ hộp thoại thu tiền. |
| BILL-03 | Đã sửa trước đó | Phân trang bằng cursor. |
| BILL-04 | Đã sửa trước đó | Cron `backfillMissingInvoices` + endpoint lập hóa đơn còn thiếu. |
| MR-03 | Đã sửa trước đó | Khóa encounter trước khi đọc trạng thái khi đóng. |
| INV-01 | **Sửa 14/10** | So sánh tồn với mức tối thiểu trong DB, trước giới hạn 200 dòng. |
| INV-02 | **Sửa 14/10** | `quantityBefore` lấy từ dòng đã khóa sau cập nhật nguyên tử. |

Các mục sửa ngày 14/10 có unit test; BILL-02, INV-01 và migration 048 đã chạy thử trên PostgreSQL 16.
