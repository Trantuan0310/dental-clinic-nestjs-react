-- =============================================================================
-- Migration 045 — Correcting invoices and treatment prices (round 4, FD)
-- =============================================================================
-- 1. A payment entered by mistake can be voided (payments.status = VOIDED,
--    with who/when/why), and money handed back is a REFUND row (positive
--    amount, paid_at = refund date). invoices.paid_amount stays the net money
--    kept; invoices.refunded_amount sums the refunds, which do not reopen the
--    debt (outstanding = total - paid - refunded).
-- 2. A voided invoice can be re-made for the same encounter: encounter_id is
--    unique only among non-VOIDED invoices, and the new invoice points at the
--    one it replaces (one replacement per voided invoice).
-- 3. Treatments keep the catalogue price they started from (list_price) and
--    the reason given when the dentist charged something else.
-- 4. Permissions: invoice.payment.void, invoice.refund, invoice.reissue,
--    invoice.item.update (clinic admin only) and treatment.price_override
--    (clinic admin and dentist). seed.ts holds the same grants.
-- =============================================================================
BEGIN;

-- 1. Payments ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentKind') THEN
    CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND');
  END IF;
END $$;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS kind "PaymentKind" NOT NULL DEFAULT 'PAYMENT';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS voided_by UUID;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS void_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_voided_by_fkey') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_voided_by_fkey
      FOREIGN KEY (voided_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_positive_check') THEN
    -- NOT VALID: checked for new rows only, an odd legacy row cannot block the upgrade.
    ALTER TABLE payments ADD CONSTRAINT payments_amount_positive_check CHECK (amount > 0) NOT VALID;
  END IF;
END $$;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refunded_amount DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- 2. Re-made invoices ----------------------------------------------------------
DROP INDEX IF EXISTS "invoices_encounter_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_encounter_id_active_key"
  ON invoices (encounter_id) WHERE status <> 'VOIDED';
CREATE INDEX IF NOT EXISTS "invoices_encounter_id_idx" ON invoices (encounter_id);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS replaces_invoice_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_replaces_invoice_id_key"
  ON invoices (replaces_invoice_id);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_replaces_invoice_id_fkey') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_replaces_invoice_id_fkey
      FOREIGN KEY (replaces_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Treatment prices ----------------------------------------------------------
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS list_price DECIMAL(15, 0);
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS price_reason TEXT;

-- 4. Permissions ---------------------------------------------------------------
INSERT INTO permissions (code, resource, action, description) VALUES
  ('invoice.payment.void', 'invoice', 'payment.void',
   'Hủy phiếu thu ghi nhầm (có lý do; không tự hủy phiếu mình thu)'),
  ('invoice.refund', 'invoice', 'refund', 'Lập phiếu hoàn tiền cho bệnh nhân (có lý do)'),
  ('invoice.reissue', 'invoice', 'reissue', 'Lập lại hóa đơn cho phiên khám có hóa đơn đã hủy'),
  ('invoice.item.update', 'invoice', 'item.update', 'Sửa/bỏ dòng hóa đơn nháp (có lý do)'),
  ('treatment.price_override', 'treatment', 'price_override',
   'Áp đơn giá thủ thuật khác giá niêm yết/giá đã chốt (có lý do)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'invoice.payment.void', 'invoice.refund', 'invoice.reissue', 'invoice.item.update',
  'treatment.price_override'
)
WHERE r.code = 'clinic_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'treatment.price_override'
WHERE r.code = 'dentist'
ON CONFLICT DO NOTHING;

COMMIT;
