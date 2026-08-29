# API — Appointments Module

> **Module:** Appointments (Bao gồm Calendar, Check-in, Waiting Queue)
> **Base:** Kế thừa toàn bộ quy ước từ [`api-conventions.md`](./api-conventions.md).
> **Ngày tạo:** 2026-07-13

---

## Base path

```
/api/v1/appointments                    — CRUD + actions
/api/v1/appointments/:id/check-in       — Action
/api/v1/appointments/:id/cancel         — Action
/api/v1/appointments/:id/reschedule     — Action
/api/v1/appointments/:id/no-show        — Action (cron)
/api/v1/appointments/:id/start          — Action (open encounter)
/api/v1/appointments/:id/finish         — Action (manual complete)
/api/v1/waiting-queue                   — FIFO queue
/api/v1/dentists/:id/working-schedules  — Working schedule
/api/v1/dentists/:id/time-offs          — Time-offs
/api/v1/calendar                        — Calendar view
```

---

## 1. CRUD Appointments

### 1.1 `GET /api/v1/appointments`

**Auth:** Login required
**Permission:** `appointment.read` (Receptionist + Dentist + Admin)

**Query:**
| Param | Type | Default | Description |
| ----- | ---- | :-----: | ----------- |
| `q` | string | — | Search by patient name/code |
| `status` | enum | — | `scheduled` \| `confirmed` \| `checked_in` \| `in_consultation` \| `completed` \| `cancelled` \| `no_show` |
| `dentistId` | uuid | — | Filter by dentist |
| `patientId` | uuid | — | Filter by patient |
| `from` | datetime | — | Start date range |
| `to` | datetime | — | End date range |
| `pageSize` | int | 20 | — |
| `cursor` | string | — | Cursor pagination |
| `sort` | string | `startsAt:asc` | mặc định sắp xếp theo giờ hẹn |
| `includeDeleted` | bool | false | Admin only |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "patientId": "uuid",
      "patientCode": "PAT-2026-00046",
      "patientName": "Nguyen Van A",
      "patientPhone": "0987654321",
      "dentistId": "uuid",
      "dentistName": "BS. Trần Thị B",
      "startsAt": "2026-07-15T09:00:00Z",
      "endsAt": "2026-07-15T09:30:00Z",
      "status": "scheduled",
      "chiefComplaint": "Đau răng 26",
      "appointmentType": "consultation",
      "createdAt": "2026-07-13T10:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

---

### 1.2 `POST /api/v1/appointments`

**Auth:** Login required
**Permission:** `appointment.create` (Receptionist + Admin)

**Rate limit:** 30 req/phút
**Idempotency:** Required

**Request:**
```json
{
  "patientId": "uuid",
  "dentistId": "uuid",
  "startsAt": "2026-07-15T09:00:00Z",
  "endsAt": "2026-07-15T09:30:00Z",
  "appointmentType": "consultation",
  "chiefComplaint": "Đau răng 26",
  "notes": "Bệnh nhân nhạy cảm với latex",
  "sendSmsReminder": true
}
```

**Validation:**
- `patientId`: required, phải `active`
- `dentistId`: required
- `startsAt`: required, ISO 8601 UTC, **phải ở tương lai** (BR-APPT-022 đã chặn)
- `endsAt`: required, > `startsAt`
- `appointmentType`: enum `consultation` \| `treatment` \| `follow_up`
- `chiefComplaint`: optional, max 500 chars
- `notes`: optional, max 1000 chars

**Business rules trước khi insert (BR-APPT):**
- Working schedule của dentist phải bao phủ `[startsAt, endsAt)` (BR-APPT-002)
- Không trùng slot với appointment khác của cùng dentist
- Không nằm trong time-off của dentist (BR-APPT-014)
- Patient không có appointment khác cùng giờ với dentist khác (BR-APPT-016)

**Response 201:**
```json
{
  "data": {
    "id": "uuid",
    "patientId": "uuid",
    "dentistId": "uuid",
    "startsAt": "2026-07-15T09:00:00Z",
    "endsAt": "2026-07-15T09:30:00Z",
    "status": "scheduled",
    "appointmentType": "consultation",
    "createdAt": "2026-07-13T10:00:00Z"
  }
}
```

**Side effect:**
- Audit `appointment_created`
- Nếu `sendSmsReminder = true`: schedule reminder job (MOCK: log "SMS would be sent")

**Response 409:**
- "Slot already booked for this dentist" (exclude exclusion constraint)

**Response 422:**
- "Appointment cannot be in the past" (BR-APPT-022)
- "Dentist is on time-off during this period" (BR-APPT-014)
- "Outside of working schedule" (BR-APPT-002)
- "Patient already has another appointment at this time" (BR-APPT-016)

---

### 1.3 `GET /api/v1/appointments/:id`

**Auth:** Login required
**Permission:** `appointment.read`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "patient": { "id": "uuid", "code": "...", "fullName": "...", "primaryPhone": "..." },
    "dentist": { "id": "uuid", "fullName": "BS. Trần Thị B" },
    "startsAt": "2026-07-15T09:00:00Z",
    "endsAt": "2026-07-15T09:30:00Z",
    "durationMinutes": 30,
    "status": "checked_in",
    "appointmentType": "consultation",
    "chiefComplaint": "Đau răng 26",
    "notes": "...",
    "checkInAt": "2026-07-15T08:48:00Z",
    "checkedInByUserId": "uuid-receptionist",
    "encounterId": "uuid-or-null",
    "rescheduledFromAppointmentId": null,
    "cancelledAt": null,
    "cancelledByUserId": null,
    "cancellationReason": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### 1.4 `PATCH /api/v1/appointments/:id`

**Auth:** Login required
**Permission:** `appointment.update` (Receptionist + Admin)

**Request (subset):**
```json
{
  "chiefComplaint": "Đau răng 26, kèm sưng nướu",
  "notes": "Đã chụp X-quang"
}
```

> **Lưu ý:**
> - Đổi `startsAt`/`endsAt` → phải dùng action `POST /reschedule` (xem 1.7) — ghi reschedule log (BR-APPT-013)
> - Đổi `dentistId` → cũng phải qua `reschedule` (vì check lại working schedule)
> - Status changes qua các actions riêng (check-in, cancel, start, finish)

**Response 200:** appointment object

---

### 1.5 `POST /api/v1/appointments/:id/check-in`

**Auth:** Login required
**Permission:** `appointment.checkin` (Receptionist)

**Rate limit:** 60 req/phút (operational)

**Request:**
```json
{
  "notes": "Bệnh nhân đến đúng giờ"
}
```

**Validation (BR-APPT-006):**
- **Check-in window:** `startsAt - 15 minutes ≤ now ≤ startsAt + 30 minutes`
- Status phải `scheduled` hoặc `confirmed`

**Side effect:**
- Status: `scheduled` → `checked_in`
- Set `checkInAt`, `checkedInByUserId`
- Auto-enqueue vào waiting queue (FIFO, BD-0001) — xem §3
- Audit `appointment_checked_in`

**Response 200:**
```json
{
  "data": {
    "appointment": { "id": "uuid", "status": "checked_in", ... },
    "queueEntry": {
      "queueId": "uuid",
      "positionInQueue": 3,
      "estimatedWaitMinutes": 30
    }
  }
}
```

**Response 422:**
- "Outside check-in window"
- "Appointment already checked-in or in-progress"

---

### 1.6 `POST /api/v1/appointments/:id/cancel`

**Auth:** Login required
**Permission:** `appointment.cancel` (Receptionist + Admin)

**Idempotency:** Required

**Request:**
```json
{
  "reason": "Bệnh nhân gọi báo hủy",
  "notifyPatient": false
}
```

**Side effect:**

**Status flow chính (BR-APPT-019):**
| From status | To status |
| ----------- | --------- |
| `scheduled` / `confirmed` | `cancelled` |
| `checked_in` / `in_consultation` | tùy encounter — xem below |

**Nếu appointment đang `checked_in` hoặc `in_consultation`:**
- Tìm encounter liên kết (1:1, BD-0002)
- Nếu encounter chưa `closed` → cascade cancel encounter (BD-0008)
  - Encounter status: `in_progress` → `cancelled`
  - Ghi `cancelled_by_user_id`, `cancellation_reason`
- Nếu encounter đã `closed` → KHÔNG cascade (BR-APPT-023)

**Phát event transactional (ADR-0008):**
- `AppointmentCancelled` event
- Nếu cascade: `EncounterCancelled`

**Atomic:** toàn bộ 1 transaction (xem SPEC §2.4 + ADR-0008)

**Audit:** `appointment_cancelled`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "status": "cancelled",
    "cancelledAt": "2026-07-13T10:00:00Z",
    "cancelledByUserId": "uuid",
    "cancellationReason": "Bệnh nhân gọi báo hủy",
    "cascadedEncounterId": "uuid-or-null"
  }
}
```

**Response 409:**
- "Appointment already completed"
- "Cannot cancel after X days rule" (nếu có)

---

### 1.7 `POST /api/v1/appointments/:id/reschedule`

**Auth:** Login required
**Permission:** `appointment.update` (Receptionist + Admin)

**Idempotency:** Required

**Request:**
```json
{
  "newStartsAt": "2026-07-16T10:00:00Z",
  "newEndsAt": "2026-07-16T10:30:00Z",
  "reason": "Bệnh nhân yêu cầu đổi lịch",
  "notifyPatient": true
}
```

**Side effect:**
- Re-validate working schedule / no-overlap / time-off
- Insert `appointment_reschedule_logs` row (BR-APPT-013)
- Status giữ nguyên (`scheduled` → `scheduled`)
- Gửi SMS nếu `notifyPatient`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "startsAt": "2026-07-16T10:00:00Z",
    "endsAt": "2026-07-16T10:30:00Z",
    "rescheduleLog": {
      "oldStartsAt": "2026-07-15T09:00:00Z",
      "newStartsAt": "2026-07-16T10:00:00Z",
      "reason": "...",
      "rescheduledByUserId": "uuid",
      "rescheduledAt": "2026-07-13T10:00:00Z"
    }
  }
}
```

**Response 422:**
- "New time outside working schedule"
- "Conflicting with existing appointment"
- "Dentist on time-off"

---

### 1.8 `POST /api/v1/appointments/:id/start`

**Auth:** Login required
**Permission:** `encounter.create` (Dentist)

**Side effect:**
- Status: `checked_in` → `in_consultation`
- Tạo encounter (BD-0002: 1 appointment = 1 encounter)
- Encounter status = `in_progress`
- Link appointment ↔ encounter (FK `encounter_id`)

**Response 200:**
```json
{
  "data": {
    "appointment": { "id": "uuid", "status": "in_consultation", "encounterId": "uuid" },
    "encounter": { "id": "uuid", "status": "in_progress", "startedAt": "..." }
  }
}
```

> **Lưu ý:** Encounter "create" endpoint thực sự nằm trong API MedicalRecords (§1.1), đây chỉ là helper từ appointment context.

---

### 1.9 `POST /api/v1/appointments/:id/finish`

**Auth:** Login required
**Permission:** `encounter.create` (Dentist)

> **Use case:** Khi BS kết thúc encounter nhưng không đóng encounter (vd encounter kéo dài nhiều ngày). Thường ít dùng ở MVP vì encounter thường đóng cùng lúc.

**Side effect:**
- Status: `in_consultation` → `completed`
- Encounter remain `in_progress`

**Response 200:** appointment object

---

### 1.10 `POST /api/v1/appointments/:id/no-show` (Cron job only)

**Auth:** System (service-to-service token)

> **BR-APPT-012:** Cron job chạy mỗi 5 phút quét appointments có `endsAt < now - 30 minutes` AND status ∈ {`scheduled`, `confirmed`}.

**Request:** empty body

**Side effect:**
- Status → `no_show`
- Audit `appointment_no_show` (system actor)
- Tự động (không qua receptionist)

**Response 200:**
```json
{
  "data": {
    "markedCount": 3,
    "appointmentIds": ["uuid1", "uuid2", "uuid3"]
  }
}
```

---

### 1.11 `DELETE /api/v1/appointments/:id`

**Auth:** Login required
**Permission:** `appointment.update` (Admin only — Receptionist phải dùng cancel)

> BR-APPT-024: Cancellation = endpoint khác (`POST /cancel`), DELETE chỉ xóa trong 1 số trường hợp đặc biệt.

**Response 204**

---

## 2. Working schedule — Dentist

### 2.1 `GET /api/v1/dentists/:id/working-schedules`

**Auth:** Login required
**Permission:** `schedule.read` (Admin + chính dentist đó)

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "weekday": 1,
      "weekdayLabel": "Thứ 2",
      "startTime": "08:00:00",
      "endTime": "17:00:00",
      "validFrom": "2026-01-01",
      "validTo": null,
      "recurrenceType": "weekly",
      "isActive": true
    }
  ]
}
```

---

### 2.2 `POST /api/v1/dentists/:id/working-schedules`

**Auth:** Login required
**Permission:** `schedule.update` (Admin)

**Request:**
```json
{
  "weekday": 1,
  "startTime": "08:00:00",
  "endTime": "17:00:00",
  "recurrenceType": "weekly",
  "validFrom": "2026-01-01"
}
```

**Response 201**

> **BR-APPT-008:** Recurrence simple — 7 weekday chính, mỗi weekday có 1 entry. Có thể thêm default 12:00-13:00 nghỉ trưa (mặc định).

**Response 422:** "Overlapping with existing schedule"

---

### 2.3 `PATCH /api/v1/dentists/:id/working-schedules/:scheduleId`

**Auth:** Login required
**Permission:** `schedule.update` (Admin)

**Response 200:** schedule object

---

### 2.4 `DELETE /api/v1/dentists/:id/working-schedules/:scheduleId`

**Auth:** Login required
**Permission:** `schedule.update` (Admin)

**Side effect:** Soft-delete. Chỉ xóa được nếu không có appointment nào trong tương lai overlap với schedule.

**Response 204**

---

## 3. Time-offs

### 3.1 `GET /api/v1/dentists/:id/time-offs`

**Auth:** Login required
**Permission:** `schedule.read`

**Query:**
- `from` (date)
- `to` (date)

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "startsAt": "2026-07-20T08:00:00Z",
      "endsAt": "2026-07-25T17:00:00Z",
      "reason": "Nghỉ phép",
      "isAllDay": true,
      "createdByUserId": "uuid-admin",
      "createdAt": "..."
    }
  ]
}
```

---

### 3.2 `POST /api/v1/dentists/:id/time-offs`

**Auth:** Login required
**Permission:** `schedule.update` (Admin)

**Idempotency:** Required

**Request:**
```json
{
  "startsAt": "2026-07-20T08:00:00Z",
  "endsAt": "2026-07-25T17:00:00Z",
  "reason": "Nghỉ phép",
  "isAllDay": true
}
```

**Side effect:**
- Audit `timeoff_created`
- **Nếu có appointment khác overlap với time-off này:**
  - KHÔNG auto-cancel — trả warning kèm danh sách appointment bị ảnh hưởng
  - Admin xử lý tay (cancel/reschedule các appointment đó)

**Response 201:**
```json
{
  "data": {
    "id": "uuid",
    "affectedAppointments": [
      {
        "id": "uuid-apt",
        "startsAt": "2026-07-21T09:00:00Z",
        "patientCode": "PAT-2026-00012",
        "patientName": "Nguyen Van X"
      }
    ]
  }
}
```

---

### 3.3 `DELETE /api/v1/dentists/:id/time-offs/:id`

**Auth:** Login required
**Permission:** `schedule.update` (Admin)

**Response 204**

---

## 4. Waiting Queue (FIFO)

### 4.1 `GET /api/v1/waiting-queue`

**Auth:** Login required
**Permission:** `appointment.read`

**Query:**
- `dentistId` (uuid, optional) — filter chỉ queue của 1 dentist
- `date` (date, default today)

**Response 200:**
```json
{
  "data": [
    {
      "queueId": "uuid",
      "appointmentId": "uuid",
      "patientCode": "PAT-2026-00046",
      "patientName": "Nguyen Van A",
      "patientPhone": "0987654321",
      "chiefComplaint": "Đau răng 26",
      "checkedInAt": "2026-07-15T08:48:00Z",
      "positionInQueue": 1,
      "estimatedWaitMinutes": 0,
      "appointmentScheduledAt": "2026-07-15T09:00:00Z"
    },
    {
      "queueId": "uuid",
      "appointmentId": "uuid",
      "positionInQueue": 2,
      "estimatedWaitMinutes": 30
    }
  ],
  "summary": {
    "totalWaiting": 5,
    "currentlyInConsultation": 1
  }
}
```

> **BD-0001:** FIFO trong cùng 1 dentist. Nếu có 2 BS song song thì mỗi BS có 1 queue riêng.
> `estimatedWaitMinutes`: giả định 30 phút/encounter, tính từ position * 30.

---

### 4.2 `GET /api/v1/waiting-queue/me`

**Auth:** Login required (Dentist only)

**Response 200:** Queue entry của dentist hiện đang authenticate

---

## 5. Calendar

### 5.1 `GET /api/v1/calendar`

**Auth:** Login required
**Permission:** `appointment.read`

**Query:**
| Param | Type | Description |
| ----- | ---- | ----------- |
| `from` | date | Required, range start |
| `to` | date | Required, range end |
| `dentistId` | uuid | Optional |
| `view` | enum | `day` \| `week` \| `month` |

**Response 200:**
```json
{
  "data": {
    "dateRange": { "from": "2026-07-13", "to": "2026-07-19" },
    "appointmentsByDay": {
      "2026-07-13": [
        {
          "id": "uuid",
          "startsAt": "...",
          "endsAt": "...",
          "status": "scheduled",
          "patientName": "...",
          "dentistName": "..."
        }
      ]
    },
    "workingSchedulesByDentist": {
      "uuid-dentist": {
        "monday": { "start": "08:00", "end": "17:00" },
        "..."
      }
    }
  }
}
```

---

## 6. Validation rules (Appointments-specific)

| Field | Rule |
| ----- | ---- |
| `startsAt` | ISO 8601 UTC, `> now()` |
| `endsAt` | `> startsAt`, `≤ startsAt + 4 hours` |
| `weekday` | 0-6 (0=CN) |
| `startTime`/`endTime` | format `HH:MM:SS`, `endTime > startTime` |
| `appointmentType` | enum |
| `durationMinutes` | 15, 30, 45, 60 (slot chuẩn cho MVP) |

---

## 7. Error responses (Appointments-specific)

| Status | Title | Khi nào |
| :----: | ----- | ------- |
| 409 | Slot already booked | BR-APPT-001 |
| 422 | Outside check-in window | BR-APPT-006 |
| 422 | Outside working schedule | BR-APPT-002 |
| 422 | Appointment in past | BR-APPT-022 |
| 422 | Cannot cancel completed | BR-APPT-023 |
| 422 | Cannot reschedule no-show | — |
| 422 | Overlapping time-off | — |

---

## 8. Cross-module events

| Event | Listener | Action |
| ----- | -------- | ------ |
| `AppointmentCancelled` | MedicalRecords | Cascade cancel encounter nếu `in_progress` (BR-APPT-024, BD-0008) |
| `AppointmentCheckedIn` | WaitingQueue | FIFO enqueue (BD-0001) |
| `AppointmentNoShow` | (logging) | Audit + counters |
| `AppointmentRescheduled` | (logging) | Audit + reschedule log |

Tất cả event theo cơ chế **transactional** (ADR-0008).

---

## 9. Idempotency

| Endpoint | Required |
| -------- | :------: |
| `POST /appointments` | ✅ |
| `POST /appointments/:id/check-in` | ✅ |
| `POST /appointments/:id/cancel` | ✅ |
| `POST /appointments/:id/reschedule` | ✅ |
| `POST /appointments/:id/start` | ✅ |
| `POST /appointments/:id/finish` | ✅ |
| `POST /dentists/:id/time-offs` | ✅ |

---

## 10. Audit log mapping

| Action | Trigger |
| ------ | ------- |
| `appointment_created` | POST /appointments |
| `appointment_updated` | PATCH /appointments/:id |
| `appointment_checked_in` | POST /check-in |
| `appointment_cancelled` | POST /cancel |
| `appointment_rescheduled` | POST /reschedule |
| `appointment_started` | POST /start |
| `appointment_finished` | POST /finish |
| `appointment_no_show` | Cron |
| `timeoff_created` | POST /dentists/:id/time-offs |
| `schedule_updated` | PATCH /working-schedules |

---

## Related

- [api-conventions.md](./api-conventions.md)
- [SPEC Appointments](../03_Specification/Appointments/SPEC.md)
- [BD-0001: FIFO Queue](../01_Architecture/business-decisions.md#bd-0001)
- [BD-0002: 1 Appt = 1 Encounter](../01_Architecture/business-decisions.md#bd-0002)
- [BD-0008: Cascade Cancellation](../01_Architecture/business-decisions.md#bd-0008)
- [ADR-0008: Transactional Events](../ADR/0008-transactional-encounter-close.md)
- [Schema Appointments](../04_Database/schema-per-module/appointments.md)