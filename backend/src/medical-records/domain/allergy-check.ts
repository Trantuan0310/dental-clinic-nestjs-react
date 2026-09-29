/**
 * Prescription vs. recorded-allergy screening (keyword based, not a drug
 * database). It only has to catch the obvious cases a busy dentist can miss —
 * "Dị ứng Penicillin" on the chart and Augmentin on the script — so a match
 * blocks the save until the dentist confirms with a reason. Deliberately
 * over-inclusive within a class: a false alarm costs one click, a miss can
 * cost an anaphylaxis.
 */

export interface AllergyConflict {
  lineIndex: number;
  drugName: string;
  allergy: string;
  /** Drug class that linked them, when the match was not a direct name match. */
  drugClass?: string;
}

/**
 * Drug classes common in dental prescribing. An allergy that names the class
 * or any member flags every member (cross-reactivity within the class).
 * Names are in normalized form (see normalize); include common VN spellings.
 */
const DRUG_CLASSES: Array<{ label: string; names: string[] }> = [
  {
    label: 'nhóm Penicillin (beta-lactam)',
    names: [
      'penicillin',
      'penicilin',
      'beta lactam',
      'betalactam',
      'amoxicillin',
      'amoxicilin',
      'amoxycillin',
      'ampicillin',
      'ampicilin',
      'augmentin',
      'klamentin',
      'curam',
      'cloxacillin',
      'dicloxacillin',
      'oxacillin',
      'piperacillin',
    ],
  },
  {
    label: 'nhóm Cephalosporin',
    names: [
      'cephalosporin',
      'cephalosporine',
      'cefalosporin',
      'cefalexin',
      'cephalexin',
      'cefadroxil',
      'cefuroxime',
      'cefuroxim',
      'cefixime',
      'cefixim',
      'cefaclor',
      'cefdinir',
      'cefpodoxime',
      'ceftriaxone',
    ],
  },
  {
    label: 'nhóm NSAID (kháng viêm không steroid)',
    names: [
      'nsaid',
      'nsaids',
      'ains',
      'khang viem khong steroid',
      'aspirin',
      'acetylsalicylic',
      'ibuprofen',
      'diclofenac',
      'naproxen',
      'meloxicam',
      'piroxicam',
      'ketoprofen',
      'ketorolac',
      'celecoxib',
      'etoricoxib',
      'nimesulide',
      'indomethacin',
      'alaxan',
    ],
  },
  {
    label: 'nhóm Macrolide',
    names: [
      'macrolide',
      'macrolid',
      'erythromycin',
      'azithromycin',
      'clarithromycin',
      'spiramycin',
      'rodogyl',
    ],
  },
  {
    label: 'nhóm Nitroimidazole (Metronidazole)',
    names: ['nitroimidazole', 'metronidazole', 'metronidazol', 'flagyl', 'tinidazole', 'rodogyl'],
  },
  {
    label: 'nhóm Tetracycline',
    names: ['tetracycline', 'tetracyclin', 'doxycycline', 'doxycyclin', 'minocycline'],
  },
  {
    label: 'nhóm Sulfonamide',
    names: ['sulfa', 'sulfonamide', 'sulfamid', 'sulfamethoxazole', 'cotrimoxazole', 'bactrim'],
  },
  {
    label: 'Paracetamol',
    names: ['paracetamol', 'acetaminophen', 'efferalgan', 'panadol', 'hapacol'],
  },
  {
    label: 'nhóm thuốc tê Amide',
    names: [
      'thuoc te',
      'lidocaine',
      'lidocain',
      'articaine',
      'articain',
      'mepivacaine',
      'prilocaine',
      'bupivacaine',
    ],
  },
];

/** Allergy entries that mean "none recorded" rather than a real allergen. */
const NO_ALLERGY = new Set([
  'khong',
  'khong co',
  'khong ro',
  'khong di ung',
  'chua ghi nhan',
  'chua phat hien',
  'none',
  'no',
  'n a',
  'na',
]);

/** Drug-name words that describe the form, not the substance. */
const FORM_WORDS = new Set([
  'thuoc',
  'vien',
  'nang',
  'uong',
  'nuoc',
  'goi',
  'siro',
  'syrup',
  'tablet',
  'tablets',
  'capsule',
  'capsules',
  'forte',
  'plus',
  'extra',
  'retard',
  'kids',
  'sui',
  'bot',
  'dang',
  'cream',
  'suc',
  'mieng',
]);

/** Lowercase, drop Vietnamese diacritics (đ → d), keep letters/digits as words. */
export function normalizeTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Whole-word (or whole-phrase) containment on normalized strings. */
function containsPhrase(haystack: string, needle: string): boolean {
  return needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);
}

function classesMentioned(normalized: string) {
  return DRUG_CLASSES.filter(c => c.names.some(n => containsPhrase(normalized, n)));
}

/**
 * Pairs every prescription line with every recorded allergy it may trigger.
 * A pair matches when the drug name contains the allergy (e.g. "Amoxicillin
 * 500mg" / "amoxicillin"), the allergy text names a substance word of the
 * drug (e.g. "Dị ứng amoxicillin" / "Amoxicillin"), or both fall in the same
 * drug class (e.g. "Penicillin" / "Augmentin 625mg").
 */
export function findAllergyConflicts(
  lines: Array<{ drugName: string }>,
  allergies: string[],
): AllergyConflict[] {
  const recorded = allergies
    .map(raw => ({ raw: raw.trim(), norm: normalizeTerm(raw) }))
    .filter(a => a.norm.length >= 3 && !NO_ALLERGY.has(a.norm));
  if (recorded.length === 0) return [];

  const conflicts: AllergyConflict[] = [];
  lines.forEach((line, lineIndex) => {
    const drug = normalizeTerm(line.drugName ?? '');
    if (!drug) return;
    const drugWords = drug
      .split(' ')
      .filter(w => w.length >= 4 && !/\d/.test(w) && !FORM_WORDS.has(w));
    const drugClasses = classesMentioned(drug);

    for (const allergy of recorded) {
      const allergyWords = new Set(allergy.norm.split(' '));
      const direct = containsPhrase(drug, allergy.norm) || drugWords.some(w => allergyWords.has(w));
      const shared = direct
        ? undefined
        : classesMentioned(allergy.norm).find(c => drugClasses.includes(c));
      if (direct || shared) {
        conflicts.push({
          lineIndex,
          drugName: line.drugName,
          allergy: allergy.raw,
          ...(shared && { drugClass: shared.label }),
        });
      }
    }
  });
  return conflicts;
}
