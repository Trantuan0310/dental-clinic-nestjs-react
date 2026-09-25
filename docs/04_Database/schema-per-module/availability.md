# AvailabilityService — một nguồn duy nhất cho giờ trống (Giai đoạn 4)

> **Module:** Appointments (`backend/src/appointments/availability.service.ts`, `backend/src/appointments/domain/day-calendar.ts`)
> **Quyết định kiến trúc:** [ADR-0009](../../ADR/0009-staff-dentist-service-scheduling-model.md), giai đoạn 4
> **Migration:** không có · **Ngày tạo:** 2026-09-25 · **Trạng thái:** Đã triển khai (PR-4)

---

## 1. Vấn đề trước đây

Quy tắc "bác sĩ có nhận khách lúc này không" được viết ở **hai** chỗ, mỗi chỗ tự truy vấn DB theo cách riêng:
- `getAvailability`: tính slot cho form đặt lịch, dùng `findMany` cho cả ngày.
- `ensureSlotAvailable`: kiểm tra khi đặt lịch và đổi lịch, dùng nhiều `findFirst` theo khoảng giờ.

Giai đoạn 3 lại thêm một bản thứ ba cho báo cáo lịch hẹn bị ảnh hưởng. Mỗi lần thêm luật (ca làm thêm, ngoại lệ, duyệt nghỉ phép), phải sửa đủ các chỗ và dễ lệch nhau.

## 2. Cấu trúc mới

```
AvailabilityService.loadDay(dentistId, date)          ← 5 truy vấn song song cho một ngày
        │  lịch tuần · ca đã duyệt · ngoại lệ · nghỉ phép đã duyệt · lịch hẹn đang giữ chỗ
        ▼
day-calendar.ts  (thuần, không I/O)
  buildDayCalendar(inputs) → { windows, blocked, bookings, closedAllDay, … }
  intervalProblem(cal, slot, opts) → CLOSED | OUTSIDE_WORKING_HOURS | TIME_OFF | SLOT_CONFLICT | null
  freeSlots(cal, duration, step, notBefore) → ["08:00", …]
```

| Nơi dùng | Hàm |
|---|---|
| Đặt lịch, đổi lịch (`ensureSlotAvailable`) | `checkSlot(..., { excludeAppointmentId })` trong transaction có khóa lịch |
| Form đặt lịch (`GET /appointments/availability`) | `dayAvailability` (response giữ nguyên dạng cũ) |
| Báo cáo ảnh hưởng, ngoại lệ lịch (`calendarProblem`) | `checkSlot(..., { ignoreBookings: true })` |
| Tìm giờ trống cho mọi bác sĩ (`GET /appointments/availability/search`) | `search` |
| Điều phối (giai đoạn 6) | sẽ dùng `checkSlot` / `freeSlots` |

## 3. Luật (thứ tự kiểm tra)

1. Ngày bị đóng hoàn toàn → `CLOSED` (BR-SCH-003).
2. Lượt khám phải nằm trọn trong **một** khung làm việc. Khung làm việc gồm:
   - lịch tuần, **hoặc** giờ đã đổi của ngày đó (BR-SCH-004);
   - cộng thêm các ca đăng ký đã duyệt (BR-APPT-027, D3).

   Khoảng nghỉ trưa giữa hai khung thì không đặt được. Vi phạm → `OUTSIDE_WORKING_HOURS`.
3. Chồng lên khoảng giờ bị đóng → `CLOSED`; chồng lên nghỉ phép **đã duyệt** → `TIME_OFF` (BR-SCH-001).
4. Chồng lên lịch hẹn đang giữ chỗ (trừ `CANCELLED`/`NO_SHOW`/`LEFT` và chính lịch đang dời) → `SLOT_CONFLICT`.

Từ giai đoạn 5, bước 3–4 so sánh **khoảng bận** `[start − before, end + after]` thay vì chỉ lượt khám (buffer, D4) — xem [`appointment-services.md`](appointment-services.md).

Mọi khoảng đều nửa mở `[start, end)`, nên hai lượt nối tiếp nhau không bị coi là chồng lấn.

## 4. `GET /appointments/availability/search`

| Tham số | Ý nghĩa |
|---|---|
| `date` | Ngày phòng khám (bắt buộc) |
| `serviceId` | Chỉ lấy bác sĩ được phân công dịch vụ này vào ngày đó (`dentist_services`) |
| `durationMin` | Thời lượng lượt khám. Mặc định: thời lượng riêng của bác sĩ, rồi đến thời lượng của dịch vụ (BR-SVC-006), rồi đến khe mặc định của lịch |

Trả về danh sách bác sĩ **đang hành nghề** còn giờ trống, mỗi bác sĩ gồm `durationMin`, `calendarColor` và `availableSlots` (bước 15 phút). Quyền: `appointment.create` hoặc `appointment.read.any`.

## 5. Kiểm thử

- `domain/day-calendar.spec.ts`: **bảng quyết định** 21 dòng, bao phủ lịch tuần, nghỉ trưa, ca thêm, đóng cả ngày hoặc một khoảng, đổi giờ (cộng ca), nghỉ phép nhiều ngày, lịch nối tiếp, thứ tự lỗi; kèm test `freeSlots`.
- `appointments.service.spec.ts`: các test đặt lịch/đổi lịch mock dữ liệu cả ngày thay vì từng `findFirst`.
- Test API trên Postgres thật: route tìm kiếm trả về giờ **đặt được thật** (đặt ngay vào giờ đầu tiên được liệt kê thì thành công); bác sĩ bị đình chỉ không xuất hiện.
