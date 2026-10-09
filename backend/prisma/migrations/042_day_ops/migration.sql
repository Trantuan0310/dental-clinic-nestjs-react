-- Day-of-visit operations (round 4, FA). Safe to re-run.

-- A5-21: a closed queue entry says why in its status too (DONE when the
-- exam started, CANCELLED for an undone check-in or a cancelled visit),
-- not WAITING. Entries closed before this keep their old status; every
-- query already reads done_at. New enum values: nothing below uses them.
ALTER TYPE "QueueStatus" ADD VALUE IF NOT EXISTS 'DONE';
ALTER TYPE "QueueStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

BEGIN;

-- A5-04: a visit finished early gives its remaining time back
-- (AvailabilityService counts a COMPLETED visit only until the encounter
-- closed), so its start minute must not stay reserved for the dentist.
DROP INDEX IF EXISTS idx_appointments_slot_active;
CREATE UNIQUE INDEX idx_appointments_slot_active
  ON appointments (dentist_id, start_at)
  WHERE status NOT IN ('CANCELLED', 'NO_SHOW', 'LEFT', 'COMPLETED') AND deleted_at IS NULL;

-- A3-03 / A5-03: a dentist may cancel their own encounter started by
-- mistake (only while it has no treatment or prescription; checked in
-- MedicalRecordsService.cancelEncounter). seed.ts holds the same grant.
UPDATE permissions SET description = 'Hủy phiên khám mở nhầm'
 WHERE code = 'encounter.cancel';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'encounter.cancel'
WHERE r.code = 'dentist'
ON CONFLICT DO NOTHING;

COMMIT;
