-- Phase 5 of ADR-0009: multi-service appointments with snapshots (D6),
-- separately stored buffers (D4), walk-in visits and the LEFT status.
-- Design: docs/04_Database/schema-per-module/appointment-services.md
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VisitKind') THEN
    CREATE TYPE "VisitKind" AS ENUM ('BOOKED', 'WALK_IN');
  END IF;
END $$;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS visit_kind "VisitKind" NOT NULL DEFAULT 'BOOKED',
  ADD COLUMN IF NOT EXISTS buffer_before_min SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_min SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calculated_duration_min SMALLINT,
  ADD COLUMN IF NOT EXISTS duration_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS left_reason TEXT;
DO $$ BEGIN
  ALTER TABLE appointments ADD CONSTRAINT appointments_buffers_chk
    CHECK (buffer_before_min BETWEEN 0 AND 60 AND buffer_after_min BETWEEN 0 AND 60);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- LEFT releases the slot like CANCELLED / NO_SHOW (replaces migration 017's index).
DROP INDEX IF EXISTS idx_appointments_slot_active;
CREATE UNIQUE INDEX idx_appointments_slot_active
  ON appointments (dentist_id, start_at)
  WHERE status NOT IN ('CANCELLED', 'NO_SHOW', 'LEFT') AND deleted_at IS NULL;

-- What was booked, frozen at booking time (ADR-0009 D6): later catalogue
-- price/duration changes do not rewrite existing appointments.
CREATE TABLE IF NOT EXISTS appointment_services (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  appointment_id    UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id        UUID NOT NULL REFERENCES services(id),
  service_code      VARCHAR(30) NOT NULL,
  service_name      VARCHAR(200) NOT NULL,
  price             NUMERIC(15, 0) NOT NULL,
  duration_min      SMALLINT NOT NULL,
  buffer_before_min SMALLINT NOT NULL DEFAULT 0,
  buffer_after_min  SMALLINT NOT NULL DEFAULT 0,
  sort_order        SMALLINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS appointment_services_appt_service_key
  ON appointment_services (appointment_id, service_id);
CREATE INDEX IF NOT EXISTS appointment_services_service_idx ON appointment_services (service_id);

INSERT INTO permissions (code, resource, action, description) VALUES
  ('appointment.mark_left', 'appointment', 'mark_left', 'Ghi nhận bệnh nhân đã về trước khi khám')
ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'appointment.mark_left'
WHERE r.code IN ('clinic_admin', 'receptionist')
ON CONFLICT DO NOTHING;
COMMIT;
