-- =============================================================================
-- Migration 054 — Recall reminders (nhắc tái khám định kỳ)
-- =============================================================================
--   services.recall_interval_months  months after a visit with the service the
--                                    patient is due back (NULL = no recall)
--   patients.recall_opt_out_at       the patient asked not to get recall emails
--   recalls                          one due date per patient and service, made
--                                    when the encounter with it closes; the front
--                                    desk calls the patients due, a daily job
--                                    emails them once (with a booking link and
--                                    an unsubscribe link, email_token_hash)
-- At most one open recall (PENDING, POSTPONED, BOOKED) per patient and service.
-- Permissions: recall.read, recall.manage (admin, front desk). seed.ts holds
-- the same grants.
-- =============================================================================
BEGIN;

ALTER TABLE services ADD COLUMN IF NOT EXISTS recall_interval_months SMALLINT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS recall_opt_out_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecallStatus') THEN
    CREATE TYPE "RecallStatus" AS ENUM ('PENDING', 'POSTPONED', 'BOOKED', 'DISMISSED', 'DONE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS recalls (
  id                       UUID NOT NULL DEFAULT uuid_generate_v7(),
  patient_id               UUID NOT NULL,
  service_id               UUID NOT NULL,
  source_encounter_id      UUID,
  due_date                 DATE NOT NULL,
  status                   "RecallStatus" NOT NULL DEFAULT 'PENDING',
  postponed_until          DATE,
  emailed_at               TIMESTAMPTZ,
  email_token_hash         VARCHAR(64),
  contact_attempts         INTEGER NOT NULL DEFAULT 0,
  last_contact_at          TIMESTAMPTZ,
  last_contact_by          UUID,
  last_contact_result      VARCHAR(20),
  last_contact_note        VARCHAR(500),
  resolved_by_encounter_id UUID,
  closed_at                TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recalls_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS recalls_status_due_date_idx ON recalls (status, due_date);
CREATE INDEX IF NOT EXISTS recalls_patient_id_idx ON recalls (patient_id);
CREATE INDEX IF NOT EXISTS recalls_source_encounter_id_idx ON recalls (source_encounter_id);
CREATE INDEX IF NOT EXISTS recalls_resolved_by_encounter_id_idx ON recalls (resolved_by_encounter_id);
CREATE UNIQUE INDEX IF NOT EXISTS recalls_one_open_per_service
  ON recalls (patient_id, service_id) WHERE status IN ('PENDING', 'POSTPONED', 'BOOKED');
CREATE UNIQUE INDEX IF NOT EXISTS recalls_email_token_hash_key ON recalls (email_token_hash);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recalls_patient_id_fkey') THEN
    ALTER TABLE recalls ADD CONSTRAINT recalls_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recalls_service_id_fkey') THEN
    ALTER TABLE recalls ADD CONSTRAINT recalls_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recalls_source_encounter_id_fkey') THEN
    ALTER TABLE recalls ADD CONSTRAINT recalls_source_encounter_id_fkey
      FOREIGN KEY (source_encounter_id) REFERENCES encounters(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recalls_resolved_by_encounter_id_fkey') THEN
    ALTER TABLE recalls ADD CONSTRAINT recalls_resolved_by_encounter_id_fkey
      FOREIGN KEY (resolved_by_encounter_id) REFERENCES encounters(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recalls_last_contact_by_fkey') THEN
    ALTER TABLE recalls ADD CONSTRAINT recalls_last_contact_by_fkey
      FOREIGN KEY (last_contact_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO permissions (code, resource, action, description) VALUES
  ('recall.read', 'recall', 'read', 'Xem danh sách bệnh nhân đến hạn tái khám'),
  ('recall.manage', 'recall', 'manage',
   'Ghi kết quả gọi nhắc tái khám, hẹn gọi lại, bỏ nhắc, bật lại nhắc qua email')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('recall.read', 'recall.manage')
WHERE r.code IN ('clinic_admin', 'receptionist')
ON CONFLICT DO NOTHING;
COMMIT;
