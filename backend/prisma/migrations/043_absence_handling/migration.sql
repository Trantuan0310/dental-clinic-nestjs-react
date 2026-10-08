-- Round 4 (FB): absent dentists, clinic closures and their bookings.
BEGIN;

-- A visit the clinic cancelled (closed day, absent dentist) is not the
-- patient's cancellation and never a no-show.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by_clinic BOOLEAN NOT NULL DEFAULT false;
-- The front desk reached the patient about a calendar change (impact list).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_contacted_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_contacted_by UUID;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS clinic_contact_note VARCHAR(500);

-- A move made for the clinic's reasons: not counted in the patient's limit
-- of three reschedules.
ALTER TABLE appointment_reschedule_logs ADD COLUMN IF NOT EXISTS by_clinic BOOLEAN NOT NULL DEFAULT false;

-- A closure may start mid-day on its first day (power cut from 14:00).
ALTER TABLE clinic_closures ADD COLUMN IF NOT EXISTS start_time TIME(0);

-- The front desk records a dentist's sudden absence today (effective at
-- once, the admin reviews it afterwards). seed.ts holds the same grants.
INSERT INTO permissions (code, resource, action, description) VALUES
  ('time_off.record_urgent', 'time_off', 'record_urgent',
   'Ghi nhận bác sĩ vắng đột xuất hôm nay (có hiệu lực ngay)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'time_off.record_urgent'
WHERE r.code IN ('clinic_admin', 'receptionist')
ON CONFLICT DO NOTHING;

COMMIT;
