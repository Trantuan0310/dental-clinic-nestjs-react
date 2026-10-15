import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  Clock,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { clinic } from '@/config/clinic';
import { SPECIALTY_LABEL } from '@/features/staff/labels';
import { mediaUrl, useSiteMedia, type SiteMedia } from '@/features/media/mediaApi';

/**
 * Public home page for patients (gensmile.online/). The price list comes from
 * /public/booking/prices (every service the clinic chose to show); dentists
 * and the "Đặt" links from the same endpoint as the booking form, so they
 * only offer what can actually be booked online. Contact details come from
 * the build-time clinic config.
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

const NAV_KEYS = ['navServices', 'navDentists', 'navBooking', 'navContact'] as const;
const NAV_HREFS = ['#dich-vu', '#bac-si', '#quy-trinh', '#lien-he'];
// Weekday names are interface labels; clinic-configured opening times stay verbatim.
const weekdayLabel = (day: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, day === 0 ? 7 : day)));
const HIGHLIGHT_ICONS = [Stethoscope, BadgeDollarSign, ShieldCheck, CalendarClock];
const STEP_ICONS = [CalendarCheck, Phone, ClipboardCheck];


const money = (locale: string) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN');
// "Miễn phí" only for a service the clinic marked free: a 0 left unset
// reads "Liên hệ", not a promise.
const formatPrice = (p: PublicPrice, t: (key: string) => string, locale: string) => {
  if (p.isFree) return t('uiEntry.landing.free');
  if (p.price === null || !Number.isFinite(p.price)) return t('uiEntry.landing.contact');
  if (p.price === 0 && p.priceFrom) return t('uiEntry.landing.freeSomeDentists');
  return `${p.priceFrom ? t('uiEntry.landing.from') + ' ' : ''}${money(locale).format(p.price)} ${locale === 'en' ? 'VND' : 'đ'}`;
};

const initials = (fullName: string) =>
  fullName
    .replace(/^(BS|ThS|TS|BSCKI|BSCKII)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

function useBookingOptions() {
  return useQuery({
    queryKey: ['public-booking-options'],
    queryFn: async () =>
      (await api.get<{ data: PublicService[] }>('/public/booking/options')).data.data,
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

function PrimaryCta({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/booking"
      className={
        'inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ' +
        className
      }
    >
      <CalendarCheck className="h-5 w-5" aria-hidden />
      {t('uiEntry.landing.bookVisit')}
    </Link>
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
    <header className="sticky top-0 z-30 border-b border-gray-100 dark:border-surface-700 bg-white/90 dark:bg-surface-900/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <a href="#top" className="flex items-center gap-2" aria-label={clinic.name}>
          <img src="/logo-icon.png" alt="" className="h-9 w-9" />
          <span className="text-lg font-bold tracking-wide text-brand-600">GENSMILE</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm font-medium text-gray-700 dark:text-surface-200 md:flex" aria-label={t('uiEntry.landing.mainNav')}>
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-brand-600">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {clinic.phone && (
            <a
              href={`tel:${clinic.phoneHref}`}
              className="hidden items-center gap-1.5 text-sm font-semibold text-brand-600 lg:inline-flex"
            >
              <Phone className="h-4 w-4" aria-hidden />
              {clinic.phone}
            </a>
          )}
          <Link
            to="/booking"
            className="hidden rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 sm:inline-flex"
          >
            {t('uiEntry.landing.booking')}
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
          <Link
            to="/booking/status"
            className="block rounded-md px-2 py-2.5 font-medium text-gray-700 dark:text-surface-200 hover:bg-brand-50"
          >
            {t('uiEntry.landing.lookup')}
          </Link>
        </nav>
      )}
    </header>
  );
}

function Hero({ media }: { media?: SiteMedia }) {
  const { t, i18n } = useTranslation();
  return (
    <section id="top" className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white dark:from-surface-900 dark:to-surface-950">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 md:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-surface-900 px-3 py-1 text-sm font-medium text-brand-600 shadow-sm ring-1 ring-brand-100">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
            {(clinic.taglineIsDefault ? t('uiEntry.landing.defaultTagline') : clinic.tagline)} · {t('uiEntry.landing.onlineBooking')}
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-tight text-gray-900 dark:text-surface-100 sm:text-5xl">
            {t('uiEntry.landing.heroTitle')} <span className="text-brand-600">{t('uiEntry.landing.heroHighlight')}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-gray-600 dark:text-surface-300">
            {t('uiEntry.landing.heroBody', { clinic: clinic.name })}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PrimaryCta />
            {clinic.phone ? (
              <a
                href={`tel:${clinic.phoneHref}`}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-200 bg-white dark:bg-surface-900 px-6 py-3 font-semibold text-brand-600 hover:bg-brand-50"
              >
                <Phone className="h-5 w-5" aria-hidden />
                {t('uiEntry.landing.call', { phone: clinic.phone })}
              </a>
            ) : (
              <a
                href="#dich-vu"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-200 bg-white dark:bg-surface-900 px-6 py-3 font-semibold text-brand-600 hover:bg-brand-50"
              >
                {t('uiEntry.landing.viewPrices')}
              </a>
            )}
          </div>
          <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm text-gray-600 dark:text-surface-300">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-500" aria-hidden />
              <dt className="sr-only">{t('uiEntry.landing.workingHours')}</dt>
              <dd>
                {weekdayLabel(1, i18n.resolvedLanguage ?? i18n.language)} – {weekdayLabel(6, i18n.resolvedLanguage ?? i18n.language)}: {clinic.hours[0].time}
              </dd>
            </div>
            {clinic.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-brand-500" aria-hidden />
                <dt className="sr-only">{t('uiEntry.landing.address')}</dt>
                <dd>{clinic.address}</dd>
              </div>
            )}
          </dl>
        </div>
        {media?.hero ? (
          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-3 -z-0 rounded-[2.5rem] bg-brand-100 blur-2xl" aria-hidden />
            <img
              src={mediaUrl(media.hero.id)}
              alt={media.hero.caption ?? t('uiEntry.landing.clinicImage', { clinic: clinic.name })}
              className="relative aspect-[4/3] w-full rounded-[2rem] object-cover shadow-xl ring-1 ring-brand-100"
            />
          </div>
        ) : (
          <div className="relative mx-auto w-full max-w-sm" aria-hidden>
            <div className="absolute inset-0 -z-0 rounded-full bg-brand-100 blur-3xl" />
            <div className="relative rounded-[2.5rem] bg-white dark:bg-surface-900 p-10 shadow-xl ring-1 ring-brand-100">
              <img src="/logo-full.svg" alt="" className="mx-auto w-full max-w-[260px]" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Highlights() {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="vi-sao">
      <h2 id="vi-sao" className="text-center text-3xl font-bold text-gray-900 dark:text-surface-100">
        {t('uiEntry.landing.whyChoose')}
      </h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {HIGHLIGHT_ICONS.map((Icon, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 dark:border-surface-700 bg-white dark:bg-surface-900 p-6 shadow-sm">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <h3 className="mt-4 font-semibold text-gray-900 dark:text-surface-100">{(t('uiEntry.landing.highlightTitles', { returnObjects: true }) as string[])[i]}</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-surface-300">{(t('uiEntry.landing.highlightTexts', { returnObjects: true }) as string[])[i]}</p>
          </div>
        ))}
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
  const categories = useMemo(() => [...new Set(services.map((s) => s.category))], [services]);
  const [active, setActive] = useState('');
  const current = categories.includes(active) ? active : categories[0] ?? '';
  const visible = services.filter((s) => s.category === current);

  return (
    <section id="dich-vu" className="scroll-mt-20 bg-slate-50 dark:bg-surface-950 py-14" aria-labelledby="dich-vu-title">
      <div className="mx-auto max-w-6xl px-4">
        <h2 id="dich-vu-title" className="text-center text-3xl font-bold text-gray-900 dark:text-surface-100">
          {t('uiEntry.landing.services')}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600 dark:text-surface-300">
          {t('uiEntry.landing.priceNote')}
        </p>

        {isLoading ? (
          <p className="mt-10 text-center text-gray-500 dark:text-surface-400">{t('uiEntry.landing.loadingPrices')}</p>
        ) : isError || services.length === 0 ? (
          <div className="mx-auto mt-10 max-w-xl rounded-xl bg-white dark:bg-surface-900 p-6 text-center text-gray-600 dark:text-surface-300 shadow-sm">
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
          </div>
        ) : (
          <>
            <div className="mt-8 flex gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:justify-center" role="group" aria-label={t('uiEntry.landing.serviceGroup')}>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={c === current}
                  onClick={() => setActive(c)}
                  className={
                    'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ' +
                    (c === current
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'bg-white dark:bg-surface-900 text-gray-700 dark:text-surface-200 ring-1 ring-gray-200 hover:ring-brand-200')
                  }
                >
                  {c}
                </button>
              ))}
            </div>
            <ul className="mt-6 grid gap-3 md:grid-cols-2" aria-label={current}>
              {visible.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white dark:bg-surface-900 p-4 shadow-sm ring-1 ring-gray-100">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-surface-100">{s.name}</p>
                    <p className="mt-0.5 text-sm text-gray-500 dark:text-surface-400">{t('uiEntry.landing.minutes', { count: s.durationMinutes })}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold text-brand-600">{formatPrice(s, t, i18n.language)}</span>
                    {bookable.has(s.id) ? (
                      <Link
                        to={`/booking?service=${encodeURIComponent(s.id)}`}
                        className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
                        aria-label={t('uiEntry.landing.bookService', { service: s.name })}
                      >
                        {t('uiEntry.landing.bookShort')} <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    ) : (
                      clinic.phone && (
                        <a
                          href={`tel:${clinic.phoneHref}`}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-surface-200 hover:bg-gray-100"
                          aria-label={t('uiEntry.landing.callToBook', { service: s.name })}
                        >
                          <Phone className="h-4 w-4" aria-hidden /> {t('uiEntry.landing.callShort')}
                        </a>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
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
    <section id="bac-si" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14" aria-labelledby="bac-si-title">
      <h2 id="bac-si-title" className="text-center text-3xl font-bold text-gray-900 dark:text-surface-100">
        {t('uiEntry.landing.dentists')}
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600 dark:text-surface-300">
        {t('uiEntry.landing.dentistDescription')}
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {dentists.map((d) => (
          <div key={d.id} className="rounded-2xl border border-gray-100 dark:border-surface-700 bg-white dark:bg-surface-900 p-6 text-center shadow-sm">
            {photos[d.id] ? (
              <img
                src={mediaUrl(photos[d.id])}
                alt={d.fullName}
                loading="lazy"
                className="mx-auto h-24 w-24 rounded-full object-cover ring-4 ring-brand-50"
              />
            ) : (
              <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-2xl font-bold text-white">
                {initials(d.fullName) || <UserRound className="h-8 w-8" aria-hidden />}
              </span>
            )}
            <h3 className="mt-4 font-semibold text-gray-900 dark:text-surface-100">{d.fullName}</h3>
            {d.bio && <p className="mt-2 line-clamp-4 text-sm text-gray-600 dark:text-surface-300">{d.bio}</p>}
            {d.specialties.length > 0 && (
              <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
                {d.specialties.map((code) => (
                  <li key={code} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                    {SPECIALTY_LABEL[code] ?? code}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Gallery({ items }: { items: SiteMedia['gallery'] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="khong-gian-title">
      <h2 id="khong-gian-title" className="text-center text-3xl font-bold text-gray-900 dark:text-surface-100">
        {t('uiEntry.landing.gallery')}
      </h2>
      <ul
        className={
          'mt-10 grid grid-cols-2 gap-3 sm:gap-4 ' +
          (items.length >= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3')
        }
      >
        {items.map((g) => (
          <li key={g.id} className="relative overflow-hidden rounded-2xl bg-gray-100">
            <img
              src={mediaUrl(g.id)}
              alt={g.caption ?? t('uiEntry.landing.galleryImage')}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
            />
            {g.caption && (
              <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-sm font-medium text-white">
                {g.caption}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Steps() {
  const { t } = useTranslation();
  return (
    <section id="quy-trinh" className="scroll-mt-20 bg-brand-600 py-14 text-white" aria-labelledby="quy-trinh-title">
      <div className="mx-auto max-w-6xl px-4">
        <h2 id="quy-trinh-title" className="text-center text-3xl font-bold">
          {t('uiEntry.landing.stepsTitle')}
        </h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEP_ICONS.map((Icon, i) => (
            <li key={i} className="rounded-2xl bg-white/10 p-6 ring-1 ring-white/15">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-gray-900 dark:text-surface-100">
                  {i + 1}
                </span>
                <Icon className="h-6 w-6 text-brand-100" aria-hidden />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{(t('uiEntry.landing.stepTitles', { returnObjects: true }) as string[])[i]}</h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-50">{(t('uiEntry.landing.stepTexts', { returnObjects: true }) as string[])[i]}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/booking"
            className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-surface-900 px-6 py-3 font-semibold text-brand-700 shadow-sm hover:bg-brand-50"
          >
            <CalendarCheck className="h-5 w-5" aria-hidden />
            {t('uiEntry.landing.bookNow')}
          </Link>
          <Link
            to="/booking/status"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white ring-1 ring-white/40 hover:bg-white/10"
          >
            <Search className="h-5 w-5" aria-hidden />
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
    <section className="mx-auto max-w-3xl px-4 py-14" aria-labelledby="faq-title">
      <h2 id="faq-title" className="text-center text-3xl font-bold text-gray-900 dark:text-surface-100">
        {t('uiEntry.landing.faqTitle')}
      </h2>
      <div className="mt-8 divide-y divide-gray-100 rounded-2xl border border-gray-100 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-sm">
        {(t('uiEntry.landing.faqQuestions', { returnObjects: true }) as string[]).map((q, i) => (
          <details key={q} className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-gray-900 dark:text-surface-100">
              {q}
              <span className="text-xl leading-none text-brand-500 transition group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-surface-300">{(t('uiEntry.landing.faqAnswers', { returnObjects: true }) as string[])[i]}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Contact() {
  const { t, i18n } = useTranslation();
  const mapEmbed = clinic.address
    ? `https://www.google.com/maps?q=${encodeURIComponent(clinic.address)}&output=embed`
    : '';
  const mapLink =
    clinic.mapUrl ||
    (clinic.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinic.address)}` : '');

  return (
    <section id="lien-he" className="scroll-mt-20 bg-slate-50 dark:bg-surface-950 py-14" aria-labelledby="lien-he-title">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-2">
        <div>
          <h2 id="lien-he-title" className="text-3xl font-bold text-gray-900 dark:text-surface-100">
            {t('uiEntry.landing.contactTitle')}
          </h2>
          <table className="mt-6 w-full overflow-hidden rounded-xl bg-white dark:bg-surface-900 text-left shadow-sm ring-1 ring-gray-100">
            <tbody className="divide-y divide-gray-100">
              {clinic.hours.map((h, i) => (
                <tr key={i}>
                  <th scope="row" className="px-4 py-3 font-medium text-gray-900 dark:text-surface-100">
                    {i === 0
                      ? `${weekdayLabel(1, i18n.resolvedLanguage ?? i18n.language)} – ${weekdayLabel(6, i18n.resolvedLanguage ?? i18n.language)}`
                      : weekdayLabel(0, i18n.resolvedLanguage ?? i18n.language)}
                  </th>
                  <td className="px-4 py-3 text-gray-600 dark:text-surface-300">
                    {i === 1 && clinic.sundayHoursIsDefault ? t('uiEntry.landing.sundayClosed') : h.time}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-6 space-y-3 text-gray-700 dark:text-surface-200">
            {clinic.address && (
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
                {mapLink ? (
                  <a href={mapLink} target="_blank" rel="noreferrer" className="hover:text-brand-600">
                    {clinic.address}
                  </a>
                ) : (
                  clinic.address
                )}
              </li>
            )}
            {clinic.phone && (
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
                <a href={`tel:${clinic.phoneHref}`} className="font-semibold hover:text-brand-600">
                  {clinic.phone}
                </a>
              </li>
            )}
            {clinic.zaloHref && (
              <li className="flex gap-3">
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
                <a href={clinic.zaloHref} target="_blank" rel="noreferrer" className="hover:text-brand-600">
                  {t('uiEntry.landing.messageReception')}
                </a>
              </li>
            )}
            {clinic.email && (
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
                <a href={`mailto:${clinic.email}`} className="hover:text-brand-600">
                  {clinic.email}
                </a>
              </li>
            )}
            {clinic.facebookUrl && (
              <li className="flex gap-3">
                <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
                <a href={clinic.facebookUrl} target="_blank" rel="noreferrer" className="hover:text-brand-600">
                  {t('uiEntry.landing.facebook')}
                </a>
              </li>
            )}
          </ul>
          <PrimaryCta className="mt-8" />
        </div>
        {mapEmbed ? (
          <iframe
            title={t('uiEntry.landing.mapTitle', { clinic: clinic.name })}
            src={mapEmbed}
            className="h-80 w-full rounded-2xl border-0 shadow-sm md:h-full md:min-h-[22rem]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl bg-white dark:bg-surface-900 p-8 text-center shadow-sm ring-1 ring-gray-100">
            <img src="/logo-icon.png" alt="" className="h-16 w-16" />
            <p className="mt-4 font-semibold text-gray-900 dark:text-surface-100">{clinic.name}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
              {clinic.taglineIsDefault ? t('uiEntry.landing.defaultTagline') : clinic.tagline}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-gray-100 dark:border-surface-700 bg-white dark:bg-surface-900">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-gray-500 dark:text-surface-400 sm:flex-row">
        <p>
          © {new Date().getFullYear()} {clinic.name}
        </p>
        <div className="flex gap-5">
          <Link to="/booking/status" className="hover:text-brand-600">
            {t('uiEntry.landing.lookup')}
          </Link>
          <Link to="/login" className="hover:text-brand-600">
            {t('uiEntry.landing.staffLogin')}
          </Link>
        </div>
      </div>
    </footer>
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
    <div className="min-h-screen bg-white dark:bg-surface-900 text-gray-900 dark:text-surface-100">
      <SiteHeader />
      <main>
        <Hero media={media} />
        <Highlights />
        <Services services={prices} bookable={bookable} isLoading={isLoading} isError={isError} />
        <Dentists services={services} photos={media?.dentists ?? {}} />
        <Gallery items={media?.gallery ?? []} />
        <Steps />
        <Faq />
        <Contact />
      </main>
      <SiteFooter />
      {clinic.phone && (
        <a
          href={`tel:${clinic.phoneHref}`}
          className="fixed bottom-5 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg hover:bg-brand-600 md:hidden"
          aria-label={t('uiEntry.landing.call', { phone: clinic.phone })}
        >
          <Phone className="h-6 w-6" aria-hidden />
        </a>
      )}
    </div>
  );
}
