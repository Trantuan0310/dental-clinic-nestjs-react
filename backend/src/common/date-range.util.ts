/**
 * Turns a `to` filter value into a Date usable as an inclusive upper bound.
 *
 * `to` may arrive as either a bare `YYYY-MM-DD` date or a full ISO
 * timestamp — callers that already compute a clinic-local end-of-day
 * boundary (e.g. `2026-09-03T16:59:59.999Z`) send the latter. `new
 * Date('2026-09-03')` alone parses as UTC midnight, which — used directly
 * as an `lte` bound — makes the upper bound a zero-width instant instead
 * of "through the end of that day", so a same-day range (from === to,
 * the common "today" query) matches nothing. Only bare dates need the
 * end-of-day time appended; a value that already has a time component is
 * used as-is.
 */
export function endOfDayInclusive(value: string): Date {
  return new Date(value.includes('T') ? value : `${value}T23:59:59.999Z`);
}
