# Test Cases — Payroll Module

> **Module:** Payroll (config, compensations, periods, me/history)
> **Priority:** P1 — đã có test (98 tests / 8 files).
> **Test files:** `backend/src/payroll/{payroll.service.spec.ts, payroll.service.major.spec.ts, compute-worked-hours.spec.ts, shift-registration.service.spec.ts, shift-registration.service.major.spec.ts}` + `domain/{payroll-state.spec.ts, tax-calculator.spec.ts, prorate-calculator.spec.ts}`

---

## 1. Purpose

Cover payroll config (GET/PUT), compensations (GET/POST/PATCH/DELETE), periods (GET/POST/GET-id/compute/adjustments/lock/approve/mark-paid/open-adjustment), and personal history (me/history, payslip, compensation, preview).

## 2. Endpoints covered (19 endpoints)

| Endpoint | Method | Permission |
|---|---|---|
| `/api/v1/payroll/config` | GET / PUT | `payroll.config.read` / `.write` |
| `/api/v1/payroll/compensations` | GET / POST | `payroll.compensation.read` / `.write` |
| `/api/v1/payroll/compensations/:id` | PATCH / DELETE | `payroll.compensation.write` |
| `/api/v1/payroll/periods` | GET / POST | `payroll.period.read` / `.write` |
| `/api/v1/payroll/periods/:id` | GET | `payroll.period.read` |
| `/api/v1/payroll/periods/:id/compute` | POST | `payroll.compute` |
| `/api/v1/payroll/periods/:id/adjustments` | POST | `payroll.adjust` |
| `/api/v1/payroll/periods/:id/lock` | POST | `payroll.lock` |
| `/api/v1/payroll/periods/:id/approve` | POST | `payroll.approve` |
| `/api/v1/payroll/periods/:id/mark-paid` | POST | `payroll.mark_paid` |
| `/api/v1/payroll/periods/:id/open-adjustment` | POST | `payroll.adjust` |
| `/api/v1/payroll/me/history` | GET | `payroll.self.read` |
| `/api/v1/payroll/me/payslip` | GET | `payroll.self.read` |
| `/api/v1/payroll/me/compensation` | GET | `payroll.self.read` |
| `/api/v1/payroll/me/preview` | GET | `payroll.self.read` |

## 3. Test cases

### TC-PAY-001 — getConfig — Returns snapshot or null

- **Verify:** `payrollConfig.findFirst` returns latest snapshot.

### TC-PAY-002 — updateConfig — R2-9 guarded snapshot version

- **Verify:** `updateMany({ where: { id, version: prev } })` → success increments version.

### TC-PAY-003 — listCompensations — Filter by dentist

- **Verify:** `where.userId = dentistId`.

### TC-PAY-004 — createCompensation — Validates effective date range

- **Setup:** overlapping compensation.
- **Expected:** `ConflictException('OVERLAPPING_COMPENSATION')`.

### TC-PAY-005 — createPeriod — Validates month boundaries

- **Verify:** `periodStart`, `periodEnd` correctly set.

### TC-PAY-006 — computePeriod — Uses tax-calculator + prorate-calculator

- **Verify:** `domain/tax-calculator` and `domain/prorate-calculator` invoked.

### TC-PAY-007 — computePeriod — Advisory lock (R2-10)

- **Verify:** `pg_advisory_xact_lock(hash(periodId))` called.

### TC-PAY-008 — computePeriod — Locked period cannot be recomputed

- **Expected:** `ConflictException('PERIOD_LOCKED')`.

### TC-PAY-009 — lockPeriod — Transitions DRAFT → LOCKED

- **Verify:** state machine in `domain/payroll-state`.

### TC-PAY-010 — approvePeriod — LOCKED → APPROVED

- **Verify:** state machine transition valid.

### TC-PAY-011 — markPaid — APPROVED → PAID

- **Verify:** records `paidAt`.

### TC-PAY-012 — openAdjustment — PAID → ADJUSTMENT (creates offsetting entries)

- **Verify:** negative line items for adjustments.

### TC-PAY-013 — meHistory — Cursor pagination

### TC-PAY-014 — mePayslip — Filter by period

### TC-PAY-015 — mePreview — Dry-run tax computation

- **Verify:** no DB writes; returns projected tax + net.

### TC-PAY-016 — domain/tax-calculator — Progressive bracket

- **Verify:** VND tax bracket logic for each band.

### TC-PAY-017 — domain/prorate-calculator — Mid-month start proration

- **Verify:** `(daysInPeriod - daysBeforeStart + 1) / daysInPeriod`.

### TC-PAY-018 — domain/payroll-state — Rejects invalid state transitions