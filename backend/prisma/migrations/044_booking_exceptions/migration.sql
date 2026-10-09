-- Online booking exceptions (round 4, FC).

-- Day-ahead reminder outcome, so the front desk sees the visits whose
-- reminder did not go out: BLOCKED (the visit falls on a closed day, the
-- dentist's time-off or outside the dentist's hours, or the dentist no longer
-- takes bookings), FAILED (the mail server refused it; retried by the next
-- runs) or SENT. reminder_status_for is the visit time the status is about,
-- so a status left over from before a move is ignored.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_status VARCHAR(20);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_note VARCHAR(500);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_attempts SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_status_for TIMESTAMPTZ;

-- The patient's link was replaced by a newer email (proposal, request for
-- details, confirmation): an older link is told so instead of "wrong code".
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS access_rotated_at TIMESTAMPTZ;
-- The last email to the patient about this request could not be sent: the
-- front desk must call (cleared when a later email goes out or staff called).
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS notice_failed_at TIMESTAMPTZ;
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS notice_failed_subject VARCHAR(200);

-- Why a request was closed, for reports (the online funnel): DECLINED, SPAM,
-- EXPIRED, WITHDRAWN_ONLINE, CANCELLED_BY_PHONE, ARRIVED_WALK_IN (linked to
-- a visit made at the desk), ARRIVED_NO_VISIT, PATIENT_CANCELLED_VISIT (the
-- patient cancelled the confirmed visit from the link). NULL: open, or
-- confirmed into a visit (or closed before migration 044).
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS close_reason VARCHAR(30);
-- When the patient cancelled the confirmed visit from the link (the request
-- stays CONFIRMED, its visit is CANCELLED).
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS patient_cancelled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS booking_requests_close_reason_idx
  ON booking_requests (close_reason, created_at) WHERE close_reason IS NOT NULL;
