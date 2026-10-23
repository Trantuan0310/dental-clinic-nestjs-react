import { Prisma, RecallStatus } from '@prisma/client';
import { clinicDateOnly } from '../../common/date-range.util';

/** Recalls still waiting for the patient to come back. */
export const OPEN_RECALL_STATUSES: RecallStatus[] = [
  RecallStatus.PENDING,
  RecallStatus.POSTPONED,
  RecallStatus.BOOKED,
];

/**
 * `months` calendar months after a YYYY-MM-DD date, clamped to the end of a
 * shorter month (31/08 + 6 months = 28/02 or 29/02).
 */
export function addMonthsToDate(dateOnly: string, months: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * On closing an encounter: for each service done in it that has a recall
 * interval, any open recall of the patient for that service is fulfilled
 * (DONE, resolved by this encounter) and a new one is due the interval
 * after the visit's clinic date.
 */
export async function scheduleRecallsForEncounter(
  tx: Prisma.TransactionClient,
  encounterId: string,
  closedAt: Date,
): Promise<number> {
  const encounter = await tx.encounter.findUnique({
    where: { id: encounterId },
    select: {
      patientId: true,
      treatments: {
        where: { deletedAt: null, serviceId: { not: null } },
        select: { service: { select: { id: true, recallIntervalMonths: true } } },
      },
    },
  });
  if (!encounter) return 0;
  const intervals = new Map<string, number>();
  for (const t of encounter.treatments ?? []) {
    const months = t.service?.recallIntervalMonths;
    if (t.service && months && months > 0) intervals.set(t.service.id, months);
  }
  const visitDay = clinicDateOnly(closedAt);
  for (const [serviceId, months] of intervals) {
    await tx.recall.updateMany({
      where: {
        patientId: encounter.patientId,
        serviceId,
        status: { in: OPEN_RECALL_STATUSES },
      },
      data: { status: RecallStatus.DONE, resolvedByEncounterId: encounterId, closedAt },
    });
    await tx.recall.create({
      data: {
        patientId: encounter.patientId,
        serviceId,
        sourceEncounterId: encounterId,
        dueDate: new Date(`${addMonthsToDate(visitDay, months)}T00:00:00Z`),
      },
    });
  }
  return intervals.size;
}

/**
 * On reopening an encounter: the recalls it made go (closing it again makes
 * them anew) and the ones it fulfilled are open again. A fulfilled recall
 * comes back as PENDING: what the front desk recorded on it before is in
 * the audit log.
 */
export async function revertRecallsForEncounter(
  tx: Prisma.TransactionClient,
  encounterId: string,
): Promise<void> {
  // First, so the reopened ones do not clash with them (one open per service).
  await tx.recall.deleteMany({ where: { sourceEncounterId: encounterId } });
  await tx.recall.updateMany({
    where: { resolvedByEncounterId: encounterId, status: RecallStatus.DONE },
    data: { status: RecallStatus.PENDING, resolvedByEncounterId: null, closedAt: null },
  });
}
