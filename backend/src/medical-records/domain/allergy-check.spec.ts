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
    // generic "antibiotic" allergy covers every antibiotic class
    ['Amoxicillin 500mg', ['Dị ứng kháng sinh']],
    ['Metronidazole 250mg', ['kháng sinh']],
    ['Azithromycin 500mg', ['Antibiotics']],
    ['Doxycycline 100mg', ['Dị ứng KHÁNG SINH (sốc)']],
    // penicillin <-> cephalosporin cross-reactivity, both directions
    ['Cefuroxime 500mg', ['Penicillin']],
    ['Amoxicillin 500mg', ['Dị ứng Cephalexin']],
    // "không dung nạp" is a real reaction, not a negation
    ['Ibuprofen 400mg', ['Không dung nạp ibuprofen']],
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
    // negations are not allergens
    ['Amoxicillin 500mg', ['Không dị ứng thuốc']],
    ['Amoxicillin 500mg', ['Không có tiền sử dị ứng']],
    ['Amoxicillin 500mg', ['Chưa ghi nhận dị ứng']],
    ['Amoxicillin 500mg', ['NKDA']],
    // salt/acid words don't link unrelated substances
    ['Acid tranexamic 500mg', ['Dị ứng acid folic']],
    ['Natri fluorid 0.05%', ['natri clorid']],
    ['Lidocain hydroclorid 2%', ['Tetracyclin hydroclorid']],
    ['Paracetamol 500mg', ['kháng sinh']],
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

  it('labels antibiotic and cross-reactivity links', () => {
    expect(match('Cefuroxime 500mg', ['Penicillin'])[0].drugClass).toBe(
      'phản ứng chéo nhóm Penicillin (beta-lactam) ↔ nhóm Cephalosporin',
    );
    expect(match('Azithromycin', ['kháng sinh'])[0].drugClass).toBe('kháng sinh — nhóm Macrolide');
  });

  it('returns nothing when no allergies are recorded', () => {
    expect(findAllergyConflicts([{ drugName: 'Amoxicillin' }], [])).toEqual([]);
  });
});
