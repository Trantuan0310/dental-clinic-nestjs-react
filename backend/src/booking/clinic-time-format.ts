import { CLINIC_UTC_OFFSET_MS } from '../common/date-range.util';

const WEEKDAYS = ['Chủ nhật', 'thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm', 'thứ Sáu', 'thứ Bảy'];

/**
 * A visit time as patients read it, at the clinic (UTC+7) whatever the
 * server's zone: "10:00 thứ Sáu 02/10/2026".
 */
export function formatVisitTime(value: Date): string {
  const local = new Date(value.getTime() + CLINIC_UTC_OFFSET_MS);
  const iso = local.toISOString();
  return (
    iso.slice(11, 16) +
    ' ' +
    WEEKDAYS[local.getUTCDay()] +
    ' ' +
    iso.slice(8, 10) +
    '/' +
    iso.slice(5, 7) +
    '/' +
    iso.slice(0, 4)
  );
}
