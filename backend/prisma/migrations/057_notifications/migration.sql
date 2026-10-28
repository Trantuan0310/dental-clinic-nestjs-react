-- =============================================================================
-- Migration 057 — in-app notifications (chuông thông báo: đã đọc / lịch sử)
-- =============================================================================
-- One row per (user, event): a new online booking request, a shift waiting
-- for approval, a draft invoice to issue, the morning digest (recalls due,
-- low stock, encounters left open). read_at marks it read. dedupe_key makes
-- each event reach a user once however often the producer runs.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID NOT NULL DEFAULT uuid_generate_v7(),
  user_id     UUID NOT NULL,
  type        VARCHAR(40) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        VARCHAR(500),
  target_id   UUID,
  dedupe_key  VARCHAR(200) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_id_dedupe_key_key ON notifications (user_id, dedupe_key);
CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

COMMIT;
