import { ValidateBy, ValidationOptions, isISO8601 } from 'class-validator';

/**
 * ISO date (optionally with time) whose YYYY-MM-DD part is a real calendar
 * day. `@IsDateString()` alone lets `2023-02-29` through and `new Date()` then
 * rolls it over to 1 March.
 */
export function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !isISO8601(value)) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(2000, mo - 1, d));
  date.setUTCFullYear(y);
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isCalendarDate',
      validator: {
        validate: value => isCalendarDate(value),
        defaultMessage: () => 'Ngày không hợp lệ (định dạng YYYY-MM-DD)',
      },
    },
    options,
  );
}
