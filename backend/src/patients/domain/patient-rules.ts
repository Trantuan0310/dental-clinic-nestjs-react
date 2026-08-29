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
