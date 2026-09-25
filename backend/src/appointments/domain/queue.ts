import { Prisma, PrismaClient, QueuePriority, QueueStatus } from '@prisma/client';
import { clinicDateOnly } from '../../common/date-range.util';

/**
 * The dispatch queue (ADR-0009 D5): who a dentist sees next, before the
 * exam. The rules are pure so the ordering is covered by a decision table
 * (queue.spec.ts); the two writers below are the only way entries open and
 * close, and every path that checks a patient in, starts the exam, cancels
 * or marks LEFT goes through them.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Checked in later than this after the booked start counts as late. */
export const LATE_AFTER_MIN = 15;

/** Dispatch order of the priority classes (BR-DSP-001). */
export const PRIORITY_RANK: Record<QueuePriority, number> = {
  EMERGENCY: 0,
  ON_TIME: 1,
  LATE: 2,
  WALK_IN: 3,
};

/** Status blocks shown top to bottom: the one being called, then the line, then skipped. */
const STATUS_RANK: Record<QueueStatus, number> = { CALLED: 0, WAITING: 1, SKIPPED: 2, LEFT: 3 };

export function priorityAtCheckIn(
  appt: { visitKind: 'BOOKED' | 'WALK_IN'; startAt: Date },
  checkedInAt: Date,
): QueuePriority {
  if (appt.visitKind === 'WALK_IN') return QueuePriority.WALK_IN;
  return checkedInAt.getTime() > appt.startAt.getTime() + LATE_AFTER_MIN * 60_000
    ? QueuePriority.LATE
    : QueuePriority.ON_TIME;
}

export interface Orderable {
  status: QueueStatus;
  priority: QueuePriority;
  checkedInAt: Date;
}

/**
 * BR-DSP-001: called first, then waiting by class (emergency > on time >
 * late > walk-in), then by check-in time; skipped patients wait at the end.
 */
export function compareQueue(a: Orderable, b: Orderable): number {
  return (
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.checkedInAt.getTime() - b.checkedInAt.getTime()
  );
}

/** Opens (or re-opens) the entry when an appointment becomes CHECKED_IN. */
export async function enqueue(
  db: Db,
  appt: { id: string; dentistId: string; startAt: Date; visitKind: 'BOOKED' | 'WALK_IN' },
  checkedInAt: Date,
  actorId: string,
) {
  const data = {
    dentistId: appt.dentistId,
    queueDate: new Date(clinicDateOnly(appt.startAt)),
    status: QueueStatus.WAITING,
    priority: priorityAtCheckIn(appt, checkedInAt),
    checkedInAt,
    doneAt: null,
    closeReason: null,
    updatedBy: actorId,
  };
  return db.queueEntry.upsert({
    where: { appointmentId: appt.id },
    create: { appointmentId: appt.id, ...data, createdBy: actorId },
    update: data,
  });
}

export type CloseReason = 'STARTED' | 'CANCELLED' | 'LEFT';

/** Closes the open entry, if any (no-op for appointments that never queued). */
export async function closeQueueEntry(
  db: Db,
  appointmentId: string,
  reason: CloseReason,
  actorId: string,
) {
  await db.queueEntry.updateMany({
    where: { appointmentId, doneAt: null },
    data: {
      doneAt: new Date(),
      closeReason: reason,
      ...(reason === 'LEFT' ? { status: QueueStatus.LEFT } : {}),
      updatedBy: actorId,
    },
  });
}
