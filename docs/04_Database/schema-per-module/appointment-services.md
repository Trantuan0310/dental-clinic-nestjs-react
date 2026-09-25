# Lịch hẹn nhiều dịch vụ, buffer, walk-in, `LEFT` (Giai đoạn 5)

> **Module:** Appointments (`backend/src/appointments/appointments.service.ts`, `domain/day-calendar.ts`)
> **Quyết định kiến trúc:** [ADR-0009](../../ADR/0009-staff-dentist-service-scheduling-model.md), giai đoạn 5 (D2, D4, D6)
> **Migration:** `022_appointment_status_left`, `023_appointment_services_visit_kind` · **Ngày tạo:** 2026-09-25 · **Trạng thái:** Đã triển khai (PR-5)

---

## 1. Thay đổi dữ liệu

| Đối tượng | Thay đổi |
|---|---|
| enum `AppointmentStatus` | thêm `LEFT` — đã check-in nhưng về trước khi khám (D2) |
| enum `VisitKind` (mới) | `BOOKED` (đặt trước), `WALK_IN` (khám ngay) |
| `appointments` | `visit_kind`, `buffer_before_min`, `buffer_after_min` (≥ 0), `calculated_duration_min`, `duration_override_reason`, `left_at`, `left_reason` |
| `appointment_services` (mới) | snapshot từng dịch vụ của lượt khám: `service_id`, `service_code`, `service_name`, `price`, `duration_min`, `buffer_before_min`, `buffer_after_min`, `sort_order`; unique `(appointment_id, service_id)`; xóa theo lịch hẹn |
| `idx_appointments_slot_active` | tạo lại, loại cả `LEFT` (cùng với `CANCELLED`, `NO_SHOW`) |
| quyền `appointment.mark_left` (mới) | `clinic_admin`, `receptionist` |

Lịch hẹn cũ không có dịch vụ: buffer = 0, `visit_kind = BOOKED`, mọi API cũ chạy như trước.

## 2. Luật nghiệp vụ

| Mã | Luật |
|---|---|
| BR-APPT-030 | Khi đặt lịch có `serviceIds` (tối đa 5, không trùng): mỗi dịch vụ phải đang hoạt động và được phân công cho bác sĩ **vào ngày khám**; nếu không → `409 SERVICE_NOT_ASSIGNED` (`details.serviceIds` = các dịch vụ thiếu). Thời lượng = tổng thời lượng từng dịch vụ (thời lượng riêng của bác sĩ trước, BR-SVC-006). Giá, tên, mã, thời lượng được **chụp lại** vào `appointment_services` (D6) — sửa danh mục sau này không đổi lịch hẹn cũ. |
| BR-APPT-031 | Nếu `endAt - startAt` khác tổng thời lượng dịch vụ thì bắt buộc `durationOverrideReason` (≥ 5 ký tự), lưu cùng `calculated_duration_min`. |
| BR-APPT-032 | Walk-in (`POST /appointments/walk-in`): bắt đầu **ngay bây giờ** (làm tròn xuống phút), trạng thái `CHECKED_IN` luôn, `visit_kind = WALK_IN`, `source = WALK_IN`. Bác sĩ phải đang trong giờ làm, không nghỉ, không vướng lịch khác (cùng luật với đặt lịch, không cần lead time 1 phút). Không chọn dịch vụ thì dùng `durationMin` hoặc khe mặc định. |
| BR-APPT-033 | `POST /appointments/:id/left` chỉ từ `CHECKED_IN`, lý do ≥ 5 ký tự. Trạng thái `LEFT` **giải phóng giờ hẹn** nhưng không phải hủy hay no-show: không phát sự kiện hủy, không tính vào tỷ lệ no-show. Hai người bấm cùng lúc → người sau nhận `409`. |
| BR-APPT-034 | `GET /appointments/:id/history`: các sự kiện audit của lịch hẹn (cũ → mới) và nhật ký đổi lịch; cùng phạm vi xem như `GET /appointments/:id` (bác sĩ chỉ xem lịch của mình). |

## 3. Buffer (D4)

Buffer của lượt khám = **buffer lớn nhất** trong các dịch vụ đã chọn (chuẩn bị trước, dọn dẹp sau).

```
khoảng bận = [start − before, end + after]
```

- Bản thân lượt khám `[start, end)` phải nằm trong khung làm việc; phần buffer được phép tràn ra ngoài khung.
- Khoảng bận không được chồng lên nghỉ phép đã duyệt, khoảng bị đóng, hay khoảng bận của lịch hẹn khác (khoảng bận của lịch khác cũng đã gồm buffer của nó).
- Đổi lịch giữ nguyên buffer của lịch hẹn.
- `GET /appointments/availability` nhận thêm `bufferBeforeMin`, `bufferAfterMin` để gợi ý giờ trống; `busy` trả về đã gồm buffer của các lịch khác.

Ví dụ: lịch A 09:00–09:30 có dọn dẹp 10′ → lịch B bắt đầu 09:30 bị `SLOT_CONFLICT`, bắt đầu 09:40 thì được.

## 4. Giao diện

- **Form tạo lịch hẹn:** sau khi chọn bác sĩ và ngày, hiện các dịch vụ bác sĩ làm ngày đó; tick dịch vụ thì thời lượng tự bằng tổng. Đổi thời lượng khác tổng → hiện ô "Lý do đổi thời lượng" (bắt buộc). Cảnh báo trùng lịch tính cả buffer.
- **Khách vãng lai** (trang lịch hẹn dạng bảng và dạng lịch): chọn bệnh nhân, bác sĩ, dịch vụ → lịch hẹn được tạo và check-in ngay, rồi mở chi tiết lịch hẹn.
- **Chi tiết lịch hẹn:** danh sách dịch vụ (thời lượng, giá đã chụp), buffer, lý do đổi thời lượng; nút **"Bệnh nhân đã về"** khi đang `CHECKED_IN` (quyền `appointment.mark_left`); mục **"Nhật ký thao tác"**.
- Trạng thái `LEFT` hiển thị "Đã về (chưa khám)", màu cam.

## 5. Kiểm thử

- `day-calendar.spec.ts` — bảng quyết định có thêm các dòng buffer.
- `appointments.service.spec.ts` — dịch vụ, walk-in, `LEFT`.
- `test/isolated/backend-api-database.spec.ts` — snapshot dịch vụ, xung đột do buffer (09:55 → 409, 10:00 → 201), lịch sử, walk-in, `LEFT` (bác sĩ 403, bấm lần hai 409, walk-in mới sau `LEFT` được nhận).
- `frontend/e2e/appointment-services.spec.ts` — đặt lịch theo dịch vụ; walk-in rồi "đã về".
