export const isValidVnPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\s/g, '').replace(/^\+84/, '0');
  const patterns = [/^0[3-9]\d{8}$/, /^0[1-9]\d{8}$/];
  return patterns.some(pattern => pattern.test(cleaned));
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidDob = (dob: Date): boolean => {
  const now = new Date();
  const minDate = new Date(now.getFullYear() - 150, now.getMonth(), now.getDate());
  return dob >= minDate && dob <= now;
};

export const isMinor = (dob: Date): boolean => {
  const now = new Date();
  const age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    return age - 1 < 12;
  }
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
