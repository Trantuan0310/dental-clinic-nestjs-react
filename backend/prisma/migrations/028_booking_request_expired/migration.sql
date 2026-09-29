-- Online booking requests that nobody confirmed before their time passed are
-- closed as EXPIRED by BookingCron (every 5 minutes) instead of waiting in the
-- inbox forever. The time that counts is the proposed one for PROPOSED /
-- PATIENT_ACCEPTED and the requested one otherwise.
--
-- No BEGIN/COMMIT: a new enum value cannot be used inside the transaction
-- that adds it, and nothing here needs to.
ALTER TYPE "BookingRequestStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
