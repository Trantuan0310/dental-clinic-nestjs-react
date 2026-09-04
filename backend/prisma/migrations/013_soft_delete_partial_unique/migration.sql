-- =============================================================================
-- Migration 013 — Scope soft-delete-aware unique constraints to active rows
-- =============================================================================
--
-- Problem: `users_email_key` and `patient_identifiers_type_value_key` are
-- full-table unique indexes. Neither excludes rows that the app already
-- treats as "gone" (deactivated user / soft-deleted identifier), so once a
-- row is deactivated or soft-deleted, its email / identifier value can never
-- be reused by a new row — INSERT hits the raw DB constraint even though the
-- application-layer duplicate checks (users.service.ts, patients.service.ts)
-- already scope to active rows only.
--
-- For patient_identifiers this is a live bug: addIdentifier() checks
-- `deletedAt: null` before create(), so re-adding an identifier value that
-- was previously soft-deleted passes the app check and then throws a raw
-- Prisma P2002 from the create() call.
--
-- For users, `deletedAt` is currently unused (no delete-user feature exists)
-- but is included for forward compatibility; the field that actually causes
-- the problem in practice is `deactivated_at`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- USERS — allow a deactivated user's email to be reused by a new account
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "users_email_key";

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_active_key"
  ON "users" ("email")
  WHERE "deactivated_at" IS NULL AND "deleted_at" IS NULL;

-- ---------------------------------------------------------------------------
-- PATIENT_IDENTIFIERS — allow a soft-deleted identifier value to be reused
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "patient_identifiers_type_value_key";

CREATE UNIQUE INDEX IF NOT EXISTS "patient_identifiers_type_value_active_key"
  ON "patient_identifiers" ("type", "value")
  WHERE "deleted_at" IS NULL;
