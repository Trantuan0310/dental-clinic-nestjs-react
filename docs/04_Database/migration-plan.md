# Migration Plan — Dental Clinic DB

> **Mục đích:** Thứ tự tạo migration, seed data, và quy trình áp dụng.
> **Tool:** Prisma Migrate + raw SQL migration (cho exclusion constraints, partial indexes).
> **Ngày tạo:** 2026-07-13

---

## Tổng quan

| Migration | Module | Type | Critical? |
| --------- | ------ | :--: | :-------: |
| M00 | extensions + uuid-ossp + pg_trgm + btree_gist | Raw SQL | YES |
| M01 | Auth (Phase 5.1) | Prisma | YES |
| M02 | Auth raw (partial indexes, check) | Raw SQL | NO |
| M03 | Auth seed (3 roles + 30 permissions + 1 admin) | Raw SQL | YES |
| M04 | Patients (Phase 5.2) | Prisma + Raw | YES |
| M05 | Inventory (Phase 5.3) | Prisma | YES |
| M06 | Appointments (Phase 5.4) | Prisma + Raw (exclusion constraint) | YES |
| M07 | Medical Records (Phase 5.5) | Prisma | YES |
| M08 | Billing (Phase 5.6) | Prisma | YES |

---

## M00 — Extensions (PHẢI chạy đầu tiên)

```sql
-- File: backend/prisma/migrations/0000_extensions/migration.sql
-- Manual: chạy raw SQL vì Prisma không support extensions tự động

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- UUID v7 fallback (nếu pg_uuidv7 không có)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- GIN trigram (full-text search)
CREATE EXTENSION IF NOT EXISTS "btree_gist";    -- EXCLUDE constraints

-- pg_uuidv7 nếu Postgres 16+: extension chính thức từ contrib
-- Nếu không có sẵn, fallback: app layer generate UUID v7 (uuidv7 npm package)
-- (xem TECH_STACK.md)
```

> **Lưu ý:** Postgres 17+ có sẵn `uuidv7()` builtin (PostgreSQL 17 released 2024-09). Nếu chạy Postgres 16 cần extension `pg_uuidv7`.

---

## M01 — Auth tables (Prisma)

`npx prisma migrate dev --name auth_init`

Tạo ra (8 bảng):
- `users`
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`
- `refresh_tokens`
- `password_reset_tokens`
- `audit_logs`

---

## M02 — Auth partial indexes + check constraints (raw SQL)

```sql
-- File: backend/prisma/migrations/0001_auth_constraints/migration.sql

-- Unique email chỉ enforce khi chưa xóa
CREATE UNIQUE INDEX idx_users_email_active
  ON users (email) WHERE deleted_at IS NULL;

-- Login lookup nhanh
CREATE INDEX idx_users_active_login
  ON users (id, email) WHERE deactivated_at IS NULL AND deleted_at IS NULL;

-- Refresh token
CREATE INDEX idx_refresh_tokens_active
  ON refresh_tokens (user_id)
  WHERE revoked_at IS NULL AND expires_at > now();

-- Audit log cho login history
CREATE INDEX idx_audit_logs_login_events
  ON audit_logs (actor_user_id, occurred_at DESC)
  WHERE action IN ('login_success', 'login_failed', 'logout_all');

-- BR-AUTH: status check
ALTER TABLE users ADD CONSTRAINT chk_users_status
  CHECK (status IN ('active', 'pending_setup', 'deactivated'));

-- BR-AUTH-009: system roles không xóa
ALTER TABLE roles ADD CONSTRAINT chk_roles_system
  CHECK (
    (is_system = true AND deleted_at IS NULL)
    OR (is_system = false)
  );
```

---

## M03 — Auth seed data (PRIVATE secret!)

```sql
-- File: backend/prisma/seed.sql (KHÔNG commit vào git)
-- File: backend/prisma/seed.template.sql (commit)

-- 1. 3 system roles
INSERT INTO roles (id, code, name, is_system, created_at, updated_at)
VALUES
  (uuidv7(), 'clinic_admin', 'Quản trị viên', true, now(), now()),
  (uuidv7(), 'receptionist', 'Lễ tân', true, now(), now()),
  (uuidv7(), 'dentist', 'Bác sĩ', true, now(), now())
ON CONFLICT (code) DO NOTHING;

-- 2. ~30 permissions theo actor-permissions-matrix.md
-- Generate từ script: backend/scripts/seed-permissions.ts
-- Output: insert statements cho từng (resource, action)

-- 3. 1 super admin user
-- email: admin@dentalclinic.local
-- password: random 32 chars, print ra console 1 lần để admin biết
-- Script: backend/scripts/create-super-admin.ts
-- Lưu password vào .env hoặc yêu cầu admin đổi ngay lần đầu login
```

> **Bảo mật:** File seed KHÔNG được commit với password thật. Dùng template + script.

---

## M04 — Patients tables

Prisma migrate + raw SQL cho GIN trigram.

```sql
-- File: backend/prisma/migrations/0002_patients/migration.sql

-- Partial unique CCCD/CMND
CREATE UNIQUE INDEX idx_patients_identifier_active
  ON patient_identifiers (type, value)
  WHERE deleted_at IS NULL;

-- GIN trigram cho full-text search
CREATE INDEX idx_patients_full_name_trgm
  ON patients
  USING GIN (full_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- BR-PT checks
ALTER TABLE patients ADD CONSTRAINT chk_patients_gender
  CHECK (gender IN ('male', 'female', 'other', 'undisclosed'));

ALTER TABLE patients ADD CONSTRAINT chk_patients_dob_range
  CHECK (dob >= DATE '1900-01-01' AND dob <= CURRENT_DATE);
```

---

## M05 — Inventory tables

Prisma migrate + raw SQL.

```sql
-- GIN trigram cho item name
CREATE INDEX idx_items_name_trgm
  ON inventory_items
  USING GIN (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- BR-INV-012: Low-stock partial index (chỉ row thỏa điều kiện)
CREATE INDEX idx_items_low_stock
  ON inventory_items (quantity_on_hand, min_stock_level)
  WHERE status = 'active' AND deleted_at IS NULL
    AND quantity_on_hand < min_stock_level;

-- Movement constraint
ALTER TABLE stock_movements ADD CONSTRAINT chk_movement_consistency
  CHECK (quantity_after = quantity_before + diff AND quantity_after >= 0);

ALTER TABLE stock_movements ADD CONSTRAINT chk_movement_diff_sign
  CHECK (
    (type = 'stock_in' AND diff > 0)
    OR (type = 'stock_out' AND diff < 0)
    OR (type = 'adjustment')
  );
```

---

## M06 — Appointments tables (cần `btree_gist`)

```sql
-- Unique slot per dentist (BR-APPT-002)
CREATE UNIQUE INDEX idx_appointments_slot_unique
  ON appointments (dentist_id, start_at)
  WHERE deleted_at IS NULL AND status NOT IN ('cancelled', 'no_show');

-- EXCLUDE constraints (cần btree_gist)
ALTER TABLE working_schedules ADD CONSTRAINT ex_ws_no_overlap
  EXCLUDE USING GIST (
    dentist_id WITH =,
    day_of_week WITH =,
    tsrange(
      ('2000-01-01'::date + start_time)::timestamp,
      ('2000-01-01'::date + end_time)::timestamp,
      '[)'
    ) WITH &&
  )
  WHERE (deleted_at IS NULL);

ALTER TABLE time_offs ADD CONSTRAINT ex_time_offs_no_overlap
  EXCLUDE USING GIST (
    dentist_id WITH =,
    tsrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (deleted_at IS NULL);

-- day_of_week check
ALTER TABLE working_schedules ADD CONSTRAINT chk_ws_dow
  CHECK (day_of_week BETWEEN 0 AND 6);

-- reschedule_count
ALTER TABLE appointments ADD CONSTRAINT chk_reschedule_max
  CHECK (reschedule_count >= 0 AND reschedule_count <= 3);
```

---

## M07 — Medical Records tables

Chỉ Prisma + 1 raw SQL cho encounter audit.

```sql
-- BR-MR-003: encounter status check
ALTER TABLE encounters ADD CONSTRAINT chk_encounter_status
  CHECK (status IN ('in_progress', 'completed', 'cancelled'));

-- BR-MR: closed_at + status check
ALTER TABLE encounters ADD CONSTRAINT chk_encounter_closed
  CHECK (
    (status = 'completed' AND closed_at IS NOT NULL)
    OR (status != 'completed')
  );

-- Patient type
ALTER TABLE dental_chart_snapshots ADD CONSTRAINT chk_patient_type
  CHECK (patient_type IN ('adult', 'child'));

-- Treatment unit_price ≥ 0
ALTER TABLE treatments ADD CONSTRAINT chk_treatment_unit_price
  CHECK (unit_price >= 0);
```

---

## M08 — Billing tables

```sql
-- BR-BILL: invoice status check
ALTER TABLE invoices ADD CONSTRAINT chk_invoice_status
  CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'voided'));

-- Amount invariants
ALTER TABLE invoices ADD CONSTRAINT chk_invoice_amounts
  CHECK (
    paid_amount >= 0
    AND outstanding_amount = total - paid_amount
    AND outstanding_amount >= 0
  );

-- Status-amount consistency
ALTER TABLE invoices ADD CONSTRAINT chk_invoice_status_amount
  CHECK (
    (status = 'draft' AND paid_amount = 0 AND outstanding_amount = total)
    OR (status = 'issued' AND paid_amount = 0 AND outstanding_amount = total)
    OR (status = 'partial' AND paid_amount > 0 AND paid_amount < total)
    OR (status = 'paid' AND paid_amount = total AND outstanding_amount = 0)
    OR (status = 'voided')
  );

-- Payment amount > 0
ALTER TABLE payments ADD CONSTRAINT chk_payment_amount
  CHECK (amount > 0);

-- Method enum check
ALTER TABLE payments ADD CONSTRAINT chk_payment_method
  CHECK (method IN ('cash', 'bank_transfer'));
```

---

## Sequence tổng thể (dùng cho production)

```bash
# 1. Init project (1 lần)
psql -d dental_clinic -f migrations/0000_extensions/migration.sql

# 2. Auth (Prisma tạo tables + raw thêm constraints)
npx prisma migrate deploy  # apply pending migrations
psql -d dental_clinic -f migrations/0001_auth_constraints/migration.sql

# 3. Auth seed
psql -d dental_clinic -f seed/seed-roles-permissions.sql
psql -d dental_clinic -f seed/seed-super-admin.sql  # có password random

# 4. Patients + Inventory + Appointments + MedicalRecords + Billing
# Mỗi module: prisma migrate deploy + raw SQL
```

---

## Conventions cho tên file migration

```
backend/prisma/migrations/
├── 0000_extensions/
│   └── migration.sql
├── 0001_auth_init/
│   └── migration.sql
├── 0002_auth_constraints/
│   └── migration.sql
├── 0003_patients/
│   └── migration.sql
├── ...
├── 9999_seed_auth/
│   ├── migration.sql
│   └── README.md (ghi rõ password policy)
└── migration_lock.toml
```

---

## Strategy cho dev vs production

### Dev (local)

```bash
# Trên local: drop + recreate mỗi lần để tránh lệch
npx prisma migrate reset
psql -d dental_clinic_dev -f ../../backend/prisma/seed.sql
```

### Production

```bash
# Chạy tuần tự, KHÔNG reset
npx prisma migrate deploy

# Verify
psql -d dental_clinic -c "SELECT * FROM audit_logs ORDER BY occurred_at DESC LIMIT 1;"
```

---

## Rollback strategy

**Quy tắc:** mỗi migration KHÔNG THỂ roll back tự động. Nếu migration fail:

1. **Dev:** `prisma migrate reset` + chạy lại từ đầu.
2. **Production:** tạo migration MỚI để undo (forward-fix). KHÔNG xóa file migration cũ.

Ví dụ: nếu M05 (Inventory) có bug:

```
không làm:  rm -rf prisma/migrations/0004_inventory
làm:       prisma migrate dev --name inventory_fix_v1
            → tạo 0005_inventory_fix_v1/migration.sql với ALTER TABLE
```

---

## Data migration (khi production đã có data)

Trường hợp đặc biệt: nếu đã có data và cần thay đổi schema:

1. Tạo migration MỚI (không edit migration cũ).
2. Trong migration mới:
   - `ALTER TABLE ADD COLUMN ... DEFAULT ...` (fill giá trị mặc định cho rows cũ)
   - `UPDATE table SET ... WHERE ...` (nếu logic phức tạp)
   - `ALTER TABLE ALTER COLUMN ... SET NOT NULL`

> Ví dụ: thêm field `version` cho `invoices`. Nếu production đã có 100k invoice → migration phải `UPDATE invoices SET version = 0 WHERE version IS NULL` trước khi SET NOT NULL.

---

## Tooling checklist (Phase 8 backend setup)

- [ ] `prisma migrate dev` chạy clean local
- [ ] `prisma migrate deploy` apply cho staging
- [ ] Seed script: `backend/scripts/seed.ts` (idempotent)
- [ ] `.env.example` có `DATABASE_URL` template
- [ ] CI: chạy `prisma migrate diff` để check drift
- [ ] Backup script: `pg_dump --schema-only` trước mỗi migration production

---

## Open questions

| # | Câu hỏi | Default decision |
| - | ------- | ---------------- |
| 1 | Migration version: number tăng hay timestamp? | Number tăng (0001, 0002, ...) đơn giản |
| 2 | Seed có chạy mỗi `prisma migrate dev` không? | Không, tách file riêng chạy thủ công |
| 3 | `soft delete helper` có cần Postgres function? | App layer (Prisma middleware) |

---

## Related

- [Schema per module](./schema-per-module/)
- [ERD Overview](./erd-overview.md)
- [PROJECT_RULES.md §8](../../PROJECT_RULES.md) — quy tắc viết migration
