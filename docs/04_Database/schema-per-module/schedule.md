# Schema — Duyệt nghỉ phép & ngoại lệ lịch làm việc (Giai đoạn 3)

> **Module:** Appointments (`backend/src/appointments/`, `frontend/src/features/schedule/`)
> **Quyết định kiến trúc:** [ADR-0009](../../ADR/0009-staff-dentist-service-scheduling-model.md): D3 ("làm thêm" chỉ đi qua `shift_registrations`)
> **Migration:** `021_time_off_approval_schedule_overrides`
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
- Unique một phần: tối đa một `CHANGED_HOURS` cho mỗi bác sĩ, mỗi ngày.

## 2. Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR-SCH-001 | Người có `time_off.approve` (admin) ghi nghỉ phép thì có hiệu lực ngay (`APPROVED`). Người khác (bác sĩ tự xin, lễ tân) chỉ tạo **đơn** `PENDING`. Chỉ nghỉ phép `APPROVED` mới chặn đặt lịch và slot trống. Khi duyệt: kiểm tra lại bệnh nhân đang ở phòng khám, rồi trả về các lịch hẹn cần dời. Từ chối phải có lý do (≥ 5 ký tự). Bác sĩ (với nghỉ phép của mình) hoặc nhân viên có thể hủy đơn đang chờ hoặc nghỉ phép đã duyệt nhưng chưa kết thúc. |
| BR-SCH-002 | Một bác sĩ không được có hai khoảng nghỉ `PENDING`/`APPROVED` chồng nhau (lỗi `TIME_OFF_OVERLAP`). |
| BR-SCH-003 | `CLOSED`: cả ngày thì không nhận hẹn (`blockedReason: 'CLOSED'`); một khoảng thì khoảng đó bị chặn như nghỉ phép. |
| BR-SCH-004 | `CHANGED_HOURS` **thay** lịch tuần của ngày đó. Ca đăng ký đã duyệt vẫn cộng thêm giờ (D3). Mỗi ngày tối đa một bản (lỗi `OVERRIDE_EXISTS`). |
| BR-SCH-005 | `GET /appointments/schedule-impact` liệt kê lịch hẹn `SCHEDULED`/`CONFIRMED` trong 60 ngày tới mà lịch hiện tại không còn cho phép, kèm lý do: `TIME_OFF`, `CLOSED`, `OUTSIDE_WORKING_HOURS`. Hệ thống **không** tự dời lịch. |
| BR-SCH-006 | Ngoại lệ lịch chỉ lễ tân/admin được tạo hoặc xóa, bác sĩ không tự làm. Không được tạo cho ngày đã qua, hoặc khi có bệnh nhân đã check-in hay đang khám trong khoảng bị ảnh hưởng. Tạo xong trả về các lịch hẹn của ngày đó bị ảnh hưởng. |

Đặt lịch, tính slot trống và báo cáo ảnh hưởng dùng chung một hàm kiểm tra (`AppointmentsService.calendarProblem`) nên không thể cho kết quả khác nhau.

## 3. Phân quyền

| Mã quyền | clinic_admin | receptionist | dentist |
|---|:-:|:-:|:-:|
| `time_off.approve` (mới) | ✓ | — | — |
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

## 5. Giao diện

Trang **Lịch làm việc & Nghỉ phép** có 4 tab:
- **Lịch làm việc cố định**.
- **Nghỉ phép**: trạng thái; duyệt, từ chối hoặc hủy; bác sĩ thấy nút "Xin nghỉ phép".
- **Ngoại lệ theo ngày**: đóng lịch cả ngày hoặc một khoảng, đổi giờ làm.
- **Lịch hẹn bị ảnh hưởng**: tiêu đề tab hiện số lượng; mỗi dòng dẫn tới lịch hẹn cần xử lý.
