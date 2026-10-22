-- The public booking page promises a reply within 30 minutes of opening
-- hours. A request still waiting after that gets one reminder email to the
-- front desk; staff_reminded_at records it was sent (or claimed), so the
-- 5-minute job never sends it twice.
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS staff_reminded_at TIMESTAMPTZ;
