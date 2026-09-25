-- Online booking requests: a patient asks for a service, dentist and time on
-- the public page; the front desk confirms, proposes another time, asks for
-- details or declines.
--
-- The gensmile.online VPS ran a branch (vps-local-postgres-demo-2026-09-23)
-- whose migrations 018-020 built this feature on its own tables:
-- clinic_services, doctor_services, doctor_profiles and appointments.service_id.
-- When those tables are present, their rows are carried into the ADR-0009
-- catalogue and dentist profiles here. Service ids are kept, so existing
-- booking requests keep pointing at the same service. On any other database
-- the legacy block is skipped and only booking_requests is created.
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingRequestStatus') THEN
    CREATE TYPE "BookingRequestStatus" AS ENUM (
      'PENDING_REVIEW', 'NEEDS_INFORMATION', 'PROPOSED', 'PATIENT_ACCEPTED',
      'CONFIRMED', 'DECLINED', 'CANCELLED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.clinic_services') IS NOT NULL THEN
    -- Categories were free text; each distinct one becomes a catalogue group.
    INSERT INTO service_categories (code, name, sort_order)
    SELECT 'LEGACY_' || upper(substr(md5(category), 1, 8)), left(category, 100), 90
    FROM (SELECT DISTINCT category FROM clinic_services) c
    ON CONFLICT (code) DO NOTHING;

    -- Same ids. Durations snap to the catalogue's 5-minute grid (5-480);
    -- prices lose the unused decimals (NUMERIC(12,2) -> (15,0)).
    INSERT INTO services (id, code, category_id, name, description, default_duration_min,
                          base_price, is_active, created_at, updated_at)
    SELECT cs.id,
           CASE WHEN EXISTS (SELECT 1 FROM services s WHERE s.code = left(cs.code, 30))
                THEN left(cs.code, 22) || '_' || upper(substr(md5(cs.id::text), 1, 7))
                ELSE left(cs.code, 30) END,
           sc.id,
           left(cs.name, 200),
           cs.description,
           LEAST(480, GREATEST(5, (round(cs.duration_minutes / 5.0) * 5)::int)),
           round(cs.base_price),
           cs.is_active,
           cs.created_at,
           cs.updated_at
    FROM clinic_services cs
    JOIN service_categories sc ON sc.code = 'LEGACY_' || upper(substr(md5(cs.category), 1, 8))
    WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.id = cs.id);

    -- Who performs what, open-ended from the day it was assigned.
    INSERT INTO dentist_services (dentist_id, service_id, effective_from, created_at, updated_at)
    SELECT ds.doctor_id, ds.service_id,
           LEAST((ds.assigned_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, CURRENT_DATE),
           ds.assigned_at, ds.assigned_at
    FROM doctor_services ds
    WHERE NOT EXISTS (
      SELECT 1 FROM dentist_services x
      WHERE x.dentist_id = ds.doctor_id AND x.service_id = ds.service_id AND x.effective_to IS NULL
    );
  END IF;

  -- Migration 019 already gave every dentist a profile; fill it from the old one.
  IF to_regclass('public.doctor_profiles') IS NOT NULL THEN
    UPDATE dentist_profiles dp SET
      license_number = COALESCE(dp.license_number, NULLIF(left(d.license_number, 50), '')),
      accepts_online_booking = d.accepting_appointments,
      -- specialties is a fixed code set (DENTIST_SPECIALTIES); the old one was
      -- free text, so it goes into the bio for the admin to map by hand.
      bio = COALESCE(dp.bio, NULLIF(concat_ws(E'\n',
              NULLIF(d.biography, ''),
              CASE WHEN d.specialty <> '' THEN 'Chuyên môn: ' || d.specialty END,
              CASE WHEN NULLIF(d.qualifications, '') IS NOT NULL
                   THEN 'Bằng cấp: ' || d.qualifications END,
              CASE WHEN d.years_experience > 0
                   THEN 'Kinh nghiệm: ' || d.years_experience || ' năm' END), '')),
      updated_at = now()
    FROM doctor_profiles d
    WHERE d.user_id = dp.user_id AND dp.deleted_at IS NULL;

    UPDATE employees e SET phone = d.phone, updated_at = now()
    FROM doctor_profiles d
    WHERE e.user_id = d.user_id AND e.deleted_at IS NULL AND e.phone IS NULL AND d.phone IS NOT NULL;
  END IF;

  -- A visit booked for one service becomes a frozen service line (ADR-0009 D6).
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'appointments'
               AND column_name = 'service_id') THEN
    INSERT INTO appointment_services (appointment_id, service_id, service_code, service_name,
                                      price, duration_min, sort_order)
    SELECT a.id, s.id, s.code, s.name, s.base_price, s.default_duration_min, 0
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    ON CONFLICT (appointment_id, service_id) DO NOTHING;

    ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_service_id_fkey;
    DROP INDEX IF EXISTS appointments_service_id_idx;
    ALTER TABLE appointments DROP COLUMN service_id;
  END IF;

  -- Existing requests: same ids, now in services instead of clinic_services.
  IF to_regclass('public.booking_requests') IS NOT NULL THEN
    ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS booking_requests_service_id_fkey;
  END IF;

  -- The legacy tables are no longer read. They are kept (not dropped) so the
  -- carried rows can be checked against them; drop them once verified.
  IF to_regclass('public.clinic_services') IS NOT NULL THEN
    COMMENT ON TABLE clinic_services IS 'Legacy (VPS branch). Copied into services by migration 025; safe to drop.';
    COMMENT ON TABLE doctor_services IS 'Legacy (VPS branch). Copied into dentist_services by migration 025; safe to drop.';
  END IF;
  IF to_regclass('public.doctor_profiles') IS NOT NULL THEN
    COMMENT ON TABLE doctor_profiles IS 'Legacy (VPS branch). Copied into dentist_profiles by migration 025; safe to drop.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS booking_requests (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  reference_code       VARCHAR(24) NOT NULL,
  access_token_hash    CHAR(64) NOT NULL,
  full_name            VARCHAR(200) NOT NULL,
  dob                  DATE NOT NULL,
  gender               "Gender" NOT NULL,
  phone                VARCHAR(20) NOT NULL,
  email                VARCHAR(255),
  contact_person_name  VARCHAR(200),
  contact_person_phone VARCHAR(20),
  service_id           UUID NOT NULL,
  preferred_dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  requested_start_at   TIMESTAMPTZ NOT NULL,
  proposed_start_at    TIMESTAMPTZ,
  proposed_dentist_id  UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  reason               VARCHAR(1000),
  status               "BookingRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  response_message     VARCHAR(1000),
  receptionist_note    VARCHAR(2000),
  consented_at         TIMESTAMPTZ NOT NULL,
  patient_id           UUID REFERENCES patients(id) ON DELETE SET NULL ON UPDATE CASCADE,
  appointment_id       UUID REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE,
  handled_by           UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  notification_sent_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_requests_dob_check CHECK (dob <= CURRENT_DATE),
  CONSTRAINT booking_requests_phone_check CHECK (length(trim(phone)) >= 9)
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_reference_code_key ON booking_requests (reference_code);
CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_appointment_id_key ON booking_requests (appointment_id);
CREATE INDEX IF NOT EXISTS booking_requests_status_created_at_idx ON booking_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_requests_phone_created_at_idx ON booking_requests (phone, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_requests_service_id_fkey') THEN
    ALTER TABLE booking_requests ADD CONSTRAINT booking_requests_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO permissions (code, resource, action, description) VALUES
  ('booking_request.read', 'booking_request', 'read', 'Xem yêu cầu đặt lịch trực tuyến'),
  ('booking_request.manage', 'booking_request', 'manage', 'Xử lý yêu cầu đặt lịch trực tuyến')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('booking_request.read', 'booking_request.manage')
WHERE r.code IN ('clinic_admin', 'receptionist')
ON CONFLICT DO NOTHING;
COMMIT;
