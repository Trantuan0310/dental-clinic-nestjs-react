import { Prisma, TreatmentPlanItemStatus, TreatmentPlanStatus } from '@prisma/client';

/** Plans whose progress follows their items (agreed, under way or finished). */
export const TRACKED_PLAN_STATUSES: TreatmentPlanStatus[] = [
  TreatmentPlanStatus.ACCEPTED,
  TreatmentPlanStatus.IN_PROGRESS,
  TreatmentPlanStatus.COMPLETED,
];

/** Plans a procedure in an encounter may be ticked off against. */
export const WORKABLE_PLAN_STATUSES: TreatmentPlanStatus[] = [
  TreatmentPlanStatus.ACCEPTED,
  TreatmentPlanStatus.IN_PROGRESS,
];

/**
 * The status an agreed plan has given its items: COMPLETED when every item is
 * done or skipped (and at least one was done), IN_PROGRESS once one is done,
 * else ACCEPTED.
 */
export function progressStatus(
  items: Array<{ status: TreatmentPlanItemStatus }>,
): TreatmentPlanStatus {
  const done = items.filter(i => i.status === TreatmentPlanItemStatus.DONE).length;
  const open = items.filter(i => i.status === TreatmentPlanItemStatus.PLANNED).length;
  if (done > 0 && open === 0) return TreatmentPlanStatus.COMPLETED;
  if (done > 0) return TreatmentPlanStatus.IN_PROGRESS;
  return TreatmentPlanStatus.ACCEPTED;
}

/**
 * Brings agreed plans' status in line with their items after items were
 * ticked off or reopened (encounter close / reopen, skip, unskip). Drafts,
 * proposals and cancelled plans are left alone.
 */
export async function syncPlanProgress(
  tx: Prisma.TransactionClient,
  planIds: string[],
  now = new Date(),
): Promise<void> {
  for (const planId of [...new Set(planIds)]) {
    const plan = await tx.treatmentPlan.findUnique({
      where: { id: planId },
      select: { status: true, items: { select: { status: true } } },
    });
    if (!plan || !TRACKED_PLAN_STATUSES.includes(plan.status)) continue;
    const next = progressStatus(plan.items);
    if (next === plan.status) continue;
    await tx.treatmentPlan.update({
      where: { id: planId },
      data: {
        status: next,
        completedAt: next === TreatmentPlanStatus.COMPLETED ? now : null,
      },
    });
  }
}

/**
 * Ticks off the plan items carried out by an encounter's treatments (called
 * from the encounter close, inside its transaction), or puts them back to
 * PLANNED when the encounter is reopened.
 */
export async function markPlanItemsForEncounter(
  tx: Prisma.TransactionClient,
  encounterId: string,
  done: boolean,
  now = new Date(),
): Promise<string[]> {
  const treatments =
    (await tx.treatment.findMany({
      where: { encounterId, deletedAt: null, planItemId: { not: null } },
      select: { planItemId: true, planItem: { select: { planId: true } } },
    })) ?? [];
  const itemIds = treatments.map(t => t.planItemId as string);
  if (!itemIds.length) return [];
  await tx.treatmentPlanItem.updateMany({
    where: done
      ? { id: { in: itemIds }, status: TreatmentPlanItemStatus.PLANNED }
      : { id: { in: itemIds }, status: TreatmentPlanItemStatus.DONE },
    data: done
      ? { status: TreatmentPlanItemStatus.DONE, doneAt: now }
      : { status: TreatmentPlanItemStatus.PLANNED, doneAt: null },
  });
  const planIds = treatments.map(t => t.planItem?.planId).filter((id): id is string => !!id);
  await syncPlanProgress(tx, planIds, now);
  return planIds;
}
