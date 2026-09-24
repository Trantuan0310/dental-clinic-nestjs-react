# Việc tồn đọng sau review luồng đặt lịch — 24/09/2026

Review thay đổi của PR #6 (`origin/main...claude/trusting-gauss-8544yk`), đã đối chiếu từng điểm với code. Chưa sửa; ghi lại để xử lý sau.

## Nên sửa trước khi dùng thật

| Mã | Vấn đề | Vị trí | Hướng sửa |
| --- | --- | --- | --- |
| APPT-FU-01 | Hủy ca APPROVED đếm lịch hẹn trong ca mà không giữ advisory lock của bác sĩ. Một lịch được đặt đúng lúc (create/reschedule đọc ca APPROVED khi đang giữ lock) vẫn lọt vào, ca bị hủy và lịch nằm ngoài giờ làm (BR-APPT-027). | `backend/src/appointments/appointments.service.ts` `cancelShiftRegistration`; `backend/src/payroll/shift-registration.service.ts` `cancel` | Trong một transaction: khóa theo bác sĩ, đếm lịch, rồi update ca. Tách hàm advisory lock ra helper dùng chung để service payroll gọi được. |
| APPT-FU-02 | Ca APPROVED chồng giờ với WorkingSchedule thì `getAvailability` trả mỗi slot 2 lần (form bị trùng React key). Nguyên nhân: `createWorkingSchedule` không kiểm tra với ca đã duyệt. | `appointments.service.ts` `getAvailability`, `createWorkingSchedule` | Loại slot trùng khi tạo danh sách; chặn tạo WorkingSchedule chồng lên ca APPROVED (giống chiều ngược lại đã có). |
| APPT-FU-03 | `createTimeOff` không giữ advisory lock của bác sĩ. Lịch đặt đúng lúc có thể vừa nằm trong ngày nghỉ, vừa không có trong `affectedAppointments` (danh sách "Lịch hẹn cần xử lý"). | `appointments.service.ts` `createTimeOff` | Chạy kiểm tra + insert trong transaction có `lockDentist`. |
| APPT-FU-04 | Form tạo nhanh bệnh nhân: sau khi hiện danh sách hồ sơ trùng, sửa họ tên / ngày sinh / giới tính không xóa danh sách. Bấm "vẫn tạo hồ sơ mới" lúc đó bỏ qua kiểm tra với thông tin mới, gây hồ sơ trùng. | `frontend/src/features/appointments/AppointmentFormModal.tsx` (tab "Bệnh nhân mới") | Xóa `duplicateCandidates` khi tên, ngày sinh hoặc giới tính thay đổi (hiện chỉ ô SĐT làm việc này). |
| APPT-FU-05 | Mở form với `?patientId=` (từ trang bệnh nhân): bệnh nhân chọn sẵn chỉ được áp sau khi `GET /patients/:id` xong. Bấm lưu sớm báo "chưa chọn bệnh nhân"; API lỗi thì mất bệnh nhân mà không báo. Lỗi mới do PR #6. | `AppointmentFormModal.tsx` (`usePatientMini`, `patientId`); `AppointmentCalendarPage.tsx` truyền `defaultPatientId` | Dùng `defaultPatientId` ngay làm `patientId`, chỉ tải tên để hiển thị; hiện "Đang tải…"/lỗi khi chưa có. |

## Cần quyết định nghiệp vụ

| Mã | Vấn đề | Đề xuất |
| --- | --- | --- |
| APPT-FU-06 | Cron no-show chạy mỗi phút và ân hạn = cuối khung check-in (+30 phút), nên lựa chọn "vẫn check-in kèm lý do" (BR-APPT-007) sau khi khung đóng chỉ dùng được khoảng 1 phút. Code cũ (+15 phút) còn tệ hơn, không phải lỗi mới; nhưng comment ở `NO_SHOW_GRACE_MIN` nói quá so với thực tế. | Chỉ tự đánh no-show khi `now > max(startAt + 30 phút, endAt)`, để BN đến trễ khi slot còn chạy vẫn check-in được. Nếu giữ cách hiện tại thì chỉ sửa comment. Cập nhật BR-APPT-012 theo lựa chọn. |

## Nhỏ / cải tiến

| Mã | Vấn đề | Hướng sửa |
| --- | --- | --- |
| APPT-FU-07 | Hủy ca có 2 cài đặt riêng (`AppointmentsService.cancelShiftRegistration` và `ShiftRegistrationService.cancel`), đang lệch nhau về múi giờ khi áp luật 24 giờ (+07:00 so với `setUTCHours`). | Gộp về một service; sửa múi giờ bên payroll theo giờ phòng khám. |
| APPT-FU-08 | `isUnder12` trong form đặt lịch tính tuổi lặp lại với `PatientForm` và coi ngày sinh tương lai là trẻ em. | Dùng `differenceInYears` (date-fns) như `PatientForm`, bỏ qua ngày sinh tương lai. |
| APPT-FU-09 | `getAvailability` chạy 4 truy vấn nối tiếp. | Gộp thành 2 nhóm `Promise.all` (schedules + shifts, rồi bookings + time-offs). |

## Đã biết từ trước, ngoài phạm vi PR #6

- `backend/prisma/seed-clinical.ts` gọi `user.findUnique({ where: { email } })` trong khi `User.email` không khai báo `@unique`, nên seed crash và bộ Playwright e2e không có tài khoản demo.
- Form đặt lịch hiểu giờ theo múi giờ trình duyệt (đúng khi máy trạm đặt giờ Việt Nam).
- Chưa đặt được lịch cho khách vãng lai ngay lúc đó (giờ bắt đầu phải sau hiện tại ít nhất 1 phút).
