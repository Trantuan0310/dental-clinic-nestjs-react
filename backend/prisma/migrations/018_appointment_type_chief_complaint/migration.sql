-- The booking form has always collected an appointment type and a chief
-- complaint, but appointments had nowhere to store them, so both were dropped.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AppointmentType') THEN
    CREATE TYPE "AppointmentType" AS ENUM ('CONSULTATION', 'TREATMENT', 'FOLLOW_UP');
  END IF;
END $$;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS appointment_type "AppointmentType" NOT NULL DEFAULT 'CONSULTATION',
  ADD COLUMN IF NOT EXISTS chief_complaint TEXT;
COMMIT;
