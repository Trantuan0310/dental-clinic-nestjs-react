-- Clinic-wide closed days (Tết, public holidays): every dentist's calendar is
-- closed for the whole day, whatever their weekly schedule says. Bookings
-- already on those days are listed for the front desk, never cancelled.
-- Also lets one day of changed hours hold several blocks (e.g. 09:00-12:00 +
-- 14:00-17:00) so a lunch break is not lost when the hours change.
-- seed.ts holds the same permission grant, so fresh and upgraded databases match.
BEGIN;

CREATE TABLE IF NOT EXISTS clinic_closures (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      VARCHAR(500) NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  deleted_by  UUID REFERENCES users(id),
  CONSTRAINT clinic_closures_dates_chk CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS clinic_closures_dates_idx
  ON clinic_closures (start_date, end_date) WHERE deleted_at IS NULL;

-- Changed hours may now be several non-overlapping blocks per day (the
-- service checks the overlap under the dentist's calendar lock).
DROP INDEX IF EXISTS schedule_overrides_changed_hours_key;

INSERT INTO permissions (code, resource, action, description) VALUES
  ('clinic_closure.manage', 'clinic_closure', 'manage',
   'Tạo/sửa/xóa ngày nghỉ toàn phòng khám (Tết, lễ)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'clinic_closure.manage'
WHERE r.code = 'clinic_admin'
ON CONFLICT DO NOTHING;
COMMIT;
