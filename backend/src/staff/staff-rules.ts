import { Prisma } from '@prisma/client';
import { clinicDateOnly } from '../common/date-range.util';
import {
  AffectedAppointment,
  DentistHasFutureAppointmentsException,
  DentistHasOpenEncountersException,
} from './staff.exceptions';

type Db = Prisma.TransactionClient;

/** Bookings that still need the dentist (BR-STAFF-004). */
const UPCOMING_APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'] as const;
export const BLOCKING_APPOINTMENT_STATUSES = [
  ...UPCOMING_APPOINTMENT_STATUSES,
  'IN_PROGRESS',
] as const;

export async function futureActiveAppointments(
  db: Db,
  dentistUserId: string,
  now: Date = new Date(),
  /** A planned departure (A5-12): only visits from that clinic day on. */
  fromStart?: Date,
): Promise<AffectedAppointment[]> {
  const rows = await db.appointment.findMany({
    where: {
      dentistId: dentistUserId,
      OR: fromStart
        ? [{ status: { in: [...UPCOMING_APPOINTMENT_STATUSES] }, startAt: { gte: fromStart } }]
        : [
            {
              status: { in: [...UPCOMING_APPOINTMENT_STATUSES] },
              endAt: { gt: now },
            },
            // A visit being treated blocks even once its slot has run over.
            { status: 'IN_PROGRESS' },
          ],
    },
    select: {
      id: true,
      startAt: true,
      endAt: true,
      status: true,
      patient: { select: { fullName: true } },
    },
    orderBy: { startAt: 'asc' },
    take: 50,
  });
  return rows.map(r => ({
    id: r.id,
    startAt: r.startAt,
    endAt: r.endAt,
    status: r.status,
    patientName: r.patient.fullName,
  }));
}

/** Encounters the dentist has started but not closed or cancelled. */
export function openEncounterCount(db: Db, dentistUserId: string): Promise<number> {
  return db.encounter.count({
    where: { dentistId: dentistUserId, status: 'IN_PROGRESS' },
  });
}

/**
 * BR-STAFF-004: a dentist cannot be suspended/terminated while bookings
 * still need them or while an encounter they opened is still in progress
 * (it could never be closed — only its own dentist may close it).
 */
export async function assertDentistHasNoOpenWork(
  db: Db,
  dentistUserId: string,
  now: Date = new Date(),
): Promise<void> {
  const blocking = await futureActiveAppointments(db, dentistUserId, now);
  if (blocking.length > 0) throw new DentistHasFutureAppointmentsException(blocking);
  const openEncounters = await openEncounterCount(db, dentistUserId);
  if (openEncounters > 0) throw new DentistHasOpenEncountersException(openEncounters);
}

/**
 * Accounts that can be booked or scheduled: anything not deactivated. A
 * PENDING_SETUP account (new dentist who has not set a password yet, or the
 * bootstrap admin who also practises) still takes bookings.
 */
export const SCHEDULABLE_ACCOUNT_WHERE = {
  status: { not: 'DEACTIVATED' },
  deactivatedAt: null,
  deletedAt: null,
} satisfies Prisma.UserWhereInput;

/**
 * Dentist profile filter for dentist pickers. `booking` (new appointments,
 * online booking, dispatch): ACTIVE practice and employee not on leave.
 * `schedule` (working hours, time off): suspended dentists and dentists on
 * leave stay manageable (BR-STAFF-006).
 */
export function dentistProfileFilter(
  scope: 'booking' | 'schedule',
): Prisma.DentistProfileWhereInput {
  return scope === 'booking'
    ? { deletedAt: null, practiceStatus: 'ACTIVE', employee: { employmentStatus: 'ACTIVE' } }
    : {
        deletedAt: null,
        practiceStatus: { in: ['ACTIVE', 'SUSPENDED'] },
        employee: { employmentStatus: { not: 'TERMINATED' } },
      };
}

/** Parse a YYYY-MM-DD string as a DATE column value. */
export function toDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

/** Today's date in the clinic timezone, as a DATE column value. */
export function clinicToday(now: Date = new Date()): Date {
  return toDateOnly(clinicDateOnly(now));
}

const CALENDAR_COLORS = [
  '#2563EB',
  '#16A34A',
  '#DC2626',
  '#9333EA',
  '#EA580C',
  '#0891B2',
  '#DB2777',
  '#65A30D',
];

/** Same palette as migration 019's backfill, continuing its rotation. */
export function nextCalendarColor(existingProfiles: number): string {
  return CALENDAR_COLORS[existingProfiles % CALENDAR_COLORS.length];
}
