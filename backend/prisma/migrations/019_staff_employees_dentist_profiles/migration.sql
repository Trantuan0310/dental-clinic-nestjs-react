-- Phase 1 of ADR-0009: HR records (employees) and dentist profiles, kept
-- separate from login accounts (users). Dentists stay identified by users.id
-- (ADR-0009 D1), so no existing dentist_id column changes.
-- Design: docs/04_Database/schema-per-module/staff.md
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployeeType') THEN
    CREATE TYPE "EmployeeType" AS ENUM ('DENTIST', 'ASSISTANT', 'RECEPTIONIST', 'MANAGER', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmploymentStatus') THEN
    CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PracticeStatus') THEN
    CREATE TYPE "PracticeStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS employee_code_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS employees (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  code              VARCHAR(20) NOT NULL,
  full_name         VARCHAR(200) NOT NULL,
  dob               DATE,
  gender            "Gender",
  phone             VARCHAR(20),
  email             VARCHAR(255),
  address           TEXT,
  employee_type     "EmployeeType" NOT NULL,
  hire_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  termination_date  DATE,
  employment_status "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
  user_id           UUID REFERENCES users(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES users(id),
  updated_by        UUID REFERENCES users(id),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT employees_termination_chk
    CHECK (termination_date IS NULL OR termination_date >= hire_date),
  CONSTRAINT employees_terminated_has_date_chk
    CHECK (employment_status <> 'TERMINATED' OR termination_date IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_code_key ON employees (code);
CREATE UNIQUE INDEX IF NOT EXISTS employees_user_active_key ON employees (user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS employees_type_status_idx ON employees (employee_type, employment_status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS dentist_profiles (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  employee_id            UUID NOT NULL REFERENCES employees(id),
  user_id                UUID NOT NULL REFERENCES users(id),
  license_number         VARCHAR(50),
  license_issued_at      DATE,
  specialties            TEXT[] NOT NULL DEFAULT '{}',
  calendar_color         CHAR(7) NOT NULL,
  default_slot_minutes   SMALLINT NOT NULL DEFAULT 30,
  accepts_online_booking BOOLEAN NOT NULL DEFAULT false,
  accepts_new_patients   BOOLEAN NOT NULL DEFAULT true,
  practice_status        "PracticeStatus" NOT NULL DEFAULT 'ACTIVE',
  bio                    TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             UUID REFERENCES users(id),
  updated_by             UUID REFERENCES users(id),
  deleted_at             TIMESTAMPTZ,
  CONSTRAINT dentist_profiles_color_chk CHECK (calendar_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT dentist_profiles_slot_chk CHECK (default_slot_minutes BETWEEN 15 AND 120)
);
CREATE UNIQUE INDEX IF NOT EXISTS dentist_profiles_employee_key ON dentist_profiles (employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS dentist_profiles_user_key ON dentist_profiles (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS dentist_profiles_license_active_key ON dentist_profiles (license_number)
  WHERE license_number IS NOT NULL AND deleted_at IS NULL;

-- Permissions (seed.ts also upserts these; inserted here so existing
-- databases get them on deploy without re-running the seed).
INSERT INTO permissions (code, resource, action, description) VALUES
  ('employee.read', 'employee', 'read', 'Xem danh sách và hồ sơ nhân viên'),
  ('employee.create', 'employee', 'create', 'Tạo hồ sơ nhân viên'),
  ('employee.update', 'employee', 'update', 'Cập nhật hồ sơ nhân viên, liên kết tài khoản'),
  ('employee.deactivate', 'employee', 'deactivate', 'Cho nhân viên nghỉ việc'),
  ('dentist.read', 'dentist', 'read', 'Xem hồ sơ bác sĩ'),
  ('dentist.create', 'dentist', 'create', 'Tạo hồ sơ bác sĩ cho nhân viên'),
  ('dentist.update', 'dentist', 'update', 'Cập nhật hồ sơ bác sĩ'),
  ('dentist.update.own', 'dentist', 'update.own', 'Bác sĩ cập nhật hồ sơ của chính mình'),
  ('dentist.deactivate', 'dentist', 'deactivate', 'Ngừng/tạm đình chỉ hành nghề bác sĩ'),
  ('dentist.assign_service', 'dentist', 'assign_service', 'Phân công dịch vụ cho bác sĩ'),
  ('dentist.manage_schedule', 'dentist', 'manage_schedule', 'Quản lý lịch làm việc bác sĩ')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = ANY (CASE r.code
  WHEN 'clinic_admin' THEN ARRAY['employee.read', 'employee.create', 'employee.update',
    'employee.deactivate', 'dentist.read', 'dentist.create', 'dentist.update',
    'dentist.deactivate', 'dentist.assign_service', 'dentist.manage_schedule']
  WHEN 'receptionist' THEN ARRAY['employee.read', 'dentist.read', 'dentist.manage_schedule']
  WHEN 'dentist' THEN ARRAY['dentist.read', 'dentist.update.own', 'dentist.manage_schedule']
  ELSE ARRAY[]::text[] END)
ON CONFLICT DO NOTHING;

-- Backfill from existing accounts. Idempotent: seed.ts/seed-clinical.ts call
-- the same statements (prisma/staff-backfill.ts reads them between the
-- markers) after creating users.
-- @staff-backfill-start
INSERT INTO employees (code, full_name, employee_type, hire_date, employment_status,
                       termination_date, user_id)
SELECT 'NV-' || lpad(nextval('employee_code_seq')::text, 5, '0'),
       x.full_name, x.employee_type, x.hire_date, x.employment_status, x.termination_date, x.id
FROM (
  SELECT u.id, u.full_name, min(u.created_at) AS created_at,
         CASE WHEN bool_or(r.code = 'dentist') THEN 'DENTIST'
              WHEN bool_or(r.code = 'receptionist') THEN 'RECEPTIONIST'
              WHEN bool_or(r.code = 'clinic_admin') THEN 'MANAGER'
              ELSE 'OTHER' END::"EmployeeType" AS employee_type,
         (u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS hire_date,
         CASE WHEN u.status = 'DEACTIVATED' THEN 'TERMINATED'
              ELSE 'ACTIVE' END::"EmploymentStatus" AS employment_status,
         CASE WHEN u.status = 'DEACTIVATED'
              THEN GREATEST((u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
                            (COALESCE(u.deactivated_at, u.updated_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
         END AS termination_date
  FROM users u
  JOIN user_roles ur ON ur.user_id = u.id
  JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
  WHERE u.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id AND e.deleted_at IS NULL)
  GROUP BY u.id
) x
ORDER BY x.created_at, x.id;

INSERT INTO dentist_profiles (employee_id, user_id, calendar_color, default_slot_minutes,
                              practice_status)
SELECT e.id, e.user_id,
       (ARRAY['#2563EB', '#16A34A', '#DC2626', '#9333EA', '#EA580C', '#0891B2', '#DB2777', '#65A30D'])
         [1 + ((SELECT count(*) FROM dentist_profiles) + row_number() OVER (ORDER BY e.code) - 1) % 8],
       LEAST(120, GREATEST(15, COALESCE(
         (SELECT mode() WITHIN GROUP (ORDER BY ws.slot_duration_min)
          FROM working_schedules ws
          WHERE ws.dentist_id = e.user_id AND ws.deleted_at IS NULL), 30))),
       CASE WHEN e.employment_status = 'TERMINATED' THEN 'INACTIVE'
            ELSE 'ACTIVE' END::"PracticeStatus"
FROM employees e
WHERE e.employee_type = 'DENTIST' AND e.deleted_at IS NULL AND e.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dentist_profiles d WHERE d.user_id = e.user_id);
-- @staff-backfill-end
COMMIT;
