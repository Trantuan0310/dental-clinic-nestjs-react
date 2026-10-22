# Rà soát nghiệp vụ các luồng (21–22/10/2026)

Chỉ rà soát, chưa sửa code. Mỗi mảng do một lượt đọc code riêng, đối chiếu đặc tả (`docs/03_Specification`, `docs/ADR`) và báo cáo 14/09; các phát hiện chính đã được kiểm lại trực tiếp trong code.

Mức: **Cao** (sai tiền/dữ liệu/quyền, chặn việc hằng ngày) · **Trung bình** · **Thấp** (bất tiện, hiếm).

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
