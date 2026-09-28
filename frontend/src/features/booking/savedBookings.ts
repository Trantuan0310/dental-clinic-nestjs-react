/**
 * Bookings made on this device, so a patient can reopen their request from
 * /booking/status without typing anything. Storage can be missing or throw
 * (private mode, blocked site data); every access is guarded and the pages
 * work without it.
 */
export type SavedBooking = { ref: string; phone?: string; token?: string; savedAt: number };

const KEY = 'gensmile.bookings';
const MAX = 10;

export function loadSavedBookings(): SavedBooking[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((b) => typeof b?.ref === 'string') : [];
  } catch {
    return [];
  }
}

export function findSavedBooking(ref: string): SavedBooking | undefined {
  return loadSavedBookings().find((b) => b.ref === ref);
}

export function saveBooking(entry: Omit<SavedBooking, 'savedAt'>) {
  try {
    const previous = findSavedBooking(entry.ref);
    const next = [
      { ...previous, ...entry, savedAt: Date.now() },
      ...loadSavedBookings().filter((b) => b.ref !== entry.ref),
    ].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: lookup by code + phone still works */
  }
}

export function forgetBooking(ref: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadSavedBookings().filter((b) => b.ref !== ref)));
  } catch {
    /* ignore */
  }
}

/** "gs 1a2b3c4d5e" / "GS1A2B3C4D5E" / "1a2b3c4d5e" → "GS-1A2B3C4D5E" (mirrors the backend). */
export function normalizeReference(value: string) {
  const clean = value.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const body = clean.startsWith('GS') ? clean.slice(2) : clean;
  return body ? 'GS-' + body : '';
}
