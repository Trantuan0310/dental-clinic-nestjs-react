-- Sequences used by raw SQL code generators.
-- Loaded at first volume init via /docker-entrypoint-initdb.d/03-sequences.sql.
-- These are NOT managed by Prisma because the sequence value feeds into a
-- human-readable business code (e.g. PAT-2026-00001), not an auto-increment PK.

-- Per-year running counter for Patient.code (BR-PT-001).
-- We use a single sequence (not per-year) so the year prefix in code is a
-- pure formatting concern; the numeric portion is monotonic across years.
CREATE SEQUENCE IF NOT EXISTS public.patient_code_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

-- Per-year running counter for Invoice.code (BR-INV-001).
CREATE SEQUENCE IF NOT EXISTS public.invoice_code_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;
