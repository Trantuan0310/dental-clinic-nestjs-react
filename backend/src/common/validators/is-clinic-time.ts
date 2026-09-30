import { ValidateBy, ValidationOptions } from 'class-validator';

/**
 * Clinic wall-clock "HH:mm" for schedules: 00:00–23:59 on a 5-minute grid.
 * "23:59" is also accepted as "end of day". Anything else ("abc", "25:00",
 * "07:60", "8:00") is a 400 instead of a 500 or a wrong row in the database.
 */
export function isClinicTime(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return false;
  return Number(m[2]) % 5 === 0 || value === '23:59';
}

export const CLINIC_TIME_MESSAGE =
  'Giờ không hợp lệ: dùng định dạng HH:mm từ 00:00 đến 23:59, phút là bội số của 5';

export function IsClinicTime(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isClinicTime',
      validator: {
        validate: value => isClinicTime(value),
        defaultMessage: () => CLINIC_TIME_MESSAGE,
      },
    },
    options,
  );
}
