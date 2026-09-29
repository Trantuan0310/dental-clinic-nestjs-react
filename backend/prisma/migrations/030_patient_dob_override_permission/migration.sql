-- Overriding a patient's date of birth once encounters exist (BR-PT-017)
-- becomes its own permission, held by the clinic admin only. The route used
-- to require patient.update, which the front desk also holds, although it is
-- documented as admin-only: the DOB decides the adult/child dental chart.
-- seed.ts holds the same grant, so fresh and upgraded databases match.
BEGIN;

INSERT INTO permissions (code, resource, action, description) VALUES
  ('patient.dob.override', 'patient', 'dob.override',
   'Sửa ngày sinh bệnh nhân đã có phiên khám (có lý do)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'patient.dob.override'
WHERE r.code = 'clinic_admin'
ON CONFLICT DO NOTHING;
COMMIT;
