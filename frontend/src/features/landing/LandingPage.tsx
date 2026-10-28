import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  BadgeDollarSign,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
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
 * the build-time clinic config. Photo frames show the clinic's uploaded
 * photos, or the logo until there are some.
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
/** Name and phone typed on the home page, handed to the booking form. */
export type BookingPrefill = { fullName?: string; phone?: string };

const NAV_KEYS = ['navServices', 'navDentists', 'navBooking', 'navContact'] as const;
const NAV_HREFS = ['#dich-vu', '#bac-si', '#quy-trinh', '#lien-he'];
// Weekday names are interface labels; clinic-configured opening times stay verbatim.
const weekdayLabel = (day: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, day === 0 ? 7 : day)));
const HIGHLIGHT_ICONS = [Stethoscope, BadgeDollarSign, ShieldCheck, CalendarClock];
const STEP_COUNT = 3;
const FEATURED_COUNT = 6;

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

/**
 * Blocks marked `lp-reveal` that start below the fold slide up as they scroll
 * into view. Blocks already on screen are left alone, and nothing is ever
 * hidden while it waits.
 */
function useReveal(deps: unknown[]) {
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('lp-in');
          io.unobserve(e.target);
        }),
      { rootMargin: '0px 0px -8% 0px' },
    );
    document.querySelectorAll<HTMLElement>('.lp-reveal:not(.lp-in)').forEach((el, i) => {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.style.animationDelay = `${(i % 4) * 70}ms`;
        io.observe(el);
      }
    });
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function SectionTitle({ id, kicker, title, note }: { id: string; kicker: string; title: string; note?: string }) {
  return (
    <div className="lp-reveal mb-9 flex flex-col items-center gap-2.5 text-center">
      <span className="font-bold text-brand-500">{kicker}</span>
      <h2 id={id} className="text-3xl font-extrabold text-gray-900 dark:text-surface-100 sm:text-4xl">
        {title}
      </h2>
      <span className="h-1 w-16 rounded-full bg-brand-500" aria-hidden />
      {note && <p className="max-w-2xl text-gray-600 dark:text-surface-300">{note}</p>}
    </div>
  );
}

/** A photo frame: the given photo, or the logo while the clinic has none. */
function PhotoFrame({ src, alt, className = '', caption }: { src?: string; alt: string; className?: string; caption?: boolean }) {
  const { t } = useTranslation();
  if (src) {
    return <img src={src} alt={alt} loading="lazy" className={'w-full object-cover ' + className} />;
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className={'relative flex w-full flex-col items-center justify-center gap-3 bg-white ' + className}
    >
      <img src="/logo-icon.png" alt="" className="w-[42%] max-w-[220px]" />
      {caption && (
        <span className="text-center leading-tight">
          <span className="block text-2xl font-black tracking-[0.08em] text-brand-600">GENSMILE</span>
          <span className="text-sm italic text-gray-600">{tagline(t)}</span>
        </span>
      )}
    </div>
  );
}

function InfoBar() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  return (
    <div className="bg-brand-600 text-sm text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-accent" aria-hidden />
          {weekdayLabel(1, lang)} – {weekdayLabel(6, lang)}: {clinic.hours[0].time}
        </span>
        <span className="flex flex-wrap gap-x-5 gap-y-1">
          {clinic.address && (
            <span className="hidden items-center gap-1.5 md:inline-flex">
              <MapPin className="h-4 w-4 text-accent" aria-hidden />
              {clinic.address}
            </span>
          )}
          {clinic.phone && (
            <a href={`tel:${clinic.phoneHref}`} className="inline-flex items-center gap-1.5 hover:underline">
              <Phone className="h-4 w-4 text-accent" aria-hidden />
              {t('uiEntry.landing.hotline')}: <b>{clinic.phone}</b>
            </a>
          )}
        </span>
      </div>
    </div>
  );
}

function SiteHeader() {
  const { t } = useTranslation();
  const NAV = NAV_HREFS.map((href, i) => ({ href, label: t(`uiEntry.landing.${NAV_KEYS[i]}`) }));
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    <header
      className={
        'sticky top-0 z-30 border-b border-gray-200 bg-white transition-shadow dark:border-surface-700 dark:bg-surface-900 ' +
        (scrolled ? 'shadow-md shadow-brand-900/5' : '')
      }
    >
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-4">
        <a href="#top" className="flex items-center gap-2.5" aria-label={clinic.name}>
          <img src="/logo-icon.png" alt="" className="h-11 w-11" />
          <span className="flex flex-col leading-none">
            <span className="text-xl font-black tracking-[0.06em] text-brand-600">GENSMILE</span>
            <span className="mt-1 text-xs italic text-gray-600 dark:text-surface-300">{tagline(t)}</span>
          </span>
        </a>
        <nav className="hidden items-center gap-1 text-[15px] font-semibold text-gray-800 dark:text-surface-200 md:flex" aria-label={t('uiEntry.landing.mainNav')}>
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="rounded-lg px-3 py-2 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-surface-800">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/booking"
            className="lp-shine hidden rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-brand-700 sm:inline-flex"
          >
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
  const { t } = useTranslation();
  const ticks = t('uiEntry.landing.highlightTitles', { returnObjects: true }) as string[];
  return (
    <section id="top" className="bg-white dark:bg-surface-900">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 md:grid-cols-[1.15fr_0.85fr] md:pb-20">
        <div className="min-w-0">
          <p className="lp-rise inline-flex rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-extrabold uppercase tracking-wide text-white">
            {tagline(t)} · {t('uiEntry.landing.onlineBooking')}
          </p>
          <h1 className="lp-rise mt-5 text-4xl font-extrabold leading-tight text-gray-900 [animation-delay:.1s] dark:text-surface-100 sm:text-5xl">
            {t('uiEntry.landing.heroTitle')} <span className="block text-brand-600">{t('uiEntry.landing.heroHighlight')}</span>
          </h1>
          <p className="lp-rise mt-5 max-w-xl text-lg text-gray-600 [animation-delay:.2s] dark:text-surface-300">
            {t('uiEntry.landing.heroBody', { clinic: clinic.name })}
          </p>
          <ul className="lp-rise mt-6 grid gap-x-6 gap-y-2.5 font-semibold text-gray-800 [animation-delay:.3s] dark:text-surface-200 sm:grid-cols-2">
            {ticks.map((tick) => (
              <li key={tick} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                {tick}
              </li>
            ))}
          </ul>
          <div className="lp-rise mt-8 flex flex-col gap-3 [animation-delay:.4s] sm:flex-row">
            <Link
              to="/booking"
              className="lp-shine inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-7 py-3.5 font-bold text-white transition hover:-translate-y-0.5 hover:bg-brand-700"
            >
              <CalendarCheck className="h-5 w-5" aria-hidden />
              {t('uiEntry.landing.bookNow')}
            </Link>
            <a
              href="#dich-vu"
              className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-brand-600 px-7 py-3 font-bold text-brand-600 transition hover:bg-brand-50 dark:hover:bg-surface-800"
            >
              {t('uiEntry.landing.viewPrices')}
            </a>
          </div>
        </div>
        <div className="lp-rise relative mx-auto w-full max-w-md [animation-delay:.25s]">
          <div className="overflow-hidden rounded-2xl border-[6px] border-white shadow-2xl shadow-brand-900/20 ring-1 ring-gray-200 dark:border-surface-800">
            <PhotoFrame
              src={media?.hero ? mediaUrl(media.hero.id) : undefined}
              alt={media?.hero?.caption ?? t('uiEntry.landing.clinicImage', { clinic: clinic.name })}
              className="aspect-[4/5]"
              caption
            />
          </div>
          {clinic.phone && (
            <a
              href={`tel:${clinic.phoneHref}`}
              className="lp-floaty absolute -left-3 bottom-8 rounded-xl bg-white px-4 py-3 shadow-xl ring-1 ring-gray-100 dark:bg-surface-800 dark:ring-surface-700"
            >
              <span className="block text-xs font-semibold text-gray-500 dark:text-surface-400">{t('uiEntry.landing.hotline')}</span>
              <span className="text-xl font-black text-brand-600">{clinic.phone}</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function QuickBooking({ services }: { services: PublicService[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const field =
    'mt-1.5 block min-h-12 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-surface-600 dark:bg-surface-900 dark:text-surface-100';
  return (
    <div className="relative z-10 mx-auto -mt-10 max-w-6xl px-4">
      <form
        className="grid items-end gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-xl shadow-brand-900/10 dark:border-surface-700 dark:bg-surface-900 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          // Name and phone ride in router state, never in the URL.
          const state: BookingPrefill = { fullName: fullName.trim() || undefined, phone: phone.trim() || undefined };
          navigate(serviceId ? `/booking?service=${encodeURIComponent(serviceId)}` : '/booking', { state });
        }}
      >
        <p className="self-center pr-2 sm:col-span-2 lg:col-span-1">
          <span className="block text-lg font-extrabold uppercase text-brand-600">{t('uiEntry.landing.quickTitle')}</span>
          <span className="text-sm text-gray-500 dark:text-surface-400">{t('uiEntry.landing.quickHint')}</span>
        </p>
        <label className="text-sm font-semibold text-gray-700 dark:text-surface-200">
          {t('uiEntry.landing.quickName')}
          <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" maxLength={100} />
        </label>
        <label className="text-sm font-semibold text-gray-700 dark:text-surface-200">
          {t('uiEntry.landing.quickPhone')}
          <input className={field} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={20} placeholder="0901 234 567" />
        </label>
        <label className="text-sm font-semibold text-gray-700 dark:text-surface-200">
          {t('uiEntry.landing.quickService')}
          <select className={field} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">{t('uiEntry.landing.quickServiceAny')}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="lp-shine min-h-12 rounded-lg bg-brand-600 px-6 font-bold text-white transition hover:bg-brand-700 sm:col-span-2 lg:col-span-1"
        >
          {t('uiEntry.landing.quickSubmit')}
        </button>
      </form>
    </div>
  );
}

function Stats({ dentists, services }: { dentists: number; services: number }) {
  const { t, i18n } = useTranslation();
  const items = [
    ...(dentists > 0 ? [[String(dentists), t('uiEntry.landing.statDentists')]] : []),
    ...(services > 0 ? [[String(services), t('uiEntry.landing.statServices')]] : []),
    ['24/7', t('uiEntry.landing.statOnline')],
    [i18n.language === 'en' ? '0 VND' : '0đ', t('uiEntry.landing.statFee')],
  ];
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-4 px-4 pb-4 pt-12 md:grid-cols-4">
      {items.map(([value, label]) => (
        <div key={label} className="lp-reveal border-gray-200 px-2 py-3 text-center odd:border-r md:border-r md:last:border-r-0 dark:border-surface-700">
          <b className="block text-4xl font-black tabular-nums text-brand-600">{value}</b>
          <span className="font-medium text-gray-600 dark:text-surface-300">{label}</span>
        </div>
      ))}
    </div>
  );
}

function Featured({ prices, bookable }: { prices: PublicPrice[]; bookable: Set<string> }) {
  const { t, i18n } = useTranslation();
  const featured = useMemo(
    () =>
      prices
        .filter((p) => bookable.has(p.id))
        .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
        .slice(0, FEATURED_COUNT),
    [prices, bookable],
  );
  if (featured.length === 0) return null;
  return (
    <section className="border-t border-gray-200 py-16 dark:border-surface-700" aria-labelledby="noi-bat-title">
      <div className="mx-auto max-w-6xl px-4">
        <SectionTitle id="noi-bat-title" kicker={t('uiEntry.landing.featuredKicker')} title={t('uiEntry.landing.featuredTitle')} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((s) => (
            <article
              key={s.id}
              className="lp-reveal flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-brand-900/10 dark:border-surface-700 dark:bg-surface-900"
            >
              <PhotoFrame alt={s.name} className="aspect-[16/10] border-b border-gray-100 dark:border-surface-800" />
              <div className="flex flex-1 flex-col gap-2 p-5">
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-surface-100">{s.name}</h3>
                <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiEntry.landing.minutes', { count: s.durationMinutes })}</p>
                <p className="mt-auto pt-2 text-xl font-black tabular-nums text-brand-600">{formatPrice(s, t, i18n.language)}</p>
                <Link
                  to={`/booking?service=${encodeURIComponent(s.id)}`}
                  aria-label={t('uiEntry.landing.bookService', { service: s.name })}
                  className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-600 font-bold text-white transition hover:bg-brand-700"
                >
                  {t('uiEntry.landing.bookNow')}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Highlights() {
  const { t } = useTranslation();
  return (
    <section className="border-t border-gray-200 py-16 dark:border-surface-700" aria-labelledby="vi-sao">
      <div className="mx-auto max-w-6xl px-4">
        <SectionTitle id="vi-sao" kicker={t('uiEntry.landing.whyKicker')} title={t('uiEntry.landing.whyChoose')} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHT_ICONS.map((Icon, i) => (
            <div
              key={i}
              className="lp-reveal group flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-center transition hover:-translate-y-1 hover:border-brand-400 dark:border-surface-700 dark:bg-surface-900"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition duration-500 group-hover:-rotate-6 group-hover:scale-105 dark:bg-surface-800">
                <Icon className="h-8 w-8" aria-hidden />
              </span>
              <h3 className="font-extrabold text-gray-900 dark:text-surface-100">{(t('uiEntry.landing.highlightTitles', { returnObjects: true }) as string[])[i]}</h3>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-surface-300">{(t('uiEntry.landing.highlightTexts', { returnObjects: true }) as string[])[i]}</p>
            </div>
          ))}
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
  const categories = useMemo(() => [...new Set(services.map((s) => s.category))], [services]);
  const [active, setActive] = useState('');
  const current = categories.includes(active) ? active : '';
  const visible = current ? services.filter((s) => s.category === current) : services;
  const tab = (selected: boolean) =>
    'shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition ' +
    (selected
      ? 'border-brand-600 bg-brand-600 text-white'
      : 'border-gray-200 bg-white text-gray-700 hover:border-brand-400 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200');

  return (
    <section id="dich-vu" className="scroll-mt-20 border-t border-gray-200 py-16 dark:border-surface-700" aria-labelledby="dich-vu-title">
      <div className="mx-auto max-w-6xl px-4">
        <SectionTitle id="dich-vu-title" kicker={t('uiEntry.landing.servicesKicker')} title={t('uiEntry.landing.services')} note={t('uiEntry.landing.priceNote')} />

        {isLoading ? (
          <p className="text-center text-gray-500 dark:text-surface-400">{t('uiEntry.landing.loadingPrices')}</p>
        ) : isError || services.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300">
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
            <div className="mb-4 flex gap-2 overflow-x-auto pb-2" role="group" aria-label={t('uiEntry.landing.serviceGroup')}>
              <button type="button" aria-pressed={current === ''} onClick={() => setActive('')} className={tab(current === '')}>
                {t('uiEntry.landing.allCategories')}
              </button>
              {categories.map((c) => (
                <button key={c} type="button" aria-pressed={c === current} onClick={() => setActive(c)} className={tab(c === current)}>
                  {c}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-surface-700">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="bg-brand-600 text-sm uppercase tracking-wide text-white">
                    <th scope="col" className="px-4 py-3.5">{t('uiEntry.landing.colService')}</th>
                    <th scope="col" className="px-4 py-3.5">{t('uiEntry.landing.colDuration')}</th>
                    <th scope="col" className="px-4 py-3.5">{t('uiEntry.landing.colPrice')}</th>
                    <th scope="col" className="relative px-4 py-3.5">
                      <span className="sr-only">{t('uiEntry.landing.colAction')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <tr key={s.id} className="border-t border-gray-200 bg-white even:bg-gray-50 dark:border-surface-700 dark:bg-surface-900 dark:even:bg-surface-950">
                      <td className="px-4 py-3.5">
                        <span className="block font-bold text-gray-900 dark:text-surface-100">{s.name}</span>
                        <span className="text-sm text-gray-500 dark:text-surface-400">{s.category}</span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-700 dark:text-surface-300">{t('uiEntry.landing.minutes', { count: s.durationMinutes })}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 font-extrabold text-brand-600">{formatPrice(s, t, i18n.language)}</td>
                      <td className="px-4 py-3.5 text-right">
                        {bookable.has(s.id) ? (
                          <Link
                            to={`/booking?service=${encodeURIComponent(s.id)}`}
                            className="inline-flex items-center rounded-lg border-2 border-brand-600 px-3.5 py-1.5 text-sm font-bold text-brand-600 transition hover:bg-brand-600 hover:text-white"
                            aria-label={t('uiEntry.landing.bookService', { service: s.name })}
                          >
                            {t('uiEntry.landing.bookShort')}
                          </Link>
                        ) : (
                          clinic.phone && (
                            <a
                              href={`tel:${clinic.phoneHref}`}
                              className="inline-flex items-center gap-1 rounded-lg border-2 border-gray-200 px-3.5 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-100 dark:border-surface-700 dark:text-surface-200"
                              aria-label={t('uiEntry.landing.callToBook', { service: s.name })}
                            >
                              <Phone className="h-4 w-4" aria-hidden /> {t('uiEntry.landing.callShort')}
                            </a>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
    <section id="bac-si" className="scroll-mt-20 border-t border-gray-200 py-16 dark:border-surface-700" aria-labelledby="bac-si-title">
      <div className="mx-auto max-w-6xl px-4">
        <SectionTitle id="bac-si-title" kicker={t('uiEntry.landing.dentistsKicker')} title={t('uiEntry.landing.dentists')} note={t('uiEntry.landing.dentistDescription')} />
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {dentists.map((d) => (
            <div key={d.id} className="lp-reveal text-center">
              <div className="mb-3.5 overflow-hidden rounded-2xl border border-gray-200 dark:border-surface-700">
                <PhotoFrame src={photos[d.id] ? mediaUrl(photos[d.id]) : undefined} alt={d.fullName} className="aspect-[3/4]" />
              </div>
              <h3 className="font-extrabold text-gray-900 dark:text-surface-100">{d.fullName}</h3>
              {d.specialties.length > 0 && (
                <p className="text-sm font-semibold text-brand-600">{d.specialties.map((code) => SPECIALTY_LABEL[code] ?? code).join(' · ')}</p>
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
    <section className="border-t border-gray-200 py-16 dark:border-surface-700" aria-labelledby="khong-gian-title">
      <div className="mx-auto max-w-6xl px-4">
        <SectionTitle id="khong-gian-title" kicker={t('uiEntry.landing.galleryKicker')} title={t('uiEntry.landing.gallery')} />
        <ul className={'grid grid-cols-2 gap-3 sm:gap-4 ' + (items.length >= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3')}>
          {items.map((g) => (
            <li key={g.id} className="lp-reveal relative overflow-hidden rounded-2xl bg-gray-100">
              <img
                src={mediaUrl(g.id)}
                alt={g.caption ?? t('uiEntry.landing.galleryImage')}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition duration-500 hover:scale-105"
              />
              {g.caption && (
                <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-sm font-medium text-white">
                  {g.caption}
                </p>
              )}
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
    <section id="quy-trinh" className="scroll-mt-20 border-t border-gray-200 py-16 dark:border-surface-700" aria-labelledby="quy-trinh-title">
      <div className="mx-auto max-w-6xl px-4">
        <SectionTitle id="quy-trinh-title" kicker={t('uiEntry.landing.stepsKicker')} title={t('uiEntry.landing.stepsTitle')} />
        <ol className="relative grid gap-8 md:grid-cols-3">
          <span className="absolute left-[16%] right-[16%] top-[34px] hidden border-t-2 border-dashed border-brand-400 md:block" aria-hidden />
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <li key={i} className="lp-reveal relative flex flex-col items-center gap-3 text-center">
              <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-brand-600 text-2xl font-black text-white ring-8 ring-brand-50 dark:ring-surface-800">
                {i + 1}
              </span>
              <h3 className="text-lg font-extrabold text-gray-900 dark:text-surface-100">{titles[i]}</h3>
              <p className="max-w-xs text-gray-600 dark:text-surface-300">{texts[i]}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/booking"
            className="lp-shine inline-flex items-center gap-2 rounded-lg bg-brand-600 px-7 py-3.5 font-bold text-white transition hover:-translate-y-0.5 hover:bg-brand-700"
          >
            <CalendarCheck className="h-5 w-5" aria-hidden />
            {t('uiEntry.landing.bookNow')}
          </Link>
          <Link
            to="/booking/status"
            className="inline-flex items-center gap-2 rounded-lg border-2 border-brand-600 px-7 py-3 font-bold text-brand-600 transition hover:bg-brand-50 dark:hover:bg-surface-800"
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
    <section className="border-t border-gray-200 py-16 dark:border-surface-700" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl px-4">
        <SectionTitle id="faq-title" kicker={t('uiEntry.landing.faqKicker')} title={t('uiEntry.landing.faqTitle')} />
        <div className="flex flex-col gap-2.5">
          {(t('uiEntry.landing.faqQuestions', { returnObjects: true }) as string[]).map((q, i) => (
            <details key={q} className="lp-reveal group rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold text-gray-900 group-open:text-brand-600 dark:text-surface-100">
                {q}
                <span className="text-2xl leading-none text-brand-600 transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="px-5 pb-4 leading-relaxed text-gray-600 dark:text-surface-300">{(t('uiEntry.landing.faqAnswers', { returnObjects: true }) as string[])[i]}</p>
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
  const mapEmbed = clinic.address
    ? `https://www.google.com/maps?q=${encodeURIComponent(clinic.address)}&output=embed`
    : '';
  const mapLink =
    clinic.mapUrl ||
    (clinic.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinic.address)}` : '');
  const item = 'flex gap-2.5';
  const icon = 'mt-0.5 h-5 w-5 shrink-0 text-accent';

  return (
    <footer id="lien-he" className="scroll-mt-20 bg-brand-700 text-brand-50 dark:bg-surface-950">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <a href="#top" className="flex items-center gap-2.5" aria-label={clinic.name}>
            <img src="/logo-icon.png" alt="" className="h-12 w-12 rounded-xl bg-white p-0.5" />
            <span className="flex flex-col leading-none">
              <span className="text-xl font-black tracking-[0.06em] text-white">GENSMILE</span>
              <span className="mt-1 text-xs italic text-brand-200">{tagline(t)}</span>
            </span>
          </a>
          <p className="mt-4 text-sm leading-relaxed">{t('uiEntry.landing.footerAbout')}</p>
        </div>
        <div>
          <h2 id="lien-he-title" className="mb-4 text-base font-extrabold uppercase text-white">
            {t('uiEntry.landing.contactTitle')}
          </h2>
          <ul className="space-y-3 text-sm">
            {clinic.hours.map((h, i) => (
              <li key={i} className={item}>
                <Clock className={icon} aria-hidden />
                <span>
                  {i === 0 ? `${weekdayLabel(1, lang)} – ${weekdayLabel(6, lang)}` : weekdayLabel(0, lang)}:{' '}
                  {i === 1 && clinic.sundayHoursIsDefault ? t('uiEntry.landing.sundayClosed') : h.time}
                </span>
              </li>
            ))}
            {clinic.phone && (
              <li className={item}>
                <Phone className={icon} aria-hidden />
                <a href={`tel:${clinic.phoneHref}`} className="font-bold text-white hover:underline">
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
          <h2 className="mb-4 text-base font-extrabold uppercase text-white">{t('uiEntry.landing.mapHeading')}</h2>
          {mapEmbed ? (
            <iframe
              title={t('uiEntry.landing.mapTitle', { clinic: clinic.name })}
              src={mapEmbed}
              className="h-56 w-full rounded-xl border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="flex h-56 flex-col items-center justify-center rounded-xl bg-white/10 text-center">
              <img src="/logo-icon.png" alt="" className="h-14 w-14 rounded-xl bg-white p-0.5" />
              <p className="mt-3 font-semibold text-white">{clinic.name}</p>
            </div>
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

/** Desktop: round call / Zalo buttons on the right. Phone: a bar along the bottom. */
function QuickContact() {
  const { t } = useTranslation();
  return (
    <>
      <div className="fixed bottom-6 right-5 z-30 hidden flex-col gap-3 md:flex">
        {clinic.zaloHref && (
          <a
            href={clinic.zaloHref}
            target="_blank"
            rel="noreferrer"
            aria-label={t('uiEntry.landing.messageReception')}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0068ff] text-sm font-black text-white shadow-lg transition hover:scale-105"
          >
            {t('uiEntry.landing.zalo')}
          </a>
        )}
        {clinic.phone && (
          <a
            href={`tel:${clinic.phoneHref}`}
            aria-label={t('uiEntry.landing.call', { phone: clinic.phone })}
            className="lp-ring flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:scale-105"
          >
            <Phone className="h-6 w-6" aria-hidden />
          </a>
        )}
      </div>
      <nav
        aria-label={t('uiEntry.landing.quickContact')}
        className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-gray-200 bg-white px-2.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.35)] dark:border-surface-700 dark:bg-surface-900 md:hidden"
      >
        {clinic.phone && (
          <a href={`tel:${clinic.phoneHref}`} className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-700 font-extrabold text-white">
            <Phone className="h-4 w-4" aria-hidden /> {t('uiEntry.landing.callNow')}
          </a>
        )}
        {clinic.zaloHref && (
          <a href={clinic.zaloHref} target="_blank" rel="noreferrer" className="flex min-h-12 flex-1 items-center justify-center rounded-lg bg-[#0068ff] font-extrabold text-white">
            {t('uiEntry.landing.zalo')}
          </a>
        )}
        <Link to="/booking" className="flex min-h-12 flex-[1.3] items-center justify-center rounded-lg bg-brand-600 font-extrabold text-white">
          {t('uiEntry.landing.booking')}
        </Link>
      </nav>
    </>
  );
}

export default function LandingPage() {
  const { t } = useTranslation();
  const { data: services = [] } = useBookingOptions();
  const { data: prices = [], isLoading, isError } = usePriceList();
  const bookable = useMemo(() => new Set(services.map((s) => s.id)), [services]);
  const dentistCount = useMemo(() => new Set(services.flatMap((s) => s.dentists.map((d) => d.id))).size, [services]);
  const { data: media } = useSiteMedia();
  useReveal([services.length, prices.length, media]);

  useEffect(() => {
    const previous = document.title;
    document.title = t('uiEntry.landing.pageTitle', { clinic: clinic.name });
    return () => {
      document.title = previous;
    };
  }, [t]);

  return (
    <div className="min-h-screen bg-white pb-[76px] text-gray-900 dark:bg-surface-900 dark:text-surface-100 md:pb-0">
      <InfoBar />
      <SiteHeader />
      <main>
        <Hero media={media} />
        <QuickBooking services={services} />
        <Stats dentists={dentistCount} services={prices.length} />
        <Featured prices={prices} bookable={bookable} />
        <Highlights />
        <Services services={prices} bookable={bookable} isLoading={isLoading} isError={isError} />
        <Dentists services={services} photos={media?.dentists ?? {}} />
        <Gallery items={media?.gallery ?? []} />
        <Steps />
        <Faq />
      </main>
      <SiteFooter />
      <QuickContact />
    </div>
  );
}
