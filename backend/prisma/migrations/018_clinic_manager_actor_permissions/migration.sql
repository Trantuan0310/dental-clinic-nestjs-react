-- The schedule editor is a management function. Dentists submit shift registrations;
-- receptionists coordinate appointments but do not directly rewrite staff schedules.
DELETE FROM "role_permissions" rp
USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id"
  AND rp."permission_id" = p."id"
  AND r."code" IN ('dentist', 'receptionist')
  AND p."code" = 'schedule.write';

UPDATE "roles"
SET "name" = 'Quản lý phòng khám',
    "description" = 'Quản lý vận hành, nhân sự và cấu hình nghiệp vụ phòng khám'
WHERE "code" = 'clinic_admin';
