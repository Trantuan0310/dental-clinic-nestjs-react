-- Payroll round 4 (H2, H5).
--
-- 1. Adjustments (bonus/penalty) belong to (period, dentist), not to a line
--    item. Recomputing a period used to delete its line items and the
--    adjustments cascaded away with them. Existing rows are moved over from
--    their line item; nothing is deleted.
-- 2. Commission is paid on issued invoices: each detail row records the
--    invoice line, the amount after the invoice discount and the rate used.

-- ---------------------------------------------------------------------------
-- 1. payroll_adjustments → (payroll_period_id, dentist_id)
-- ---------------------------------------------------------------------------
ALTER TABLE payroll_adjustments ADD COLUMN IF NOT EXISTS payroll_period_id UUID;
ALTER TABLE payroll_adjustments ADD COLUMN IF NOT EXISTS dentist_id UUID;
ALTER TABLE payroll_adjustments ADD COLUMN IF NOT EXISTS source_invoice_id UUID;

UPDATE payroll_adjustments a
   SET payroll_period_id = li.payroll_period_id,
       dentist_id        = li.dentist_id
  FROM payroll_line_items li
 WHERE li.id = a.payroll_line_item_id
   AND (a.payroll_period_id IS NULL OR a.dentist_id IS NULL);

-- Every adjustment has a line item today (NOT NULL + ON DELETE CASCADE), so
-- the backfill covers all rows. Stop here rather than lose data if not.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payroll_adjustments
              WHERE payroll_period_id IS NULL OR dentist_id IS NULL) THEN
    RAISE EXCEPTION 'payroll_adjustments rows without a line item: backfill them by hand first';
  END IF;
END $$;

ALTER TABLE payroll_adjustments ALTER COLUMN payroll_period_id SET NOT NULL;
ALTER TABLE payroll_adjustments ALTER COLUMN dentist_id SET NOT NULL;

-- The line item link no longer owns the row: SET NULL instead of CASCADE.
ALTER TABLE payroll_adjustments ALTER COLUMN payroll_line_item_id DROP NOT NULL;
ALTER TABLE payroll_adjustments DROP CONSTRAINT IF EXISTS payroll_adjustments_payroll_line_item_id_fkey;
ALTER TABLE payroll_adjustments
  ADD CONSTRAINT payroll_adjustments_payroll_line_item_id_fkey
  FOREIGN KEY (payroll_line_item_id) REFERENCES payroll_line_items(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- System clawbacks have no human actor.
ALTER TABLE payroll_adjustments ALTER COLUMN adjusted_by_user_id DROP NOT NULL;

ALTER TABLE payroll_adjustments DROP CONSTRAINT IF EXISTS payroll_adjustments_payroll_period_id_fkey;
ALTER TABLE payroll_adjustments
  ADD CONSTRAINT payroll_adjustments_payroll_period_id_fkey
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE payroll_adjustments DROP CONSTRAINT IF EXISTS payroll_adjustments_dentist_id_fkey;
ALTER TABLE payroll_adjustments
  ADD CONSTRAINT payroll_adjustments_dentist_id_fkey
  FOREIGN KEY (dentist_id) REFERENCES users(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE payroll_adjustments DROP CONSTRAINT IF EXISTS payroll_adjustments_source_invoice_id_fkey;
ALTER TABLE payroll_adjustments
  ADD CONSTRAINT payroll_adjustments_source_invoice_id_fkey
  FOREIGN KEY (source_invoice_id) REFERENCES invoices(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS payroll_adjustments_payroll_period_id_dentist_id_idx
  ON payroll_adjustments (payroll_period_id, dentist_id);
CREATE INDEX IF NOT EXISTS payroll_adjustments_source_invoice_id_idx
  ON payroll_adjustments (source_invoice_id);

-- ---------------------------------------------------------------------------
-- 2. payroll_encounter_details: commission basis per invoice line
-- ---------------------------------------------------------------------------
ALTER TABLE payroll_encounter_details ADD COLUMN IF NOT EXISTS invoice_id UUID;
ALTER TABLE payroll_encounter_details ADD COLUMN IF NOT EXISTS invoice_item_id UUID;
ALTER TABLE payroll_encounter_details ADD COLUMN IF NOT EXISTS basis_amount_vnd DECIMAL(15, 0);
ALTER TABLE payroll_encounter_details ADD COLUMN IF NOT EXISTS commission_pct DECIMAL(5, 4);

-- An invoice line need not be a treatment.
ALTER TABLE payroll_encounter_details ALTER COLUMN treatment_id DROP NOT NULL;

ALTER TABLE payroll_encounter_details DROP CONSTRAINT IF EXISTS payroll_encounter_details_invoice_id_fkey;
ALTER TABLE payroll_encounter_details
  ADD CONSTRAINT payroll_encounter_details_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE payroll_encounter_details DROP CONSTRAINT IF EXISTS payroll_encounter_details_invoice_item_id_fkey;
ALTER TABLE payroll_encounter_details
  ADD CONSTRAINT payroll_encounter_details_invoice_item_id_fkey
  FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- One row per invoice line (older rows have NULL and keep their own data).
DROP INDEX IF EXISTS payroll_encounter_details_payroll_line_item_id_encounter_id_key;
DROP INDEX IF EXISTS payroll_encounter_details_payroll_line_item_id_encounter_id_treatment_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS payroll_encounter_details_line_item_invoice_item_key
  ON payroll_encounter_details (payroll_line_item_id, invoice_item_id);
CREATE INDEX IF NOT EXISTS payroll_encounter_details_invoice_id_idx
  ON payroll_encounter_details (invoice_id);
