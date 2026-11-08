BEGIN;

ALTER TABLE appointments
  ADD COLUMN confirmed_by_patient BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN reschedule_requested_at TIMESTAMPTZ;

CREATE TABLE appointment_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON UPDATE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX appointment_links_appointment_id_idx ON appointment_links(appointment_id);

CREATE TYPE "AppointmentLinkRescheduleStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED');
CREATE TABLE appointment_link_reschedule_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON UPDATE CASCADE,
  dentist_id UUID NOT NULL,
  original_start_at TIMESTAMPTZ NOT NULL,
  original_end_at TIMESTAMPTZ NOT NULL,
  requested_start_at TIMESTAMPTZ,
  requested_end_at TIMESTAMPTZ,
  buffer_before_min SMALLINT NOT NULL DEFAULT 0,
  buffer_after_min SMALLINT NOT NULL DEFAULT 0,
  note VARCHAR(1000),
  status "AppointmentLinkRescheduleStatus" NOT NULL DEFAULT 'PENDING',
  hold_until TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointment_link_requested_interval CHECK (
    (requested_start_at IS NULL AND requested_end_at IS NULL AND hold_until IS NULL)
    OR (requested_start_at IS NOT NULL AND requested_end_at > requested_start_at)
  )
);
CREATE UNIQUE INDEX appointment_link_one_pending_request
  ON appointment_link_reschedule_requests(appointment_id) WHERE status = 'PENDING';
CREATE INDEX appointment_link_reschedule_requests_dentist_id_hold_until_idx
  ON appointment_link_reschedule_requests(dentist_id, hold_until);
CREATE INDEX appointment_link_reschedule_requests_status_created_at_idx
  ON appointment_link_reschedule_requests(status, created_at);
CREATE INDEX appointment_link_reschedule_requests_appointment_id_idx
  ON appointment_link_reschedule_requests(appointment_id);

COMMIT;
