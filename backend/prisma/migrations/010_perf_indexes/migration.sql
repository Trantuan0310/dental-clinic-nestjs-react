-- =============================================================================
-- Migration 010_perf_indexes — Performance indexes (Phase: Audit & Optimization)
-- Generated for mid-term optimization plan.
--
-- NOT CONCURRENTLY: CREATE INDEX CONCURRENTLY cannot run inside a transaction,
-- and `prisma migrate deploy` executes a migration.sql file as one implicit
-- transaction — it has no built-in way to run a statement outside of it. An
-- earlier version of this file used CONCURRENTLY assuming a manual psql-only
-- deploy path; nothing enforced that, so a standard `prisma migrate deploy`
-- would abort partway through this file. Plain CREATE INDEX takes a brief
-- ACCESS EXCLUSIVE lock on the target table, which is acceptable at this
-- project's current scale (no live production traffic yet). If write-lock
-- avoidance becomes necessary once tables are large, recreate the specific
-- index CONCURRENTLY by hand via psql and DROP the plain one created here.
--
-- Targets:
--   - users:           search staff by fullName + filter by status
--   - patients:        search medical JSONB columns (allergies, chronic_diseases)
--   - appointments:    calendar filter by status+startAt+dentistId
--   - invoices:        dashboard revenue by createdAt+status
--   - payroll_line_items: dentist payslip lookup composite
-- =============================================================================

-- ---------------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------------
-- @@index([fullName]) for staff search.
CREATE INDEX IF NOT EXISTS "users_full_name_idx"
  ON "users" ("full_name");

-- @@index([status, fullName]) for "active staff" filtered search.
CREATE INDEX IF NOT EXISTS "users_status_full_name_idx"
  ON "users" ("status", "full_name");

-- ---------------------------------------------------------------------------
-- PATIENTS — JSONB GIN indexes for medical history fields
-- ---------------------------------------------------------------------------
-- Allows queries like: WHERE allergies @> '["penicillin"]' OR
--                       WHERE chronic_diseases @> '["diabetes"]'
-- Using jsonb_path_ops for smaller, faster index on containment (@>).
CREATE INDEX IF NOT EXISTS "patients_allergies_gin_idx"
  ON "patients" USING GIN ("allergies" jsonb_path_ops);

CREATE INDEX IF NOT EXISTS "patients_chronic_diseases_gin_idx"
  ON "patients" USING GIN ("chronic_diseases" jsonb_path_ops);

CREATE INDEX IF NOT EXISTS "patients_current_medications_gin_idx"
  ON "patients" USING GIN ("current_medications" jsonb_path_ops);

-- Trigram index for fuzzy name search (autocomplete patient lookup).
CREATE INDEX IF NOT EXISTS "patients_full_name_trgm_idx"
  ON "patients" USING GIN ("full_name" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- APPOINTMENTS — composite for calendar filtering
-- ---------------------------------------------------------------------------
-- Existing: unique_active_slot(dentist_id, start_at), dentist_id+start_at,
--           patient_id+start_at DESC, start_at, status+start_at.
-- Add composite (status, start_at, dentist_id) so calendar queries that
-- filter by status and dentist benefit from a covering index.
CREATE INDEX IF NOT EXISTS "appointments_status_start_dentist_idx"
  ON "appointments" ("status", "start_at", "dentist_id");

-- ---------------------------------------------------------------------------
-- INVOICES — dashboard revenue range scan
-- ---------------------------------------------------------------------------
-- Existing: patient_id+created_at DESC, status.
-- Add composite (status, created_at DESC) for "revenue by period" reports.
CREATE INDEX IF NOT EXISTS "invoices_status_created_at_idx"
  ON "invoices" ("status", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- PAYROLL_LINE_ITEMS — payslip lookup composite
-- ---------------------------------------------------------------------------
-- Existing: unique(payroll_period_id, dentist_id), dentist_id+computed_at DESC.
-- Add partial index for the most common query path: "active (non-deleted) line
-- items for a dentist sorted by computation time".
-- Note: payroll_line_items has no deletedAt column; this is purely a covering
-- composite to give the query planner a single index to use.
CREATE INDEX IF NOT EXISTS "payroll_line_items_dentist_computed_idx"
  ON "payroll_line_items" ("dentist_id", "computed_at" DESC);
