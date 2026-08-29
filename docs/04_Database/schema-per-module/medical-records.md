# Schema — Medical Records Module

> **Module:** Medical Records
> **File này:** Chi tiết schema cho 9 bảng của Medical Records — module phức tạp nhất.
> **Đặc biệt:** Cross-module atomic transaction với Inventory (stock-out) và Billing (invoice draft) xảy ra tại Encounter close (xem [ADR-0008](../../ADR/0008-transactional-encounter-close.md)).
> **Ngày tạo:** 2026-07-13

---

## ERD module

```mermaid
erDiagram
  APPOINTMENTS ||--|| ENCOUNTERS : "1-1 (BD-0002)"
  PATIENTS ||--o{ ENCOUNTERS : has
  USERS ||--o{ ENCOUNTERS : "as dentist"

  ENCOUNTERS ||--|| CLINICAL_NOTES : has
  CLINICAL_NOTES ||--o{ CLINICAL_NOTE_ADDENDUMS : "amended by"
  ENCOUNTERS ||--o{ TREATMENTS : contains
  TREATMENTS ||--o{ TREATMENT_INVENTORY_USAGES : uses
  ENCOUNTERS ||--|| PRESCRIPTIONS : has
  PRESCRIPTIONS ||--o{ PRESCRIPTION_LINES : has
  ENCOUNTERS ||--|| DENTAL_CHART_SNAPSHOTS : has
  ENCOUNTERS ||--o{ ENCOUNTER_AUDITS : logged

  ENCOUNTERS {
    uuid id PK
    uuid appointment_id UK_FK
    uuid patient_id FK
    uuid dentist_id FK
    string status
    timestamptz started_at
    timestamptz closed_at
    text summary
    text chief_complaint
    text diagnosis
    text treatment_plan_text
    timestamptz cancelled_at
    uuid cancelled_by FK
    text cancelled_reason
    timestamptz created_at
    timestamptz updated_at
  }

  CLINICAL_NOTES {
    uuid id PK
    uuid encounter_id UK_FK
    text chief_complaint
    text diagnosis
    text treatment_plan
    text notes
    timestamptz created_at
    timestamptz updated_at
    uuid last_edited_by FK
    bool is_locked
    timestamptz locked_at
  }

  CLINICAL_NOTE_ADDENDUMS {
    uuid id PK
    uuid clinical_note_id FK
    text content
    uuid added_by FK
    timestamptz added_at
  }

  TREATMENTS {
    uuid id PK
    uuid encounter_id FK
    jsonb tooth_numbers
    text procedure
    text description
    decimal unit_price
    int duration_minutes
    int sequence
    timestamptz created_at
    timestamptz updated_at
    uuid created_by FK
    timestamptz deleted_at
  }

  TREATMENT_INVENTORY_USAGES {
    uuid id PK
    uuid treatment_id FK
    uuid inventory_item_id FK
    decimal quantity
    string unit
  }

  PRESCRIPTIONS {
    uuid id PK
    uuid encounter_id UK_FK
    text notes
    timestamptz created_at
    uuid created_by FK
    timestamptz deleted_at
  }

  PRESCRIPTION_LINES {
    uuid id PK
    uuid prescription_id FK
    int sequence
    string drug_name
    string dosage
    string frequency
    string duration
    text instructions
    timestamptz deleted_at
  }

  DENTAL_CHART_SNAPSHOTS {
    uuid id PK
    uuid encounter_id UK_FK
    string patient_type
    jsonb teeth
    timestamptz snapshot_at
    uuid snapshot_by FK
  }

  ENCOUNTER_AUDITS {
    uuid id PK
    uuid encounter_id FK
    string action
    uuid actor_id FK
    jsonb before
    jsonb after
    timestamptz occurred_at
  }
```

---

## Bảng 1: `encounters`

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `appointment_id` | UUID | NO | — | FK → `appointments.id`. UNIQUE (BR-MR-001: 1-1) |
| `patient_id` | UUID | NO | — | FK → `patients.id` |
| `dentist_id` | UUID | NO | — | FK → `users.id` (BS thực hiện) |
| `status` | VARCHAR(20) | NO | `'in_progress'` | enum: `in_progress`, `completed`, `cancelled`. BR-MR-003 |
| `started_at` | TIMESTAMPTZ | NO | `now()` | |
| `closed_at` | TIMESTAMPTZ | YES | NULL | Set khi status → completed (ADR-0008 atomic chain) |
| `summary` | TEXT | YES | NULL | Tóm tắt cuối encounter |
| `chief_complaint` | TEXT | YES | NULL | Lý do khám (snapshot từ ClinicalNote) |
| `diagnosis` | TEXT | YES | NULL | Snapshot từ ClinicalNote |
| `treatment_plan_text` | TEXT | YES | NULL | Snapshot từ ClinicalNote |
| `cancelled_at` | TIMESTAMPTZ | YES | NULL | Cascade cancel (BD-0008) |
| `cancelled_by` | UUID | YES | NULL | FK → `users.id` |
| `cancelled_reason` | TEXT | YES | NULL | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

### Indexes

```sql
-- 1-1 với appointment
CREATE UNIQUE INDEX idx_encounters_appointment ON encounters (appointment_id);

-- Lịch sử BN
CREATE INDEX idx_encounters_patient ON encounters (patient_id, started_at DESC);

-- Lịch sử BS
CREATE INDEX idx_encounters_dentist ON encounters (dentist_id, started_at DESC);

-- Auto-close hoặc report
CREATE INDEX idx_encounters_status ON encounters (status, started_at)
  WHERE status = 'in_progress';
```

### Constraints

```sql
ALTER TABLE encounters ADD CONSTRAINT chk_encounters_status
  CHECK (status IN ('in_progress', 'completed', 'cancelled'));

ALTER TABLE encounters ADD CONSTRAINT chk_encounters_closed_time
  CHECK ((status = 'completed' AND closed_at IS NOT NULL)
      OR (status != 'completed'));
```

### Sample queries

#### Active encounter của 1 BS

```sql
SELECT e.id, p.code, p.full_name, e.started_at
FROM encounters e
JOIN patients p ON p.id = e.patient_id
WHERE e.dentist_id = $1 AND e.status = 'in_progress'
ORDER BY e.started_at ASC;
```

---

## Bảng 2: `clinical_notes`

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `encounter_id` | UUID | NO | — | FK → `encounters.id`. UNIQUE. |
| `chief_complaint` | TEXT | YES | NULL | |
| `diagnosis` | TEXT | YES | NULL | |
| `treatment_plan` | TEXT | YES | NULL | |
| `notes` | TEXT | YES | NULL | Note thêm |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |
| `last_edited_by` | UUID | YES | NULL | FK → `users.id` |
| `is_locked` | BOOLEAN | NO | `false` | BR-MR-004: true sau khi encounter closed |
| `locked_at` | TIMESTAMPTZ | YES | NULL | Khi is_locked → true |

### Indexes

```sql
CREATE UNIQUE INDEX idx_clinical_notes_encounter ON clinical_notes (encounter_id);
```

---

## Bảng 3: `clinical_note_addendums`

Append-only (BR-MR-014). Sau khi ghi → không sửa.

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `clinical_note_id` | UUID | NO | — | FK → `clinical_notes.id` |
| `content` | TEXT | NO | — | |
| `added_by` | UUID | NO | — | FK → `users.id` |
| `added_at` | TIMESTAMPTZ | NO | `now()` | |

### Indexes

```sql
CREATE INDEX idx_addendums_note ON clinical_note_addendums (clinical_note_id, added_at DESC);
```

### Constraint thời gian

> BR-MR-005: chỉ ghi addendum trong **30 ngày** sau khi encounter closed.
> App layer check `now() - encounter.closed_at <= 30 days`. Không enforce DB.

---

## Bảng 4: `treatments`

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `encounter_id` | UUID | NO | — | FK → `encounters.id` |
| `tooth_numbers` | JSONB | YES | NULL | `string[]` FDI. VD: `["16", "17"]`. BR-MR-020 có thể rỗng. |
| `procedure` | TEXT | NO | — | VD: "Hàn composite", "Lấy cao răng" |
| `description` | TEXT | YES | NULL | Chi tiết |
| `unit_price` | DECIMAL(12,2) | NO | — | BR-MR-021 ≥ 0 |
| `duration_minutes` | INTEGER | YES | NULL | |
| `sequence` | INTEGER | NO | 0 | Thứ tự trong encounter |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |
| `created_by` | UUID | YES | NULL | FK → `users.id` (BS) |
| `deleted_at` | TIMESTAMPTZ | YES | NULL | |

### Indexes

```sql
CREATE INDEX idx_treatments_encounter ON treatments (encounter_id, sequence)
  WHERE deleted_at IS NULL;
```

### Constraints

```sql
ALTER TABLE treatments ADD CONSTRAINT chk_treatments_unit_price
  CHECK (unit_price >= 0);

ALTER TABLE treatments ADD CONSTRAINT chk_treatments_duration
  CHECK (duration_minutes IS NULL OR duration_minutes > 0);
```

---

## Bảng 5: `treatment_inventory_usages`

Bảng join: mỗi treatment dùng bao nhiêu vật tư nào. Snapshot cho encounter close (BR-INV-005).

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `treatment_id` | UUID | NO | — | FK → `treatments.id` |
| `inventory_item_id` | UUID | NO | — | FK → `inventory_items.id`. Reference-only, không enforce FK ON DELETE |
| `quantity` | DECIMAL(12,4) | NO | — | |
| `unit` | VARCHAR(20) | NO | — | BR-INV-010 free text. **Nên normalize (g, ml, cái, hộp)** |

> **Lưu ý về unit:** BR-INV-010 cho phép free text. Cross-module consistency: ưu tiên stock-out dựa trên `inventory_items.unit`. Nếu `treatment_inventory_usages.unit != inventory_items.unit` → cần convert hoặc log warning. App layer enforce (không DB).

### Indexes

```sql
CREATE INDEX idx_tiu_treatment ON treatment_inventory_usages (treatment_id);
CREATE INDEX idx_tiu_inventory ON treatment_inventory_usages (inventory_item_id);
```

---

## Bảng 6: `prescriptions`

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `encounter_id` | UUID | NO | — | FK → `encounters.id`. UNIQUE (BR-MR-012: ≥ 1 line). |
| `notes` | TEXT | YES | NULL | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `created_by` | UUID | YES | NULL | FK → `users.id` |
| `deleted_at` | TIMESTAMPTZ | YES | NULL | |

### Indexes

```sql
CREATE UNIQUE INDEX idx_prescriptions_encounter ON prescriptions (encounter_id)
  WHERE deleted_at IS NULL;
```

---

## Bảng 7: `prescription_lines`

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `prescription_id` | UUID | NO | — | FK → `prescriptions.id` |
| `sequence` | INTEGER | NO | 0 | Thứ tự trong toa |
| `drug_name` | VARCHAR(255) | NO | — | VD: "Paracetamol 500mg" |
| `dosage` | VARCHAR(100) | NO | — | VD: "1 viên" |
| `frequency` | VARCHAR(100) | NO | — | VD: "Khi đau, tối đa 3 lần/ngày" |
| `duration` | VARCHAR(100) | NO | — | VD: "3 ngày" |
| `instructions` | TEXT | YES | NULL | VD: "Uống sau ăn" |
| `deleted_at` | TIMESTAMPTZ | YES | NULL | |

### Indexes

```sql
CREATE INDEX idx_rx_lines ON prescription_lines (prescription_id, sequence)
  WHERE deleted_at IS NULL;
```

---

## Bảng 8: `dental_chart_snapshots`

Mỗi encounter lưu 1 snapshot 32 răng (BD-0005). Append-only cho mỗi encounter.

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `encounter_id` | UUID | NO | — | FK → `encounters.id`. UNIQUE |
| `patient_type` | VARCHAR(10) | NO | — | enum: `adult` (32 răng), `child` (20 răng sữa) |
| `teeth` | JSONB | NO | — | `{"16": "caries", "17": "filled", ...}`. BR-MR-006/007: FDI notation. |
| `snapshot_at` | TIMESTAMPTZ | NO | `now()` | |
| `snapshot_by` | UUID | YES | NULL | FK → `users.id` |

### Indexes

```sql
CREATE UNIQUE INDEX idx_dental_chart_encounter ON dental_chart_snapshots (encounter_id);
```

### Constraints

```sql
ALTER TABLE dental_chart_snapshots ADD CONSTRAINT chk_patient_type
  CHECK (patient_type IN ('adult', 'child'));
```

---

## Bảng 9: `encounter_audits`

Append-only log cho mọi thay đổi encounter (BR-MR-015).

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `encounter_id` | UUID | NO | — | FK → `encounters.id` |
| `action` | VARCHAR(50) | NO | — | enum-like: `created`, `clinical_note_updated`, `treatment_added`, `treatment_updated`, `treatment_deleted`, `prescription_added`, `prescription_updated`, `dental_chart_snapshotted`, `closed`, `cancelled`, `reopened` |
| `actor_id` | UUID | NO | — | FK → `users.id` |
| `before` | JSONB | YES | NULL | Snapshot state trước (cho update) |
| `after` | JSONB | YES | NULL | Snapshot state sau |
| `occurred_at` | TIMESTAMPTZ | NO | `now()` | |

### Indexes

```sql
CREATE INDEX idx_encounter_audits_encounter
  ON encounter_audits (encounter_id, occurred_at DESC);

CREATE INDEX idx_encounter_audits_action
  ON encounter_audits (action, occurred_at DESC);
```

> **BR-MR-015:** Append-only. Không UPDATE/DELETE. Có thể enforce bằng trigger (out-of-band DB) hoặc chỉ enforce ở application layer.

---

## Tổng kết số liệu

| Object | Count |
| ------ | :---: |
| Bảng | 9 |
| Indexes | 11 |
| Constraints | 4 |

---

## Cross-module atomic chain (ADR-0008)

Khi `POST /encounters/:id/close` được gọi, sequence sau chạy trong **1 transaction duy nhất**:

```
1. UPDATE encounters SET status = 'completed', closed_at, summary
2. UPDATE appointments SET status = 'completed'
3. INSERT encounter_audits (action = 'closed')
4. emit 'encounter.closed' (sync, in-process event)
   ├── Inventory handler validate stock + return movements data
   │   └── INSERT stock_movements + UPDATE inventory_items.quantity_on_hand
   └── Billing handler build invoice draft + return data
       └── INSERT invoices (status = draft)
5. UPDATE clinical_notes SET is_locked = true (optional, có thể ở step 1)
6. COMMIT (hoặc ROLLBACK nếu handler throw)
```

**Lưu ý:** Step 4 handlers KHÔNG tự INSERT (xem ADR-0008). Publisher INSERTs data trong cùng tx.

> **Implementation:** pattern này dùng Prisma `prisma.$transaction(async (tx) => {...})`. Handlers `await eventEmitter.emitAsync('encounter.closed', event)` và return data. Publisher dùng `tx` để INSERT.

---

## Open questions

| # | Câu hỏi | Default decision |
| - | ------- | ---------------- |
| 1 | `tooth_numbers` JSONB array vs bảng riêng? | JSONB (free-form array) |
| 2 | ClinicalNote có cần lưu version (optimistic lock)? | DB không có; dùng `updated_at` ở app layer |
| 3 | `encounter_audits.before`/`after` có cần schema enforce? | JSONB free, app define |
| 4 | `dental_chart_snapshots.teeth` validate 32 răng cho adult ở DB? | App layer (JSONB không có schema) |

---

## Related

- [SPEC MedicalRecords](../../03_Specification/MedicalRecords/SPEC.md)
- [ADR-0008: Transactional Encounter Close](../../ADR/0008-transactional-encounter-close.md)
- [BD-0005: Medical Record MVP scope](../../01_Architecture/business-decisions.md#bd-0005--medical-record-mvp-đầy-đủ-clinical-core-không-có-hình-ảnh)
- [BD-0008: Cascade Cancel](../../01_Architecture/business-decisions.md#bd-0008--cascade-cancel-appointment--encounter)
