import { TOOTH_STATUS_LABEL, type Encounter } from '@/types/medical-records';

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
    blockers.push('Encounter phải có ít nhất ghi chú lâm sàng HOẶC điều trị (BR-MR-022).');
  }
  for (const t of enc.treatments ?? []) {
    if (!t.priceCents || t.priceCents <= 0) {
      blockers.push(`Điều trị "${t.treatmentName}" (răng ${t.toothNumber}) chưa có giá (BR-MR-025).`);
    }
  }
  return blockers;
}

export function canCloseEncounter(enc: Encounter): boolean {
  return validateClose(enc).length === 0;
}

export { TOOTH_STATUS_LABEL };
