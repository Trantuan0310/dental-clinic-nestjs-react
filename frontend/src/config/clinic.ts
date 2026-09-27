/**
 * Public clinic details shown on the landing page. They are baked in at build
 * time from VITE_CLINIC_* (set CLINIC_* in .env.production; the web image
 * passes them through as build args). Empty values hide the matching block,
 * so a missing hotline never renders as a broken "tel:" link.
 */
const env = import.meta.env;
const clean = (value: string | undefined) => (value ?? '').trim();

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
    { days: 'Thứ Hai – Thứ Bảy', time: clean(env.VITE_CLINIC_HOURS) || '08:00 – 12:00 · 13:30 – 19:00' },
    { days: 'Chủ nhật', time: clean(env.VITE_CLINIC_SUNDAY_HOURS) || 'Nghỉ' },
  ],
};
