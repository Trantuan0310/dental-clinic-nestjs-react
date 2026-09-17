-- Cancelled/no-show/deleted appointments must release their booking slot.
BEGIN;
DROP INDEX IF EXISTS appointments_dentist_id_start_at_key;
CREATE UNIQUE INDEX idx_appointments_slot_active
  ON appointments (dentist_id, start_at)
  WHERE status NOT IN ('CANCELLED', 'NO_SHOW') AND deleted_at IS NULL;
COMMIT;
