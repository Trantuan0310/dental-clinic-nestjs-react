/**
 * Which demo treatments make sense for whom, on which teeth, and for what
 * complaint, so the demo data holds up in front of a dentist: no "root canal
 * on a baby tooth" on an adult's 36, no implant for a nine-year-old, a wisdom
 * tooth extraction on 18, 28, 38 or 48, no amoxicillin for a patient allergic
 * to penicillin. Used by seed-demo-clinic.ts and seed-demo-fix-teeth.ts.
 */

type Svc = { code: string; requiredSpecialty?: string | null };

/** Services for children only (baby teeth, children's check-ups). */
export const childOnly = (s: Svc) =>
  s.code.startsWith('TE_') || s.code === 'NHO_RANG_SUA' || s.requiredSpecialty === 'NHA_TRE_EM';

/** Services a child may also have besides the children's ones. */
const CHILD_ALSO = new Set([
  'KHAM_TQ',
  'TAI_KHAM',
  'KHAM_CAP_CUU',
  'BOI_FLUOR',
  'CAO_VOI',
  'DANH_BONG',
  'TRAM_BIT_HO_RANH',
  'TRAM_GIC',
  'TRAM_COMPOSITE',
  'CHUP_XQ',
  'CHUP_PANO',
  'NHO_RANG',
  'CN_TU_VAN',
  'CN_TAI_KHAM',
  'CN_MAC_CAI_KIM_LOAI',
  'CN_KHAY_TRONG',
]);

export const fitsAge = (s: Svc, child: boolean) =>
  child ? childOnly(s) || CHILD_ALSO.has(s.code) : !childOnly(s);

/** The adult service standing in for a children's one (demo repair). */
export const ADULT_FOR: Record<string, string> = {
  TE_TUY_RANG_SUA: 'TUY_RANG_HAM',
  TE_TRAM_RANG_SUA: 'TRAM_COMPOSITE',
  NHO_RANG_SUA: 'NHO_RANG',
  TE_KHAM: 'KHAM_TQ',
  TE_VECNI_FLUOR: 'BOI_FLUOR',
};

/** Reason for the visit and diagnosis that lead to a service. */
const CLINICAL: Array<[RegExp, string, string]> = [
  [/^(CAO_VOI_SAU|DIEU_TRI_NHA_CHU)$/, 'Chảy máu chân răng, hôi miệng', 'Viêm nha chu mức độ nhẹ'],
  [/^(CAO_VOI|DANH_BONG)$/, 'Chảy máu chân răng khi chải', 'Viêm nướu, cao răng nhiều'],
  [/^(TRAM_CO_RANG|DIEU_TRI_E_BUOT)$/, 'Ê buốt khi uống lạnh', 'Mòn cổ răng, nhạy cảm ngà'],
  [
    /^(TRAM_BIT_HO_RANH|BOI_FLUOR|TE_VECNI_FLUOR)$/,
    'Khám định kỳ, phòng sâu răng',
    'Hố rãnh sâu, nguy cơ sâu răng',
  ],
  [/^(TRAM_|TE_TRAM_)/, 'Răng bị mẻ, ê khi ăn nhai', 'Sâu răng ngà'],
  [/^(TUY_|TE_TUY_)/, 'Đau nhức răng về đêm', 'Viêm tủy răng không hồi phục'],
  [/^CHOT_TAI_TAO_CUI$/, 'Phục hồi răng sau điều trị tủy', 'Răng đã điều trị tủy, mất nhiều mô'],
  [/^NHO_RANG_KHON/, 'Đau vùng răng khôn', 'Răng khôn mọc lệch'],
  [/^NHO_RANG_SUA$/, 'Răng sữa lung lay', 'Răng sữa đến tuổi thay'],
  [/^NHO_RANG/, 'Răng lung lay, đau khi nhai', 'Răng không còn khả năng bảo tồn'],
  [/^(IMPLANT|GHEP_XUONG|NANG_XOANG|MAO_TREN_IMPLANT)/, 'Mất răng muốn làm lại', 'Mất răng'],
  [/^HAM_THAO_LAP$/, 'Mất nhiều răng, ăn nhai khó', 'Mất răng nhiều'],
  [/^(MAO_|INLAY_ONLAY|THAO_MAO_CU)/, 'Răng vỡ lớn, muốn bọc sứ', 'Răng vỡ lớn sau điều trị tủy'],
  [/^(MAT_DAN_SU|DINH_DA|TAY_TRANG)/, 'Muốn làm đẹp răng', 'Răng nhiễm màu nhẹ'],
  [/^CN_/, 'Muốn niềng răng', 'Răng khấp khểnh'],
  [/^CAT_LOI$/, 'Lợi trùm răng khôn, đau khi nhai', 'Viêm lợi trùm'],
  [/^KHAM_CAP_CUU$/, 'Đau, sưng má', 'Viêm quanh chóp cấp'],
];

/** [chief complaint, diagnosis] for a visit whose main service is `code`. */
export function clinicalFor(code: string): [string, string] {
  const hit = CLINICAL.find(([re]) => re.test(code));
  return hit ? [hit[1], hit[2]] : ['Khám định kỳ', 'Răng miệng ổn định'];
}

/** A penicillin-group drug (to keep off a patient allergic to penicillin). */
export const isPenicillin = (drug: string) =>
  /^(amoxi|ampi|penicil|augmentin)/i.test(drug.trim());

/** Work on the whole mouth or a whole arch: no tooth number. */
const WHOLE_MOUTH =
  /^(KHAM|TAI_KHAM|TE_KHAM|CAO_VOI|DANH_BONG|BOI_FLUOR|TE_VECNI|CHUP_PANO|CHUP_CT|CN_|TAY_TRANG|DIEU_TRI_NHA_CHU|HAM_THAO_LAP|IMPLANT_TU_VAN|DIEU_TRI_E_BUOT)/;

const INCISORS = [11, 12, 21, 22, 31, 32, 41, 42];
const ANTERIOR = [11, 12, 13, 21, 22, 23];
const PREMOLARS = [14, 15, 24, 25, 34, 35, 44, 45];
const MOLARS = [16, 17, 26, 27, 36, 37, 46, 47];
const FIRST_MOLARS = [16, 26, 36, 46];
const BABY_MOLARS = [54, 55, 64, 65, 74, 75, 84, 85];
const ADULT_COMMON = [11, 12, 14, 16, 21, 24, 26, 36, 37, 45, 46, 47];

/** Tooth numbers (FDI) for a treatment, or null for whole-mouth work. */
export function teethFor(
  code: string,
  child: boolean,
  pick: <T>(xs: readonly T[]) => T,
): number[] | null {
  if (WHOLE_MOUTH.test(code)) return null;
  if (code.startsWith('TE_') || code === 'NHO_RANG_SUA') return [pick(BABY_MOLARS)];
  switch (code) {
    case 'TUY_RANG_CUA':
      return [pick(INCISORS)];
    case 'TUY_TIEN_HAM':
      return [pick(PREMOLARS)];
    case 'TUY_RANG_HAM':
    case 'INLAY_ONLAY':
      return [pick(MOLARS)];
    case 'NHO_RANG_KHON':
      return [pick([18, 28])];
    case 'NHO_RANG_KHON_NGAM':
      return [pick([38, 48])];
    case 'MAT_DAN_SU':
      return [pick(ANTERIOR)];
    case 'TRAM_BIT_HO_RANH':
      return [pick(FIRST_MOLARS)];
  }
  return [child ? pick(FIRST_MOLARS) : pick(ADULT_COMMON)];
}
