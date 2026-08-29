-- Migration 009 — Payroll Module
-- Date: 2026-07-15
-- Reference: docs/04_Database/schema-per-module/payroll.md
--            docs/03_Specification/Payroll/SPEC.md (BD-0009)

BEGIN;

-- ============================================================
-- 1. payroll_config (singleton)
-- ============================================================
CREATE TABLE payroll_config (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  payroll_cycle VARCHAR(16) NOT NULL DEFAULT 'MONTHLY'
    CHECK (payroll_cycle IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY')),
  overtime_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.50,
  default_tax_tncn_pct DECIMAL(5,4) NOT NULL DEFAULT 0.10,
  bhxh_pct DECIMAL(5,4) NOT NULL DEFAULT 0.08,
  bhyt_pct DECIMAL(5,4) NOT NULL DEFAULT 0.015,
  bhtn_pct DECIMAL(5,4) NOT NULL DEFAULT 0.01,
  min_gross_for_bhxh BIGINT NOT NULL DEFAULT 4680000,
  probation_salary_pct DECIMAL(4,2) NOT NULL DEFAULT 0.85,
  tax_brackets JSONB NOT NULL DEFAULT '{
    "personalDeductionVnd": 11000000,
    "brackets": [
      {"thresholdVnd": 5000000,  "rate": 0.05},
      {"thresholdVnd": 10000000, "rate": 0.10},
      {"thresholdVnd": 18000000, "rate": 0.15},
      {"thresholdVnd": 32000000, "rate": 0.20},
      {"thresholdVnd": null,      "rate": 0.25}
    ]
  }'::jsonb,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Singleton constraint
CREATE UNIQUE INDEX idx_payroll_config_singleton
  ON payroll_config ((true));

-- Seed default config
INSERT INTO payroll_config (id) VALUES (uuidv7());


-- ============================================================
-- 2. dentist_compensations (effective dating)
-- ============================================================
CREATE TABLE dentist_compensations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL,
  effective_to DATE,
  base_salary_vnd BIGINT NOT NULL CHECK (base_salary_vnd >= 0),
  commission_pct DECIMAL(5,4) NOT NULL DEFAULT 0 CHECK (commission_pct >= 0 AND commission_pct <= 1),
  overtime_hourly_vnd BIGINT NOT NULL DEFAULT 0 CHECK (overtime_hourly_vnd >= 0),
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_effective_range CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_dentist_comp_effective
  ON dentist_compensations (dentist_id, effective_from, effective_to)
  WHERE deleted_at IS NULL;

-- Prevent overlap using daterange EXCLUDE constraint (requires btree_gist)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE dentist_compensations
  ADD CONSTRAINT excl_dentist_comp_no_overlap
  EXCLUDE USING gist (
    dentist_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[)') WITH &&
  ) WHERE (deleted_at IS NULL);


-- ============================================================
-- 3. payroll_periods (state machine)
-- ============================================================
CREATE TABLE payroll_periods (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payroll_cycle VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'REVIEWING', 'APPROVED', 'PAID', 'LOCKED')),
  config_snapshot JSONB NOT NULL,
  opened_from_period_id UUID REFERENCES payroll_periods(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  marked_paid_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  locked_immutable_at TIMESTAMPTZ,
  CONSTRAINT chk_period_range CHECK (period_end > period_start),
  CONSTRAINT chk_status_lifecycle CHECK (
    (status = 'DRAFT' AND locked_at IS NULL AND approved_at IS NULL AND paid_at IS NULL) OR
    (status = 'REVIEWING' AND locked_at IS NOT NULL AND approved_at IS NULL AND paid_at IS NULL) OR
    (status = 'APPROVED' AND locked_at IS NOT NULL AND approved_at IS NOT NULL AND paid_at IS NULL) OR
    (status = 'PAID' AND locked_at IS NOT NULL AND approved_at IS NOT NULL AND paid_at IS NOT NULL) OR
    (status = 'LOCKED' AND locked_at IS NOT NULL AND approved_at IS NOT NULL AND paid_at IS NOT NULL AND locked_immutable_at IS NOT NULL)
  )
);

-- BR-PAY-023 snapshot is mandatory → add default empty object migration safety net
-- (will be back-filled by migration 011_payroll_config_snapshot_backfill.sql)
ALTER TABLE payroll_periods ALTER COLUMN config_snapshot SET DEFAULT '{}'::jsonb;

-- R2-3.2: adjustment periods (BR-PAY-019) link back to original via
-- opened_from_period_id. They can have the same period_start/period_end as
-- the original because the ORIGINAL is unmodified — the adjustment is a new
-- period that references it. So exclude adjustment rows from the no-overlap
-- constraint.
--
-- Note: this migration assumes it's run AFTER `011_payroll_config_snapshot_backfill.sql`
-- (which doesn't exist yet, but the DROP/recreate of the index is independent).
--
-- If a fresh DB: the very first 009 migration run won't have an existing index
-- to drop, hence the IF EXISTS guard.
DROP INDEX IF EXISTS idx_payroll_periods_no_overlap;
CREATE UNIQUE INDEX idx_payroll_periods_no_overlap
  ON payroll_periods (period_start, period_end)
  WHERE status != 'LOCKED' AND opened_from_period_id IS NULL;

CREATE INDEX idx_payroll_periods_status_start
  ON payroll_periods (status, period_start DESC);

-- BR-PAY-017: cron auto-lock
CREATE INDEX idx_payroll_periods_paid_auto_lock
  ON payroll_periods (paid_at)
  WHERE status = 'PAID';

-- BR-PAY-019: lookup re-opened periods
CREATE INDEX idx_payroll_periods_opened_from
  ON payroll_periods (opened_from_period_id)
  WHERE opened_from_period_id IS NOT NULL;


-- ============================================================
-- 4. payroll_line_items (computed result, idempotent)
-- ============================================================
CREATE TABLE payroll_line_items (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  encounters_count INTEGER NOT NULL DEFAULT 0 CHECK (encounters_count >= 0),
  total_revenue_vnd BIGINT NOT NULL DEFAULT 0 CHECK (total_revenue_vnd >= 0),
  worked_shifts INTEGER NOT NULL DEFAULT 0 CHECK (worked_shifts >= 0),
  total_hours DECIMAL(8,2) NOT NULL DEFAULT 0 CHECK (total_hours >= 0),
  overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
  base_salary_vnd BIGINT NOT NULL DEFAULT 0 CHECK (base_salary_vnd >= 0),
  commission_vnd BIGINT NOT NULL DEFAULT 0 CHECK (commission_vnd >= 0),
  overtime_pay_vnd BIGINT NOT NULL DEFAULT 0 CHECK (overtime_pay_vnd >= 0),
  bonus_vnd BIGINT NOT NULL DEFAULT 0,
  penalty_vnd BIGINT NOT NULL DEFAULT 0,
  gross_pay_vnd BIGINT NOT NULL DEFAULT 0 CHECK (gross_pay_vnd >= 0),
  tax_tncn_vnd BIGINT NOT NULL DEFAULT 0 CHECK (tax_tncn_vnd >= 0),
  bhxh_vnd BIGINT NOT NULL DEFAULT 0 CHECK (bhxh_vnd >= 0),
  net_pay_vnd BIGINT NOT NULL DEFAULT 0 CHECK (net_pay_vnd >= 0),
  computation_log JSONB NOT NULL DEFAULT '{}'::jsonb,
  manually_adjusted BOOLEAN NOT NULL DEFAULT false,
  adjustment_note TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BR-PAY-022: idempotent compute (1 line item per period × dentist)
CREATE UNIQUE INDEX idx_payroll_line_items_unique
  ON payroll_line_items (payroll_period_id, dentist_id);

CREATE INDEX idx_payroll_line_items_dentist
  ON payroll_line_items (dentist_id, computed_at DESC);


-- ============================================================
-- 5. payroll_encounter_details (breakdown)
-- ============================================================
CREATE TABLE payroll_encounter_details (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  payroll_line_item_id UUID NOT NULL REFERENCES payroll_line_items(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT,
  treatment_revenue_vnd BIGINT NOT NULL CHECK (treatment_revenue_vnd >= 0),
  encounter_start_at TIMESTAMPTZ NOT NULL,
  encounter_end_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  treatment_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT chk_encounter_range CHECK (encounter_end_at > encounter_start_at)
);

CREATE UNIQUE INDEX idx_payroll_encounter_detail_unique
  ON payroll_encounter_details (payroll_line_item_id, encounter_id, treatment_id);

CREATE INDEX idx_payroll_encounter_detail_encounter
  ON payroll_encounter_details (encounter_id);


-- ============================================================
-- 6. payroll_adjustments (audit trail)
-- ============================================================
CREATE TABLE payroll_adjustments (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  payroll_line_item_id UUID NOT NULL REFERENCES payroll_line_items(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('BONUS', 'PENALTY', 'DEDUCTION', 'MANUAL_OVERRIDE')),
  amount_vnd BIGINT NOT NULL CHECK (amount_vnd != 0),
  reason TEXT NOT NULL CHECK (length(reason) >= 5 AND length(reason) <= 500),
  adjusted_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  adjusted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_adjustments_line_item
  ON payroll_adjustments (payroll_line_item_id, adjusted_at DESC);


-- ============================================================
-- 7. Audit log entries (Phase 8 already created audit_logs; just add new actions)
-- ============================================================
-- New audit actions: PAYROLL_CONFIG_UPDATED, COMPENSATION_CREATED, COMPENSATION_UPDATED,
--   PERIOD_CREATED, PERIOD_COMPUTED, ADJUSTMENT_ADDED, PERIOD_LOCKED, PERIOD_APPROVED,
--   PERIOD_PAID, PERIOD_AUTO_LOCKED, SHIFT_REGISTERED, SHIFT_APPROVED, SHIFT_REJECTED,
--   SHIFT_CANCELLED, PAYSLIP_VIEWED
-- (handled in audit module seed)

COMMIT;