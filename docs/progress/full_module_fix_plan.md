# Sửa lỗi nghiệp vụ backend và frontend

Điểm xuất phát: dd18bf5. Nhánh: fix/full-module-review. Không tích hợp nguyên bản sửa dở của checkout cũ.

## Phân công

| Nhóm | Phạm vi | Điều kiện nghiệm thu |
|---|---|---|
| Admin | Users cursor/pageSize/search, quyền đọc vai trò và gán quyền, audit codes | Trang sau dùng cursor thật; không bỏ sót người dùng; không nâng quyền qua form/API |
| Tiếp nhận | Booking response cũ, identity, holds, phiên tồn đọng, nhận ngoài ca | Response cũ không sửa form mới; giữ chỗ cùng khóa và CAS; danh tính không suy từ số gia đình |
| Tài chính | Kho số lượng/đơn vị/phân trang, điều chỉnh tồn, payment intent, AI | Không đảo chiều kho; không mất giao dịch; retry không tạo lần thu mới; phạm vi AI thống nhất |
| Nhân sự | Ca +07, trùng kỳ lương, rate lịch sử, BHXH, delta lương, expense, specialty | Công thức đúng qua kỳ; không trả trùng; giao dịch đồng thời trả conflict; UI tổng và tìm kiếm đúng |
| Lâm sàng | Chart chưa lưu, recall pagination/jobs, consent, messaging permissions/recovery, overflow close | Không mất chart khi rời trang; batch tiếp tục sau 200; consent đúng kênh; không gửi lại mù khi chưa biết kết quả |
| Kiểm chứng | Dependency, build/typecheck/lint, unit, PostgreSQL cô lập, browser | Giữ exit status, ghi số test và phần chưa chạy; không dùng DB production/dev để reset |

## Quy chuẩn

- Đọc PROJECT_RULES và spec tương ứng, xác minh lại từng lỗi trên bản hiện tại trước khi sửa.
- Mỗi nhân viên chỉ sửa phạm vi đã giao, không tự commit/push/đổi branch. Model chính review diff và yêu cầu rework; commit theo gói sau nghiệm thu.
- Backend bảo vệ invariant, quyền và concurrency; UI phải cùng contract và phản ánh lỗi. Không dùng UI validation thay service validation.
- Không thêm dependency/schema nếu chưa chứng minh cần; không sửa lockfile, không tắt TLS/checksum/test/assertion.
- Tiền và số lượng theo Decimal và cận DB; giờ theo múi giờ phòng khám. Mutation retry giữ idempotency intent và payload.
- Test hồi quy gồm trigger lỗi, happy path, quyền, boundary, stale response và concurrent writes khi liên quan. Mock không đủ chứng minh khóa DB.
- Chạy typecheck, lint không --fix toàn repo lúc nhân viên đang sửa, build và các suite liên quan; kiểm thử tích hợp trước báo hoàn tất.
- Tài liệu và báo cáo nêu rõ pass/fail/skipped/unrun. Không gọi snapshot test trong khi sửa là baseline sạch.
- Không có API quota Codex 5 giờ. Khi có tín hiệu còn <=10%, dừng tất cả nhân viên, thu trạng thái, ghi session-log/checkpoint và push nhánh riêng. Không suy đoán quota từ thời gian.

## Trạng thái

Đang triển khai; chưa nghiệm thu. Không deploy/merge main. Khi hoàn thành cập nhật báo cáo test, review và giới hạn trong cùng thư mục.
