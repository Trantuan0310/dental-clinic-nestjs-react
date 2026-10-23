# Kiểm từng module — 22/10/2026

Phần 3 của `docs/progress/plan-2026-10-22.md`.

## Cách làm

1. Với mỗi đặc tả (`docs/03_Specification/*/SPEC.md`), liệt kê mọi BR và tìm mã BR trong code. BR không thấy mã trong code (108/192) được kiểm thực tế từng cái bằng đọc code, không coi là thiếu chỉ vì không có mã.
2. Chạy thử trên DB demo: đăng nhập admin / lễ tân / bác sĩ, mở mọi mục menu (không 403/5xx/lỗi JS); chạy các luồng tiền và lâm sàng qua giao diện (xem nhật ký Phần 1).
3. Báo cáo, Dashboard, Quản trị, AI không có BR riêng: kiểm qua lượt mở menu ở bước 2 và các test hiện có.

## Kết quả theo module

| Module | BR | Kết luận |
|--------|----|----------|
| Đăng nhập (Auth) | 20 | Khớp: khoá sau nhiều lần sai, access 15 phút / refresh 7 ngày, xoay vòng refresh token, phát hiện dùng lại → thu hồi mọi phiên, argon2id đúng tham số, đổi mật khẩu/vai trò/vô hiệu → thu hồi phiên, chặn gỡ admin cuối, không API sửa/xoá nhật ký. |
| Bệnh nhân | 23 | Khớp (SĐT, ngày sinh, họ tên, email lưu chữ thường, giấy tờ unique trên hồ sơ còn hoạt động). BR-PT-015 đã sửa đặc tả ở Phần 2. |
| Lịch hẹn | 38 | 1 lệch (M5). |
| Hồ sơ khám | 27 | 2 lệch (M1, M2). |
| Kho | 28 | 3 lệch (M3, M4, M6). Danh mục kho không có cấp cha–con nên BR-INV-016/017 không áp dụng. |
| Hoá đơn | 30 | Khớp (vừa rà kỹ 21–22/10). |
| Lương | 26 | Khớp (vừa rà kỹ 21–22/10, sửa duyệt kỳ ở PR #66). |
| Báo cáo, Dashboard, Quản trị, AI | — | Không lỗi khi mở; số liệu báo cáo đã rà ở đợt A. |

## Phát hiện

| # | Mức | BR | Vấn đề | Hướng sửa |
|---|-----|----|--------|-----------|
| M1 | Trung bình | BR-MR-013 | Kết thúc phiên khám không cần ghi chú lâm sàng: code chỉ khoá ghi chú "nếu có". Hồ sơ khám có thể không có lý do khám / chẩn đoán. | Kết thúc phiên khám cần ghi chú có ít nhất lý do khám hoặc chẩn đoán; lỗi 422 `CLINICAL_NOTE_REQUIRED` nói rõ cần điền gì. |
| M2 | Thấp | BR-MR-008 | Sơ đồ răng nhận trạng thái răng tuỳ ý (chỉ kiểm số răng FDI). Giao diện dùng 7 trạng thái, đặc tả liệt kê danh sách khác. | Máy chủ chỉ nhận 7 trạng thái giao diện dùng (`healthy`, `cavity`, `filled`, `crowned`, `missing`, `implant`, `extraction_needed`), ghi chú ≤ 1000 ký tự; sửa danh sách trong đặc tả cho khớp. |
| M3 | Trung bình | BR-INV-006, BR-INV-008 | Xuất kho thủ công và điều chỉnh tồn không bắt buộc lý do — mất dấu vì sao kho giảm. | Bắt buộc lý do (≥ 3 ký tự) cho xuất kho thủ công và điều chỉnh tồn. |
| M4 | Thấp | BR-INV-023 | Điều chỉnh tồn bằng đúng số hiện có vẫn tạo bản ghi xuất nhập và nhật ký rác. | Bỏ qua, trả về như cũ, không ghi gì. |
| M5 | Thấp | BR-APPT-020 | Check-in được lịch của bác sĩ đang nghỉ phép (nghỉ được duyệt sau khi đặt lịch). | Chặn check-in, báo bác sĩ đang nghỉ và cần đổi bác sĩ trước. |
| M6 | Thấp | BR-INV-001 | Tên vật tư trùng nhau được (chỉ SKU là duy nhất). | Từ chối tạo/đổi tên trùng với vật tư đang dùng (không phân biệt hoa thường). |

## Trạng thái sửa

Sửa trong PR "Phần 3: sửa phát hiện kiểm module" (xem `session-log.md`).
