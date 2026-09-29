import { AppointmentStatus, Prisma } from '@prisma/client';
import { clinicDateOnly, endOfClinicDay, startOfClinicDay } from './date-range.util';

/**
 * Row-level access of a (row-scoped) dentist to a patient's clinical record.
 * Single source of truth for Patients, Medical Records, Appointments and AI.
 *
 *   - READ (whole record, every dentist's encounters, read-only): the dentist
 *     has treated the patient (a non-CANCELLED encounter) OR has an
 *     appointment with them that is CHECKED_IN / IN_PROGRESS / COMPLETED, or
 *     SCHEDULED / CONFIRMED starting within the next 7 days — so a
 *     first-visit patient can be reviewed before the encounter starts.
 *   - Medical history (allergies…) WRITE: treated, or checked in / being
 *     seen by this dentist today (clinic time) — see dentistMayEditMedicalHistory.
 *   - "Treated" alone gates follow-up booking.
 *   - Clinical WRITE stays on the dentist's own encounters (each writer).
 *
 * Note: reopenCancelledEncounter (medical-records/domain/reopen-encounter.ts)
 * reassigns the reopened encounter's dentistId to the appointment's current
 * dentist, so "treated" follows that reassignment.
 */

type Db = Pick<Prisma.TransactionClient, 'encounter' | 'appointment'>;

/** Appointment statuses that let the booked dentist read the patient's record. */
export const READ_GRANTING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
];

/** Upcoming bookings grant read access only this close to the visit. */
export const UPCOMING_READ_WINDOW_DAYS = 7;
const UPCOMING_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];
const PRESENT_OR_PAST_STATUSES: AppointmentStatus[] = ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'];

export function treatedByDentistWhere(dentistId: string): Prisma.EncounterWhereInput {
  return { dentistId, status: { not: 'CANCELLED' } };
}

export function bookedWithDentistWhere(
  dentistId: string,
  now: Date = new Date(),
): Prisma.AppointmentWhereInput {
  const horizon = new Date(now.getTime() + UPCOMING_READ_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    dentistId,
    deletedAt: null,
    OR: [
      { status: { in: PRESENT_OR_PAST_STATUSES } },
      { status: { in: UPCOMING_STATUSES }, startAt: { lte: horizon } },
    ],
  };
}

/** Patient filter equivalent to {@link dentistCanReadPatient}, for list queries. */
export function patientReadableByDentistWhere(
  dentistId: string,
  now: Date = new Date(),
): Prisma.PatientWhereInput {
  return {
    OR: [
      { encounters: { some: treatedByDentistWhere(dentistId) } },
      { appointments: { some: bookedWithDentistWhere(dentistId, now) } },
    ],
  };
}

export async function dentistHasTreatedPatient(
  db: Db,
  patientId: string,
  dentistId: string,
): Promise<boolean> {
  const n = await db.encounter.count({
    where: { patientId, ...treatedByDentistWhere(dentistId) },
  });
  return n > 0;
}

export async function dentistCanReadPatient(
  db: Db,
  patientId: string,
  dentistId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (await dentistHasTreatedPatient(db, patientId, dentistId)) return true;
  const n = await db.appointment.count({
    where: { patientId, ...bookedWithDentistWhere(dentistId, now) },
  });
  return n > 0;
}

/**
 * Allergies / chronic diseases / current medications may be edited by a
 * dentist who has treated the patient, or who has them checked in / in the
 * chair today (clinic day). An upcoming booking only grants read access.
 */
export async function dentistMayEditMedicalHistory(
  db: Db,
  patientId: string,
  dentistId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (await dentistHasTreatedPatient(db, patientId, dentistId)) return true;
  const today = clinicDateOnly(now);
  const n = await db.appointment.count({
    where: {
      patientId,
      dentistId,
      deletedAt: null,
      status: { in: ['CHECKED_IN', 'IN_PROGRESS'] },
      startAt: { gte: startOfClinicDay(today), lte: endOfClinicDay(today) },
    },
  });
  return n > 0;
}

/** Ids (optionally among `candidates`) of patients the dentist may read. */
export async function patientIdsReadableByDentist(
  db: Db,
  dentistId: string,
  candidates?: string[],
): Promise<string[]> {
  const scope = candidates ? { patientId: { in: candidates } } : {};
  const [encounters, appointments] = await Promise.all([
    db.encounter.findMany({
      where: { ...scope, ...treatedByDentistWhere(dentistId) },
      select: { patientId: true },
      distinct: ['patientId'],
    }),
    db.appointment.findMany({
      where: { ...scope, ...bookedWithDentistWhere(dentistId) },
      select: { patientId: true },
      distinct: ['patientId'],
    }),
  ]);
  return [...new Set([...encounters, ...appointments].map(r => r.patientId))];
}
