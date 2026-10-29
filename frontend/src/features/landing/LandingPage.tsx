import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Mail, MapPin, Menu, MessageCircle, Phone, UserRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import { clinic } from '@/config/clinic';
import { clinicToday } from '@/lib/clinicTime';
import { SPECIALTY_LABEL } from '@/features/staff/labels';
import { mediaUrl, useSiteMedia, type SiteMedia } from '@/features/media/mediaApi';
import { ToothArch } from './ToothArch';

/**
 * Public home page for patients (gensmile.online/). The price list comes from
 * /public/booking/prices (every service the clinic chose to show); dentists,
 * open times and the "Đặt" links from the booking endpoints, so they only
 * offer what can actually be booked online. Contact details come from the
 * build-time clinic config.
 *
 * Two things lead the page: a tooth chart (tap the tooth that hurts to see
 * what the clinic does for it) and this week's open times for one dentist.
 */

type PublicDentist = { id: string; fullName: string; specialties: string[]; bio?: string | null };
type PublicService = {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  basePrice: string | number;
  dentists: PublicDentist[];
};
/** A price-list row: `price` null = ask the clinic; `priceFrom` = "từ …". */
type PublicPrice = {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  isFree: boolean;
  price: number | null;
  priceFrom: boolean;
};
type SlotsResponse = { availableSlots: string[] };
/** Details typed or picked on the home page, handed to the booking form. */
export type BookingPrefill = { fullName?: string; phone?: string; reason?: string };

const NAV_KEYS = ['navSlots', 'navServices', 'navDentists', 'navContact'] as const;
const NAV_HREFS = ['#gio-trong', '#dich-vu', '#bac-si', '#lien-he'];
const SLOT_DAYS = 6;
const SLOTS_PER_DAY = 6;
// Weekday names are interface labels; clinic-configured opening times stay verbatim.
const weekdayLabel = (day: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, day === 0 ? 7 : day)));

const money = (locale: string) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN');
// "Miễn phí" only for a service the clinic marked free: a 0 left unset
// reads "Liên hệ", not a promise.
const formatPrice = (p: PublicPrice, t: (key: string) => string, locale: string) => {
  if (p.isFree) return t('uiEntry.landing.free');
  if (p.price === null || !Number.isFinite(p.price)) return t('uiEntry.landing.contact');
  if (p.price === 0 && p.priceFrom) return t('uiEntry.landing.freeSomeDentists');
  return `${p.priceFrom ? t('uiEntry.landing.from') + ' ' : ''}${money(locale).format(p.price)} ${locale === 'en' ? 'VND' : 'đ'}`;
};
const tagline = (t: (key: string) => string) =>
  clinic.taglineIsDefault ? t('uiEntry.landing.defaultTagline') : clinic.tagline;
const addDays = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const initials = (fullName: string) =>
  fullName
    .replace(/^(BS|ThS|TS|BSCKI|BSCKII)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

/**
 * Which services on the clinic's own price list fit a tooth, by its position
 * (1 = central incisor … 8 = wisdom tooth). Matched on the service name, so a
 * clinic that names a service differently just shows fewer suggestions.
 */
const TOOTH_SERVICE_PATTERNS: Record<'front' | 'back' | 'wisdom', RegExp[]> = {
  front: [/trám|hàn|composite|filling/i, /sứ|veneer|mặt dán|crown/i, /implant/i],
  back: [/trám|hàn|composite|filling/i, /tủy|root canal/i, /sứ|crown/i, /implant/i],
  // "răng khôn", not "khôn" alone: "không" (as in "không biến chứng") contains it.
  wisdom: [/răng khôn|wisdom/i, /x-?quang|x-?ray/i],
};
function servicesForTooth(code: number, prices: PublicPrice[]) {
  const n = code % 10;
  const group = n === 8 ? 'wisdom' : n <= 3 ? 'front' : 'back';
  const picked: PublicPrice[] = [];
  for (const re of TOOTH_SERVICE_PATTERNS[group]) {
    const hit = prices.find((p) => re.test(p.name) && !picked.includes(p) && (group === 'wisdom' || !/răng khôn|wisdom/i.test(p.name)));
    if (hit) picked.push(hit);
  }
  return picked;
}

function useBookingOptions() {
  return useQuery({
    queryKey: ['public-booking-options'],
    queryFn: async () => (await api.get<{ data: PublicService[] }>('/public/booking/options')).data.data,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

function usePriceList() {
  return useQuery({
    queryKey: ['public-price-list'],
    queryFn: async () => (await api.get<{ data: PublicPrice[] }>('/public/booking/prices')).data.data,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

function Brand({ light = false }: { light?: boolean }) {
  const { t } = useTranslation();
  return (
    <a href="#top" className="flex items-center gap-2.5" aria-label={clinic.name}>
      <img src="/logo-icon.png" alt="" className="h-10 w-10 rounded bg-white" />
      <span className="flex flex-col leading-none">
        <span className={'font-display text-xl font-extrabold tracking-[0.04em] ' + (light ? 'text-white' : 'text-brand-600')}>GENSMILE</span>
        <span className={'mt-1 text-xs ' + (light ? 'text-brand-100' : 'text-gray-500 dark:text-surface-400')}>{tagline(t)}</span>
      </span>
    </a>
  );
}

function SiteHeader() {
  const { t } = useTranslation();
  const NAV = NAV_HREFS.map((href, i) => ({ href, label: t(`uiEntry.landing.${NAV_KEYS[i]}`) }));
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Brand />
        <nav className="hidden items-center gap-6 text-[15px] text-gray-800 dark:text-surface-200 md:flex" aria-label={t('uiEntry.landing.mainNav')}>
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-brand-600">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          {clinic.phone && (
            <a href={`tel:${clinic.phoneHref}`} className="hidden font-mono text-sm font-semibold text-gray-900 hover:text-brand-600 dark:text-surface-100 lg:inline">
              {clinic.phone}
            </a>
          )}
          <Link to="/booking" className="hidden rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:inline-flex">
            {t('uiEntry.landing.bookVisit')}
          </Link>
          <button
            type="button"
            ref={menuButton}
            className="min-h-11 min-w-11 rounded-md p-2 text-gray-700 dark:text-surface-200 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-controls="public-mobile-navigation"
            aria-expanded={open}
            aria-label={t(open ? 'uiEntry.landing.closeMenu' : 'uiEntry.landing.openMenu')}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="public-mobile-navigation" className="border-t border-gray-100 dark:border-surface-700 bg-white dark:bg-surface-900 px-4 py-3 md:hidden" aria-label={t('uiEntry.landing.nav')}>
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-2.5 font-medium text-gray-700 dark:text-surface-200 hover:bg-brand-50"
            >
              {item.label}
            </a>
          ))}
          <Link to="/booking/status" className="block rounded-md px-2 py-2.5 font-medium text-gray-700 dark:text-surface-200 hover:bg-brand-50">
            {t('uiEntry.landing.lookup')}
          </Link>
        </nav>
      )}
    </header>
  );
}

/** Opening: tap a tooth to see what the clinic does for it and the price. */
function ToothHero({ prices, bookable, media }: { prices: PublicPrice[]; bookable: Set<string>; media?: SiteMedia }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const [tooth, setTooth] = useState(36);
  const kinds = t('uiEntry.landing.toothKinds', { returnObjects: true }) as string[];
  const sides = t('uiEntry.landing.toothSides', { returnObjects: true }) as string[];
  const kind = kinds[(tooth % 10) - 1];
  const side = sides[Math.floor(tooth / 10) - 1];
  const matched = useMemo(() => servicesForTooth(tooth, prices), [tooth, prices]);
  const reason: BookingPrefill = { reason: t('uiEntry.landing.toothReason', { code: tooth, kind: kind.toLowerCase(), side }) };

  return (
    <section id="top" className="border-b border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-[1fr_1.1fr] md:py-14">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-gray-900 dark:text-surface-100 sm:text-6xl">
            {t('uiEntry.landing.toothTitle')} <span className="block text-brand-600">{t('uiEntry.landing.toothHighlight')}</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-gray-600 dark:text-surface-300">{t('uiEntry.landing.toothLead')}</p>
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
            <dt className="text-gray-500 dark:text-surface-400">{t('uiEntry.landing.workingHours')}</dt>
            <dd className="text-gray-900 dark:text-surface-100">
              {weekdayLabel(1, lang)} – {weekdayLabel(6, lang)}: {clinic.hours[0].time}
            </dd>
            {clinic.address && (
              <>
                <dt className="text-gray-500 dark:text-surface-400">{t('uiEntry.landing.address')}</dt>
                <dd className="text-gray-900 dark:text-surface-100">{clinic.address}</dd>
              </>
            )}
          </dl>
        </div>
        <div className="min-w-0">
          <ToothArch selected={tooth} onSelect={setTooth} />
          <div className="mt-2 rounded-lg bg-brand-50 p-4 dark:bg-surface-800" aria-live="polite">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl font-semibold leading-none text-brand-600 dark:text-brand-300">{tooth}</span>
              <span>
                <span className="block font-display text-lg font-semibold text-gray-900 dark:text-surface-100">{kind}</span>
                <span className="text-sm text-gray-500 dark:text-surface-400">{side}</span>
              </span>
            </div>
            {matched.length > 0 ? (
              <ul className="mt-3 divide-y divide-dashed divide-brand-200 border-t border-dashed border-brand-200 text-[15px] dark:divide-surface-700 dark:border-surface-700">
                {matched.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 text-gray-800 dark:text-surface-200">{s.name}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-gray-900 dark:text-surface-100">{formatPrice(s, t, i18n.language)}</span>
                      {bookable.has(s.id) && (
                        <Link
                          to={`/booking?service=${encodeURIComponent(s.id)}`}
                          state={reason}
                          className="text-sm font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                          aria-label={t('uiEntry.landing.bookService', { service: s.name })}
                        >
                          {t('uiEntry.landing.bookShort')}
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-600 dark:text-surface-300">{t('uiEntry.landing.toothNoMatch')}</p>
            )}
            <Link to="/booking" state={reason} className="mt-3 inline-flex rounded-md bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700">
              {t('uiEntry.landing.toothBook')}
            </Link>
          </div>
        </div>
      </div>
      {media?.hero && (
        <div className="mx-auto max-w-6xl px-4 pb-10">
          <img
            src={mediaUrl(media.hero.id)}
            alt={media.hero.caption ?? t('uiEntry.landing.clinicImage', { clinic: clinic.name })}
            className="aspect-[21/8] w-full rounded-lg object-cover"
          />
        </div>
      )}
    </section>
  );
}

/** This week's open times for one service and dentist; a tap opens the booking form on it. */
function OpenSlots({ services }: { services: PublicService[] }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const [serviceId, setServiceId] = useState('');
  const [dentistId, setDentistId] = useState('');
  const service = services.find((s) => s.id === serviceId) ?? services[0];
  const dentist = service?.dentists.find((d) => d.id === dentistId) ?? service?.dentists[0];
  const today = clinicToday();
  const days = Array.from({ length: SLOT_DAYS }, (_, i) => addDays(today, i));
  const results = useQueries({
    queries: days.map((date) => ({
      queryKey: ['public-slots', service?.id, dentist?.id, date],
      enabled: !!service && !!dentist,
      staleTime: 60_000,
      retry: 0,
      queryFn: async () =>
        (await api.get<{ data: SlotsResponse }>('/public/booking/slots', { params: { serviceId: service!.id, dentistId: dentist!.id, date } })).data.data
          .availableSlots,
    })),
  });
  if (!service || !dentist) return null;
  const byDay = results.map((r) => r.data ?? []);
  const count = byDay.reduce((s, d) => s + d.length, 0);
  const loading = results.some((r) => r.isLoading);
  const dayHead = (date: string) => {
    const d = new Date(date + 'T00:00:00Z');
    return {
      week: new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(d),
      day: date.slice(8, 10) + '/' + date.slice(5, 7),
    };
  };
  const select =
    'mt-1 block min-h-11 w-full rounded-md border-0 bg-white/95 px-3 text-[15px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent';

  return (
    <section id="gio-trong" className="scroll-mt-16 bg-brand-600 text-white dark:bg-brand-800" aria-labelledby="gio-trong-title">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-[18rem_1fr]">
        <div className="flex flex-col gap-4">
          <h2 id="gio-trong-title" className="font-display text-3xl font-bold">
            {t('uiEntry.landing.slotsTitle')}
          </h2>
          <p className="text-brand-50">
            <span className="font-mono text-4xl font-semibold text-white">{loading ? '…' : count}</span>{' '}
            {t('uiEntry.landing.slotsCount', { days: SLOT_DAYS })}
          </p>
          <label className="text-sm text-brand-50">
            {t('uiEntry.landing.slotsService')}
            <select
              className={select}
              value={service.id}
              onChange={(e) => {
                setServiceId(e.target.value);
                setDentistId('');
              }}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-brand-50">
            {t('uiEntry.landing.slotsDentist')}
            <select className={select} value={dentist.id} onChange={(e) => setDentistId(e.target.value)}>
              {service.dentists.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="min-w-0">
          {!loading && count === 0 ? (
            <p className="rounded-md bg-white/10 p-5">{t('uiEntry.landing.slotsEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[540px] grid-cols-6 gap-2" role="group" aria-label={t('uiEntry.landing.slotsCaption', { service: service.name, dentist: dentist.fullName })}>
                {days.map((date, i) => {
                  const h = dayHead(date);
                  const shown = byDay[i].slice(0, SLOTS_PER_DAY);
                  const more = byDay[i].length - shown.length;
                  const open = (time?: string) =>
                    navigate(
                      `/booking?service=${encodeURIComponent(service.id)}&dentist=${encodeURIComponent(dentist.id)}&date=${date}` + (time ? `&time=${time}` : ''),
                    );
                  return (
                    <div key={date} className="flex min-w-0 flex-col gap-1.5">
                      <p className="text-sm font-medium">
                        {h.week} <span className="block font-mono text-xs font-normal text-brand-100">{h.day}</span>
                      </p>
                      {results[i].isLoading ? (
                        <span className="block h-9 animate-pulse rounded bg-white/10" aria-hidden />
                      ) : shown.length === 0 ? (
                        <span className="rounded bg-white/10 px-2 py-2 text-xs text-brand-100">{t('uiEntry.landing.slotsDayFull')}</span>
                      ) : (
                        <>
                          {shown.map((time) => (
                            <button
                              key={time}
                              type="button"
                              onClick={() => open(time)}
                              className="h-9 w-full rounded bg-white font-mono text-sm font-medium text-brand-700 hover:bg-accent hover:text-gray-900"
                              aria-label={t('uiEntry.landing.slotAt', { day: `${h.week} ${h.day}`, time })}
                            >
                              {time}
                            </button>
                          ))}
                          {more > 0 && (
                            <button type="button" onClick={() => open()} className="py-1 text-left text-xs font-semibold text-white underline-offset-2 hover:underline">
                              {t('uiEntry.landing.slotsMore', { count: more })}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <p className="mt-3 text-sm text-brand-100">{t('uiEntry.landing.slotsHint')}</p>
        </div>
      </div>
    </section>
  );
}

function Services({
  services,
  bookable,
  isLoading,
  isError,
}: {
  services: PublicPrice[];
  /** Ids of the services that can be booked online now. */
  bookable: Set<string>;
  isLoading: boolean;
  isError: boolean;
}) {
  const { t, i18n } = useTranslation();
  const groups = useMemo(() => {
    const map = new Map<string, PublicPrice[]>();
    for (const s of services) map.set(s.category, [...(map.get(s.category) ?? []), s]);
    return [...map.entries()];
  }, [services]);

  return (
    <section id="dich-vu" className="scroll-mt-16 border-b border-gray-200 dark:border-surface-700" aria-labelledby="dich-vu-title">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-[18rem_1fr]">
        <div>
          <h2 id="dich-vu-title" className="font-display text-3xl font-bold text-gray-900 dark:text-surface-100">
            {t('uiEntry.landing.services')}
          </h2>
          <p className="mt-3 text-gray-600 dark:text-surface-300">{t('uiEntry.landing.priceNote')}</p>
        </div>
        {isLoading ? (
          <p className="text-gray-500 dark:text-surface-400">{t('uiEntry.landing.loadingPrices')}</p>
        ) : isError || services.length === 0 ? (
          <p className="text-gray-600 dark:text-surface-300">
            {t('uiEntry.landing.pricesUpdating')}{' '}
            {clinic.phone ? (
              <>
                {t('uiEntry.landing.callShort')}{' '}
                <a className="font-semibold text-brand-600" href={`tel:${clinic.phoneHref}`}>
                  {clinic.phone}
                </a>{' '}
                {t('uiEntry.landing.toConsult')}
              </>
            ) : (
              t('uiEntry.landing.contactReception')
            )}
          </p>
        ) : (
          <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
            {groups.map(([category, rows]) => (
              <div key={category} className="min-w-0">
                <h3 className="border-b-2 border-gray-900 pb-1.5 text-sm font-semibold uppercase tracking-wide text-gray-900 dark:border-surface-200 dark:text-surface-100">
                  {category}
                </h3>
                <ul>
                  {rows.map((s) => (
                    <li key={s.id} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-b border-gray-200 py-3 dark:border-surface-700">
                      <span className="min-w-0 font-medium text-gray-900 dark:text-surface-100">{s.name}</span>
                      <span className="whitespace-nowrap font-mono text-sm font-semibold text-brand-700 dark:text-brand-300">{formatPrice(s, t, i18n.language)}</span>
                      <span className="text-sm text-gray-500 dark:text-surface-400">{t('uiEntry.landing.minutes', { count: s.durationMinutes })}</span>
                      <span className="text-right">
                        {bookable.has(s.id) ? (
                          <Link
                            to={`/booking?service=${encodeURIComponent(s.id)}`}
                            className="text-sm font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                            aria-label={t('uiEntry.landing.bookService', { service: s.name })}
                          >
                            {t('uiEntry.landing.bookShort')}
                          </Link>
                        ) : (
                          clinic.phone && (
                            <a
                              href={`tel:${clinic.phoneHref}`}
                              className="text-sm font-semibold text-gray-600 underline-offset-2 hover:underline dark:text-surface-300"
                              aria-label={t('uiEntry.landing.callToBook', { service: s.name })}
                            >
                              {t('uiEntry.landing.callShort')}
                            </a>
                          )
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Dentists({ services, photos }: { services: PublicService[]; photos: Record<string, string> }) {
  const { t } = useTranslation();
  const dentists = useMemo(() => {
    const byId = new Map<string, PublicDentist>();
    for (const s of services) for (const d of s.dentists) byId.set(d.id, d);
    return [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  }, [services]);
  if (dentists.length === 0) return null;

  return (
    <section id="bac-si" className="scroll-mt-16 border-b border-gray-200 dark:border-surface-700" aria-labelledby="bac-si-title">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="bac-si-title" className="font-display text-3xl font-bold text-gray-900 dark:text-surface-100">
            {t('uiEntry.landing.dentists')}
          </h2>
          <p className="max-w-md text-gray-600 dark:text-surface-300">{t('uiEntry.landing.dentistDescription')}</p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {dentists.map((d) => (
            <div key={d.id} className="min-w-0">
              {photos[d.id] ? (
                <img src={mediaUrl(photos[d.id])} alt={d.fullName} loading="lazy" className="aspect-[3/4] w-full rounded-md object-cover" />
              ) : (
                <span className="flex aspect-[3/4] w-full items-end rounded-md bg-brand-50 p-4 font-display text-5xl font-bold text-brand-600 dark:bg-surface-800 dark:text-brand-300" aria-hidden>
                  {initials(d.fullName) || <UserRound className="h-10 w-10" />}
                </span>
              )}
              <h3 className="mt-3 font-semibold text-gray-900 dark:text-surface-100">{d.fullName}</h3>
              {d.specialties.length > 0 && (
                <p className="text-sm text-brand-700 dark:text-brand-300">{d.specialties.map((code) => SPECIALTY_LABEL[code] ?? code).join(' · ')}</p>
              )}
              {d.bio && <p className="mt-1 line-clamp-3 text-sm text-gray-600 dark:text-surface-300">{d.bio}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Gallery({ items }: { items: SiteMedia['gallery'] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <section className="border-b border-gray-200 dark:border-surface-700" aria-labelledby="khong-gian-title">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h2 id="khong-gian-title" className="font-display text-3xl font-bold text-gray-900 dark:text-surface-100">
          {t('uiEntry.landing.gallery')}
        </h2>
        <ul className={'mt-8 grid grid-cols-2 gap-3 ' + (items.length >= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3')}>
          {items.map((g) => (
            <li key={g.id} className="min-w-0">
              <img src={mediaUrl(g.id)} alt={g.caption ?? t('uiEntry.landing.galleryImage')} loading="lazy" className="aspect-[4/3] w-full rounded-md object-cover" />
              {g.caption && <p className="mt-1.5 text-sm text-gray-600 dark:text-surface-300">{g.caption}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Steps() {
  const { t } = useTranslation();
  const titles = t('uiEntry.landing.stepTitles', { returnObjects: true }) as string[];
  const texts = t('uiEntry.landing.stepTexts', { returnObjects: true }) as string[];
  return (
    <section id="quy-trinh" className="scroll-mt-16 border-b border-gray-200 dark:border-surface-700" aria-labelledby="quy-trinh-title">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h2 id="quy-trinh-title" className="font-display text-3xl font-bold text-gray-900 dark:text-surface-100">
          {t('uiEntry.landing.stepsTitle')}
        </h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {titles.map((title, i) => (
            <li key={title} className="border-t-2 border-brand-600 pt-4">
              <span className="font-mono text-sm font-semibold text-brand-700 dark:text-brand-300">{i + 1}/{titles.length}</span>
              <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-surface-100">{title}</h3>
              <p className="mt-1.5 text-gray-600 dark:text-surface-300">{texts[i]}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
          <Link to="/booking" className="rounded-md bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">
            {t('uiEntry.landing.bookNow')}
          </Link>
          <Link to="/booking/status" className="self-center font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
            {t('uiEntry.landing.lookup')}
          </Link>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const { t } = useTranslation();
  return (
    <section className="border-b border-gray-200 dark:border-surface-700" aria-labelledby="faq-title">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-[18rem_1fr]">
        <h2 id="faq-title" className="font-display text-3xl font-bold text-gray-900 dark:text-surface-100">
          {t('uiEntry.landing.faqTitle')}
        </h2>
        <div className="divide-y divide-gray-200 border-y border-gray-200 dark:divide-surface-700 dark:border-surface-700">
          {(t('uiEntry.landing.faqQuestions', { returnObjects: true }) as string[]).map((q, i) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-gray-900 dark:text-surface-100">
                {q}
                <span className="font-mono text-xl leading-none text-brand-600 group-open:hidden" aria-hidden>
                  +
                </span>
                <span className="hidden font-mono text-xl leading-none text-brand-600 group-open:inline" aria-hidden>
                  −
                </span>
              </summary>
              <p className="mt-2 max-w-2xl text-gray-600 dark:text-surface-300">{(t('uiEntry.landing.faqAnswers', { returnObjects: true }) as string[])[i]}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const mapEmbed = clinic.address ? `https://www.google.com/maps?q=${encodeURIComponent(clinic.address)}&output=embed` : '';
  const mapLink =
    clinic.mapUrl || (clinic.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinic.address)}` : '');
  const item = 'flex gap-2.5';
  const icon = 'mt-0.5 h-4 w-4 shrink-0 text-brand-200';

  return (
    <footer id="lien-he" className="scroll-mt-16 bg-brand-700 text-brand-50 dark:bg-surface-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1fr_1fr_1.2fr]">
        <div>
          <Brand light />
          <p className="mt-4 max-w-xs text-sm">{t('uiEntry.landing.footerAbout')}</p>
        </div>
        <div>
          <h2 id="lien-he-title" className="mb-3 font-display text-lg font-bold text-white">
            {t('uiEntry.landing.contactTitle')}
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {clinic.hours.map((h, i) => (
                <tr key={i} className="border-b border-white/10">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-brand-100">
                    {i === 0 ? `${weekdayLabel(1, lang)} – ${weekdayLabel(6, lang)}` : weekdayLabel(0, lang)}
                  </th>
                  <td className="py-2 font-mono text-white">{i === 1 && clinic.sundayHoursIsDefault ? t('uiEntry.landing.sundayClosed') : h.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-4 space-y-2.5 text-sm">
            {clinic.phone && (
              <li className={item}>
                <Phone className={icon} aria-hidden />
                <a href={`tel:${clinic.phoneHref}`} className="font-mono font-semibold text-white hover:underline">
                  {clinic.phone}
                </a>
              </li>
            )}
            {clinic.zaloHref && (
              <li className={item}>
                <MessageCircle className={icon} aria-hidden />
                <a href={clinic.zaloHref} target="_blank" rel="noreferrer" className="hover:underline">
                  {t('uiEntry.landing.messageReception')}
                </a>
              </li>
            )}
            {clinic.email && (
              <li className={item}>
                <Mail className={icon} aria-hidden />
                <a href={`mailto:${clinic.email}`} className="hover:underline">
                  {clinic.email}
                </a>
              </li>
            )}
            {clinic.facebookUrl && (
              <li className={item}>
                <UserRound className={icon} aria-hidden />
                <a href={clinic.facebookUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  {t('uiEntry.landing.facebook')}
                </a>
              </li>
            )}
            {clinic.address && (
              <li className={item}>
                <MapPin className={icon} aria-hidden />
                {mapLink ? (
                  <a href={mapLink} target="_blank" rel="noreferrer" className="hover:underline">
                    {clinic.address}
                  </a>
                ) : (
                  clinic.address
                )}
              </li>
            )}
          </ul>
        </div>
        <div>
          {mapEmbed && (
            <iframe
              title={t('uiEntry.landing.mapTitle', { clinic: clinic.name })}
              src={mapEmbed}
              className="h-64 w-full rounded-md border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          )}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-sm sm:flex-row">
          <p>
            © {new Date().getFullYear()} {clinic.name}
          </p>
          <div className="flex gap-5">
            <Link to="/booking/status" className="hover:text-white hover:underline">
              {t('uiEntry.landing.lookup')}
            </Link>
            <Link to="/login" className="hover:text-white hover:underline">
              {t('uiEntry.landing.staffLogin')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** Phone only: call, Zalo and book along the bottom edge. */
function MobileBar() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('uiEntry.landing.quickContact')}
      className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-gray-200 bg-white px-2.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 dark:border-surface-700 dark:bg-surface-900 md:hidden"
    >
      {clinic.phone && (
        <a href={`tel:${clinic.phoneHref}`} className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-300 font-semibold text-gray-900 dark:border-surface-600 dark:text-surface-100">
          <Phone className="h-4 w-4" aria-hidden /> {t('uiEntry.landing.callNow')}
        </a>
      )}
      {clinic.zaloHref && (
        <a href={clinic.zaloHref} target="_blank" rel="noreferrer" className="flex min-h-12 flex-1 items-center justify-center rounded-md border border-gray-300 font-semibold text-gray-900 dark:border-surface-600 dark:text-surface-100">
          {t('uiEntry.landing.zalo')}
        </a>
      )}
      <Link to="/booking" className="flex min-h-12 flex-[1.4] items-center justify-center rounded-md bg-brand-600 font-semibold text-white">
        {t('uiEntry.landing.booking')}
      </Link>
    </nav>
  );
}

export default function LandingPage() {
  const { t } = useTranslation();
  const { data: services = [] } = useBookingOptions();
  const { data: prices = [], isLoading, isError } = usePriceList();
  const bookable = useMemo(() => new Set(services.map((s) => s.id)), [services]);
  const { data: media } = useSiteMedia();

  useEffect(() => {
    const previous = document.title;
    document.title = t('uiEntry.landing.pageTitle', { clinic: clinic.name });
    return () => {
      document.title = previous;
    };
  }, [t]);

  return (
    <div className="min-h-screen bg-white pb-[72px] text-gray-900 dark:bg-surface-900 dark:text-surface-100 md:pb-0">
      <SiteHeader />
      <main>
        <ToothHero prices={prices} bookable={bookable} media={media} />
        <OpenSlots services={services} />
        <Services services={prices} bookable={bookable} isLoading={isLoading} isError={isError} />
        <Dentists services={services} photos={media?.dentists ?? {}} />
        <Gallery items={media?.gallery ?? []} />
        <Steps />
        <Faq />
      </main>
      <SiteFooter />
      <MobileBar />
    </div>
  );
}
