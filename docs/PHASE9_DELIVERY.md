# Phase 9: Payroll + Shift Management — Delivery Summary

## What was built

| Layer | File(s) | Purpose |
|---|---|---|
| **BD** | `docs/01_Architecture/business-decisions.md` (BD-0009, BD-0010) | Decisions on hybrid compensation + dual shift sources |
| **Permissions** | `docs/01_Architecture/actor-permissions-matrix.md` (§3.9, §3.10) + seed.ts (17 new perm codes) | RBAC for Payroll + Shift |
| **Spec** | `docs/03_Specification/Payroll/SPEC.md` | 24 BRs (BR-PAY-001 → BR-PAY-024), business flows, entities, APIs |
| **DB Schema** | `docs/04_Database/schema-per-module/payroll.md` + `docs/04_Database/migrations/009_payroll.sql` | 6 payroll tables |
| **Shift Migration** | `docs/04_Database/migrations/010_appointments_shift_registration.sql` | Alter working_schedules + new shift_registrations |
| **Prisma** | `backend/prisma/schema.prisma` | 5 new enums + 7 new models |
| **OpenAPI** | `backend/openapi.yaml` (v1.9.0) | 17 Payroll endpoints + 6 Shift endpoints |
| **UI Spec** | `docs/06_UI/screens/payroll.md` | Admin + Dentist screens |
| **Domain** | `backend/src/payroll/domain/{tax-calculator,prorate-calculator,payroll-state,exceptions}.ts` | Pure-function services |
| **Service** | `backend/src/payroll/payroll.service.ts` (640 lines) | Full lifecycle + atomic compute |
| **Shift Service** | `backend/src/payroll/shift-registration.service.ts` (290 lines) | Conflict checks, BS cancellation rules |
| **Controllers** | `backend/src/payroll/{payroll,shift-registration}.controller.ts` | 24 endpoints combined |
| **Cron** | `backend/src/payroll/payroll.cron.ts` | Auto-create period, auto-cancel past, auto-lock |
| **Listener** | `backend/src/payroll/payroll.listener.ts` | EncounterClosed → re-compute |
| **Module** | `backend/src/payroll/payroll.module.ts` | Wired into AppModule |
| **Tests** | `backend/src/payroll/{domain/payroll-state.spec,domain/tax-calculator.spec,domain/prorate-calculator.spec,payroll.service.spec,shift-registration.service.spec}.ts` | ~50 unit + integration tests |

## Business Rules implemented

### BR-PAY-001 → BR-PAY-024
See `docs/03_Specification/Payroll/SPEC.md` §6 for full text.

Key BRs covered by code:
- **BR-PAY-003** period overlap prevention (Postgres exclusion + pre-check in service)
- **BR-PAY-009** PIT progressive brackets (5/10/15/20/25%) — `tax-calculator.ts` spec example (30M gross → 2.15M tax)
- **BR-PAY-010** BHXH/BHYT/BHTN on capped base (minGross × 20)
- **BR-PAY-013** pro-rate base salary when comp effective range < period
- **BR-PAY-014** commission based on treatments in completed encounters
- **BR-PAY-016** state machine DRAFT → REVIEWING → APPROVED → PAID → LOCKED
- **BR-PAY-017** auto-lock PAID periods > 7 days
- **BR-PAY-018** MANUAL_OVERRIDE adjustment requires ≥ 50-char reason
- **BR-PAY-022** period compute is idempotent (re-running replaces line items)
- **BR-PAY-023** EncounterClosed → re-compute current DRAFT/REVIEWING period

### BR-APPT-026 → BR-APPT-031 (Shift Registration)
- **BR-APPT-028**: BS can only cancel own shift ≥ 24h before
- **BR-APPT-029**: Admin can approve shift, but not past date
- **BR-APPT-030**: Conflict check vs WorkingSchedule + existing approved shifts

## API surface

### Admin (clinic_admin + receptionist for shift approve)
```
GET/PUT  /payroll/config                          — get/update PayrollConfig
GET/POST /payroll/compensations                   — list/create DentistCompensation
PATCH/DEL /payroll/compensations/:id              — update/soft-delete
GET/POST /payroll/periods                         — list/create PayrollPeriod
GET       /payroll/periods/:id                    — period detail with line items
POST      /payroll/periods/:id/compute            — recompute entire period
POST      /payroll/periods/:id/adjustments        — add manual BONUS/PENALTY
POST      /payroll/periods/:id/lock               — DRAFT → REVIEWING
POST      /payroll/periods/:id/approve            — REVIEWING → APPROVED
POST      /payroll/periods/:id/mark-paid          — APPROVED → PAID
POST      /shifts/registrations/:id/approve       — approve BS shift request
POST      /shifts/registrations/:id/reject        — reject (with reason)
```

### Dentist (own)
```
GET       /payroll/me/history                     — own payslip history
GET       /payroll/me/payslip/:periodId           — own payslip detail
GET       /payroll/me/compensation                — current effective compensation
GET       /payroll/me/preview                     — current DRAFT period preview
POST      /shifts/registrations                   — register own shift
GET       /shifts/registrations                   — list own shifts (row-level)
POST      /shifts/registrations/:id/cancel        — cancel own (≥ 24h)
```

## What is NOT implemented yet

1. **Real check-in/check-out tracking** — currently shift hours = sum of encounter durations. Phase 9.1.
2. **PDF payslip generation** — manual export via API. Future.
3. **Audit log for config changes is "null actorUserId"** — logs as system action; future: full SystemActor concept.
4. **Integration test against real DB** — `payroll.service.spec.ts` mocks Prisma; E2E (real DB) recommended in next iteration.

## Files count

```
backend/src/payroll/                    — 14 files
docs/03_Specification/Payroll/          — 1 file (SPEC.md)
docs/04_Database/{schema-per-module,migrations}/   — 3 files
docs/06_UI/screens/payroll.md           — 1 file
docs/01_Architecture/{business-decisions,actor-permissions-matrix}.md updated
backend/prisma/schema.prisma            — 5 new enums + 7 new models (~250 LOC added)
backend/prisma/seed.ts                  — 17 new permission codes + role assignments
ROADMAP.md                              — Phase 9 marked complete
```