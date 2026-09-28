-- Role permissions matched to who does what in the clinic (seed.ts holds the
-- same lists, so fresh databases and upgraded ones end up identical).
--
-- Front desk (receptionist): books, checks in, bills and collects payment.
--   * Finance: outstanding balances only. Revenue, expense and profit figures
--     (dashboard KPIs, revenue by dentist/procedure, finance summary) go.
--   * HR records (Nhân sự) and dentist shift registration go; the "Ca của
--     tôi" page never applied to front desk.
--   * Working schedules and time-off are read-only; the clinic manager and
--     each dentist (own schedule) edit them.
--   * Starting an encounter is the dentist's step; check-in stays.
-- Clinic admin: manages the clinic but no longer authors medical records
--   (notes, treatments, prescriptions, dental chart, closing an encounter).
--   An owner who also treats patients gets the dentist role as well.
-- Dentist: may book follow-up visits for patients they have treated (only on
--   their own calendar; enforced in AppointmentsService) and update those
--   patients' allergies, chronic diseases and current medications.
BEGIN;

INSERT INTO permissions (code, resource, action, description) VALUES
  ('patient.medical_history.update', 'patient', 'medical_history.update',
   'Cập nhật dị ứng, bệnh nền, thuốc đang dùng của bệnh nhân')
ON CONFLICT (code) DO NOTHING;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'receptionist'
  AND p.code IN (
    'report.revenue.read', 'report.read',
    'employee.read',
    'shift_registration.write', 'shift_registration.read',
    'shift.read.any', 'shift.read_self',
    'schedule.write', 'dentist.manage_schedule', 'appointment.schedule.manage',
    'encounter.start'
  );

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'clinic_admin'
  AND p.code IN (
    'encounter.start', 'encounter.complete',
    'clinical_note.write', 'clinical_note.addendum',
    'treatment.write', 'treatment.delete',
    'prescription.write', 'dental_chart.write'
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON (
     (r.code = 'dentist' AND p.code IN ('appointment.create', 'patient.medical_history.update'))
  OR (r.code = 'clinic_admin' AND p.code = 'patient.medical_history.update')
)
ON CONFLICT DO NOTHING;
COMMIT;
