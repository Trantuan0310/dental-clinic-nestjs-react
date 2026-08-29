-- =============================================================================
-- Migration 011_prescription_extra_fields
-- =============================================================================
-- Adds diagnosis / instructions / followUpNote columns to the `prescriptions`
-- table so the FE can store (and render) the clinical context that the
-- patient needs in addition to the drug lines. Also adds a `version` column
-- for optimistic concurrency on future PATCH endpoints.
--
-- All ALTERs are idempotent (IF NOT EXISTS) and safe to re-run.
-- =============================================================================

ALTER TABLE "prescriptions"
  ADD COLUMN IF NOT EXISTS "diagnosis"    TEXT,
  ADD COLUMN IF NOT EXISTS "instructions" TEXT,
  ADD COLUMN IF NOT EXISTS "follow_up_note" TEXT,
  ADD COLUMN IF NOT EXISTS "version"       INTEGER NOT NULL DEFAULT 0;