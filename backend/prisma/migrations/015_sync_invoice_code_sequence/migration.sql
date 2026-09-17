CREATE SEQUENCE IF NOT EXISTS invoice_code_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

WITH current_codes AS (
  SELECT COALESCE(MAX(split_part(code, '-', 3)::bigint), 0) AS max_value
  FROM invoices
  WHERE code ~ '^INV-[0-9]{4}-[0-9]+$'
)
SELECT setval(
  'invoice_code_seq',
  GREATEST((SELECT last_value FROM invoice_code_seq), current_codes.max_value, 1),
  (SELECT is_called FROM invoice_code_seq) OR current_codes.max_value > 0
)
FROM current_codes;
