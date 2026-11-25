import { ADULT_FOR, childOnly, clinicalFor, fitsAge, isPenicillin, teethFor } from './demo-teeth';

const first = <T>(xs: readonly T[]) => xs[0];
/** Returns the whole list instead of one item, to check the range offered. */
const all = <T>(xs: readonly T[]) => xs as unknown as T;
const svc = (code: string, requiredSpecialty: string | null = null) => ({ code, requiredSpecialty });

describe('demo-teeth', () => {
  it("keeps children's work for children and adult work for adults", () => {
    expect(fitsAge(svc('TE_TUY_RANG_SUA', 'NHA_TRE_EM'), false)).toBe(false);
    expect(fitsAge(svc('NHO_RANG_SUA'), true)).toBe(true);
    expect(fitsAge(svc('IMPLANT_HAN_QUOC', 'IMPLANT'), true)).toBe(false);
    expect(fitsAge(svc('TAY_TRANG_PHONG_KHAM'), true)).toBe(false);
    expect(fitsAge(svc('CAO_VOI'), true)).toBe(true);
    expect(fitsAge(svc('MAO_SU_ZIRCONIA', 'PHUC_HINH'), false)).toBe(true);
  });

  it("maps every children's service to an adult one", () => {
    for (const code of Object.keys(ADULT_FOR)) {
      expect(childOnly(svc(code))).toBe(true);
      expect(childOnly(svc(ADULT_FOR[code]))).toBe(false);
    }
  });

  it('puts work on teeth that suit it', () => {
    expect(teethFor('TE_TUY_RANG_SUA', true, all)).toEqual([[54, 55, 64, 65, 74, 75, 84, 85]]);
    expect(teethFor('NHO_RANG_KHON_NGAM', false, all)).toEqual([[38, 48]]);
    expect(teethFor('TUY_RANG_CUA', false, all)).toEqual([[11, 12, 21, 22, 31, 32, 41, 42]]);
    expect(teethFor('MAT_DAN_SU', false, first)).toEqual([11]);
  });

  it('leaves whole-mouth work without a tooth', () => {
    for (const code of ['KHAM_TQ', 'CAO_VOI', 'CHUP_PANO', 'CN_KHAY_TRONG', 'TAY_TRANG_TAI_NHA']) {
      expect(teethFor(code, false, first)).toBeNull();
    }
  });

  it('gives a complaint and diagnosis that lead to the service', () => {
    expect(clinicalFor('TUY_RANG_HAM')).toEqual(['Đau nhức răng về đêm', 'Viêm tủy răng không hồi phục']);
    expect(clinicalFor('NHO_RANG_KHON_NGAM')[1]).toBe('Răng khôn mọc lệch');
    expect(clinicalFor('CN_KHAY_TRONG')[1]).toBe('Răng khấp khểnh');
    expect(clinicalFor('KHAM_TQ')).toEqual(['Khám định kỳ', 'Răng miệng ổn định']);
  });

  it('recognises penicillin-group drugs', () => {
    expect(isPenicillin('Amoxicillin 500mg')).toBe(true);
    expect(isPenicillin('Augmentin 625mg')).toBe(true);
    expect(isPenicillin('Clindamycin 300mg')).toBe(false);
    expect(isPenicillin('Paracetamol 500mg')).toBe(false);
  });
});
