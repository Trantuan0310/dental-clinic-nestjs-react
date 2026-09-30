import { ValidateBy, ValidationArguments, ValidationOptions } from 'class-validator';
import { isCalendarDate } from '../../common/validators/is-calendar-date';

/** Longest visit accepted anywhere (booking, reschedule, walk-in, slot search). */
export const MAX_VISIT_MINUTES = 480;

// YYYY-MM-DDTHH:mm[:ss[.fff]] followed by Z or ±hh[:]mm.
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})$/;

function problem(value: unknown): string | null {
  if (typeof value !== 'string' || !isCalendarDate(value)) return 'không phải ngày giờ hợp lệ';
  const m = INSTANT.exec(value);
  // A zone-less time is ambiguous (it used to be read as UTC: 09:00 → 16:00).
  if (!m) return 'phải có múi giờ (Z hoặc ±hh:mm)';
  if ((m[1] && m[1] !== '00') || (m[2] && !/^0+$/.test(m[2]))) {
    return 'phải tròn phút (không có giây)';
  }
  return null;
}

/**
 * An appointment time: a real calendar date, an explicit offset (Z or
 * ±hh:mm) and a whole minute, as online requests already require.
 */
export function IsAppointmentInstant(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isAppointmentInstant',
      validator: {
        validate: value => problem(value) === null,
        defaultMessage: (args?: ValidationArguments) =>
          `${args?.property ?? 'Thời gian'} ${problem(args?.value) ?? 'không hợp lệ'}`,
      },
    },
    options,
  );
}
