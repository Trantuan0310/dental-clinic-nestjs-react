-- Phase 3 of ADR-0009: time-off approval and per-day schedule overrides.
-- Design: docs/04_Database/schema-per-module/schedule.md
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TimeOffStatus') THEN
    CREATE TYPE "TimeOffStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ScheduleOverrideKind') THEN
    CREATE TYPE "ScheduleOverrideKind" AS ENUM ('CLOSED', 'CHANGED_HOURS');
  END IF;
END $$;

-- Existing time-off was effective as soon as it was recorded, so it is APPROVED.
ALTER TABLE time_offs
  ADD COLUMN IF NOT EXISTS status "TimeOffStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_note TEXT;
-- New requests start PENDING unless the service approves them on creation.
ALTER TABLE time_offs ALTER COLUMN status SET DEFAULT 'PENDING';
CREATE INDEX IF NOT EXISTS time_offs_status_idx ON time_offs (status, start_at)
  WHERE deleted_at IS NULL;

-- One day of a dentist's calendar that differs from the weekly schedule
-- (ADR-0009 D3: extra hours stay in shift_registrations).
--   CLOSED        start_time/end_time NULL = whole day, else that range is closed
--   CHANGED_HOURS start_time/end_time replace the weekly schedule that day
CREATE TABLE IF NOT EXISTS schedule_overrides (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  dentist_id  UUID NOT NULL REFERENCES users(id),
  date        DATE NOT NULL,
  kind        "ScheduleOverrideKind" NOT NULL,
  start_time  TIME(0),
  end_time    TIME(0),
  reason      TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  deleted_by  UUID REFERENCES users(id),
  CONSTRAINT schedule_overrides_times_chk CHECK (
    (start_time IS NULL AND end_time IS NULL AND kind = 'CLOSED')
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);
CREATE INDEX IF NOT EXISTS schedule_overrides_dentist_date_idx
  ON schedule_overrides (dentist_id, date) WHERE deleted_at IS NULL;
-- At most one changed-hours row per dentist and day.
CREATE UNIQUE INDEX IF NOT EXISTS schedule_overrides_changed_hours_key
  ON schedule_overrides (dentist_id, date) WHERE kind = 'CHANGED_HOURS' AND deleted_at IS NULL;

INSERT INTO permissions (code, resource, action, description) VALUES
  ('time_off.approve', 'time_off', 'approve', 'Duyệt/từ chối đơn nghỉ phép của bác sĩ')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'time_off.approve'
WHERE r.code = 'clinic_admin'
ON CONFLICT DO NOTHING;
COMMIT;
