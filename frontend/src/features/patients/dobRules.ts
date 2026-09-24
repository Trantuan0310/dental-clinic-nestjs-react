import { differenceInYears, parseISO } from 'date-fns';

// Mirrors backend's isValidDob (patients/domain/patient-rules.ts): must be
// today or earlier, and no more than 150 years ago. Without this, picking a
// future birth year rendered a nonsensical negative age and could trigger
// the emergency-contact panel (age < 12 is true for negative ages too).
export const isValidDob = (value: string) => {
  const dob = parseISO(value);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  const minDate = new Date(now.getFullYear() - 150, now.getMonth(), now.getDate());
  return dob >= minDate && dob <= now;
};

/** BR-PT-013: a valid DOB under 12 years old needs a contact person. */
export const isUnder12 = (value: string) =>
  isValidDob(value) && differenceInYears(new Date(), parseISO(value)) < 12;
