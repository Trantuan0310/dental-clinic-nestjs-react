# Test Cases — Shifts / Registrations Module

> **Module:** Shifts (ShiftRegistration, schedule, time-off)
> **Priority:** P1 — đã có test trong `payroll/shift-registration.service.*.spec.ts`.
> **Test files:** `backend/src/payroll/shift-registration.service.spec.ts`, `shift-registration.service.major.spec.ts`

---

## 1. Purpose

Cover shift registration lifecycle (create, approve, reject, cancel, no-show detection).

## 2. Endpoints covered (7 endpoints)

| Endpoint | Method | Permission |
|---|---|---|
| `/api/v1/shift-registrations` | GET | `shift.read` |
| `/api/v1/shift-registrations/:id` | GET | `shift.read` |
| `/api/v1/shift-registrations` | POST | `shift.register` |
| `/api/v1/shift-registrations/:id/approve` | POST | `shift.approve` |
| `/api/v1/shift-registrations/:id/reject` | POST | `shift.approve` |
| `/api/v1/shift-registrations/:id/cancel` | POST | `shift.cancel` |
| `/api/v1/shift-registrations/no-show-detection` | POST (cron / scheduled) | internal |

## 3. Test cases

### TC-SHIFT-001 — list — Filter by dentist, period

- **Verify:** `where.userId` and date range applied.

### TC-SHIFT-002 — get — 404 when missing

### TC-SHIFT-003 — create — Validates overlapping with existing shifts

- **Setup:** existing shift same dentist overlapping.
- **Expected:** `ConflictException('OVERLAPPING_SHIFT')`.

### TC-SHIFT-004 — create — Validates against time-off

- **Setup:** dentist has time-off in that period.
- **Expected:** `ConflictException('SHIFT_DURING_TIME_OFF')`.

### TC-SHIFT-005 — approve — Transitions PENDING → APPROVED

- **Verify:** `update({ status: 'APPROVED', approvedBy, approvedAt })`.

### TC-SHIFT-006 — reject — Requires reason, sets REJECTED

- **Verify:** `update({ status: 'REJECTED', rejectedReason })`.

### TC-SHIFT-007 — cancel — Allowed for PENDING or APPROVED

- **Verify:** `update({ status: 'CANCELLED' })`.

### TC-SHIFT-008 — noShowDetection — Auto-marks if encounter not started

- **Verify:** `updateMany` where status=APPROVED and startAt < now-grace and no encounter.