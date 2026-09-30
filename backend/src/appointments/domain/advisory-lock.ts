import { Prisma } from '@prisma/client';

// Every advisory-lock namespace of the app (first int4 of
// pg_advisory_xact_lock(int4, int4)), kept in this one place so two kinds of
// key can never hash onto the same lock:
//   1 dentist calendar · 2 patient calendar · 3 online-booking phone ·
//   4 clinic-wide closures
const LOCK_NS_DENTIST = 1;
const LOCK_NS_PATIENT = 2;
const LOCK_NS_BOOKING_PHONE = 3;
const LOCK_NS_CLINIC = 4;

async function advisoryLock(
  tx: Prisma.TransactionClient,
  namespace: number,
  id: string,
): Promise<void> {
  // FNV-1a 32-bit hash, reinterpreted as a signed int4.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  const key = h | 0;
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${namespace}, ${key})`);
}

/**
 * Serialize everything that changes a dentist's bookable time: bookings,
 * reschedules, time-off and shift cancellation. The lock is bound to the
 * transaction and released on commit/rollback.
 */
export function lockDentistCalendar(tx: Prisma.TransactionClient, dentistId: string) {
  return advisoryLock(tx, LOCK_NS_DENTIST, dentistId);
}

/**
 * Serialize bookings for a patient too: the dentist lock alone lets two
 * concurrent bookings of the same patient with different dentists both
 * pass the patient-overlap check. Always taken after the dentist lock, so
 * every booking transaction acquires locks in the same order.
 */
export function lockPatientCalendar(tx: Prisma.TransactionClient, patientId: string) {
  return advisoryLock(tx, LOCK_NS_PATIENT, patientId);
}

/** Serialize changes to clinic-wide closed days (overlap check + insert). */
export function lockClinicClosures(tx: Prisma.TransactionClient) {
  return advisoryLock(tx, LOCK_NS_CLINIC, 'clinic_closures');
}

/**
 * Serialize online submissions from one phone, so the duplicate check and the
 * insert of a booking request are atomic (a double submit, a second tab).
 */
export async function lockBookingPhone(tx: Prisma.TransactionClient, phone: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NS_BOOKING_PHONE}::int4, hashtext(${phone}))`;
}
