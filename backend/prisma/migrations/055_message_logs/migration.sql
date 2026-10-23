-- =============================================================================
-- Migration 055 — SMS / Zalo message log (lớp gửi tin)
-- =============================================================================
-- One row per message sent (or MOCKED while no provider is configured).
-- dedupe_key is unique so a reminder goes out at most once.
-- Permission message_log.read (admin). seed.ts holds the same grant.
-- =============================================================================
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageChannel') THEN
    CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'ZALO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageStatus') THEN
    CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'MOCKED', 'FAILED', 'SKIPPED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS message_logs (
  id          UUID NOT NULL DEFAULT uuid_generate_v7(),
  channel     "MessageChannel" NOT NULL,
  provider    VARCHAR(30) NOT NULL,
  recipient   VARCHAR(30) NOT NULL,
  template    VARCHAR(50) NOT NULL,
  body        TEXT NOT NULL,
  status      "MessageStatus" NOT NULL,
  error       VARCHAR(500),
  provider_id VARCHAR(100),
  dedupe_key  VARCHAR(200) NOT NULL,
  patient_id  UUID,
  target_type VARCHAR(30),
  target_id   UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_logs_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS message_logs_dedupe_key_key ON message_logs (dedupe_key);
CREATE INDEX IF NOT EXISTS message_logs_created_at_idx ON message_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS message_logs_patient_id_idx ON message_logs (patient_id);

INSERT INTO permissions (code, resource, action, description) VALUES
  ('message_log.read', 'message_log', 'read', 'Xem nhật ký tin nhắn SMS / Zalo và cấu hình kênh gửi')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'message_log.read'
WHERE r.code = 'clinic_admin'
ON CONFLICT DO NOTHING;
COMMIT;
