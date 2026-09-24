import { AppointmentStatus, Prisma } from '@prisma/client';

type AppointmentCounter = {
  appointment: { count: Prisma.TransactionClient['appointment']['count'] };
};

/**
 * A shift registration's start/end as instants. `date` is a calendar date
 * (stored as UTC midnight) and start/end are clinic wall-clock "HH:mm"
 * (UTC+7), the same convention as working schedules and appointments.
 */
export function shiftInstants(shift: { date: Date; startTime: string; endTime: string }): {
  start: Date;
  end: Date;
} {
  const day = shift.date.toISOString().slice(0, 10);
  return {
    start: new Date(`${day}T${shift.startTime}:00+07:00`),
    end: new Date(`${day}T${shift.endTime}:00+07:00`),
  };
}

/**
 * Number of appointments still booked (not cancelled/no-show/completed)
 * inside a shift registration's window. Shift date is a calendar date and
 * start/end are clinic wall-clock "HH:mm" (UTC+7), same as working schedules.
 *
 * An APPROVED shift opens bookable slots (BR-APPT-027), so cancelling it
 * while this is > 0 would strand those appointments outside working hours.
 */
export function countActiveBookingsInShift(
  prisma: AppointmentCounter,
  shift: { dentistId: string; date: Date; startTime: string; endTime: string },
): Promise<number> {
  const { start, end } = shiftInstants(shift);
  return prisma.appointment.count({
    where: {
      dentistId: shift.dentistId,
      startAt: { lt: end },
      endAt: { gt: start },
      status: {
        notIn: [
          AppointmentStatus.CANCELLED,
          AppointmentStatus.NO_SHOW,
          AppointmentStatus.COMPLETED,
        ],
      },
      deletedAt: null,
    },
  });
}

export function shiftHasBookingsMessage(count: number): string {
  return `Ca này còn ${count} lịch hẹn — hãy đổi lịch hoặc hủy các lịch đó trước khi hủy ca`;
}
