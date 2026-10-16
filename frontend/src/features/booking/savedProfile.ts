/**
 * The details a patient typed on the booking form, kept on this device only
 * so the next booking is pre-filled. Nothing is looked up on the server by
 * phone (that would hand a patient's name and birth date to anyone who types
 * the number). Storage can be missing or throw; every access is guarded.
 */
export type SavedProfile = {
  fullName: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  contactPersonName: string;
  contactPersonPhone: string;
  onBehalf: boolean;
};

const KEY = 'gensmile.bookingProfile';
const TEXT = ['fullName', 'dob', 'gender', 'phone', 'email', 'contactPersonName', 'contactPersonPhone'] as const;

export function loadSavedProfile(): SavedProfile | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || typeof raw.fullName !== 'string' || !raw.fullName.trim()) {
      return null;
    }
    const profile = { onBehalf: raw.onBehalf === true } as SavedProfile;
    for (const key of TEXT) {
      (profile[key] as string) = typeof raw[key] === 'string' ? raw[key] : '';
    }
    return profile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: SavedProfile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* storage unavailable: the form simply starts empty next time */
  }
}

export function clearSavedProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
