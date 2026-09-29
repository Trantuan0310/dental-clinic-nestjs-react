import { findAllergyConflicts, normalizeTerm } from './allergy-check';

describe('allergy-check', () => {
  describe('normalizeTerm', () => {
    it('lowercases, strips Vietnamese diacritics and splits dose from name', () => {
      expect(normalizeTerm('Dị ứng THUỐC TÊ')).toBe('di ung thuoc te');
      expect(normalizeTerm('Đường')).toBe('duong');
      expect(normalizeTerm('Amoxicillin500mg')).toBe('amoxicillin 500 mg');
    });
  });

  const match = (drug: string, allergies: string[]) =>
    findAllergyConflicts([{ drugName: drug }], allergies);

  it.each([
    // direct name, either direction, case/diacritics-insensitive
    ['Amoxicillin 500mg', ['amoxicillin']],
    ['Amoxicillin 500mg', ['Dị ứng Amoxicillin (nổi mề đay)']],
    ['IBUPROFEN 400', ['ibuprofen']],
    // class table
    ['Augmentin 625mg', ['Penicillin']],
    ['Ampicillin 500mg', ['penicilin']],
    ['Klamentin 875', ['Amoxicillin']],
    ['Ibuprofen 400mg', ['NSAID']],
    ['Diclofenac 50mg', ['Aspirin']],
    ['Meloxicam 7.5mg', ['Kháng viêm không steroid']],
    ['Rodogyl', ['Metronidazole']],
    ['Cefuroxime 500mg', ['cephalosporin']],
    ['Lidocaine 2%', ['Dị ứng thuốc tê']],
  ])('flags %s for allergy %j', (drug, allergies) => {
    expect(match(drug, allergies)).toHaveLength(1);
  });

  it.each([
    ['Paracetamol 500mg', ['Penicillin']],
    ['Chlorhexidine 0.12%', ['NSAID']],
    ['Amoxicillin 500mg', ['Tôm, cua']],
    ['Amoxicillin 500mg', ['Không']],
    ['Amoxicillin 500mg', ['không có']],
    ['Amoxicillin 500mg', ['']],
    ['Vitamin C 500mg viên sủi', ['Dị ứng thuốc tê']],
  ])('does not flag %s for allergy %j', (drug, allergies) => {
    expect(match(drug, allergies)).toEqual([]);
  });

  it('reports every line/allergy pair with the class that linked them', () => {
    const conflicts = findAllergyConflicts(
      [{ drugName: 'Paracetamol 500mg' }, { drugName: 'Augmentin 1g' }, { drugName: 'Ibuprofen' }],
      ['Penicillin', 'Aspirin'],
    );
    expect(conflicts).toEqual([
      {
        lineIndex: 1,
        drugName: 'Augmentin 1g',
        allergy: 'Penicillin',
        drugClass: 'nhóm Penicillin (beta-lactam)',
      },
      {
        lineIndex: 2,
        drugName: 'Ibuprofen',
        allergy: 'Aspirin',
        drugClass: 'nhóm NSAID (kháng viêm không steroid)',
      },
    ]);
  });

  it('returns nothing when no allergies are recorded', () => {
    expect(findAllergyConflicts([{ drugName: 'Amoxicillin' }], [])).toEqual([]);
  });
});
