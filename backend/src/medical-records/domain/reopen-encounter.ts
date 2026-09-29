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
    select: {
      status: true,
      dentistId: true,
      startedAt: true,
      cancelledAt: true,
      cancelledBy: true,
      cancelledReason: true,
    },
  });
  const handover =
    before && before.dentistId !== dentistId
      ? await retirePreviousDentistWork(tx, encounterId, before.dentistId, actorId)
      : null;
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
            dentistId: before.dentistId,
            startedAt: before.startedAt.toISOString(),
            cancelledAt: before.cancelledAt?.toISOString() ?? null,
            cancelledBy: before.cancelledBy,
            cancelledReason: before.cancelledReason,
          }
        : Prisma.JsonNull,
      after: {
        status: EncounterStatus.IN_PROGRESS,
        dentistId,
        ...(handover && { handover }),
      },
    },
  });
}

/**
 * Reopened for a DIFFERENT dentist (dispatch moved the booking after the
 * cancel): the previous dentist's treatments and prescription must not be
 * invoiced / printed under the new dentist's name, so they are soft-deleted.
 * The clinical note has no soft delete; its text is kept read-only as an
 * addendum attributed to the previous dentist and the sections are cleared
 * for the new dentist. Everything removed is listed in the REOPENED audit.
 */
async function retirePreviousDentistWork(
  tx: Prisma.TransactionClient,
  encounterId: string,
  previousDentistId: string,
  actorId: string,
) {
  const now = new Date();
  const treatments = await tx.treatment.findMany({
    where: { encounterId, deletedAt: null },
    select: { id: true },
  });
  if (treatments.length > 0) {
    await tx.treatment.updateMany({
      where: { id: { in: treatments.map(t => t.id) } },
      data: { deletedAt: now },
    });
  }
  const prescription = await tx.prescription.findFirst({
    where: { encounterId, deletedAt: null },
    select: { id: true },
  });
  if (prescription) {
    await tx.prescription.update({
      where: { id: prescription.id },
      data: { deletedAt: now },
    });
  }
  const note = await tx.clinicalNote.findUnique({ where: { encounterId } });
  const sections: Array<[string, string | null]> = note
    ? [
        ['Lý do khám', note.chiefComplaint],
        ['Chẩn đoán', note.diagnosis],
        ['Kế hoạch điều trị', note.treatmentPlan],
        ['Ghi chú', note.notes],
      ]
    : [];
  const kept = sections.filter(([, v]) => !!v?.trim());
  if (note && kept.length > 0) {
    await tx.clinicalNoteAddendum.create({
      data: {
        clinicalNoteId: note.id,
        addedBy: previousDentistId,
        content:
          'Ghi chú của bác sĩ trước (phiên đã hủy rồi mở lại cho bác sĩ khác):\n' +
          kept.map(([label, v]) => `${label}: ${v}`).join('\n'),
      },
    });
    await tx.clinicalNote.update({
      where: { id: note.id },
      data: {
        chiefComplaint: null,
        diagnosis: null,
        treatmentPlan: null,
        notes: null,
        isLocked: false,
        lastEditedBy: actorId,
      },
    });
  }
  return {
    previousDentistId,
    retiredTreatmentIds: treatments.map(t => t.id),
    retiredPrescriptionId: prescription?.id ?? null,
    clinicalNoteMovedToAddendum: kept.length > 0,
  };
}
