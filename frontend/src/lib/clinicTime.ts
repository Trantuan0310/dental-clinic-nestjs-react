/**
 * Clinic wall-clock time (Asia/Ho_Chi_Minh, UTC+7, no DST).
 *
 * Booking dates and "HH:mm" in the UI are clinic time, whatever time zone
 * the workstation is set to — the backend treats them the same way
 * (ADR-0009 "Quy ước chung"). Using the browser's local time here made a
 * front desk PC set to another zone book the wrong hour (issue #8).
 */
export const CLINIC_OFFSET = '+07:00';
const OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Clinic date ("yyyy-MM-dd") and time ("HH:mm") of an instant. */
export function clinicParts(value: string | Date): { date: string; time: string } {
  const shifted = new Date(new Date(value).getTime() + OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}

/** Today's clinic date. */
export function clinicToday(now: Date = new Date()): string {
  return clinicParts(now).date;
}

/** Minutes since clinic midnight. */
export function clinicMinutes(value: string | Date = new Date()): number {
  const { time } = clinicParts(value);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** ISO instant of a clinic date + "HH:mm". */
export function clinicIso(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00${CLINIC_OFFSET}`).toISOString();
}
