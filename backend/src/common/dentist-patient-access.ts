import { AppointmentStatus, Prisma } from '@prisma/client';

/**
 * Row-level access of a (row-scoped) dentist to a patient's clinical record.
 * Single source of truth for Patients, Medical Records, Appointments and AI.
 *
 *   - READ (whole record, every dentist's encounters, read-only): the dentist
 *     has treated the patient (a non-CANCELLED encounter) OR has a live /
 *     completed appointment with them — so a first-visit patient on today's
 *     list can be reviewed before the encounter starts.
 *   - "Treated" alone gates follow-up booking.
 *   - WRITE stays on the dentist's own encounters (enforced by each writer).
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

export function treatedByDentistWhere(dentistId: string): Prisma.EncounterWhereInput {
  return { dentistId, status: { not: 'CANCELLED' } };
}

export function bookedWithDentistWhere(dentistId: string): Prisma.AppointmentWhereInput {
  return { dentistId, deletedAt: null, status: { in: READ_GRANTING_APPOINTMENT_STATUSES } };
}

/** Patient filter equivalent to {@link dentistCanReadPatient}, for list queries. */
export function patientReadableByDentistWhere(dentistId: string): Prisma.PatientWhereInput {
  return {
    OR: [
      { encounters: { some: treatedByDentistWhere(dentistId) } },
      { appointments: { some: bookedWithDentistWhere(dentistId) } },
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
): Promise<boolean> {
  if (await dentistHasTreatedPatient(db, patientId, dentistId)) return true;
  const n = await db.appointment.count({
    where: { patientId, ...bookedWithDentistWhere(dentistId) },
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
