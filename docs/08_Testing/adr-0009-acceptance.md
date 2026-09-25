# Nghiệm thu ADR-0009 — nhân sự, dịch vụ, lịch làm việc, lịch hẹn, điều phối (Giai đoạn 7)

> **Quyết định kiến trúc:** [ADR-0009](../ADR/0009-staff-dentist-service-scheduling-model.md) · **Ngày:** 2026-09-25 · **PR:** PR-7

Tài liệu này nối từng yêu cầu của kế hoạch 7 giai đoạn với test chứng minh nó, và ghi kết quả rà soát phân quyền, audit, hiệu năng.

## 1. Luồng đầy đủ

Test `ADR-0009 acceptance (phase 7) › runs from a new employee to a paid invoice…` (`backend/test/isolated/backend-api-database.spec.ts`) chạy trên Postgres thật, bằng ba người dùng mới (admin, lễ tân, bác sĩ):

| Bước | Giai đoạn | Kiểm tra |
|---|---|---|
| Tạo nhân viên → gắn tài khoản → hồ sơ bác sĩ | 1 | 201/200, audit `EMPLOYEE_CREATED`, `EMPLOYEE_ACCOUNT_LINKED` |
| Tạo nhóm + dịch vụ có buffer → phân công cho bác sĩ | 2 | audit `SERVICE_CREATED` |
| Lịch làm việc cả tuần qua API | 3 | 201 |
| Lễ tân đặt lịch theo dịch vụ; đặt trùng giờ | 4–5 | trùng → `409` với `code = SLOT_CONFLICT` (issue #8) |
| Check-in → hàng đợi; bác sĩ gọi → bắt đầu khám | 6 | hàng đợi `WAITING / ON_TIME / #1`, sau khi khám hàng đợi rỗng |
| Điều trị chọn từ danh mục, ghi chẩn đoán, đóng lượt khám | D6 | hóa đơn nháp đúng giá dịch vụ |
| Phát hành hóa đơn, thu đủ | — | hóa đơn `PAID`, lịch hẹn `COMPLETED` |
| Nhật ký lịch hẹn | BR-APPT-034 | có `APPOINTMENT_CREATED`, `APPOINTMENT_CHECKED_IN`, `QUEUE_CALLED` |

Trên giao diện, luồng được phủ bởi các spec Playwright: `staff.spec.ts` (1), `services.spec.ts` (2), `schedule-*.spec.ts` (3), `appointment-services.spec.ts` (5), `dispatch.spec.ts` (6), `flow-patient-to-payment.spec.ts` (khám → thanh toán), `booking-clinic-time.spec.ts` (giờ phòng khám).

## 2. Truy vết yêu cầu → test

| Yêu cầu | Tài liệu | Test |
|---|---|---|
| Nhân viên / hồ sơ bác sĩ, bác sĩ có lịch tương lai không được ngừng | `schema-per-module/staff.md` | isolated `staff: …`, `staff.spec.ts`, `staff-dentist-self.spec.ts` |
| Danh mục dịch vụ, phân công theo ngày hiệu lực | `services.md` | isolated `service catalogue …`, `services.spec.ts` |
| Duyệt nghỉ phép, ngoại lệ lịch, lịch hẹn bị ảnh hưởng | `schedule.md` | isolated `time-off approval …`, `schedule-*.spec.ts` |
| Một nguồn cho giờ trống | `availability.md` | `day-calendar.spec.ts` (bảng quyết định), isolated search |
| Nhiều dịch vụ, buffer, walk-in, `LEFT`, lịch sử | `appointment-services.md` | isolated `multi-service …`, `appointment-services.spec.ts` |
| Hàng đợi, ưu tiên, gọi/bỏ qua/chuyển, thay bác sĩ cả ngày | `dispatch.md` | `queue.spec.ts`, isolated `dispatch queue …`, `dispatch.spec.ts` |

## 3. Rà soát phân quyền

Quyền được đọc lại từ DB ở mỗi request (không tin claim trong JWT), nên test ký token cho người dùng mới và kiểm tra theo **vai trò thật**. Guard chạy trước validation: body rỗng trả `400` nghĩa là **được phép**, `403` là **bị chặn**, không đổi dữ liệu.

| Vai trò | Được | Bị chặn |
|---|---|---|
| Lễ tân | xem hàng đợi, thay bác sĩ cả ngày, tiếp nhận vãng lai | sửa danh mục dịch vụ, duyệt nghỉ phép, xem lương |
| Bác sĩ | xem hàng đợi của mình | thay bác sĩ cả ngày, đánh cấp cứu, chuyển bệnh nhân, tiếp nhận vãng lai, tạo nhân viên, sửa danh mục |

Test: `permission matrix: …` (13 dòng). Phạm vi theo dòng (bác sĩ chỉ thấy hàng đợi / lịch của mình → 404 với của người khác) có test riêng ở từng giai đoạn. Ma trận đầy đủ: [`actor-permissions-matrix.md`](../01_Architecture/actor-permissions-matrix.md).

## 4. Audit

Mọi thao tác thay đổi dữ liệu của các giai đoạn 1–6 ghi `audit_logs` (nhân viên, hồ sơ bác sĩ, dịch vụ, phân công, nghỉ phép, ngoại lệ, đặt / check-in / walk-in / đã về / hủy / đổi lịch, gọi / bỏ qua / cấp cứu / chuyển / thay bác sĩ). Lịch hẹn hiển thị các dòng này ở "Nhật ký thao tác".

## 5. Hiệu năng

Test `performance smoke (phase 7)`: 20 bác sĩ, mỗi người 20 lịch hẹn trong ngày được tìm và 3 bệnh nhân đang chờ.

| Endpoint | Ngưỡng test | Đo được (máy dev, 2026-09-25) |
|---|---|---|
| `GET /appointments/availability/search?date=…` (20 bác sĩ) | < 3000 ms | 74 ms |
| `GET /queue` (60 bệnh nhân) | < 1500 ms | 27 ms |

Ngưỡng cố ý rộng để bắt lỗi N+1 hoặc thiếu index chứ không bắt dao động của máy CI.

## 6. Các mục còn lại của issue #8

| Mục | Cách xử lý |
|---|---|
| Form đặt lịch hiểu giờ theo múi giờ trình duyệt | `frontend/src/lib/clinicTime.ts`; form đặt lịch, đổi lịch, gợi ý giờ trống, walk-in, hàng đợi dùng giờ phòng khám (+07:00). Chứng minh bằng `booking-clinic-time.spec.ts` (trình duyệt đặt múi giờ UTC). |
| Không đặt được lịch vãng lai ngay lúc đó | Đã làm ở giai đoạn 5 (`POST /appointments/walk-in`). |
| Bộ lọc lỗi làm mất mã nghiệp vụ | `http-exception.filter.ts` lấy `code` (hoặc `error` dạng `UPPER_SNAKE`), còn lại mới suy từ HTTP status. Test `http-exception.filter.spec.ts`. |
| Phiên admin dùng chung mất hiệu lực, test lệch giao diện | Đã sửa ở PR #11 (cả bộ pass). |
| Khung giờ demo bị bỏ lại khi lượt chạy bị ngắt | `seed-demo-window.ts` xóa fixture cũ (nhận diện: không trả lương, slot 15′, không có người tạo, có ngày kết thúc) trước khi tạo mới, và cho phép khung giờ chồng lên ca sắp hết thay vì báo lỗi. |
| Playwright chưa chạy trong CI | Job `Playwright E2E` trong `.github/workflows/ci.yml`: Postgres, migrate + seed, backend, Vite, Chromium. Nếu giờ phòng khám đã qua 22:50, job chờ sang ngày mới (khung giờ demo cần phủ 60 phút sau lúc setup: cả bộ test chạy ~6 phút, rồi các luồng đặt lịch 30 phút, bắt đầu muộn nhất 15 phút sau giờ hiện tại). |
