import { EncounterStatus, Prisma } from '@prisma/client';

/**
 * Restart a CANCELLED encounter on its existing row (encounters.appointment_id
 * is unique, so the appointment can never get a second one). Used by both
 * "start encounter" paths after the appointment is back at CHECKED_IN. The
 * cancellation itself stays on record in encounter_audits.
 */
export async function reopenCancelledEncounter(
  tx: Prisma.TransactionClient,
  encounterId: string,
  dentistId: string,
  actorId: string,
): Promise<void> {
  const before = await tx.encounter.findUnique({
    where: { id: encounterId },
    select: { status: true, cancelledAt: true, cancelledBy: true, cancelledReason: true },
  });
  await tx.encounter.update({
    where: { id: encounterId },
    data: {
      status: EncounterStatus.IN_PROGRESS,
      dentistId,
      startedAt: new Date(),
      cancelledAt: null,
      cancelledBy: null,
      cancelledReason: null,
    },
  });
  await tx.encounterAudit.create({
    data: {
      encounterId,
      action: 'REOPENED',
      actorId,
      before: before
        ? {
            status: before.status,
            cancelledAt: before.cancelledAt?.toISOString() ?? null,
            cancelledBy: before.cancelledBy,
            cancelledReason: before.cancelledReason,
          }
        : Prisma.JsonNull,
      after: { status: EncounterStatus.IN_PROGRESS },
    },
  });
}
