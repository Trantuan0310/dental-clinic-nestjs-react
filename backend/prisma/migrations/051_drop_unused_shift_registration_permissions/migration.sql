-- shift_registration.read / .write / .approve guard nothing any more: shift
-- registration moved to the /shifts routes, which check shift.* (the old
-- /appointments/shift-registrations routes were removed in batch B of the
-- 21/10 review). Drop them so the Roles screen does not offer switches that
-- do nothing. seed.ts no longer creates them.
BEGIN;

DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE code LIKE 'shift_registration.%');

DELETE FROM permissions WHERE code LIKE 'shift_registration.%';

COMMIT;
