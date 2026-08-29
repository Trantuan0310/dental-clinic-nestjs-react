# Test Cases — Patients Module

> **Module:** Patients
> **Priority:** P0 — core data, soft-delete, merge business rule.
> **Test file:** `backend/src/patients/patients.service.spec.ts`

---

## 1. Purpose

Cover patient creation, updates (phone history, DOB override), lookup duplicate detection, soft-delete/restore, and merge.

## 2. Endpoints covered

| Endpoint | Method | Permission |
|---|---|---|
| `/api/v1/patients/lookup` | POST | `patient.read` |
| `/api/v1/patients` | GET | `patient.read` |
| `/api/v1/patients` | POST | `patient.create` |
| `/api/v1/patients/:id` | GET | `patient.read` |
| `/api/v1/patients/:id` | PATCH | `patient.update` |
| `/api/v1/patients/:id/override-dob` | POST | `patient.override_dob` |
| `/api/v1/patients/:id` | DELETE | `patient.delete` |
| `/api/v1/patients/:id/restore` | POST | `patient.restore` |
| `/api/v1/patients/:id/phones` | GET | `patient.read` |
| `/api/v1/patients/:id/identifiers` | POST | `patient.update` |
| `/api/v1/patients/:id/identifiers/:identifierId` | DELETE | `patient.update` |
| `/api/v1/patients/:id/merge` | POST | `patient.merge` |

## 3. Test cases

### TC-PAT-001 — lookup — Returns candidates with last visit info

- **Setup:** mock `encounter.findMany` for `batchLastVisit`.
- **Verify:** `result.candidates` is array, includes `lastVisitAt`.

### TC-PAT-002 — create — Validates unique phone & identifier

- **Setup:** duplicate phone.
- **Expected:** `ConflictException`.

### TC-PAT-003 — create — Persists phone history record

- **Verify:** `phoneHistory.create` called for new phone.

### TC-PAT-004 — update — Maintains phone history when phone changes

- **Expected:** old phone `phoneHistory.create({ validTo: now })`, new phone `phoneHistory.create({ validFrom: now })`.

### TC-PAT-005 — overrideDob — Requires reason, records audit

- **Verify:** `audit.log('DOB_OVERRIDDEN')`, patient DOB updated.

### TC-PAT-006 — delete — Soft-deletes patient (sets deletedAt)

- **Verify:** `update` with `deletedAt = now()`.

### TC-PAT-007 — restore — Restores soft-deleted patient

- **Verify:** `update` with `deletedAt = null`.

### TC-PAT-008 — merge — Transactional merge of source → target

- **Verify:** `prisma.$transaction` invoked; encounters/treatments/invoices reassigned; source soft-deleted; audit `PATIENT_MERGED`.

### TC-PAT-009 — merge — Throws if source == target

- **Expected:** `BadRequestException`.

### TC-PAT-010 — merge — Throws if either is already deleted

- **Expected:** `NotFoundException`.