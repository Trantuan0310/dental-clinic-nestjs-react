CREATE TYPE "IntakeStatus" AS ENUM ('PENDING', 'APPROVED', 'DISCARDED');
CREATE TABLE intake_forms (
  appointment_id uuid PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  answers jsonb NOT NULL,
  status "IntakeStatus" NOT NULL DEFAULT 'PENDING',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
);
