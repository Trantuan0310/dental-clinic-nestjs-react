# Gói E — AI và báo cáo

Ngày 21/10/2026. Phạm vi: `backend/src/ai`, `backend/src/reports`.

## Quy tắc được áp dụng

- Tóm tắt AI dùng `rowScope(actor, 'patient')` như PatientsService. Quyền `none` bị từ chối; quyền `own` phải qua cùng kiểm tra bệnh nhân đã khám hoặc có lịch hợp lệ. Kiểm tra này diễn ra trước khi đọc cache. Dữ liệu lâm sàng chỉ xuất hiện khi có `encounter.read.any`, hoặc `encounter.read.own` cùng quyền xem bệnh nhân cụ thể. Cache `full` và `basic` vẫn tách riêng.
- Số hóa đơn chưa thanh toán trong tóm tắt chỉ đếm `ISSUED` và `PARTIAL` còn dư nợ. `DRAFT` đang chờ phát hành, `PAID` hết nợ và `VOIDED` không được gọi là hóa đơn chưa thanh toán.
- Báo cáo `byService` dùng cùng chuyển động doanh thu với tổng: hóa đơn `ISSUED`/`PARTIAL`/`PAID` theo `issuedAt`, hoàn tiền hợp lệ theo `paidAt` của khoản hoàn. Khoản hoàn của hóa đơn kỳ trước trừ vào dịch vụ trong kỳ hoàn. Mỗi chuyển động được chia theo `lineTotal` của các dòng chưa xóa; phần lẻ cent được phân bổ theo số dư lớn nhất, theo thứ tự dòng khi hòa, để tổng các dịch vụ bằng chuyển động gốc. Số đếm dịch vụ chỉ tăng khi phát hành, không tăng khi hoàn tiền. Dòng 0 vẫn được đếm; nếu dữ liệu cũ không có dòng hợp lệ, phần tiền đi vào `Khác` để giữ đối chiếu tổng.

## Kiểm chứng

- Baseline AI + Reports: 24/24 test đạt.
- Regression: 31/31 test AI + Reports đạt. Role tùy chỉnh có `patient.update` nhưng chỉ xem lịch của mình bị chặn ở cả cache hit/miss; `none` bị chặn; `own` hợp lệ dùng cache lâm sàng đúng quyền; trạng thái hóa đơn và điều kiện truy vấn; hoàn tiền khác kỳ, nhiều dòng, tổng có làm tròn, tên dịch vụ trùng, dòng 0 và bộ lọc dòng đã xóa. ESLint các file thay đổi đạt. `tsc --noEmit` toàn backend hiện vướng lỗi trong test appointments đang được gói A sửa; không có lỗi TypeScript thuộc gói E.

Spec Billing hiện có mô tả cũ về hoàn tiền ở phần MVP; định nghĩa phát hành và hoàn tiền đang được thống nhất tại `backend/src/reports/revenue-basis.ts` và kế hoạch hardening. Không đổi chính sách hoàn tiền trong gói này.
