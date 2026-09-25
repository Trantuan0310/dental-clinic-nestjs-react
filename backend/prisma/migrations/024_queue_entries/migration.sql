-- Phase 6 of ADR-0009: the dispatch queue (D5) and catalogue-linked treatments (D6).
-- The queue only covers the time before the exam: WAITING → CALLED, with
-- SKIPPED and LEFT as side exits. Starting the exam closes the entry
-- (done_at); from then on Appointment/Encounter carry the state.
-- Design: docs/04_Database/schema-per-module/dispatch.md
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QueueStatus') THEN
    CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'CALLED', 'SKIPPED', 'LEFT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QueuePriority') THEN
    -- Declared in dispatch order: emergency first, walk-ins last.
    CREATE TYPE "QueuePriority" AS ENUM ('EMERGENCY', 'ON_TIME', 'LATE', 'WALK_IN');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS queue_entries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  appointment_id      UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  dentist_id          UUID NOT NULL REFERENCES users(id),
  queue_date          DATE NOT NULL,
  status              "QueueStatus" NOT NULL DEFAULT 'WAITING',
  priority            "QueuePriority" NOT NULL,
  checked_in_at       TIMESTAMPTZ NOT NULL,
  emergency_reason    TEXT,
  called_at           TIMESTAMPTZ,
  called_by           UUID REFERENCES users(id),
  call_count          SMALLINT NOT NULL DEFAULT 0,
  skipped_at          TIMESTAMPTZ,
  skip_reason         TEXT,
  skip_count          SMALLINT NOT NULL DEFAULT 0,
  transferred_from_id UUID REFERENCES users(id),
  transfer_reason     TEXT,
  done_at             TIMESTAMPTZ,
  close_reason        VARCHAR(20),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES users(id),
  updated_by          UUID REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS queue_entries_appointment_key ON queue_entries (appointment_id);
CREATE INDEX IF NOT EXISTS queue_entries_open_idx
  ON queue_entries (dentist_id, queue_date, priority, checked_in_at) WHERE done_at IS NULL;
-- A dentist calls one patient at a time.
CREATE UNIQUE INDEX IF NOT EXISTS queue_entries_one_called_idx
  ON queue_entries (dentist_id) WHERE status = 'CALLED' AND done_at IS NULL;

-- Patients already waiting when this ships join the queue in check-in order.
INSERT INTO queue_entries (appointment_id, dentist_id, queue_date, priority, checked_in_at)
SELECT a.id, a.dentist_id, (a.start_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
       CASE
         WHEN a.visit_kind = 'WALK_IN' THEN 'WALK_IN'::"QueuePriority"
         WHEN a.checked_in_at > a.start_at + interval '15 minutes' THEN 'LATE'::"QueuePriority"
         ELSE 'ON_TIME'::"QueuePriority"
       END,
       COALESCE(a.checked_in_at, a.start_at)
FROM appointments a
WHERE a.status = 'CHECKED_IN' AND a.deleted_at IS NULL
ON CONFLICT (appointment_id) DO NOTHING;

-- D6: a treatment may come from the catalogue (optional; old rows stay valid).
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id);
CREATE INDEX IF NOT EXISTS treatments_service_idx ON treatments (service_id) WHERE service_id IS NOT NULL;

INSERT INTO permissions (code, resource, action, description) VALUES
  ('queue.read', 'queue', 'read', 'Xem hàng đợi khám'),
  ('queue.call', 'queue', 'call', 'Gọi / bỏ qua bệnh nhân trong hàng đợi'),
  ('queue.manage', 'queue', 'manage', 'Điều phối: ưu tiên cấp cứu, chuyển bác sĩ, thay bác sĩ cả ngày')
ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('queue.read', 'queue.call')
WHERE r.code IN ('clinic_admin', 'receptionist', 'dentist')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'queue.manage'
WHERE r.code IN ('clinic_admin', 'receptionist')
ON CONFLICT DO NOTHING;
COMMIT;
