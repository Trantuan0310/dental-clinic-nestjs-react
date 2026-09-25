import { Prisma } from '@prisma/client';
import { clinicDateOnly } from '../common/date-range.util';
import { AffectedAppointment } from './staff.exceptions';

type Db = Prisma.TransactionClient;

/** Bookings that still need the dentist (BR-STAFF-004). */
export const BLOCKING_APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'] as const;

export async function futureActiveAppointments(
  db: Db,
  dentistUserId: string,
  now: Date = new Date(),
): Promise<AffectedAppointment[]> {
  const rows = await db.appointment.findMany({
    where: {
      dentistId: dentistUserId,
      status: { in: [...BLOCKING_APPOINTMENT_STATUSES] },
      endAt: { gt: now },
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
