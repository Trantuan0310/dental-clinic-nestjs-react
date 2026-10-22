-- =============================================================================
-- Migration 053 — Treatment plans (kế hoạch điều trị nhiều buổi)
-- =============================================================================
-- A dentist plans several procedures over several visits (braces, implants,
-- root canals), quotes the total, the patient agrees, and each procedure is
-- ticked off when the visit that did it is closed.
--   treatment_plans        one plan per patient and course of treatment
--   treatment_plan_items   the planned procedures, with the quoted price
--   treatments.plan_item_id  the procedure done in an encounter that carries
--                            out a planned item (DONE when that encounter closes)
-- Permissions: treatment_plan.read (admin, dentist, front desk),
-- treatment_plan.write (admin, dentist — a dentist only their own plans),
-- treatment_plan.accept (admin, dentist, front desk: record the patient's
-- agreement). seed.ts holds the same grants.
-- =============================================================================
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TreatmentPlanStatus') THEN
    CREATE TYPE "TreatmentPlanStatus" AS ENUM (
      'DRAFT', 'PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TreatmentPlanItemStatus') THEN
    CREATE TYPE "TreatmentPlanItemStatus" AS ENUM ('PLANNED', 'DONE', 'SKIPPED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS treatment_plans (
  id                  UUID NOT NULL DEFAULT uuid_generate_v7(),
  patient_id          UUID NOT NULL,
  dentist_id          UUID NOT NULL,
  title               VARCHAR(200) NOT NULL,
  notes               TEXT,
  status              "TreatmentPlanStatus" NOT NULL DEFAULT 'DRAFT',
  source_encounter_id UUID,
  proposed_at         TIMESTAMPTZ,
  accepted_at         TIMESTAMPTZ,
  accepted_by         UUID,
  acceptance_note     TEXT,
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancel_reason       TEXT,
  created_by          UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT treatment_plans_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS treatment_plans_patient_id_created_at_idx
  ON treatment_plans (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS treatment_plans_dentist_id_status_idx
  ON treatment_plans (dentist_id, status);

CREATE TABLE IF NOT EXISTS treatment_plan_items (
  id            UUID NOT NULL DEFAULT uuid_generate_v7(),
  plan_id       UUID NOT NULL,
  sequence      INTEGER NOT NULL DEFAULT 0,
  service_id    UUID,
  procedure     VARCHAR(200) NOT NULL,
  tooth_numbers JSONB,
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price    DECIMAL(15, 0) NOT NULL DEFAULT 0,
  notes         TEXT,
  status        "TreatmentPlanItemStatus" NOT NULL DEFAULT 'PLANNED',
  done_at       TIMESTAMPTZ,
  skip_reason   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT treatment_plan_items_pkey PRIMARY KEY (id),
  CONSTRAINT treatment_plan_items_quantity_check CHECK (quantity >= 1),
  CONSTRAINT treatment_plan_items_unit_price_check CHECK (unit_price >= 0)
);
CREATE INDEX IF NOT EXISTS treatment_plan_items_plan_id_sequence_idx
  ON treatment_plan_items (plan_id, sequence);

ALTER TABLE treatments ADD COLUMN IF NOT EXISTS plan_item_id UUID;
CREATE INDEX IF NOT EXISTS treatments_plan_item_id_idx ON treatments (plan_item_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_patient_id_fkey') THEN
    ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_dentist_id_fkey') THEN
    ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_dentist_id_fkey
      FOREIGN KEY (dentist_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_created_by_fkey') THEN
    ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_accepted_by_fkey') THEN
    ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_accepted_by_fkey
      FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plans_source_encounter_id_fkey') THEN
    ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_source_encounter_id_fkey
      FOREIGN KEY (source_encounter_id) REFERENCES encounters(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plan_items_plan_id_fkey') THEN
    ALTER TABLE treatment_plan_items ADD CONSTRAINT treatment_plan_items_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES treatment_plans(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatment_plan_items_service_id_fkey') THEN
    ALTER TABLE treatment_plan_items ADD CONSTRAINT treatment_plan_items_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_plan_item_id_fkey') THEN
    ALTER TABLE treatments ADD CONSTRAINT treatments_plan_item_id_fkey
      FOREIGN KEY (plan_item_id) REFERENCES treatment_plan_items(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO permissions (code, resource, action, description) VALUES
  ('treatment_plan.read', 'treatment_plan', 'read', 'Xem kế hoạch điều trị của bệnh nhân'),
  ('treatment_plan.write', 'treatment_plan', 'write',
   'Lập và sửa kế hoạch điều trị (bác sĩ: kế hoạch của mình)'),
  ('treatment_plan.accept', 'treatment_plan', 'accept',
   'Ghi nhận khách đồng ý kế hoạch điều trị và báo giá')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON
     (r.code = 'clinic_admin' AND p.code IN ('treatment_plan.read', 'treatment_plan.write', 'treatment_plan.accept'))
  OR (r.code = 'dentist' AND p.code IN ('treatment_plan.read', 'treatment_plan.write', 'treatment_plan.accept'))
  OR (r.code = 'receptionist' AND p.code IN ('treatment_plan.read', 'treatment_plan.accept'))
ON CONFLICT DO NOTHING;
COMMIT;
