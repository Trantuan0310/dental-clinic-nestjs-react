# Kết quả tiếp tục sửa dark mode và giao diện tiếng Anh

Ngày kiểm tra: 2026-10-13. Tiếp tục từ checkpoint `be82023` trên nhánh `work`.

## Đã sửa

- Đồng bộ sáu bộ từ điển Việt/Anh và nhãn theo ngôn ngữ cho hồ sơ bệnh nhân,
  lịch hẹn, lịch làm việc, đặt lịch công khai, bác sĩ, ca làm việc, bảng lương,
  phân quyền, nhật ký và cấu hình phòng khám.
- Sửa lỗi `ACCOUNT_STATUS_HINT`, khóa dịch thiếu/trùng, lỗi nội suy và các nhãn
  trạng thái hoặc lý do mẫu vẫn hiện tiếng Việt khi chọn English.
- Bổ sung màu nền/chữ/viền cho dark mode, sửa tương phản tiêu đề tiền sử bệnh và
  duyệt ca, xử lý tràn ngang ở chi tiết bệnh nhân và lịch làm việc trên mobile.
- Chỉ dịch khẩu hiệu và giờ Chủ nhật mặc định do ứng dụng cung cấp; giá trị
  `VITE_CLINIC_*` do phòng khám cấu hình vẫn được hiển thị nguyên văn.
- Cập nhật các browser script cũ theo nhãn giao diện hiện tại và mở rộng ma trận
  kiểm tra từ 21 lên 29 tuyến trang.

## Nghiệm thu với API fixtures

- `npm run build`: đạt (TypeScript và Vite).
- `npm run lint`: đạt.
- `node scripts/check-ui-locales.mjs`: đạt; 6 cặp VI/EN, đối chiếu biến nội suy,
  2.643 tham chiếu khóa dịch tĩnh.
- `node scripts/check-theme-language.mjs`: đạt; 29 tuyến × 2 ngôn ngữ × 2 theme
  × 2 độ rộng = **232 trường hợp, 0 finding**. Kiểm tra tràn ngang, lỗi runtime,
  khóa dịch lộ ra, chữ tiếng Việt trong giao diện English và tương phản chữ.
  [Dữ liệu audit đầy đủ](theme-language-audit-final.json); ảnh chụp nằm trong
  `frontend/artifacts/theme-language/` và bị gitignore.
- `check-preferences.mjs`, `check-ui-polish.mjs`, `check-table-ui.mjs`,
  `check-booking-race.mjs`, `check-clinical-ui.mjs`: đạt.
- `git diff --check`: đạt.

Các browser script dùng dữ liệu API giả lập, vì vậy kết quả này không xác nhận
luồng nghiệp vụ với backend thật hoặc mọi trạng thái dữ liệu của từng dialog.
Các bước nghiệm thu tiếp theo nằm trong
[theme-language-followup-plan.md](theme-language-followup-plan.md).
