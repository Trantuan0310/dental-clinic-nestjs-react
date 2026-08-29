# API — Medical Records Module

> **Module:** Medical Records (Encounter, Clinical Note, Treatment, Prescription, Dental Chart)
> **Base:** Kế thừa toàn bộ quy ước từ [`api-conventions.md`](./api-conventions.md).
> **Ngày tạo:** 2026-07-13

---

## Base path

```
/api/v1/encounters                                  — CRUD + actions
/api/v1/encounters/:id/clinical-note                — Clinical note (1 per encounter)
/api/v1/encounters/:id/clinical-note/addendums      — Addendums (sau close)
/api/v1/encounters/:id/treatments                   — Treatment lines
/api/v1/encounters/:id/prescriptions                — Prescriptions
/api/v1/encounters/:id/dental-chart                 — Dental chart snapshot
/api/v1/encounters/:id/close                       — Action (atomic)
/api/v1/encounters/:id/cancel                       — Action (cascade from appt cancel)
/api/v1/patients/:id/encounters                     — Cross-module helper
```

---

## 1. Encounter CRUD

### 1.1 `GET /api/v1/encounters`

**Auth:** Login required
**Permission:** `encounter.read`

**Query:**
| Param | Type | Default | Description |
| ----- | ---- | :-----: | ----------- |
| `patientId` | uuid | — | Filter |
| `dentistId` | uuid | — | Filter |
| `status` | enum | — | `in_progress` \| `closed` \| `cancelled` |
| `from` | date | — | Date range start |
| `to` | date | — | Date range end |
| `pageSize` | int | 20 | — |
| `cursor` | string | — | Cursor pagination |
| `sort` | string | `startedAt:desc` | — |

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "patientId": "uuid",
      "patientCode": "PAT-2026-00046",
      "patientName": "Nguyen Van A",
      "dentistId": "uuid",
      "dentistName": "BS. Trần Thị B",
      "appointmentId": "uuid",
      "startedAt": "2026-07-15T09:00:00Z",
      "closedAt": "2026-07-15T09:45:00Z",
      "status": "closed",
      "chiefComplaint": "Đau răng 26",
      "diagnosis": "Sâu răng 26, viêm tủy không hồi phục",
      "treatmentLineCount": 2,
      "isLocked": true
    }
  ],
  "pagination": { ... }
}
```

---

### 1.2 `POST /api/v1/encounters`

**Auth:** Login required
**Permission:** `encounter.create` (Dentist)

> **Thường được tạo qua `POST /appointments/:id/start`** (xem API Appointments §1.8). Endpoint này cho phép tạo encounter walk-in không qua appointment (vd cấp cứu).

**Request:**
```json
{
  "patientId": "uuid",
  "appointmentId": "uuid-optional",
  "chiefComplaint": "Đau răng dữ dội từ sáng",
  "walkIn": true
}
```

**Validation:**
- `patientId`: required, active
- `appointmentId`: optional
- Nếu `appointmentId` được truyền vào, kiểm tra chưa có encounter khác (1:1, BD-0002)
- `walkIn = true` chỉ Dentist mới dùng

**Side effect:**
- Tạo encounter `in_progress`
- Liên kết với appointment nếu có

**Response 201:**
```json
{
  "data": {
    "id": "uuid",
    "patientId": "uuid",
    "appointmentId": "uuid",
    "dentistId": "uuid-from-current-user",
    "status": "in_progress",
    "startedAt": "2026-07-15T09:00:00Z",
    "isLocked": false
  }
}
```

---

### 1.3 `GET /api/v1/encounters/:id`

**Auth:** Login required
**Permission:** `encounter.read`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "patient": { "id": "uuid", "code": "PAT-2026-00046", "fullName": "...", "allergies": [...] },
    "dentist": { "id": "uuid", "fullName": "BS. Trần Thị B" },
    "appointmentId": "uuid-or-null",
    "status": "in_progress",
    "startedAt": "2026-07-15T09:00:00Z",
    "closedAt": null,
    "chiefComplaint": "Đau răng 26",
    "diagnosis": null,
    "clinicalNote": { ... },
    "treatments": [ ... ],
    "prescriptions": [ ... ],
    "dentalChartSnapshotId": "uuid-or-null",
    "cancelledAt": null,
    "cancellationReason": null,
    "isLocked": false,
    "lockedAt": null,
    "createdAt": "2026-07-15T09:00:00Z",
    "updatedAt": "2026-07-15T09:30:00Z"
  }
}
```

---

### 1.4 `PATCH /api/v1/encounters/:id`

**Auth:** Login required
**Permission:** `encounter.update` (Dentist)

> **Allowed update:** `chiefComplaint`, `diagnosis` ONLY while `status = in_progress`.
> **Locked khi status = closed** (immutable — BR-MR-001).

**Request:**
```json
{
  "chiefComplaint": "Đau răng 26, kèm sưng nướu",
  "diagnosis": "Sâu răng 26, viêm tủy không hồi phục"
}
```

**Response 200:** encounter object

**Response 409:** "Encounter is locked"

---

### 1.5 `POST /api/v1/encounters/:id/close`

**Auth:** Login required
**Permission:** `encounter.create` (Dentist)

**Idempotency:** Required

**Request:**
```json
{
  "diagnosis": "Sâu răng 26, viêm tủy không hồi phục",
  "finalNotes": "Bệnh nhân hẹn 1 tuần sau để làm mão"
}
```

**Validation:**
- Status phải `in_progress`
- Phải có ít nhất 1 trong:
  - Clinical note có nội dung
  - Treatment items > 0
- Có ít nhất 1 dentist xác nhận (current user)
- Nếu có treatment lines, mỗi line phải có giá (price cents) — sẽ dùng cho billing

**Side effect (ATOMIC — ADR-0008):**

**Sequence (xem SPEC §2.6 đã fix + SPEC.md sequence đã chuẩn theo ADR-0008):**

1. Set encounter `status = closed`, `closed_at = now()`, `is_locked = true`
2. Snapshot dental chart (nếu đã tạo)
3. Phát 1 transaction event `EncounterClosed`:
   - **Inventory subscriber:** consume `EncounterClosed` → tạo `stock_movements` (out) cho từng `treatment_inventory_usages` line. Trigger BR-INV-004/005.
4. Trong CÙNG transaction:
   - **Billing subscriber:** tạo invoice draft từ treatments. Status = `draft`. Receptionist review sau.
5. Commit

**Audit:** `encounter_closed` (+ metadata: totalTreatments, stockOutCount, invoiceDraftId)

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "status": "closed",
    "closedAt": "2026-07-15T09:45:00Z",
    "isLocked": true,
    "sideEffects": {
      "stockMovementsCreated": 2,
      "invoiceDraftId": "uuid-draft-invoice",
      "treatmentCount": 2
    }
  }
}
```

**Response 422:**
- "Encounter must have clinical note or treatments before closing"
- "All treatment lines must have price"

---

### 1.6 `POST /api/v1/encounters/:id/cancel`

**Auth:** Login required
**Permission:** `encounter.create` (Dentist + Admin — thường cascade từ appointment cancel)

**Request:**
```json
{
  "reason": "Bệnh nhân hủy giờ hẹn"
}
```

**Side effect (BR-MR-026, BD-0008):**
- Set `status = cancelled`, `cancelled_at = now()`
- Set `cancellation_reason`
- **Không cascade tạo invoice / stock-out** (vì encounter huỷ)

**Response 200:** encounter object

**Response 409:** "Cannot cancel closed encounter"

---

## 2. Clinical Note

### 2.1 `GET /api/v1/encounters/:id/clinical-note`

**Auth:** Login required
**Permission:** `encounter.read`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "encounterId": "uuid",
    "subjective": "Bệnh nhân than đau nhức răng 26 từ 3 ngày trước, tăng khi ăn nóng lạnh",
    "objective": "Răng 26 có lỗ sâu mặt nhai, thử nóng lạnh (+), gõ ngang (+), gõ dọc (-)",
    "assessment": "Sâu răng 26, viêm tủy không hồi phục",
    "plan": "Điều trị tủy + mão sứ. Bệnh nhân đồng ý. Hẹn 1 tuần sau làm mão.",
    "rawNotes": "PA x-quang: có thấu quang chóp răng 26, mô quanh chóp bình thường",
    "isLocked": false,
    "createdByUserId": "uuid-dentist",
    "createdAt": "2026-07-15T09:10:00Z",
    "updatedAt": "2026-07-15T09:35:00Z"
  }
}
```

> **Lưu ý:** Field `rawNotes` chỉ Dentist admin mới thấy (BR-MR-018). Receptionist thấy null.

---

### 2.2 `PUT /api/v1/encounters/:id/clinical-note`

**Auth:** Login required
**Permission:** `encounter.create` (Dentist)

> **Upsert pattern:** Nếu chưa có → tạo. Có → cập nhật (chỉ khi encounter còn `in_progress`).

**Request:**
```json
{
  "subjective": "...",
  "objective": "...",
  "assessment": "...",
  "plan": "...",
  "rawNotes": "PA: thấu quang chóp 26..."
}
```

**Response 200:** clinical note object

**Response 409:** "Encounter is locked"

---

### 2.3 `POST /api/v1/encounters/:id/clinical-note/addendums`

**Auth:** Login required
**Permission:** `encounter.create` (Dentist)

**Idempotency:** Required

**Request:**
```json
{
  "text": "Bổ sung: Bệnh nhân có tiền sử dị ứng với penicillin (đã cập nhật vào patient.allergies)",
  "reason": "Bệnh nhân khai báo thêm"
}
```

**Validation:**
- Encounter phải `closed`
- **now - closedAt ≤ 30 ngày** (BR-MR-019)

**Response 201:**
```json
{
  "data": {
    "id": "uuid",
    "encounterId": "uuid",
    "authorUserId": "uuid-dentist",
    "text": "...",
    "reason": "...",
    "addedAt": "2026-07-16T08:00:00Z"
  }
}
```

**Response 422:**
- "Encounter not yet closed"
- "Addendum window exceeded (30 days)"

---

### 2.4 `GET /api/v1/encounters/:id/clinical-note/addendums`

**Auth:** Login required
**Permission:** `encounter.read`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "text": "...",
      "reason": "...",
      "authorUserId": "uuid",
      "authorName": "BS. Trần Thị B",
      "addedAt": "2026-07-16T08:00:00Z"
    }
  ]
}
```

---

## 3. Treatments

### 3.1 `GET /api/v1/encounters/:id/treatments`

**Auth:** Login required
**Permission:** `encounter.read`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "encounterId": "uuid",
      "toothNumber": 26,
      "treatmentCode": "ENDO_ROOT",
      "treatmentName": "Điều trị tủy răng 26",
      "description": "Lấy tủy buồng + 3 ống tủy, bơm gutta-percha",
      "priceCents": 3500000,
      "currency": "VND",
      "quantity": 1,
      "lineTotalCents": 3500000,
      "inventoryItemsUsed": [
        {
          "inventoryItemId": "uuid-gutta",
          "inventoryItemName": "Gutta-percha 30#",
          "quantityUsed": 3
        }
      ],
      "performedAt": "2026-07-15T09:30:00Z",
      "performedByUserId": "uuid-dentist"
    }
  ]
}
```

---

### 3.2 `POST /api/v1/encounters/:id/treatments`

**Auth:** Login required
**Permission:** `encounter.create` (Dentist)

**Request:**
```json
{
  "toothNumber": 26,
  "treatmentCode": "ENDO_ROOT",
  "description": "Lấy tủy buồng + 3 ống tủy, bơm gutta-percha",
  "priceCents": 3500000,
  "quantity": 1,
  "inventoryItemsUsed": [
    { "inventoryItemId": "uuid-gutta", "quantityUsed": 3 }
  ]
}
```

**Validation:**
- Encounter phải `in_progress`
- `toothNumber`: 1-32 (răng người, hệ FDI)
- `treatmentCode`: enum hoặc string (1-50)
- `priceCents`: ≥ 0
- `quantity`: ≥ 1
- `inventoryItemsUsed[].quantityUsed`: ≥ 1

**Validation kho (BR-MR-022, BR-INV-004):**
- Mỗi inventory item phải đủ số lượng `quantityUsed` để "reserved"
- Reservation KHÔNG trừ kho ngay — chỉ "reserve"
- Stock thực sự OUT khi encounter close (xem 1.5)

**Side effect:**
- Tạo treatment line
- Reserve inventory (insert `treatment_inventory_usages` row + update reservation)
- Audit `treatment_added`

**Response 201:** treatment object

**Response 422:**
- "Insufficient stock for item X"
- "Inventory item not active"

---

### 3.3 `PATCH /api/v1/treatments/:id`

**Auth:** Login required
**Permission:** `encounter.create` (Dentist)

> Chỉ update được khi encounter còn `in_progress`.

**Request (subset):**
```json
{
  "description": "...",
  "quantity": 2,
  "inventoryItemsUsed": [...]
}
```

**Side effect:** re-calculate reservation

**Response 200:** treatment object

---

### 3.4 `DELETE /api/v1/treatments/:id`

**Auth:** Login required
**Permission:** `encounter.create`

**Idempotency:** Required

**Side effect:**
- Release reservation
- Soft-delete
- Audit `treatment_removed`

**Response 204**

---

## 4. Prescriptions

### 4.1 `GET /api/v1/encounters/:id/prescriptions`

**Auth:** Login required
**Permission:** `encounter.read`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "encounterId": "uuid",
      "note": "Uống sau ăn. Tránh uống rượu.",
      "lines": [
        {
          "id": "uuid",
          "drugName": "Amoxicillin 500mg",
          "dosage": "500mg",
          "frequency": "3 lần/ngày",
          "durationDays": 5,
          "quantity": 15,
          "instructions": "Mỗi lần 1 viên, sau ăn",
          "isAllergyWarning": false
        }
      ],
      "issuedByUserId": "uuid-dentist",
      "issuedAt": "2026-07-15T09:35:00Z",
      "isLocked": false
    }
  ]
}
```

---

### 4.2 `POST /api/v1/encounters/:id/prescriptions`

**Auth:** Login required
**Permission:** `encounter.create` (Dentist)

**Request:**
```json
{
  "note": "Uống sau ăn. Tránh uống rượu.",
  "lines": [
    {
      "drugName": "Amoxicillin 500mg",
      "dosage": "500mg",
      "frequency": "3 lần/ngày",
      "durationDays": 5,
      "quantity": 15,
      "instructions": "..."
    },
    {
      "drugName": "Paracetamol 500mg",
      "dosage": "500mg",
      "frequency": "Khi đau, tối đa 3 lần/ngày",
      "durationDays": 5,
      "quantity": 10
    }
  ]
}
```

**Validation:**
- Encounter phải `in_progress`
- `lines[].drugName`: 1-200 chars
- `lines[].dosage`: 1-100 chars
- `lines[].frequency`: 1-200 chars
- `lines[].durationDays`: ≥ 1, ≤ 30
- `lines[].quantity`: ≥ 1
- `lines[]` không trống

**Side effect — DRUG INTERACTION / ALLERGY CHECK (BR-MR-015):**
- So `drugName` với patient.allergies
- So drug-drug interaction (basic MVP rules — table small)
- Nếu có warning: response vẫn 201 nhưng cờ `warnings[]` đi kèm

**Response 201:**
```json
{
  "data": {
    "id": "uuid",
    "lines": [...],
    "warnings": [
      {
        "type": "allergy",
        "severity": "high",
        "message": "Bệnh nhân có tiền sử dị ứng với Amoxicillin (Penicillin)",
        "lineIndex": 0
      }
    ]
  }
}
```

---

### 4.3 `PATCH /api/v1/prescriptions/:id`

Tương tự PUT clinical-note. Cho phép update khi encounter còn `in_progress`.

### 4.4 `DELETE /api/v1/prescriptions/:id`

Soft-delete. Trả 204.

---

## 5. Dental Chart

### 5.1 `GET /api/v1/encounters/:id/dental-chart`

**Auth:** Login required
**Permission:** `encounter.read`

**Response 200:**
```json
{
  "data": {
    "id": "uuid",
    "encounterId": "uuid",
    "snapshot": {
      "teeth": {
        "11": { "status": "healthy", "notes": "" },
        "16": { "status": "cavity", "notes": "Sâu mặt nhai" },
        "26": { "status": "filled", "notes": "Đã điều trị tủy" },
        "46": { "status": "missing", "notes": "Mất từ lâu" },
        "...": {}
      },
      "schemaVersion": "1.0",
      "capturedAt": "2026-07-15T09:45:00Z"
    },
    "capturedByUserId": "uuid-dentist"
  }
}
```

---

### 5.2 `PUT /api/v1/encounters/:id/dental-chart`

**Auth:** Login required
**Permission:** `encounter.create` (Dentist)

**Request:**
```json
{
  "teeth": {
    "11": { "status": "healthy", "notes": "" },
    "16": { "status": "cavity", "notes": "Sâu mặt nhai" },
    "26": { "status": "filled", "notes": "Đã điều trị tủy" },
    "...": {}
  }
}
```

**Validation (BR-MR-009, BD-0005):**
- Phải có đủ 32 răng (1-32, hệ FDI)
- `teeth[i].status`: enum `healthy` \| `cavity` \| `filled` \| `crowned` \| `missing` \| `implant` \| `extraction_needed`
- `teeth[i].notes`: 0-200 chars
- Mỗi răng chỉ 1 status chính

**Side effect (BD-0005):**
- Snapshot toàn bộ 32 răng (JSONB)
- Ghi vào `dental_chart_snapshots` table
- Mỗi encounter chỉ có 1 snapshot (UNIQUE constraint ở `encounterId`)

**Response 200:** snapshot object

---

## 6. Validation rules (MedicalRecords-specific)

| Field | Rule |
| ----- | ---- |
| `toothNumber` | integer 1-32 |
| `treatmentCode` | enum or string 1-50 |
| `priceCents` | integer ≥ 0, > patient wallet balance (n/a MVP) |
| `quantity` | integer ≥ 1 |
| `dosage` | string 1-100 |
| `durationDays` | integer 1-30 |
| `drugName` | string 1-200 |
| `teeth[i].status` | enum 7 giá trị |

---

## 7. Error responses (MedicalRecords-specific)

| Status | Title | Khi nào |
| :----: | ----- | ------- |
| 409 | Encounter is locked | BR-MR-001 |
| 409 | Encounter already has clinical note | (PUT overwrite OK) |
| 422 | Allergies warning | (warning, not error) |
| 422 | Insufficient inventory | BR-INV-004 |
| 422 | Tooth number out of range 1-32 | BR-MR-009 |
| 422 | Addendum window exceeded | BR-MR-019 (30 days) |
| 422 | Encounter has no treatments or note | BR-MR-022 |
| 422 | Treatment price required | BR-MR-025 (để generate invoice) |

---

## 8. Cross-module events (ADR-0008)

| Event | Publisher | Subscriber | Action |
| ----- | --------- | ---------- | ------ |
| `EncounterClosed` | MedicalRecords (close) | Inventory | Tạo stock_movements (out) cho treatment inventory usage. BR-INV-004/005 |
| `EncounterClosed` | MedicalRecords (close) | Billing | Auto tạo invoice draft. BR-BILL-001 |
| `EncounterCancelled` | MedicalRecords / Appointments (cancel) | — | (chỉ audit, không cascade stock/invoice) |

> **Atomic guarantee:** Tất cả 3 bước (encounter close + stock out + invoice draft) chung 1 DB transaction. Nếu 1 bước fail → rollback tất cả (xem ADR-0008).

---

## 9. Idempotency

| Endpoint | Required |
| -------- | :------: |
| `POST /encounters/:id/close` | ✅ |
| `POST /encounters/:id/cancel` | ✅ |
| `PUT /encounters/:id/clinical-note` | Optional |
| `POST /encounters/:id/clinical-note/addendums` | ✅ |
| `POST /encounters/:id/treatments` | Optional |
| `DELETE /treatments/:id` | ✅ |
| `POST /encounters/:id/prescriptions` | Optional |
| `PUT /encounters/:id/dental-chart` | Optional |

---

## 10. Audit log mapping

| Action | Trigger |
| ------ | ------- |
| `encounter_created` | POST /encounters |
| `encounter_updated` | PATCH /encounters/:id |
| `encounter_started` | (POST /appointments/:id/start) |
| `encounter_closed` | POST /encounters/:id/close |
| `encounter_cancelled` | POST /encounters/:id/cancel (hoặc cascade) |
| `clinical_note_added` | PUT /encounters/:id/clinical-note |
| `clinical_note_addendum_added` | POST /encounters/:id/clinical-note/addendums |
| `treatment_added` | POST /encounters/:id/treatments |
| `treatment_updated` | PATCH /treatments/:id |
| `treatment_removed` | DELETE /treatments/:id |
| `prescription_issued` | POST /encounters/:id/prescriptions |
| `dental_chart_snapshot` | PUT /encounters/:id/dental-chart |

---

## Related

- [api-conventions.md](./api-conventions.md)
- [SPEC Medical Records](../03_Specification/MedicalRecords/SPEC.md)
- [BD-0002: 1 Appt = 1 Encounter](../01_Architecture/business-decisions.md#bd-0002)
- [BD-0005: Dental Chart snapshot](../01_Architecture/business-decisions.md#bd-0005)
- [BD-0008: Cascade Cancellation](../01_Architecture/business-decisions.md#bd-0008)
- [ADR-0007: Cross-module event bus](../ADR/0007-cross-module-event-bus.md)
- [ADR-0008: Transactional encounter close](../ADR/0008-transactional-encounter-close.md)
- [Schema Medical Records](../04_Database/schema-per-module/medical-records.md)