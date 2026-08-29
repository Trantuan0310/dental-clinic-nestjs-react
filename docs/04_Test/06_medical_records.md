# Test Cases — Medical Records Module

> **Module:** Medical Records (encounters, clinical notes, treatments, prescriptions, dental chart)
> **Priority:** P0 — encounter state machine, inventory impact.
> **Test file:** `backend/src/medical-records/medical-records.service.spec.ts`

---

## 1. Purpose

Cover encounter lifecycle (start, close), clinical notes (upsert, addendum), treatments (create, update, delete), prescriptions, and dental chart snapshots.

## 2. Endpoints covered (13 endpoints)

| Endpoint | Method | Permission |
|---|---|---|
| `/api/v1/encounters` | GET | `encounter.read` |
| `/api/v1/encounters` | POST | `encounter.start` |
| `/api/v1/encounters/:id` | GET | `encounter.read` |
| `/api/v1/encounters/:id/close` | POST | `encounter.close` |
| `/api/v1/encounters/:id/cancel` | POST | `encounter.cancel` |
| `/api/v1/encounters/:id/clinical-note` | PUT | `clinical_note.write` |
| `/api/v1/encounters/:id/clinical-note/addendum` | POST | `clinical_note.write` |
| `/api/v1/encounters/:id/treatments` | POST | `treatment.create` |
| `/api/v1/encounters/:id/treatments/:tid` | PATCH | `treatment.update` |
| `/api/v1/encounters/:id/treatments/:tid` | DELETE | `treatment.delete` |
| `/api/v1/encounters/:id/prescription` | PUT | `prescription.write` |
| `/api/v1/encounters/:id/dental-chart` | GET (snapshot) | `dental_chart.read` |
| `/api/v1/patients/:id/dental-chart/latest` | GET | `dental_chart.read` |

## 3. Test cases

### TC-MR-001 — startEncounter — Transitions appointment to IN_PROGRESS

- **Verify:** `prisma.encounter.create` + `appointment.update({ status: 'IN_PROGRESS' })`.

### TC-MR-002 — closeEncounter — Transactional: close encounter + update appointment + deduct inventory

- **Verify:** `prisma.$transaction` invoked with:
  - `encounter.update({ status: 'CLOSED' })`
  - `appointment.update({ status: 'COMPLETED' })`
  - `inventoryItem.updateMany` (R2-9) for stock-out
  - audit log `ENCOUNTER_CLOSED`

### TC-MR-003 — closeEncounter — Stock-out fails when insufficient stock

- **Setup:** mock `updateMany` returns `{ count: 0 }`.
- **Expected:** rolls back, throws `InsufficientStockException`.

### TC-MR-004 — upsertClinicalNote — Happy path with chiefComplaint

- **Verify:** creates or updates note; `isLocked = false`.

### TC-MR-005 — upsertClinicalNote — Locked note cannot be modified

- **Setup:** note with `isLocked = true`.
- **Expected:** `ConflictException('NOTE_LOCKED')`.

### TC-MR-006 — addendum — Appends to locked note

- **Verify:** `clinicalNoteAddendum.create`.

### TC-MR-007 — createTreatment — Auto-increments sequence via aggregate

- **Verify:** `prisma.treatment.aggregate({ _max: { sequence } })` then `sequence: max+1`.

### TC-MR-008 — updateTreatment — Only within open encounter

- **Setup:** encounter `status = 'CLOSED'`.
- **Expected:** `ConflictException('ENCOUNTER_CLOSED')`.

### TC-MR-009 — deleteTreatment — Soft-delete, audit

- **Verify:** `update({ deletedAt: now })`.

### TC-MR-010 — upsertPrescription — Validates lines array

- **Setup:** DTO without `lines`.
- **Expected:** Zod validation error.

### TC-MR-011 — dentalChartSnapshot — Captures current chart state

- **Verify:** `prisma.dentalChart.create({ snapshot: true })`.