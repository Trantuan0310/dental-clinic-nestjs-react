-- A queue entry left open on a past day (patient checked in but never
-- started or marked LEFT) kept its dentist "busy" the next day:
-- queue_entries_one_called_idx allowed one CALLED entry per dentist across
-- all dates. The rule is one called patient per dentist per clinic day.
-- The end-of-day job (AppointmentsCron.closeStaleCheckIns) now closes such
-- leftovers every night; this migration clears the ones already there.
-- Safe to re-run.
BEGIN;

-- Entries of days before today (clinic time) still open: nobody can be
-- waiting or called for a past day. Closed the way "left before the exam" is.
UPDATE queue_entries
SET done_at = now(),
    close_reason = 'LEFT',
    status = 'LEFT',
    updated_at = now()
WHERE done_at IS NULL
  AND queue_date < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

DROP INDEX IF EXISTS queue_entries_one_called_idx;
-- A dentist calls one patient at a time, per clinic day.
CREATE UNIQUE INDEX IF NOT EXISTS queue_entries_one_called_per_day_idx
  ON queue_entries (dentist_id, queue_date) WHERE status = 'CALLED' AND done_at IS NULL;

COMMIT;
