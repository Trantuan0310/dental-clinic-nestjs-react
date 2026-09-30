# Schema — Duyệt nghỉ phép & ngoại lệ lịch làm việc (Giai đoạn 3)

> **Module:** Appointments (`backend/src/appointments/`, `frontend/src/features/schedule/`)
> **Quyết định kiến trúc:** [ADR-0009](../../ADR/0009-staff-dentist-service-scheduling-model.md): D3 ("làm thêm" chỉ đi qua `shift_registrations`)
> **Migration:** `021_time_off_approval_schedule_overrides`, `035_clinic_closures`
> **Ngày tạo:** 2026-09-25 · **Trạng thái:** Đã triển khai (PR-3)

---

## 1. Thay đổi bảng

### `time_offs`: thêm vòng đời duyệt
| Cột mới | Kiểu | Ghi chú |
|---|---|---|
| `status` | `TimeOffStatus` | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`. Dòng có sẵn trước migration được đặt `APPROVED` (vì đã có hiệu lực ngay khi ghi nhận); dòng mới mặc định `PENDING` |
| `decided_by`, `decided_at` | UUID, TIMESTAMPTZ | Người và thời điểm duyệt, từ chối hoặc hủy |
| `decision_note` | TEXT | Ghi chú khi duyệt; **bắt buộc** khi từ chối |

### `schedule_overrides`: ngoại lệ theo ngày
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `dentist_id` | FK `users` | |
| `date` | DATE | Ngày của phòng khám |
| `kind` | `ScheduleOverrideKind` | `CLOSED` hoặc `CHANGED_HOURS` |
| `start_time`, `end_time` | TIME(0), có thể trống | `CLOSED` trống cả hai = đóng cả ngày; có giờ = đóng khoảng đó. `CHANGED_HOURS` bắt buộc có giờ |
| `reason` | TEXT | Bắt buộc |
| `deleted_at`, `deleted_by` | | Xóa mềm |

Ràng buộc:
- `CHECK`: nếu có giờ thì phải có đủ cả hai và `end_time > start_time`.
- ~~Unique một phần: tối đa một `CHANGED_HOURS` cho mỗi bác sĩ, mỗi ngày~~ — migration 035 bỏ index này: một ngày đổi giờ có thể có nhiều khung (VD 09:00–12:00 và 13:30–17:00 để giữ nghỉ trưa). Service kiểm tra các khung không chồng nhau (dưới khóa lịch của bác sĩ).

### `clinic_closures`: ngày nghỉ toàn phòng khám (migration 035)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `start_date`, `end_date` | DATE | Ngày của phòng khám, tính cả hai đầu; `CHECK end_date >= start_date` |
| `reason` | VARCHAR(500) | Bắt buộc; hiển thị "Phòng khám nghỉ: {lý do}" |
| `created_by` | FK `users` | |
| `deleted_at`, `deleted_by` | | Xóa mềm |

### `working_schedules`: sửa, kết thúc, xóa
Không đổi cột. Sửa giờ/thứ của một lịch **đang áp dụng** không ghi đè: dòng cũ được đóng ở ngày X−1 (`valid_to`), dòng mới bắt đầu từ ngày X — các ngày đã qua giữ giờ cũ để tính lương. Lịch chưa bắt đầu thì sửa trực tiếp hoặc xóa (xóa mềm); lịch đã bắt đầu chỉ "kết thúc" (đặt `valid_to`, sớm nhất là hôm qua); lịch đã hết hiệu lực không sửa được.

## 2. Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR-SCH-001 | Người có `time_off.approve` (admin) ghi nghỉ phép thì có hiệu lực ngay (`APPROVED`). Người khác (bác sĩ tự xin, lễ tân) chỉ tạo **đơn** `PENDING`. Chỉ nghỉ phép `APPROVED` mới chặn đặt lịch và slot trống. Khi duyệt: kiểm tra lại bệnh nhân đang ở phòng khám, rồi trả về các lịch hẹn cần dời. Từ chối phải có lý do (≥ 5 ký tự). Bác sĩ (với nghỉ phép của mình) hoặc nhân viên có thể hủy đơn đang chờ hoặc nghỉ phép đã duyệt nhưng chưa kết thúc. |
| BR-SCH-002 | Một bác sĩ không được có hai khoảng nghỉ `PENDING`/`APPROVED` chồng nhau (lỗi `TIME_OFF_OVERLAP`). |
| BR-SCH-003 | `CLOSED`: cả ngày thì không nhận hẹn (`blockedReason: 'CLOSED'`); một khoảng thì khoảng đó bị chặn như nghỉ phép. |
| BR-SCH-004 | `CHANGED_HOURS` **thay** lịch tuần của ngày đó; một ngày có thể có nhiều khung (hợp các khung là giờ làm mới, khoảng trống giữa hai khung không nhận hẹn). Khung mới trùng khung đã có của ngày đó bị từ chối (`OVERRIDE_EXISTS`). Ca đăng ký đã duyệt vẫn cộng thêm giờ (D3). Các khung liền nhau (VD 08:00–12:00 và ca 12:00–13:30) được gộp, nên một lịch hẹn 11:30–12:30 hợp lệ. |
| BR-SCH-005 | `GET /appointments/schedule-impact` liệt kê lịch hẹn `SCHEDULED`/`CONFIRMED` trong 60 ngày tới mà lịch hiện tại không còn cho phép, kèm lý do: `TIME_OFF`, `CLOSED`, `OUTSIDE_WORKING_HOURS`. Hệ thống **không** tự dời lịch. |
| BR-SCH-006 | Ngoại lệ lịch chỉ quản trị được tạo hoặc xóa (lễ tân không có `schedule.write`, bác sĩ không tự làm). Không được tạo cho ngày đã qua, hoặc khi có bệnh nhân đã check-in hay đang khám trong khoảng bị ảnh hưởng. Tạo hoặc xóa xong trả về các lịch hẹn của ngày đó bị ảnh hưởng. |
| BR-SCH-007 | Lịch làm việc cố định: giờ `HH:mm` 00:00–23:59, phút là bội số của 5 (`23:59` = hết ngày), giờ kết thúc sau giờ bắt đầu, `valid_to ≥ valid_from` — sai thì 400 tiếng Việt. Có thể tạo nhiều thứ × nhiều khung trong một lần lưu (một transaction). Admin sửa mọi bác sĩ, bác sĩ chỉ sửa lịch của mình, không cần duyệt. Mọi lần sửa/kết thúc/xóa trả về lịch hẹn tương lai và yêu cầu đặt online đang chờ rơi ra ngoài giờ làm; **không tự hủy**. |
| BR-SCH-008 | Ngày nghỉ toàn phòng khám: mọi bác sĩ đóng cả ngày (lý do "Phòng khám nghỉ: …"), áp dụng cho đặt lịch, slot trống, tìm bác sĩ trống, đặt online và báo cáo ảnh hưởng. Không tạo cho ngày đã qua, tối đa 60 ngày/đợt, không trùng đợt khác, không khi có bệnh nhân đang ở phòng khám. Tạo/sửa trả về mọi lịch hẹn và yêu cầu online trong những ngày đó (không tự hủy). Đợt đã qua giữ làm lịch sử. Lý do hiển thị cho khách đặt online ("Phòng khám nghỉ: …"); lý do đóng lịch riêng của bác sĩ thì không. |
| BR-SCH-009 | "Yêu cầu online bị ảnh hưởng" dùng **một** kiểm tra chung `AvailabilityService.requestIssues` (thời lượng riêng của bác sĩ, buffer, dịch vụ đã ngừng sau ngày gửi vẫn tính): vừa cho `affectedBookingRequests` khi đổi lịch, vừa cho `slotIssue` của danh sách yêu cầu và `GET /booking-requests/pending-in-range` (tab "Lịch hẹn bị ảnh hưởng"). Đổi lịch áp dụng từ hôm nay còn liệt kê lịch hẹn hôm nay đã qua giờ bắt đầu hoặc đã check-in/đang khám. |
| BR-PAY-011 (bổ sung) | Giờ tính lương của một ngày = hợp của **mọi** khung lịch tuần có hiệu lực đúng ngày đó (theo `valid_from`/`valid_to`) và các ca đăng ký đã duyệt ngày đó, khung chồng/liền nhau được gộp (cùng quy tắc với lịch đặt hẹn, `mergeWindows`) nên không phút nào tính hai lần. |

Đặt lịch, tính slot trống và báo cáo ảnh hưởng dùng chung một hàm kiểm tra (`AppointmentsService.calendarProblem`) nên không thể cho kết quả khác nhau.

## 3. Phân quyền

| Mã quyền | clinic_admin | receptionist | dentist |
|---|:-:|:-:|:-:|
| `time_off.approve` (mới) | ✓ | — | — |
| `clinic_closure.manage` (migration 035) | ✓ | — | — |
| `schedule.write`: tạo nghỉ phép (đơn chờ duyệt nếu không có quyền duyệt), hủy nghỉ phép | ✓ | ✓ | 🔒 của mình |
| `schedule.write` + không bị giới hạn "chỉ của mình": ngoại lệ lịch | ✓ | ✓ | — |
| `schedule.read`: xem nghỉ phép, ngoại lệ, báo cáo ảnh hưởng | ✓ | ✓ | ✓ (báo cáo ảnh hưởng chỉ của mình) |

## 4. API (prefix `/api/v1/appointments`)

| Method | Path | Quyền |
|---|---|---|
| POST | `/time-offs` | `schedule.write` |
| GET | `/time-offs?dentistId=&status=` | `schedule.read` |
| POST | `/time-offs/:id/approve` \| `/reject` | `time_off.approve` |
| POST | `/time-offs/:id/cancel` | `schedule.write` |
| POST / GET | `/schedule-overrides` | `schedule.write` / `schedule.read` |
| DELETE | `/schedule-overrides/:id` | `schedule.write` |
| GET | `/schedule-impact?dentistId=&from=&to=` | `schedule.read` |
| POST | `/schedules/bulk` (nhiều thứ × nhiều khung) | `schedule.write` |
| PATCH | `/schedules/:id` (`startTime`, `endTime`, `dayOfWeek`, `validTo`, `effectiveFrom`…) | `schedule.write` |
| DELETE | `/schedules/:id` (chỉ lịch chưa bắt đầu) | `schedule.write` |
| GET | `/clinic-closures?from=` | `schedule.read` |
| POST / PATCH / DELETE | `/clinic-closures`, `/clinic-closures/:id` | `clinic_closure.manage` |

## 5. Giao diện

Trang **Lịch làm việc & Nghỉ phép** có 5 tab:
- **Lịch làm việc cố định**: thêm nhiều thứ và nhiều khung một lần (mặc định theo giờ mở cửa trong `frontend/src/config/clinic.ts`, cảnh báo khi rơi vào ngày/giờ phòng khám không mở); Sửa / Kết thúc / Xóa (chỉ lịch chưa bắt đầu).
- **Nghỉ phép**: trạng thái; duyệt, từ chối hoặc hủy; bác sĩ thấy nút "Xin nghỉ phép".
- **Ngoại lệ theo ngày**: đóng lịch cả ngày hoặc một khoảng, đổi giờ làm (một hoặc nhiều khung).
- **Ngày nghỉ phòng khám**: Tết, lễ — đóng cả phòng khám.
- **Lịch hẹn bị ảnh hưởng**: tiêu đề tab hiện số lượng; mỗi dòng dẫn tới lịch hẹn cần xử lý.
