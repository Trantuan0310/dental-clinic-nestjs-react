-- Online booking and the public price list are decided per service, and a
-- price of 0 is shown as "free" only when the clinic says so explicitly.
-- Existing services keep their behaviour: bookable online and listed.
ALTER TABLE services ADD COLUMN IF NOT EXISTS bookable_online BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS show_public_price BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT FALSE;

-- The shipped catalogue (clinic-setup/catalog.ts, catalog-seed.ts) prices the
-- general check-up and follow-up visits at 0 on purpose. Any other 0 may be
-- the old form default, so it shows as "Liên hệ" until an admin ticks
-- "Dịch vụ miễn phí".
UPDATE services SET is_free = TRUE
 WHERE code IN ('KHAM_TQ', 'TAI_KHAM') AND base_price = 0 AND is_free = FALSE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_free_price_check') THEN
    ALTER TABLE services
      ADD CONSTRAINT services_free_price_check CHECK (NOT is_free OR base_price = 0);
  END IF;
END $$;
