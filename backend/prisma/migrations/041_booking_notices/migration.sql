-- Online booking notices (phase 2, G3).
-- The requester's own note (why they withdrew, or why a proposed time does
-- not suit them), kept apart from the front desk's response_message.
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS patient_message VARCHAR(1000);

-- The day-before reminder email went out for this visit (cleared when the
-- visit is moved, so the new time gets its own reminder).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- The reminder job looks for upcoming visits not reminded yet.
CREATE INDEX IF NOT EXISTS appointments_reminder_due_idx
  ON appointments (start_at)
  WHERE reminder_sent_at IS NULL AND deleted_at IS NULL
    AND status IN ('SCHEDULED', 'CONFIRMED');
