-- Clinic setup modules: reusable doctor profiles and service catalogue.
-- Appointments, encounters, treatments, and invoices remain untouched.
BEGIN;

CREATE TABLE "doctor_profiles" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "phone" VARCHAR(20),
  "specialty" VARCHAR(120) NOT NULL DEFAULT '',
  "license_number" VARCHAR(80),
  "qualifications" TEXT,
  "years_experience" INTEGER NOT NULL DEFAULT 0 CHECK ("years_experience" >= 0),
  "biography" TEXT,
  "accepting_appointments" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "doctor_profiles_license_number_key"
  ON "doctor_profiles" ("license_number") WHERE "license_number" IS NOT NULL;

CREATE TABLE "clinic_services" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  "code" VARCHAR(40) NOT NULL UNIQUE,
  "name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "description" TEXT,
  "duration_minutes" INTEGER NOT NULL CHECK ("duration_minutes" > 0),
  "base_price" NUMERIC(12, 2) NOT NULL CHECK ("base_price" >= 0),
  "requires_consultation" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "clinic_services_active_category_name_idx"
  ON "clinic_services" ("is_active", "category", "name");

CREATE TABLE "doctor_services" (
  "doctor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "service_id" UUID NOT NULL REFERENCES "clinic_services"("id") ON DELETE CASCADE,
  "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("doctor_id", "service_id")
);
CREATE INDEX "doctor_services_service_id_idx" ON "doctor_services" ("service_id");

INSERT INTO "permissions" ("code", "resource", "action", "description", "is_system") VALUES
  ('doctor.read', 'doctor', 'read', 'Xem hồ sơ bác sĩ', TRUE),
  ('doctor.manage', 'doctor', 'manage', 'Quản lý hồ sơ và dịch vụ bác sĩ', TRUE),
  ('service.read', 'service', 'read', 'Xem danh mục dịch vụ', TRUE),
  ('service.manage', 'service', 'manage', 'Quản lý danh mục dịch vụ', TRUE)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE (r."code" = 'clinic_admin' AND p."code" IN ('doctor.read', 'doctor.manage', 'service.read', 'service.manage'))
   OR (r."code" IN ('receptionist', 'dentist') AND p."code" IN ('doctor.read', 'service.read'))
ON CONFLICT DO NOTHING;

COMMIT;
