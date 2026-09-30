import { Prisma } from '@prisma/client';
import { CalendarBusyException } from './exceptions';

// Every advisory-lock namespace of the app (first int4 of
// pg_advisory_xact_lock(int4, int4)), kept in this one place so two kinds of
// key can never hash onto the same lock:
//   1 dentist calendar · 2 patient calendar · 3 online-booking phone ·
//   4 clinic-wide closures
const LOCK_NS_DENTIST = 1;
const LOCK_NS_PATIENT = 2;
const LOCK_NS_BOOKING_PHONE = 3;
const LOCK_NS_CLINIC = 4;

/** How long a transaction waits for one of these locks before CALENDAR_BUSY (409). */
export const LOCK_TIMEOUT_MS = 5_000;

/**
 * Interactive-transaction options for a transaction that takes one of these
 * locks. Prisma's defaults (2 s to get a connection, 5 s in all) would end
 * the transaction before the lock wait does, turning a busy calendar into a
 * 500 instead of CALENDAR_BUSY.
 */
export const LOCKING_TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

const LOCK_NOT_AVAILABLE = '55P03';

function isLockTimeout(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.meta as { code?: unknown } | undefined)?.code === LOCK_NOT_AVAILABLE
  );
}

/**
 * Bounds the lock wait (set_config local: this transaction only); its timeout
 * is a 409. Once granted the bound is lifted again, so a later row lock or
 * unique-index wait in the same transaction is not cut short into a 500.
 */
async function withLockTimeout(tx: Prisma.TransactionClient, lock: () => Promise<unknown>) {
  await tx.$executeRaw`SELECT set_config('lock_timeout', ${String(LOCK_TIMEOUT_MS)}::text, true)`;
  try {
    await lock();
  } catch (err) {
    if (isLockTimeout(err)) throw new CalendarBusyException();
    throw err;
  }
  await tx.$executeRaw`SELECT set_config('lock_timeout', '0', true)`;
}

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
  await withLockTimeout(tx, () =>
    tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${namespace}, ${key})`),
  );
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
  await withLockTimeout(
    tx,
    () =>
      tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NS_BOOKING_PHONE}::int4, hashtext(${phone}))`,
  );
}
