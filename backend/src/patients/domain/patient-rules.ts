import { clinicDateOnly } from '../../common/date-range.util';

export const isValidVnPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\s/g, '').replace(/^\+84/, '0');
  const patterns = [/^0[3-9]\d{8}$/, /^0[1-9]\d{8}$/];
  return patterns.some(pattern => pattern.test(cleaned));
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/** Today at the clinic as [year, month 0–11, day]; a DOB is a DATE (UTC midnight). */
const clinicToday = (now: Date): [number, number, number] => {
  const [y, m, d] = clinicDateOnly(now).split('-').map(Number);
  return [y, m - 1, d];
};

export const isValidDob = (dob: Date, now: Date = new Date()): boolean => {
  const [y, m, d] = clinicToday(now);
  const minDate = Date.UTC(y - 150, m, d);
  return dob.getTime() >= minDate && dob.getTime() <= Date.UTC(y, m, d);
};

export const isMinor = (dob: Date, now: Date = new Date()): boolean => {
  const [y, m, d] = clinicToday(now);
  let age = y - dob.getUTCFullYear();
  if (m < dob.getUTCMonth() || (m === dob.getUTCMonth() && d < dob.getUTCDate())) age--;
  return age < 12;
};

export const isValidIdentifierValue = (type: string, value: string): boolean => {
  switch (type) {
    case 'CCCD':
      return /^\d{12}$/.test(value);
    case 'CMND':
      return /^\d{9}$|^\d{12}$/.test(value);
    case 'PASSPORT':
      return /^[A-Z0-9]{6,9}$/i.test(value);
    default:
      return value.length >= 5 && value.length <= 50;
  }
};

export const readJsonStringArray = (json: unknown): string[] => {
  if (Array.isArray(json)) {
    return json.filter((item): item is string => typeof item === 'string');
  }
  return [];
};

/**
 * Union of free-text lists (allergies, diseases, medications), trimmed and
 * de-duplicated case-insensitively; the first spelling seen wins.
 */
export const mergeStringLists = (...lists: string[][]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of lists.flat()) {
    const value = item.trim();
    const key = value.toLocaleLowerCase('vi');
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
};

/** Lower case, no accents (đ → d), single spaces: how a name typed on a phone compares. */
export function foldName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The same person's name as typed twice: equal once accents and case are
 * ignored, or one leaves out middle names ("Ngô Nam" for "Ngô Quang Nam").
 * The family name (first word) and the given name (last) must both agree, and
 * the shorter name's words must appear in order in the longer. A single word
 * only ever equals itself.
 */
export function similarName(a: string, b: string): boolean {
  const x = foldName(a).split(' ').filter(Boolean);
  const y = foldName(b).split(' ').filter(Boolean);
  if (!x.length || !y.length) return false;
  if (x.join(' ') === y.join(' ')) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 2) return false;
  if (short[0] !== long[0] || short[short.length - 1] !== long[long.length - 1]) return false;
  let next = 0;
  for (const word of long) if (word === short[next]) next++;
  return next === short.length;
}

type MedicalListKey = 'allergies' | 'chronicDiseases' | 'currentMedications';
const MEDICAL_LIST_KEYS: MedicalListKey[] = ['allergies', 'chronicDiseases', 'currentMedications'];

/**
 * What changed in the safety-critical lists (allergies, chronic diseases,
 * current medications), for the audit log: entries added and removed per
 * list. A removed allergy must be traceable to who removed it. Lists not in
 * `next` (not sent) or unchanged are left out.
 */
export function medicalListChanges(
  before: Partial<Record<MedicalListKey, unknown>>,
  next: Partial<Record<MedicalListKey, unknown>>,
): Partial<Record<MedicalListKey, { added: string[]; removed: string[] }>> {
  const out: Partial<Record<MedicalListKey, { added: string[]; removed: string[] }>> = {};
  for (const key of MEDICAL_LIST_KEYS) {
    if (next[key] === undefined) continue;
    const was = readJsonStringArray(before[key]);
    const now = readJsonStringArray(next[key]);
    const fold = (v: string) => v.trim().toLocaleLowerCase('vi');
    const wasSet = new Set(was.map(fold));
    const nowSet = new Set(now.map(fold));
    const added = now.filter(v => !wasSet.has(fold(v)));
    const removed = was.filter(v => !nowSet.has(fold(v)));
    if (added.length || removed.length) out[key] = { added, removed };
  }
  return out;
}
