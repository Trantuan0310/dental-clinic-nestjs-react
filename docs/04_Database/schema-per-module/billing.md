# Schema — Billing Module

> **Module:** Billing
> **File này:** Chi tiết schema cho 4 bảng của Billing.
> **Đặc biệt:** Invoice tự động sinh từ `encounter.closed` event (BR-BILL-019), subscription pattern xem [ADR-0007](../../ADR/0007-cross-module-event-bus.md) + [ADR-0008](../../ADR/0008-transactional-encounter-close.md).
> **Ngày tạo:** 2026-07-13

---

## ERD module

```mermaid
erDiagram
  ENCOUNTERS ||--|| INVOICES : "1-1 (auto-create)"
  PATIENTS ||--o{ INVOICES : billed
  USERS ||--o{ INVOICES : "issued by"
  INVOICES ||--o{ INVOICE_ITEMS : contains
  TREATMENTS ||--o{ INVOICE_ITEMS : "snapshotted from"
  INVOICES ||--o{ PAYMENTS : paid_by
  USERS ||--o{ PAYMENTS : "received by"
  INVOICES ||--o{ INVOICE_AUDITS : logged

  INVOICES {
    uuid id PK
    string code UK
    uuid encounter_id UK_FK
    uuid patient_id FK
    string status
    decimal subtotal
    string discount_type
    decimal discount_value
    decimal total
    decimal paid_amount
    decimal outstanding_amount
    text notes
    timestamptz issued_at
    uuid issued_by FK
    timestamptz voided_at
    uuid voided_by FK
    text void_reason
    timestamptz created_at
    timestamptz updated_at
    uuid created_by FK
    int version
    timestamptz deleted_at
  }

  INVOICE_ITEMS {
    uuid id PK
    uuid invoice_id FK
    uuid treatment_id FK
    int sequence
    text description
    decimal quantity
    decimal unit_price
    decimal line_total
    timestamptz deleted_at
  }

  PAYMENTS {
    uuid id PK
    uuid invoice_id FK
    decimal amount
    string method
    string status
    timestamptz paid_at
    text note
    uuid received_by FK
    timestamptz created_at
  }

  INVOICE_AUDITS {
    uuid id PK
    uuid invoice_id FK
    string action
    uuid actor_id FK
    jsonb before
    jsonb after
    timestamptz occurred_at
  }
```

---

## Bảng 1: `invoices`

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `code` | VARCHAR(20) | NO | — | `INV-YYYY-NNNNN`. Unique. |
| `encounter_id` | UUID | NO | — | FK → `encounters.id`. UNIQUE (BR-BILL-002: 1 Invoice = 1 Encounter) |
| `patient_id` | UUID | NO | — | FK → `patients.id` (denormalized cho query nhanh) |
| `status` | VARCHAR(20) | NO | `'draft'` | enum: `draft`, `issued`, `partial`, `paid`, `voided` |
| `subtotal` | DECIMAL(12,2) | NO | 0 | Tổng trước discount |
| `discount_type` | VARCHAR(10) | YES | NULL | enum: `percent`, `amount`, NULL |
| `discount_value` | DECIMAL(12,2) | YES | NULL | |
| `total` | DECIMAL(12,2) | NO | 0 | subtotal - discount |
| `paid_amount` | DECIMAL(12,2) | NO | 0 | BR-BILL-009 |
| `outstanding_amount` | DECIMAL(12,2) | NO | 0 | total - paid_amount |
| `notes` | TEXT | YES | NULL | |
| `issued_at` | TIMESTAMPTZ | YES | NULL | Khi draft → issued |
| `issued_by` | UUID | YES | NULL | FK → `users.id` |
| `voided_at` | TIMESTAMPTZ | YES | NULL | Khi status → voided |
| `voided_by` | UUID | YES | NULL | FK → `users.id` |
| `void_reason` | TEXT | YES | NULL | BR-BILL-015 |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |
| `created_by` | UUID | YES | NULL | FK → `users.id` |
| `version` | INTEGER | NO | 0 | Optimistic lock — concurrent payment (BR-BILL edge case) |
| `deleted_at` | TIMESTAMPTZ | YES | NULL | |

### Indexes

```sql
-- Code unique
CREATE UNIQUE INDEX idx_invoices_code ON invoices (code) WHERE deleted_at IS NULL;

-- 1-1 encounter
CREATE UNIQUE INDEX idx_invoices_encounter ON invoices (encounter_id) WHERE deleted_at IS NULL;

-- Lịch sử BN
CREATE INDEX idx_invoices_patient ON invoices (patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Báo cáo công nợ (BR)
CREATE INDEX idx_invoices_outstanding ON invoices (status, outstanding_amount)
  WHERE status = 'partial' AND deleted_at IS NULL;

-- Report doanh thu theo ngày
CREATE INDEX idx_invoices_paid_at ON invoices (paid_amount, issued_at)
  WHERE status = 'paid' AND deleted_at IS NULL;
```

### Constraints

```sql
ALTER TABLE invoices ADD CONSTRAINT chk_invoice_status
  CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'voided'));

ALTER TABLE invoices ADD CONSTRAINT chk_invoice_amounts
  CHECK (
    paid_amount >= 0 AND paid_amount <= total
    AND outstanding_amount = total - paid_amount
    AND outstanding_amount >= 0
  );

ALTER TABLE invoices ADD CONSTRAINT chk_invoice_discount
  CHECK (
    (discount_type IS NULL AND discount_value IS NULL)
    OR (discount_type IN ('percent', 'amount') AND discount_value > 0)
  );

ALTER TABLE invoices ADD CONSTRAINT chk_invoice_status_amounts
  CHECK (
    (status = 'draft' AND paid_amount = 0)
    OR (status = 'issued' AND paid_amount = 0)
    OR (status = 'partial' AND paid_amount > 0 AND paid_amount < total)
    OR (status = 'paid' AND paid_amount = total)
    OR (status = 'voided')
  );
```

### State transitions (BR-BILL-006, BR-BILL-007, BR-BILL-008)

```
draft → issued → partial → paid
       ↘ (voided - BR-BILL-015 block nếu có payment)
```

---

## Bảng 2: `invoice_items`

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `invoice_id` | UUID | NO | — | FK → `invoices.id` |
| `treatment_id` | UUID | YES | NULL | FK → `treatments.id`. NULL cho custom item (lễ tân add) |
| `sequence` | INTEGER | NO | 0 | |
| `description` | TEXT | NO | — | Snapshot treatment.procedure (immutable nếu từ treatment) |
| `quantity` | DECIMAL(8,2) | NO | 1 | |
| `unit_price` | DECIMAL(12,2) | NO | — | Snapshot treatment.unit_price |
| `line_total` | DECIMAL(12,2) | NO | — | quantity * unit_price |
| `deleted_at` | TIMESTAMPTZ | YES | NULL | |

### Indexes

```sql
CREATE INDEX idx_invoice_items_invoice ON invoice_items (invoice_id, sequence)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_invoice_items_treatment ON invoice_items (treatment_id);
```

### Constraints

```sql
ALTER TABLE invoice_items ADD CONSTRAINT chk_item_qty
  CHECK (quantity > 0);

ALTER TABLE invoice_items ADD CONSTRAINT chk_item_price
  CHECK (unit_price >= 0);
```

> **Snapshot vs reference:** Khi auto-create invoice từ encounter, description + unit_price **copy từ treatment** (snapshot). Sau khi invoice đã issued (BR-BILL-007), item không thay đổi từ treatment. Nếu encounter reopen → invoice phải void + tạo mới.

---

## Bảng 3: `payments`

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `invoice_id` | UUID | NO | — | FK → `invoices.id` |
| `amount` | DECIMAL(12,2) | NO | — | BR-BILL-009: > 0, ≤ outstanding |
| `method` | VARCHAR(20) | NO | — | enum: `cash`, `bank_transfer` |
| `status` | VARCHAR(20) | NO | `'completed'` | enum: `completed`, `voided` (cho future reversal) |
| `paid_at` | TIMESTAMPTZ | NO | `now()` | |
| `note` | TEXT | YES | NULL | |
| `received_by` | UUID | NO | — | FK → `users.id` (lễ tân) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

### Indexes

```sql
CREATE INDEX idx_payments_invoice ON payments (invoice_id, paid_at DESC);
CREATE INDEX idx_payments_received_by ON payments (received_by, paid_at DESC)
  WHERE received_by IS NOT NULL;
```

### Constraints

```sql
ALTER TABLE payments ADD CONSTRAINT chk_payment_amount
  CHECK (amount > 0);

ALTER TABLE payments ADD CONSTRAINT chk_payment_method
  CHECK (method IN ('cash', 'bank_transfer'));

ALTER TABLE payments ADD CONSTRAINT chk_payment_status
  CHECK (status IN ('completed', 'voided'));
```

### Sample query (invoice updated to new status after payment)

```sql
-- Inside prisma transaction
SELECT i.total, i.paid_amount, i.outstanding_amount, i.status, i.version
FROM invoices i
WHERE i.id = $1 AND i.deleted_at IS NULL
FOR UPDATE;  -- row lock

-- App layer validate:
-- amount <= outstanding
-- Then UPDATE invoice SET paid_amount = paid_amount + $new, outstanding, status, version++

INSERT INTO payments (..., amount, method, ...);

-- Audit
INSERT INTO invoice_audits (... action = 'payment_received', before, after);
```

---

## Bảng 4: `invoice_audits`

Append-only log cho mọi thay đổi invoice.

### Columns

| Column | Type | Null | Default | Comment |
| ------ | ---- | :--: | ------- | ------- |
| `id` | UUID v7 | NO | `uuidv7()` | PK |
| `invoice_id` | UUID | NO | — | FK → `invoices.id` |
| `action` | VARCHAR(50) | NO | — | enum-like: `auto_created`, `updated`, `issued`, `voided`, `payment_received`, `payment_voided` |
| `actor_id` | UUID | YES | NULL | FK → `users.id`. NULL nếu system (auto_created) |
| `before` | JSONB | YES | NULL | Snapshot trước |
| `after` | JSONB | YES | NULL | Snapshot sau |
| `occurred_at` | TIMESTAMPTZ | NO | `now()` | |

### Indexes

```sql
CREATE INDEX idx_invoice_audits_invoice ON invoice_audits (invoice_id, occurred_at DESC);
```

---

## Tổng kết số liệu

| Object | Count |
| ------ | :---: |
| Bảng | 4 |
| Indexes | 8 |
| Constraints | 7 |

---

## Cross-module chain

Khi encounter đóng (BR-MR-018 + ADR-0008), trong cùng transaction:

```sql
-- (MedicalRecords đã UPDATE encounters + appointments)
-- (Inventory đã INSERT stock_movements + UPDATE inventory_items)

-- Billing handler return invoice data, publisher INSERTs:
INSERT INTO invoices (
  id, code, encounter_id, patient_id, status,
  subtotal, total, paid_amount, outstanding_amount,
  created_by, created_at
)
-- subtotal = sum(treatments.unit_price)
-- total = subtotal (no discount at auto-create)
-- status = 'draft'

INSERT INTO invoice_items (...)
-- 1 item per treatment, snapshot từ treatment.procedure + unit_price

INSERT INTO invoice_audits (
  ..., action = 'auto_created', actor_id = NULL
)
```

---

## Open questions

| # | Câu hỏi | Default decision |
| - | ------- | ---------------- |
| 1 | `payment.method` có cần thêm `card`, `e_wallet` sau? | MVP: cash + bank_transfer. Thêm sau. |
| 2 | `payments.status = voided` dùng cho refund/reversal — có cần MVP không? | MVP: skip (BR-BILL-015 block void invoice có payment) |
| 3 | Invoice code `INV-YYYY-NNNNN` — sequence per year hay per clinic? | Per clinic (1 sequence) |

---

## Related

- [SPEC Billing](../../03_Specification/Billing/SPEC.md)
- [BD-0003: No deposit for MVP](../../01_Architecture/business-decisions.md#bd-0003--thanh-toán-sau-khi-khám-không-đặt-cọc)
- [ADR-0007: Cross-Module Event Bus](../../ADR/0007-cross-module-event-bus.md)
- [ADR-0008: Transactional Encounter Close](../../ADR/0008-transactional-encounter-close.md)
