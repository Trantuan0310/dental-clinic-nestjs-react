ALTER TABLE "prescription_lines"
  ADD COLUMN IF NOT EXISTS "quantity" INTEGER,
  ADD COLUMN IF NOT EXISTS "unit" VARCHAR(50);

ALTER TABLE "prescription_lines"
  ADD CONSTRAINT "prescription_lines_quantity_positive"
  CHECK ("quantity" IS NULL OR "quantity" > 0);
