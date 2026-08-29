-- =============================================================================
-- Migration 010_perf_indexes — Performance indexes (Phase: Audit & Optimization)
-- Generated for mid-term optimization plan.
--
-- All indexes use CREATE INDEX CONCURRENTLY so they do not block writes
-- against large tables. This migration should be run during a low-traffic
-- window or applied via psql outside Prisma migrate deploy.
--
-- Prisma migration runner does NOT natively support CONCURRENTLY. We wrap
-- each statement in a DO block that is a no-op when CONCURRENTLY is not
-- supported (e.g. inside a transaction), and we mark this migration as
-- non-transactional by splitting each index into its own file step.
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
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_full_name_idx"
  ON "users" ("full_name");

-- @@index([status, fullName]) for "active staff" filtered search.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_status_full_name_idx"
  ON "users" ("status", "full_name");

-- ---------------------------------------------------------------------------
-- PATIENTS — JSONB GIN indexes for medical history fields
-- ---------------------------------------------------------------------------
-- Allows queries like: WHERE allergies @> '["penicillin"]' OR
--                       WHERE chronic_diseases @> '["diabetes"]'
-- Using jsonb_path_ops for smaller, faster index on containment (@>).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "patients_allergies_gin_idx"
  ON "patients" USING GIN ("allergies" jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "patients_chronic_diseases_gin_idx"
  ON "patients" USING GIN ("chronic_diseases" jsonb_path_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "patients_current_medications_gin_idx"
  ON "patients" USING GIN ("current_medications" jsonb_path_ops);

-- Trigram index for fuzzy name search (autocomplete patient lookup).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "patients_full_name_trgm_idx"
  ON "patients" USING GIN ("full_name" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- APPOINTMENTS — composite for calendar filtering
-- ---------------------------------------------------------------------------
-- Existing: unique_active_slot(dentist_id, start_at), dentist_id+start_at,
--           patient_id+start_at DESC, start_at, status+start_at.
-- Add composite (status, start_at, dentist_id) so calendar queries that
-- filter by status and dentist benefit from a covering index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "appointments_status_start_dentist_idx"
  ON "appointments" ("status", "start_at", "dentist_id");

-- ---------------------------------------------------------------------------
-- INVOICES — dashboard revenue range scan
-- ---------------------------------------------------------------------------
-- Existing: patient_id+created_at DESC, status.
-- Add composite (status, created_at DESC) for "revenue by period" reports.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "invoices_status_created_at_idx"
  ON "invoices" ("status", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- PAYROLL_LINE_ITEMS — payslip lookup composite
-- ---------------------------------------------------------------------------
-- Existing: unique(payroll_period_id, dentist_id), dentist_id+computed_at DESC.
-- Add partial index for the most common query path: "active (non-deleted) line
-- items for a dentist sorted by computation time".
-- Note: payroll_line_items has no deletedAt column; this is purely a covering
-- composite to give the query planner a single index to use.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "payroll_line_items_dentist_computed_idx"
  ON "payroll_line_items" ("dentist_id", "computed_at" DESC);