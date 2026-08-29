# Test Cases — Appointments Module

> **Module:** Appointments
> **Priority:** P0 — state machine, R2-10 advisory lock, business rule nhiều.
> **Test file:** `backend/src/appointments/appointments.service.spec.ts`

---

## 1. Purpose

Cover appointment creation, check-in, starting encounters, cancellation, rescheduling, no-show, schedules, time-offs, shift-registrations.

## 2. Endpoints covered (22 endpoints)

| Endpoint | Method | Permission |
|---|---|---|
| `/api/v1/appointments` | GET | `appointment.read` |
| `/api/v1/appointments/today` | GET | `appointment.read` |
| `/api/v1/appointments/waiting-queue` | GET | `appointment.read` |
| `/api/v1/appointments/availability` | GET | `appointment.read` |
| `/api/v1/appointments/:id` | GET | `appointment.read` |
| `/api/v1/appointments/:id` | PATCH | `appointment.update` |
| `/api/v1/appointments` | POST | `appointment.create` |
| `/api/v1/appointments/:id/reschedule` | POST | `appointment.update` |
| `/api/v1/appointments/:id/check-in` | POST | `appointment.update` |
| `/api/v1/appointments/:id/start-encounter` | POST | `encounter.start` |
| `/api/v1/appointments/:id/cancel` | POST | `appointment.cancel` |
| `/api/v1/appointments/:id/no-show` | POST | `appointment.update` |
| `/api/v1/schedules` | POST | `schedule.manage` |
| `/api/v1/schedules` | GET | `schedule.read` |
| `/api/v1/time-offs` | POST | `schedule.manage` |
| `/api/v1/time-offs` | GET | `schedule.read` |
| `/api/v1/shift-registrations` | POST/GET | `shift.read` / `shift.register` |
| `/api/v1/shift-registrations/:id/approve` | POST | `shift.approve` |
| `/api/v1/shift-registrations/:id/reject` | POST | `shift.approve` |
| `/api/v1/shift-registrations/:id/cancel` | POST | `shift.cancel` |

## 3. Test cases

### TC-APPT-001 — create — Happy path with valid schedule

- **Setup:** valid dentist with working schedule covering test time.
- **Expected:** appointment created with state `SCHEDULED`.

### TC-APPT-002 — create — OutsideWorkingHoursException when no schedule

- **Expected:** `BadRequestException('OUTSIDE_WORKING_HOURS')`.

### TC-APPT-003 — create — Slot already booked

- **Verify:** `pg_advisory_xact_lock` would be called (R2-10); conflict detected.

### TC-APPT-004 — checkIn — Transitions SCHEDULED → CHECKED_IN

- **Verify:** `update({ status: 'CHECKED_IN' })`.

### TC-APPT-005 — checkIn — Rejects when appointment is CANCELLED

- **Expected:** `InvalidAppointmentStateException`.

### TC-APPT-006 — startEncounter — Creates encounter + transitions to IN_PROGRESS

- **Verify:** `prisma.encounter.create` then `appt.update({ status: 'IN_PROGRESS' })`.

### TC-APPT-007 — cancel — Soft delete + audit

- **Verify:** `status = 'CANCELLED'`, `cancelledReason` recorded, audit `APPOINTMENT_CANCELLED`.

### TC-APPT-008 — cancel — Cannot cancel already-completed appointment

- **Expected:** `InvalidAppointmentStateException`.

### TC-APPT-009 — reschedule — Increments rescheduleCount, updates startAt/endAt

- **Verify:** `update({ rescheduleCount: prev+1, lastRescheduleAt: now })`.

### TC-APPT-010 — reschedule — Advisory lock (R2-10) for overlap check

- **Verify:** mock `pg_advisory_xact_lock` would be invoked for target dentist+time.

### TC-APPT-011 — markNoShow — Transitions to NO_SHOW

- **Verify:** `update({ status: 'NO_SHOW' })`.

### TC-APPT-012 — availability — Returns free slots within schedule

- **Verify:** returns array of slot timestamps not overlapping existing appointments.

### TC-APPT-013 — waitingQueue — Filter today's CHECKED_IN appointments

- **Expected:** array of patients ready for encounter.

### TC-APPT-014 — shiftRegistration — Approve transitions state

- **Verify:** `update({ status: 'APPROVED' })`.

### TC-APPT-015 — shiftRegistration — Reject requires reason

- **Verify:** `update({ status: 'REJECTED', rejectedReason })`.