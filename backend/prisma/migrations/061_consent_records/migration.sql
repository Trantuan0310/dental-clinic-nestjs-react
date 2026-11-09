BEGIN;

CREATE TYPE "ConsentChannel" AS ENUM ('ONLINE', 'INTAKE', 'DESK');

CREATE TABLE consent_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  idempotency_key varchar(64) NOT NULL UNIQUE,
  patient_id uuid REFERENCES patients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  booking_request_id uuid REFERENCES booking_requests(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  purpose varchar(100) NOT NULL CHECK (length(trim(purpose)) > 0),
  version varchar(100) NOT NULL CHECK (length(trim(version)) > 0),
  text text NOT NULL CHECK (length(trim(text)) > 0),
  channel "ConsentChannel" NOT NULL,
  ip_prefix varchar(50),
  actor_id uuid REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT consent_records_source_check CHECK (
    (channel = 'ONLINE' AND booking_request_id IS NOT NULL) OR
    (channel = 'INTAKE' AND patient_id IS NOT NULL AND appointment_id IS NOT NULL) OR
    (channel = 'DESK' AND patient_id IS NOT NULL)
  ),
  CONSTRAINT consent_records_withdrawal_check CHECK (
    (withdrawn_at IS NULL AND withdrawn_by IS NULL) OR
    (withdrawn_at >= created_at AND withdrawn_by IS NOT NULL)
  )
);

-- Independent source constraints protect retries even outside the shared helper.
CREATE UNIQUE INDEX consent_records_online_once ON consent_records (booking_request_id, purpose, version)
  WHERE channel = 'ONLINE';
CREATE UNIQUE INDEX consent_records_intake_once ON consent_records (appointment_id, purpose, version)
  WHERE channel = 'INTAKE';
CREATE UNIQUE INDEX consent_records_desk_once ON consent_records (patient_id, purpose, version)
  WHERE channel = 'DESK';
CREATE INDEX consent_records_patient_id_created_at_idx ON consent_records (patient_id, created_at DESC);
CREATE INDEX consent_records_booking_request_id_idx ON consent_records (booking_request_id);
CREATE INDEX consent_records_appointment_id_idx ON consent_records (appointment_id);
CREATE INDEX consent_records_created_at_idx ON consent_records (created_at DESC);

INSERT INTO permissions (code, resource, action, description) VALUES
  ('consent.read', 'consent', 'read', 'Xem lịch sử đồng ý của bệnh nhân theo phạm vi hồ sơ'),
  ('consent.manage', 'consent', 'manage', 'Ghi nhận tại quầy và rút lại đồng ý của bệnh nhân'),
  ('consent.export', 'consent', 'export', 'Tra cứu và xuất sổ đồng ý toàn phòng khám')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON
  (r.code = 'clinic_admin' AND p.code IN ('consent.read', 'consent.manage', 'consent.export')) OR
  (r.code = 'receptionist' AND p.code IN ('consent.read', 'consent.manage')) OR
  (r.code = 'dentist' AND p.code = 'consent.read')
ON CONFLICT DO NOTHING;

-- No backfill: old timestamps cannot prove which notice was accepted.
COMMIT;
