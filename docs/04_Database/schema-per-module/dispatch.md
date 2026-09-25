# Điều phối — hàng đợi trước khi khám (Giai đoạn 6)

> **Module:** Appointments (`backend/src/appointments/dispatch.service.ts`, `domain/queue.ts`)
> **Quyết định kiến trúc:** [ADR-0009](../../ADR/0009-staff-dentist-service-scheduling-model.md), giai đoạn 6 (D2, D3, D5, D6)
> **Migration:** `024_queue_entries` · **Ngày tạo:** 2026-09-25 · **Trạng thái:** Đã triển khai (PR-6)

---

## 1. Thay đổi dữ liệu

| Đối tượng | Thay đổi |
|---|---|
| enum `QueueStatus` (mới) | `WAITING`, `CALLED`, `SKIPPED`, `LEFT` |
| enum `QueuePriority` (mới) | `EMERGENCY`, `ON_TIME`, `LATE`, `WALK_IN` (khai báo theo thứ tự ưu tiên) |
| `queue_entries` (mới) | một dòng cho mỗi lịch hẹn đã check-in (`appointment_id` unique): `dentist_id`, `queue_date`, `status`, `priority`, `checked_in_at`, `emergency_reason`, `called_at/by`, `call_count`, `skipped_at`, `skip_reason`, `skip_count`, `transferred_from_id`, `transfer_reason`, `done_at`, `close_reason` (`STARTED`/`CANCELLED`/`LEFT`) |
| `queue_entries_one_called_idx` | unique `(dentist_id)` khi `status = CALLED` và chưa đóng — mỗi bác sĩ chỉ gọi một bệnh nhân một lúc |
| `treatments.service_id` (mới, có thể trống) | điều trị chọn từ danh mục dịch vụ (D6); dữ liệu cũ vẫn hợp lệ |
| quyền mới | `queue.read`, `queue.call` (admin, lễ tân, bác sĩ); `queue.manage` (admin, lễ tân) |

Khi migration chạy, các lịch hẹn đang `CHECKED_IN` được đưa vào hàng đợi theo giờ check-in.

## 2. Vòng đời (D5)

```
check-in / walk-in ──► WAITING ──gọi──► CALLED ──bắt đầu khám──► (đóng: STARTED)
                          ▲  │             │
                  gọi lại │  └──bỏ qua──►  SKIPPED
                          └───────────────┘
bất kỳ trạng thái mở ──"đã về"──► LEFT (đóng)      ──hủy lịch──► (đóng: CANCELLED)
```

- Hàng đợi **chỉ** lo phần trước khi khám. Bắt đầu khám (từ lịch hẹn hoặc từ bệnh án) đóng dòng hàng đợi; từ đó trạng thái đi theo `Appointment` (`IN_PROGRESS → COMPLETED`) và `Encounter`.
- Mọi đường vào/ra đều qua hai hàm `enqueue` / `closeQueueEntry` (`domain/queue.ts`): check-in thường, check-in muộn có lý do, walk-in, bắt đầu khám (cả hai lối), hủy, `LEFT`.
- Bác sĩ có thể bắt đầu khám ngay mà không cần bấm "Gọi".

## 3. Luật nghiệp vụ

| Mã | Luật |
|---|---|
| BR-DSP-001 | Thứ tự trong hàng đợi một bác sĩ: người **đang gọi** ở trên cùng; rồi người **đang chờ** theo lớp ưu tiên **cấp cứu > đúng giờ > đến trễ > vãng lai**, cùng lớp thì ai check-in trước đi trước; người **đã bỏ qua** xuống cuối. Lớp được tính lúc check-in: walk-in → `WALK_IN`; check-in muộn hơn giờ hẹn quá 15 phút → `LATE`; còn lại `ON_TIME`. |
| BR-DSP-002 | "Gọi" từ `WAITING` hoặc `SKIPPED` → `CALLED`. Mỗi bác sĩ chỉ gọi một người một lúc; gọi người thứ hai → `409 QUEUE_DENTIST_BUSY`. Bác sĩ chỉ thao tác trên hàng đợi của mình (hàng của người khác trả 404). |
| BR-DSP-003 | "Bỏ qua" (lý do ≥ 3 ký tự) từ `WAITING`/`CALLED` → `SKIPPED`, giữ nguyên lớp và giờ check-in, có thể gọi lại. |
| BR-DSP-004 | "Cấp cứu" (lý do ≥ 5 ký tự, quyền `queue.manage`) đổi lớp thành `EMERGENCY`. |
| BR-DSP-005 | "Chuyển bác sĩ" (lý do ≥ 5, `queue.manage`), không áp dụng khi đang gọi. Lượt khám giữ thời lượng và buffer, bắt đầu từ **bây giờ** (hoặc giờ hẹn nếu còn ở tương lai). Bác sĩ nhận phải đang hành nghề, làm được các dịch vụ đã chọn (BR-APPT-030) và rảnh theo AvailabilityService. Bệnh nhân giữ lớp ưu tiên và giờ check-in; ghi nhật ký đổi lịch và audit `APPOINTMENT_TRANSFERRED`. |
| BR-DSP-006 | "Thay bác sĩ cả ngày" (D3, `queue.manage`): chuyển các lịch hẹn **chưa đến** (`SCHEDULED`/`CONFIRMED`, chưa qua giờ) của một bác sĩ trong ngày sang bác sĩ khác, **giữ nguyên giờ**. Từng lịch được kiểm tra riêng (dịch vụ, giờ trống); lịch không chuyển được giữ nguyên và được trả về kèm lý do. Bệnh nhân đã check-in thì chuyển từng người bằng BR-DSP-005. |
| BR-DSP-007 | Mọi thao tác ghi audit trên lịch hẹn (`QUEUE_CALLED`, `QUEUE_SKIPPED`, `QUEUE_EMERGENCY`, `APPOINTMENT_TRANSFERRED`, `APPOINTMENT_REASSIGNED`) và hiện trong "Nhật ký thao tác" (BR-APPT-034). |

## 4. API

| Route | Quyền |
|---|---|
| `GET /queue?dentistId&date` | `queue.read` (bác sĩ chỉ thấy hàng của mình) |
| `POST /queue/:id/call` | `queue.call` |
| `POST /queue/:id/skip` `{reason}` | `queue.call` |
| `POST /queue/:id/emergency` `{reason}` | `queue.manage` |
| `POST /queue/:id/transfer` `{dentistId, reason}` | `queue.manage` |
| `POST /queue/reassign-day` `{fromDentistId, toDentistId, date, reason}` → `{moved, failed}` | `queue.manage` |

`GET /appointments/waiting-queue` vẫn giữ cho tương thích (danh sách `CHECKED_IN` theo giờ check-in).

## 5. Quyết định còn treo từ D2 — `NO_SHOW`

**Chốt:** giữ như hiện tại — cron tự đánh `NO_SHOW` cho cả `SCHEDULED` lẫn `CONFIRMED` khi đã hết khung check-in **và** hết giờ hẹn (BR-APPT-012). Nếu chỉ cho `CONFIRMED → NO_SHOW` thì lịch không ai xác nhận sẽ treo mãi ở `SCHEDULED` và giữ chỗ trên lịch. Tỷ lệ no-show có thể tách theo "đã xác nhận / chưa xác nhận" ở báo cáo nếu cần.

## 6. Giao diện

- **Điều phối** (`/dispatch`, lễ tân/admin): hàng đợi của từng bác sĩ hôm nay; nút Gọi / Gọi lại, Bỏ qua, Cấp cứu, Chuyển BS, Đã về; nút "Thay bác sĩ cả ngày" hiện kết quả chuyển được / không chuyển được.
- **Hàng chờ của tôi** (`/my-queue`, bác sĩ): cùng thứ tự; Gọi, Bắt đầu khám, Bỏ qua; mục "Đang khám" để tiếp tục.
- **Thêm điều trị:** chọn "Dịch vụ từ danh mục" (dịch vụ bác sĩ làm hôm nay) điền sẵn mã, tên, đơn giá; vẫn cho nhập tay.

## 7. Kiểm thử

- `domain/queue.spec.ts` — bảng quyết định lớp ưu tiên và thứ tự.
- `test/isolated/backend-api-database.spec.ts` — thứ tự thật trên Postgres, cấp cứu, một người được gọi mỗi bác sĩ (409), phạm vi bác sĩ (404), bỏ qua, chuyển bác sĩ, đóng khi bắt đầu khám / `LEFT`, thay bác sĩ cả ngày (chuyển được / không), `treatments.service_id`.
- `frontend/e2e/dispatch.spec.ts` — bảng điều phối: cấp cứu, gọi, bỏ qua, đã về; thay bác sĩ cả ngày.
