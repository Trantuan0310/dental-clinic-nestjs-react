-- BILL-02 (audit 2026-09-14): a payment request sent twice (double click, a
-- retry after a lost response) must not record the money twice. The client
-- sends one key per payment it means to record; the second insert with the
-- same key hits this index and the API returns the payment already recorded.
-- NULL keys (older clients, refunds) are never equal, so they are unaffected.
ALTER TABLE payments ADD COLUMN request_key VARCHAR(64);

CREATE UNIQUE INDEX payments_invoice_id_request_key_key
  ON payments (invoice_id, request_key);
