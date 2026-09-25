-- ADR-0009 D2: a checked-in patient who leaves before being seen is LEFT
-- (was: a late cancel with a reason, BR-APPT-025). Kept in its own
-- migration: a new enum value can't be used in the transaction that adds it.
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'LEFT';
