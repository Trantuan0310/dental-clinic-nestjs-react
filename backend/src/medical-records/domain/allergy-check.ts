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
  /**
   * Word prefixes that also name a member ("amoxi" → Amoxicillin, Amoxi,
   * Amoxiclav). Only for stems no unrelated word starts with.
   */
  prefixes?: string[];
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
      'hagimox',
      'clamoxyl',
      'ofmantine',
      'ospamox',
      'moxilen',
      'amoxiclav',
      'cloxacillin',
      'dicloxacillin',
      'oxacillin',
      'piperacillin',
    ],
    prefixes: ['amoxi'],
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
      'zinnat',
      'keflex',
      'hapenxin',
    ],
    prefixes: ['cef', 'ceph'],
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
      'voltaren',
      'mobic',
      'celebrex',
      'arcoxia',
      'brufen',
      'nurofen',
      'feldene',
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
      'dorogyne',
      'zithromax',
    ],
  },
  {
    label: 'nhóm Nitroimidazole (Metronidazole)',
    antibiotic: true,
    names: [
      'nitroimidazole',
      'metronidazole',
      'metronidazol',
      'flagyl',
      'tinidazole',
      'rodogyl',
      'dorogyne',
    ],
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
    names: [
      'paracetamol',
      'acetaminophen',
      'efferalgan',
      'panadol',
      'hapacol',
      'tylenol',
      'partamol',
      'alaxan',
    ],
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

/** Generic "painkiller" allergy wording: warns on NSAIDs and Paracetamol. */
const ANALGESIC_TERMS = ['giam dau', 'painkiller', 'painkillers', 'analgesic', 'analgesics'];
const ANALGESIC_CLASSES = ['nhóm NSAID (kháng viêm không steroid)', 'Paracetamol'];

/**
 * Classes with known cross-reactivity (both directions): a penicillin allergy
 * still warns on a cephalosporin and vice versa.
 */
const CROSS_REACTIVE: Array<[string, string]> = [
  ['nhóm Penicillin (beta-lactam)', 'nhóm Cephalosporin'],
];

/**
 * A clause that only says "no allergy" and names nothing ("Không", "Không có
 * tiền sử dị ứng", "Chưa ghi nhận", "NKDA"). Anything longer is screened:
 * "Không chịu được Penicillin", "Không dùng được X", "No penicillin" name a
 * real allergen.
 */
const PURE_NEGATION = [
  /^(khong|chua)( co)?( ghi nhan| phat hien| ro| biet)?( co)?( tien su)?( di ung)?( voi)?( thuoc| thuc an| thuc pham| thuoc va thuc an| thuoc hay thuc an)?( gi| nao)?$/,
  /^(none|nil|no|nkda|nka|n a|na|unknown)$/,
  /^no( known)?( drug)? allerg(y|ies)$/,
];

function isPureNegation(clause: string): boolean {
  return PURE_NEGATION.some(re => re.test(clause));
}

/**
 * One recorded entry can hold several statements ("Không dị ứng thức ăn; dị
 * ứng Penicillin", "Không rõ, nghi dị ứng Amoxicillin"), so each is screened
 * on its own — a leading negation must not hide the allergen after it.
 */
function allergyClauses(raw: string): string[] {
  return raw
    .split(/[;,.\n/+]+|\s(?:nhưng|nhung|tuy nhiên|tuy nhien|ngoài ra|ngoai ra|but|however)\s/i)
    .map(part => normalizeTerm(part))
    .filter(norm => norm.length >= 3 && !isPureNegation(norm));
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
  const words = normalized.split(' ');
  return DRUG_CLASSES.filter(
    c =>
      c.names.some(n => containsPhrase(normalized, n)) ||
      (c.prefixes ?? []).some(p => words.some(w => w.startsWith(p))),
  );
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
  if (ANALGESIC_TERMS.some(t => containsPhrase(allergyNorm, t))) {
    const analgesic = drugClasses.find(c => ANALGESIC_CLASSES.includes(c.label));
    if (analgesic) return `thuốc giảm đau — ${analgesic.label}`;
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
 * "kháng sinh" / "giảm đau" and the drug is an antibiotic / analgesic, or
 * the classes cross-react (penicillin ↔ cephalosporin). Each entry is split
 * into clauses and only pure "no allergy" clauses are skipped.
 */
export function findAllergyConflicts(
  lines: Array<{ drugName: string }>,
  allergies: string[],
): AllergyConflict[] {
  const recorded = allergies
    .map(raw => ({ raw: (raw ?? '').trim(), clauses: allergyClauses(raw ?? '') }))
    .filter(a => a.clauses.length > 0);
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
      // One conflict per line/entry: the first clause that links them.
      for (const clause of allergy.clauses) {
        const clauseWords = new Set(clause.split(' '));
        const direct = containsPhrase(drug, clause) || drugWords.some(w => clauseWords.has(w));
        const link = direct ? undefined : classLink(clause, drugClasses);
        if (direct || link) {
          conflicts.push({
            lineIndex,
            drugName: line.drugName,
            allergy: allergy.raw,
            ...(link && { drugClass: link }),
          });
          break;
        }
      }
    }
  });
  return conflicts;
}
