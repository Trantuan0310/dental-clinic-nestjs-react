-- Migration 011 — Payroll: backfill config_snapshot for existing periods
-- Date: 2026-07-15
-- Reference: BR-PAY-023 (config snapshot frozen at period creation)
-- Pre-requisite: migration 009 must have run (column added with default '{}')

BEGIN;

-- For any period created before snapshot was mandatory, copy current live config.
-- This is an idempotent safe operation: re-running on already-backfilled data
-- is harmless because we only fill rows where the snapshot is still the default.
UPDATE payroll_periods pp
SET config_snapshot = jsonb_build_object(
  'payrollCycle', pc.payroll_cycle,
  'overtimeMultiplier', pc.overtime_multiplier,
  'bhxhPct', pc.bhxh_pct,
  'bhytPct', pc.bhyt_pct,
  'bhtnPct', pc.bhtn_pct,
  'minGrossForBhxh', pc.min_gross_for_bhxh,
  'probationSalaryPct', pc.probation_salary_pct,
  'taxBrackets', pc.tax_brackets,
  'backfilled', true,
  'backfilledAt', now()
)
FROM payroll_config pc
WHERE pp.config_snapshot = '{}'::jsonb;

-- After backfill, enforce NOT NULL by tightening the default.
ALTER TABLE payroll_periods
  ALTER COLUMN config_snapshot DROP DEFAULT;

COMMIT;