-- =============================================================================
-- Migration 050 — Reopening a closed encounter; writing down an issued invoice
-- =============================================================================
-- 1. "Điều chỉnh giảm / xoá nợ": an issued invoice's debt can be lowered with
--    a reason, keeping its payments. Each write-down is a row of
--    invoice_adjustments (dated, by whom); invoices.adjusted_amount sums them
--    (outstanding = total - paid - refunded - adjusted). Like a refund, it
--    lowers revenue and the commission basis on its own date, never in the
--    month the invoice was issued.
-- 2. Permissions, clinic admin only: encounter.reopen (BR-MR-024, reopen a
--    COMPLETED encounter whose invoice is still a draft or voided) and
--    invoice.adjust. seed.ts holds the same grants.
-- =============================================================================
BEGIN;

-- 1. Invoice adjustments -------------------------------------------------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS adjusted_amount DECIMAL(12, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS invoice_adjustments (
  id          UUID NOT NULL DEFAULT uuid_generate_v7(),
  invoice_id  UUID NOT NULL,
  amount      DECIMAL(12, 2) NOT NULL,
  reason      TEXT NOT NULL,
  adjusted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  adjusted_by UUID NOT NULL,
  CONSTRAINT invoice_adjustments_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_adjustments_amount_positive_check CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS "invoice_adjustments_invoice_id_adjusted_at_idx"
  ON invoice_adjustments (invoice_id, adjusted_at DESC);
CREATE INDEX IF NOT EXISTS "invoice_adjustments_adjusted_at_idx"
  ON invoice_adjustments (adjusted_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_adjustments_invoice_id_fkey') THEN
    ALTER TABLE invoice_adjustments ADD CONSTRAINT invoice_adjustments_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_adjustments_adjusted_by_fkey') THEN
    ALTER TABLE invoice_adjustments ADD CONSTRAINT invoice_adjustments_adjusted_by_fkey
      FOREIGN KEY (adjusted_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- 2. Permissions ---------------------------------------------------------------
INSERT INTO permissions (code, resource, action, description) VALUES
  ('encounter.reopen', 'encounter', 'reopen',
   'Mở lại phiên khám đã kết thúc khi hóa đơn còn nháp hoặc đã hủy (có lý do)'),
  ('invoice.adjust', 'invoice', 'adjust',
   'Điều chỉnh giảm / xoá nợ hóa đơn đã phát hành (có lý do, giữ phiếu thu)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('encounter.reopen', 'invoice.adjust')
WHERE r.code = 'clinic_admin'
ON CONFLICT DO NOTHING;
COMMIT;
