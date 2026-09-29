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
 * Names are in normalized form (see normalizeTerm); include common VN spellings.
 */
interface DrugClass {
  label: string;
  names: string[];
  /** Covered by a generic "dị ứng kháng sinh" / "antibiotic" allergy. */
  antibiotic?: boolean;
}

const DRUG_CLASSES: DrugClass[] = [
  {
    label: 'nhóm Penicillin (beta-lactam)',
    antibiotic: true,
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
    antibiotic: true,
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
    antibiotic: true,
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
    antibiotic: true,
    names: ['nitroimidazole', 'metronidazole', 'metronidazol', 'flagyl', 'tinidazole', 'rodogyl'],
  },
  {
    label: 'nhóm Tetracycline',
    antibiotic: true,
    names: ['tetracycline', 'tetracyclin', 'doxycycline', 'doxycyclin', 'minocycline'],
  },
  {
    label: 'nhóm Sulfonamide',
    antibiotic: true,
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

/** Generic allergy wording that covers every antibiotic class. */
const ANTIBIOTIC_TERMS = ['khang sinh', 'antibiotic', 'antibiotics', 'antibiotique'];

/**
 * Classes with known cross-reactivity (both directions): a penicillin allergy
 * still warns on a cephalosporin and vice versa.
 */
const CROSS_REACTIVE: Array<[string, string]> = [
  ['nhóm Penicillin (beta-lactam)', 'nhóm Cephalosporin'],
];

/**
 * Entries that negate rather than name an allergen ("Không dị ứng", "Không
 * có", "Chưa ghi nhận", "NKDA"). "Không dung nạp …" (intolerance) is kept —
 * it names a real reaction.
 */
const NEGATION_PREFIXES = ['khong', 'chua', 'none', 'no', 'n a', 'na', 'nka', 'nkda'];

function isNegation(normalized: string): boolean {
  if (normalized.startsWith('khong dung nap')) return false;
  return NEGATION_PREFIXES.some(p => normalized === p || normalized.startsWith(`${p} `));
}

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
  // salt / acid parts of a substance name ("Acid tranexamic", "Natri
  // fluorid", "Lidocain hydroclorid") say nothing about the allergen
  'acid',
  'natri',
  'sodium',
  'kali',
  'potassium',
  'hydroclorid',
  'hydrochlorid',
  'hydrochloride',
  'hcl',
]);

/** Lowercase, drop Vietnamese diacritics (đ → d), keep letters/digits as words. */
export function normalizeTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
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

/** Label of the class-level link between an allergy and a drug, if any. */
function classLink(allergyNorm: string, drugClasses: DrugClass[]): string | undefined {
  const allergyClasses = classesMentioned(allergyNorm);
  const same = allergyClasses.find(c => drugClasses.includes(c));
  if (same) return same.label;
  if (ANTIBIOTIC_TERMS.some(t => containsPhrase(allergyNorm, t))) {
    const antibiotic = drugClasses.find(c => c.antibiotic);
    if (antibiotic) return `kháng sinh — ${antibiotic.label}`;
  }
  for (const [a, b] of CROSS_REACTIVE) {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      if (allergyClasses.some(c => c.label === from) && drugClasses.some(c => c.label === to)) {
        return `phản ứng chéo ${from} ↔ ${to}`;
      }
    }
  }
  return undefined;
}

/**
 * Pairs every prescription line with every recorded allergy it may trigger.
 * A pair matches when the drug name contains the allergy (e.g. "Amoxicillin
 * 500mg" / "amoxicillin"), the allergy text names a substance word of the
 * drug (e.g. "Dị ứng amoxicillin" / "Amoxicillin"), both fall in the same
 * drug class (e.g. "Penicillin" / "Augmentin 625mg"), the allergy is a generic
 * "kháng sinh" and the drug is an antibiotic, or the classes cross-react
 * (penicillin ↔ cephalosporin).
 */
export function findAllergyConflicts(
  lines: Array<{ drugName: string }>,
  allergies: string[],
): AllergyConflict[] {
  const recorded = allergies
    .map(raw => ({ raw: raw.trim(), norm: normalizeTerm(raw) }))
    .filter(a => a.norm.length >= 3 && !isNegation(a.norm));
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
      const link = direct ? undefined : classLink(allergy.norm, drugClasses);
      if (direct || link) {
        conflicts.push({
          lineIndex,
          drugName: line.drugName,
          allergy: allergy.raw,
          ...(link && { drugClass: link }),
        });
      }
    }
  });
  return conflicts;
}
