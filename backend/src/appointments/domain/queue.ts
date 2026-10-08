import { Prisma, PrismaClient, QueuePriority, QueueStatus } from '@prisma/client';
import { clinicDateOnly } from '../../common/date-range.util';

/**
 * The dispatch queue (ADR-0009 D5): who a dentist sees next, before the
 * exam. The rules are pure so the ordering is covered by a decision table
 * (queue.spec.ts); the writers below are the only way entries open and
 * close, and every path that checks a patient in, starts the exam, cancels
 * the exam, cancels the visit or marks LEFT goes through them.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Checked in later than this after the booked start counts as late. */
export const LATE_AFTER_MIN = 15;

/** Status blocks shown top to bottom: the one being called, then the line, then skipped. */
const STATUS_RANK: Record<QueueStatus, number> = {
  CALLED: 0,
  WAITING: 1,
  SKIPPED: 2,
  LEFT: 3,
  DONE: 3,
  CANCELLED: 3,
};

/**
 * A late patient lines up as if they had come this long after their
 * check-in: behind the patients booked around then, not behind the whole
 * day (A3-09).
 */
export const LATE_PENALTY_MIN = 15;
/** A walk-in waits behind booked patients for about this long at most. */
export const WALK_IN_WAIT_CAP_MIN = 45;

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
  appointment: { startAt: Date };
}

/**
 * When the patient is due in line: the booked time for one who came on
 * time (or early), the arrival plus LATE_PENALTY_MIN for a late one, the
 * arrival plus WALK_IN_WAIT_CAP_MIN for a walk-in.
 */
export function dueAt(e: Orderable): number {
  switch (e.priority) {
    case QueuePriority.ON_TIME:
      return e.appointment.startAt.getTime();
    case QueuePriority.LATE:
      return e.checkedInAt.getTime() + LATE_PENALTY_MIN * 60_000;
    case QueuePriority.WALK_IN:
      return e.checkedInAt.getTime() + WALK_IN_WAIT_CAP_MIN * 60_000;
    default:
      return e.checkedInAt.getTime();
  }
}

/**
 * BR-DSP-001: called first, then emergencies, then everyone waiting by the
 * time they are due (dueAt), earlier check-in breaking ties; skipped
 * patients wait at the end.
 */
export function compareQueue(a: Orderable, b: Orderable): number {
  return (
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    Number(a.priority !== QueuePriority.EMERGENCY) -
      Number(b.priority !== QueuePriority.EMERGENCY) ||
    dueAt(a) - dueAt(b) ||
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

/**
 * Puts a patient whose exam was started and then cancelled (encounter
 * created by mistake) back in line, keeping their priority and check-in time.
 * Only today's (clinic date) entries closed by STARTED reopen; LEFT/CANCELLED
 * and past days' entries stay closed.
 */
export async function reopenStartedQueueEntry(db: Db, appointmentId: string, actorId: string) {
  await db.queueEntry.updateMany({
    where: { appointmentId, closeReason: 'STARTED', queueDate: new Date(clinicDateOnly()) },
    data: { status: QueueStatus.WAITING, doneAt: null, closeReason: null, updatedBy: actorId },
  });
}

/**
 * Puts a patient marked "Đã về" by mistake (or who came back) back in line
 * with their priority and check-in time (A3-04). Only today's entries
 * closed by LEFT reopen; returns how many did.
 */
export async function reopenLeftQueueEntry(db: Db, appointmentId: string, actorId: string) {
  const res = await db.queueEntry.updateMany({
    where: { appointmentId, closeReason: 'LEFT', queueDate: new Date(clinicDateOnly()) },
    data: { status: QueueStatus.WAITING, doneAt: null, closeReason: null, updatedBy: actorId },
  });
  return res.count;
}

/**
 * The dentist started an exam: any other patient left "called" for them
 * that day goes back to waiting (keeping their place), so the next call
 * is not refused as "busy" (A3-15).
 */
export async function releaseOtherCalled(
  db: Db,
  appt: { id: string; dentistId: string; startAt: Date },
  actorId: string,
) {
  await db.queueEntry.updateMany({
    where: {
      dentistId: appt.dentistId,
      queueDate: new Date(clinicDateOnly(appt.startAt)),
      status: QueueStatus.CALLED,
      doneAt: null,
      NOT: { appointmentId: appt.id },
    },
    data: { status: QueueStatus.WAITING, updatedBy: actorId },
  });
}

export type CloseReason = 'STARTED' | 'CANCELLED' | 'LEFT';

/** Status of a closed entry, so a query on status alone counts it right (A5-21). */
const CLOSED_STATUS: Record<CloseReason, QueueStatus> = {
  STARTED: QueueStatus.DONE,
  CANCELLED: QueueStatus.CANCELLED,
  LEFT: QueueStatus.LEFT,
};

/**
 * Closes the open entry, if any (no-op for appointments that never queued).
 * `actorId` is null when the system closes it (end-of-day job).
 */
export async function closeQueueEntry(
  db: Db,
  appointmentId: string,
  reason: CloseReason,
  actorId: string | null,
) {
  await db.queueEntry.updateMany({
    where: { appointmentId, doneAt: null },
    data: {
      doneAt: new Date(),
      closeReason: reason,
      status: CLOSED_STATUS[reason],
      updatedBy: actorId,
    },
  });
}
