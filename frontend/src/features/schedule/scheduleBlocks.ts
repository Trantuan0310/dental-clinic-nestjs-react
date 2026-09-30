import { clinic } from '@/config/clinic';
import type { TimeBlock } from '@/types/schedule';

export const DAY_LABELS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Opening blocks of the clinic on a weekday (0 = Chủ nhật), from config/clinic.ts. */
export function openingBlocks(dayOfWeek: number): TimeBlock[] {
  return clinic.openingHours.byDay[dayOfWeek] ?? [];
}

/** Default blocks for a new schedule: the clinic's weekday opening hours. */
export function defaultBlocks(): TimeBlock[] {
  const blocks = openingBlocks(1);
  return blocks.length ? blocks.map((b) => ({ ...b })) : [{ startTime: '08:00', endTime: '17:00' }];
}

/** Same rules as the backend: HH:mm on a 5-minute grid, end after start, no overlap. */
export function blockError(blocks: TimeBlock[]): string | null {
  const sorted = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const [i, b] of sorted.entries()) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.endTime)) {
      return 'Nhập đủ giờ bắt đầu và kết thúc (HH:mm)';
    }
    if ((toMinutes(b.startTime) % 5 !== 0) || (toMinutes(b.endTime) % 5 !== 0 && b.endTime !== '23:59')) {
      return 'Phút phải là bội số của 5 (VD 08:05, 13:30)';
    }
    if (b.endTime <= b.startTime) return `Khung ${b.startTime}–${b.endTime}: giờ kết thúc phải sau giờ bắt đầu`;
    const prev = sorted[i - 1];
    if (prev && b.startTime < prev.endTime) {
      return `Khung ${prev.startTime}–${prev.endTime} và ${b.startTime}–${b.endTime} chồng nhau`;
    }
  }
  return null;
}

/**
 * Non-blocking warnings: a day the clinic is closed (e.g. Chủ nhật) or a block
 * outside the clinic's opening hours. A dentist may still work then.
 */
export function openingHoursWarnings(days: number[], blocks: TimeBlock[]): string[] {
  const warnings: string[] = [];
  for (const day of [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
    const open = openingBlocks(day);
    if (open.length === 0) {
      warnings.push(`${DAY_LABELS[day]}: phòng khám không mở cửa theo giờ đã cấu hình`);
      continue;
    }
    const outside = blocks.filter(
      (b) => !open.some((o) => o.startTime <= b.startTime && b.endTime <= o.endTime),
    );
    if (outside.length) {
      warnings.push(
        `${DAY_LABELS[day]}: ${outside.map((b) => `${b.startTime}–${b.endTime}`).join(', ')} nằm ngoài giờ mở cửa (${open
          .map((o) => `${o.startTime}–${o.endTime}`)
          .join(', ')})`,
      );
    }
  }
  return warnings;
}
