/**
 * Public clinic details shown on the landing page. They are baked in at build
 * time from VITE_CLINIC_* (set CLINIC_* in .env.production; the web image
 * passes them through as build args). Empty values hide the matching block,
 * so a missing hotline never renders as a broken "tel:" link.
 */
const env = import.meta.env;
const clean = (value: string | undefined) => (value ?? '').trim();

/**
 * "08:00 – 12:00 · 13:30 – 19:00" → [{ startTime: '08:00', endTime: '12:00' }, …].
 *
 * A pair that is not a real range (hour past 23, minute past 59, end at or
 * before start, overlapping or out of order with the one before it) is
 * dropped. The backend's parser — backend/prisma/clinic-setup/hours.ts —
 * throws on those, so without the same rules here a typo in CLINIC_HOURS
 * became opening-hours *data*: it pre-filled the working-schedule form with
 * a block the form itself refuses to save, and measured "outside opening
 * hours" warnings against it. This parser cannot throw (it runs while the
 * module loads, and an exception there takes the whole app down), so it
 * keeps the valid blocks and ignores the rest; the landing page still shows
 * the configured text as typed, which is what tells the admin about it.
 */
export function parseHourBlocks(text: string): Array<{ startTime: string; endTime: string }> {
  const blocks: Array<{ startTime: string; endTime: string }> = [];
  let previousEnd = -1;
  for (const m of text.matchAll(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/g)) {
    const [h1, m1, h2, m2] = m.slice(1).map(Number);
    if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) continue;
    const start = h1 * 60 + m1;
    const end = h2 * 60 + m2;
    if (end <= start || start < previousEnd) continue;
    previousEnd = end;
    blocks.push({ startTime: `${m[1].padStart(2, '0')}:${m[2]}`, endTime: `${m[3].padStart(2, '0')}:${m[4]}` });
  }
  return blocks;
}

const configuredWeekdayHours = clean(env.VITE_CLINIC_HOURS);
const configuredSundayHours = clean(env.VITE_CLINIC_SUNDAY_HOURS);
const configuredTagline = clean(env.VITE_CLINIC_TAGLINE);
const weekdayHours = configuredWeekdayHours || '08:00 – 12:00 · 13:30 – 19:00';
const sundayHours = configuredSundayHours || 'Nghỉ';
const phone = clean(env.VITE_CLINIC_PHONE);
const zalo = clean(env.VITE_CLINIC_ZALO);

export const clinic = {
  name: clean(env.VITE_CLINIC_NAME) || 'Nha khoa GENSMILE',
  tagline: configuredTagline || 'Nha khoa thẩm mỹ',
  /** True when the value is a built-in fallback that may be localized in UI. */
  taglineIsDefault: !configuredTagline,
  sundayHoursIsDefault: !configuredSundayHours,
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
