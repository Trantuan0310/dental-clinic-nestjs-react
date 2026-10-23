-- =============================================================================
-- Migration 056 — retry SMS / Zalo messages that failed
-- =============================================================================
-- A FAILED message is tried again by the next runs of its job, up to
-- MESSAGE_MAX_ATTEMPTS (messaging.service.ts) in all; attempts counts them.
-- =============================================================================
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1;
