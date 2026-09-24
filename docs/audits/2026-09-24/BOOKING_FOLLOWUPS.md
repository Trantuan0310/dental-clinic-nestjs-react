# Việc tồn đọng sau review luồng đặt lịch — 24/09/2026

Review thay đổi của PR #6 (`origin/main...claude/trusting-gauss-8544yk`), đã đối chiếu từng điểm với code. APPT-FU-01 → 05 đã sửa ngay trong PR #6; các mục còn lại để xử lý sau.

## Nên sửa trước khi dùng thật — ✅ đã sửa trong PR #6

| Mã | Vấn đề | Vị trí | Đã sửa |
| --- | --- | --- | --- |
| APPT-FU-01 | Hủy ca APPROVED đếm lịch hẹn trong ca mà không giữ advisory lock của bác sĩ. Một lịch được đặt đúng lúc (create/reschedule đọc ca APPROVED khi đang giữ lock) vẫn lọt vào, ca bị hủy và lịch nằm ngoài giờ làm (BR-APPT-027). | `backend/src/appointments/appointments.service.ts` `cancelShiftRegistration`; `backend/src/payroll/shift-registration.service.ts` `cancel` | ✅ Cả hai đường hủy chạy đếm + hủy trong một transaction có khóa lịch của bác sĩ. Hàm khóa tách ra `appointments/domain/advisory-lock.ts` dùng chung. |
| APPT-FU-02 | Ca APPROVED chồng giờ với WorkingSchedule thì `getAvailability` trả mỗi slot 2 lần (form bị trùng React key). Nguyên nhân: `createWorkingSchedule` không kiểm tra với ca đã duyệt. | `appointments.service.ts` `getAvailability`, `createWorkingSchedule` | ✅ `availableSlots` loại trùng (Set); `createWorkingSchedule` từ chối lịch chồng lên ca PENDING/APPROVED cùng thứ trong khoảng hiệu lực. |
| APPT-FU-03 | `createTimeOff` không giữ advisory lock của bác sĩ. Lịch đặt đúng lúc có thể vừa nằm trong ngày nghỉ, vừa không có trong `affectedAppointments` (danh sách "Lịch hẹn cần xử lý"). | `appointments.service.ts` `createTimeOff` | ✅ Kiểm tra, lấy `affectedAppointments` và insert chạy trong một transaction có khóa lịch của bác sĩ. |
| APPT-FU-04 | Form tạo nhanh bệnh nhân: sau khi hiện danh sách hồ sơ trùng, sửa họ tên / ngày sinh / giới tính không xóa danh sách. Bấm "vẫn tạo hồ sơ mới" lúc đó bỏ qua kiểm tra với thông tin mới, gây hồ sơ trùng. | `frontend/src/features/appointments/AppointmentFormModal.tsx` (tab "Bệnh nhân mới") | ✅ Sửa họ tên, ngày sinh, giới tính hoặc SĐT đều xóa danh sách trùng cũ, nên phải kiểm tra lại. |
| APPT-FU-05 | Mở form với `?patientId=` (từ trang bệnh nhân): bệnh nhân chọn sẵn chỉ được áp sau khi `GET /patients/:id` xong. Bấm lưu sớm báo "chưa chọn bệnh nhân"; API lỗi thì mất bệnh nhân mà không báo. Lỗi mới do PR #6. | `AppointmentFormModal.tsx` (`usePatientMini`, `patientId`); `AppointmentCalendarPage.tsx` truyền `defaultPatientId` | ✅ `defaultPatientId` được dùng làm `patientId` ngay; GET chỉ để hiện tên, có trạng thái "Đang tải…" / "Không tải được tên…" (retry 1 lần). |

## Cần quyết định nghiệp vụ — ✅ đã sửa theo đề xuất

| Mã | Vấn đề | Đề xuất |
| --- | --- | --- |
| APPT-FU-06 | Cron no-show chạy mỗi phút và ân hạn = cuối khung check-in (+30 phút), nên lựa chọn "vẫn check-in kèm lý do" (BR-APPT-007) sau khi khung đóng chỉ dùng được khoảng 1 phút. Code cũ (+15 phút) còn tệ hơn, không phải lỗi mới; nhưng comment ở `NO_SHOW_GRACE_MIN` nói quá so với thực tế. | Chỉ tự đánh no-show khi `now > max(startAt + 30 phút, endAt)`, để BN đến trễ khi slot còn chạy vẫn check-in được. Nếu giữ cách hiện tại thì chỉ sửa comment. Cập nhật BR-APPT-012 theo lựa chọn. ✅ Đã làm theo đề xuất: cron dùng `startAt < now - 30 phút` **và** `endAt < now`; drawer có hộp "Check-in muộn" (lý do ≥ 5 ký tự) khi API trả `CHECK_IN_EXPIRED`. BR-APPT-006/012 cập nhật. |

## Nhỏ / cải tiến — ✅ đã sửa trong PR #6

| Mã | Vấn đề | Đã sửa |
| --- | --- | --- |
| APPT-FU-07 | Hủy ca có 2 cài đặt riêng (`AppointmentsService.cancelShiftRegistration` và `ShiftRegistrationService.cancel`), đang lệch nhau về múi giờ khi áp luật 24 giờ (+07:00 so với `setUTCHours`). | ✅ Route cũ `POST /appointments/shift-registrations/:id/cancel` gọi thẳng `ShiftRegistrationService.cancel`; bỏ bản trùng trong `AppointmentsService`. Luật 24 giờ và cờ late-cancel dùng `shiftInstants()` (giờ phòng khám +07:00). |
| APPT-FU-08 | `isUnder12` trong form đặt lịch tính tuổi lặp lại với `PatientForm` và coi ngày sinh tương lai là trẻ em. | ✅ `isValidDob` / `isUnder12` chung ở `frontend/src/features/patients/dobRules.ts` (date-fns), dùng cho cả `PatientForm` và form đặt lịch; ngày sinh tương lai bị báo lỗi, không bật ô người liên hệ. |
| APPT-FU-09 | `getAvailability` chạy 4 truy vấn nối tiếp. | ✅ 2 nhóm `Promise.all`: schedules + shifts, rồi bookings + time-offs. |

## Đã biết từ trước, ngoài phạm vi PR #6

- `backend/prisma/seed-clinical.ts` gọi `user.findUnique({ where: { email } })` trong khi `User.email` không khai báo `@unique`, nên seed crash và bộ Playwright e2e không có tài khoản demo.
- Form đặt lịch hiểu giờ theo múi giờ trình duyệt (đúng khi máy trạm đặt giờ Việt Nam).
- Chưa đặt được lịch cho khách vãng lai ngay lúc đó (giờ bắt đầu phải sau hiện tại ít nhất 1 phút).
