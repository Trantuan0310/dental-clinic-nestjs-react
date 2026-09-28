-- Photos shown on the public home page: the clinic's hero and gallery
-- pictures, and one portrait per dentist. The bytes live in the database so
-- they need no shared volume and are covered by the pre-deploy pg_dump. The
-- app resizes images before upload (at most ~1600 px, a few hundred KB), and
-- the size check below keeps a stray upload from bloating the table.
BEGIN;

CREATE TABLE IF NOT EXISTS media_assets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  purpose     VARCHAR(30)  NOT NULL,
  dentist_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  mime_type   VARCHAR(40)  NOT NULL,
  bytes       BYTEA        NOT NULL,
  byte_size   INTEGER      NOT NULL,
  caption     VARCHAR(200),
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT media_assets_purpose_check
    CHECK (purpose IN ('CLINIC_HERO', 'CLINIC_GALLERY', 'DENTIST_PHOTO')),
  CONSTRAINT media_assets_dentist_check
    CHECK ((purpose = 'DENTIST_PHOTO') = (dentist_id IS NOT NULL)),
  CONSTRAINT media_assets_mime_check
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT media_assets_size_check
    CHECK (byte_size > 0 AND byte_size <= 3145728 AND byte_size = octet_length(bytes))
);

-- One hero picture and one portrait per dentist; uploading replaces it.
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_one_hero
  ON media_assets (purpose) WHERE purpose = 'CLINIC_HERO';
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_one_dentist_photo
  ON media_assets (dentist_id) WHERE purpose = 'DENTIST_PHOTO';
CREATE INDEX IF NOT EXISTS media_assets_purpose_idx
  ON media_assets (purpose, sort_order, created_at);

INSERT INTO permissions (code, resource, action, description) VALUES
  ('site_media.manage', 'site_media', 'manage', 'Quản lý ảnh phòng khám trên trang chủ')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'site_media.manage'
WHERE r.code = 'clinic_admin'
ON CONFLICT DO NOTHING;
COMMIT;
