-- A treatment line can cover several units (e.g. 3 composite fillings at the
-- same price). Existing rows stay at 1, which is what invoices billed them at.
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treatments_quantity_check') THEN
    ALTER TABLE treatments
      ADD CONSTRAINT treatments_quantity_check CHECK (quantity BETWEEN 1 AND 100);
  END IF;
END $$;
