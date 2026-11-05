-- =============================================================================
-- Migration 058 — Bank transfers received (A6.3: tự ghi nhận chuyển khoản)
-- =============================================================================
-- One row per incoming transfer the bank (through an aggregator such as SePay)
-- reported to POST /webhooks/bank/sepay. (provider, external_id) is unique, so
-- a resent notification is the same row, never a second payment.
--   RECORDED      matched an invoice by the code in the transfer note and a
--                 payment was recorded (payment_id)
--   NEEDS_REVIEW  not recorded: no invoice code, unknown invoice, invoice not
--                 owed, more than owed, or no recording account configured.
--                 `reason` says which; the front desk handles it by hand
--   RESOLVED      a person dealt with a NEEDS_REVIEW row (resolution_note)
-- No new permission: listing and resolving need invoice.payment.create.
-- =============================================================================
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BankTransactionStatus') THEN
    CREATE TYPE "BankTransactionStatus" AS ENUM ('RECORDED', 'NEEDS_REVIEW', 'RESOLVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bank_transactions (
  id               UUID NOT NULL DEFAULT uuid_generate_v7(),
  provider         VARCHAR(20) NOT NULL,
  external_id      VARCHAR(100) NOT NULL,
  reference_code   VARCHAR(100),
  account_no       VARCHAR(30) NOT NULL,
  amount           NUMERIC(15, 0) NOT NULL,
  content          VARCHAR(500) NOT NULL,
  transaction_at   TIMESTAMPTZ NOT NULL,
  status           "BankTransactionStatus" NOT NULL,
  reason           VARCHAR(40),
  invoice_id       UUID,
  payment_id       UUID,
  resolved_by      UUID,
  resolved_at      TIMESTAMPTZ,
  resolution_note  VARCHAR(500),
  raw              JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bank_transactions_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_provider_external_id_key
  ON bank_transactions (provider, external_id);
CREATE INDEX IF NOT EXISTS bank_transactions_status_created_at_idx
  ON bank_transactions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS bank_transactions_invoice_id_idx ON bank_transactions (invoice_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_invoice_id_fkey') THEN
    ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_payment_id_fkey') THEN
    ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_payment_id_fkey
      FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_resolved_by_fkey') THEN
    ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_resolved_by_fkey
      FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
