/**
 * Public clinic details shown on the landing page. They are baked in at build
 * time from VITE_CLINIC_* (set CLINIC_* in .env.production; the web image
 * passes them through as build args). Empty values hide the matching block,
 * so a missing hotline never renders as a broken "tel:" link.
 */
const env = import.meta.env;
const clean = (value: string | undefined) => (value ?? '').trim();

/** "08:00 – 12:00 · 13:30 – 19:00" → [{ startTime: '08:00', endTime: '12:00' }, …]. */
export function parseHourBlocks(text: string): Array<{ startTime: string; endTime: string }> {
  const blocks: Array<{ startTime: string; endTime: string }> = [];
  for (const m of text.matchAll(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/g)) {
    blocks.push({ startTime: `${m[1].padStart(2, '0')}:${m[2]}`, endTime: `${m[3].padStart(2, '0')}:${m[4]}` });
  }
  return blocks;
}

const weekdayHours = clean(env.VITE_CLINIC_HOURS) || '08:00 – 12:00 · 13:30 – 19:00';
const sundayHours = clean(env.VITE_CLINIC_SUNDAY_HOURS) || 'Nghỉ';
const phone = clean(env.VITE_CLINIC_PHONE);
const zalo = clean(env.VITE_CLINIC_ZALO);

export const clinic = {
  name: clean(env.VITE_CLINIC_NAME) || 'Nha khoa GENSMILE',
  tagline: clean(env.VITE_CLINIC_TAGLINE) || 'Nha khoa thẩm mỹ',
  phone,
  /** Digits only, for tel: links. */
  phoneHref: phone.replace(/[^\d+]/g, ''),
  /** A Zalo phone number or a full zalo.me link. */
  zaloHref: zalo ? (/^https?:\/\//.test(zalo) ? zalo : `https://zalo.me/${zalo.replace(/\D/g, '')}`) : '',
  email: clean(env.VITE_CLINIC_EMAIL),
  address: clean(env.VITE_CLINIC_ADDRESS),
  mapUrl: clean(env.VITE_CLINIC_MAP_URL),
  facebookUrl: clean(env.VITE_CLINIC_FACEBOOK_URL),
  hours: [
    { days: 'Thứ Hai – Thứ Bảy', time: weekdayHours },
    { days: 'Chủ nhật', time: sundayHours },
  ],
  /**
   * Opening hours as data, for the working-schedule form: default blocks and
   * a warning when a dentist's schedule falls outside them. Same source as
   * `hours` above (VITE_CLINIC_HOURS / VITE_CLINIC_SUNDAY_HOURS).
   */
  openingHours: {
    /** dayOfWeek (0 = Chủ nhật) → blocks the clinic is open. */
    byDay: [0, 1, 2, 3, 4, 5, 6].map((day) => parseHourBlocks(day === 0 ? sundayHours : weekdayHours)),
  },
};
