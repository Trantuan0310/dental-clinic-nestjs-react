-- Phase 2 of ADR-0009: service catalogue and which dentist performs which
-- service, with per-dentist duration/price overrides over time.
-- Design: docs/04_Database/schema-per-module/services.md
BEGIN;

CREATE TABLE IF NOT EXISTS service_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  code        VARCHAR(30) NOT NULL,
  name        VARCHAR(100) NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_categories_code_key ON service_categories (code);

CREATE TABLE IF NOT EXISTS services (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  code                 VARCHAR(30) NOT NULL,
  category_id          UUID NOT NULL REFERENCES service_categories(id),
  name                 VARCHAR(200) NOT NULL,
  description          TEXT,
  default_duration_min SMALLINT NOT NULL,
  buffer_before_min    SMALLINT NOT NULL DEFAULT 0,
  buffer_after_min     SMALLINT NOT NULL DEFAULT 0,
  base_price           NUMERIC(15, 0) NOT NULL DEFAULT 0,
  required_specialty   VARCHAR(30),
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID REFERENCES users(id),
  updated_by           UUID REFERENCES users(id),
  CONSTRAINT services_duration_chk
    CHECK (default_duration_min BETWEEN 5 AND 480 AND default_duration_min % 5 = 0),
  CONSTRAINT services_buffer_chk
    CHECK (buffer_before_min BETWEEN 0 AND 60 AND buffer_after_min BETWEEN 0 AND 60),
  CONSTRAINT services_price_chk CHECK (base_price >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS services_code_key ON services (code);
CREATE INDEX IF NOT EXISTS services_category_idx ON services (category_id) WHERE is_active;

-- One row per assignment period. dentist_id is users.id (ADR-0009 D1).
CREATE TABLE IF NOT EXISTS dentist_services (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  dentist_id     UUID NOT NULL REFERENCES users(id),
  service_id     UUID NOT NULL REFERENCES services(id),
  duration_min   SMALLINT,
  price          NUMERIC(15, 0),
  effective_from DATE NOT NULL,
  effective_to   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES users(id),
  updated_by     UUID REFERENCES users(id),
  CONSTRAINT dentist_services_period_chk
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT dentist_services_duration_chk
    CHECK (duration_min IS NULL OR (duration_min BETWEEN 5 AND 480 AND duration_min % 5 = 0)),
  CONSTRAINT dentist_services_price_chk CHECK (price IS NULL OR price >= 0)
);
-- At most one open-ended assignment per dentist + service; overlap between
-- closed periods is checked in the service under the dentist's lock.
CREATE UNIQUE INDEX IF NOT EXISTS dentist_services_open_key
  ON dentist_services (dentist_id, service_id) WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS dentist_services_service_idx
  ON dentist_services (service_id, effective_from);

INSERT INTO permissions (code, resource, action, description) VALUES
  ('service.read', 'service', 'read', 'Xem danh mục dịch vụ'),
  ('service.manage', 'service', 'manage', 'Tạo/sửa/ngừng dịch vụ và nhóm dịch vụ')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = ANY (CASE r.code
  WHEN 'clinic_admin' THEN ARRAY['service.read', 'service.manage']
  WHEN 'receptionist' THEN ARRAY['service.read']
  WHEN 'dentist' THEN ARRAY['service.read']
  ELSE ARRAY[]::text[] END)
ON CONFLICT DO NOTHING;
COMMIT;
