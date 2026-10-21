import { TOOTH_STATUS_LABEL, type Encounter } from '@/types/medical-records';
import { useAuthStore } from '@/stores/authStore';
import { i18n } from '@/locales';

export type CloseBlocker = string;

export function validateClose(enc: Encounter): CloseBlocker[] {
  const blockers: CloseBlocker[] = [];
  const hasNote = !!(
    enc.clinicalNote &&
    (enc.clinicalNote.subjective ||
      enc.clinicalNote.objective ||
      enc.clinicalNote.assessment ||
      enc.clinicalNote.plan ||
      enc.clinicalNote.rawNotes)
  );
  const hasTreatment = (enc.treatments?.length ?? 0) > 0;
  if (!hasNote && !hasTreatment) {
    blockers.push(i18n.t('uiClinical.closeBlockerNoContent'));
  }
  for (const line of enc.treatments ?? []) {
    if (!line.priceCents || line.priceCents <= 0) {
      blockers.push(
        i18n.t('uiClinical.closeBlockerNoPrice', { name: line.treatmentName, tooth: line.toothNumber }),
      );
    }
  }
  return blockers;
}

export function canCloseEncounter(enc: Encounter): boolean {
  return validateClose(enc).length === 0;
}

/**
 * Mirrors the backend row scope (isRowScopedDentist): without
 * encounter.read.any, only the encounter's own dentist may write to it, so a
 * colleague opening it (history read) gets a read-only view.
 */
export function useIsOwnEncounterScope(encounter: Pick<Encounter, 'dentistId'> | undefined): boolean {
  return useAuthStore(
    (s) =>
      s.hasPermission('encounter.read.any') ||
      (!!encounter && !!s.user && s.user.id === encounter.dentistId),
  );
}

export { TOOTH_STATUS_LABEL };
