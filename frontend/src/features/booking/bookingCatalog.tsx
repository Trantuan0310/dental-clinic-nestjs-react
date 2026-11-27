import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Award, BriefcaseMedical, Clock, GraduationCap, Search, Star, Stethoscope, X } from "lucide-react";
import { api } from "@/lib/api";
import { SPECIALTY_LABEL } from "@/features/staff/labels";
import { cn } from "@/lib/cn";
import { mediaUrl, useSiteMedia } from "@/features/media/mediaApi";
import {
  dentistDisplayName,
  dentistPriceText,
  initials,
  servicePriceText,
  type BookingDentist,
  type BookingService,
  type Rating,
} from "./bookingCatalogUtils";

export type { BookingDentist, BookingService, Rating };

export function Stars({ value, size = 14, label }: { value: number; size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          width={size}
          height={size}
          aria-hidden
          className={cn(
            i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "fill-transparent text-gray-300 dark:text-surface-600",
          )}
        />
      ))}
    </span>
  );
}

export function RatingLine({ rating }: { rating?: Rating }) {
  const { t } = useTranslation();
  if (!rating || rating.count === 0 || rating.average == null)
    return <span className="text-xs text-gray-500 dark:text-surface-400">{t("uiScheduling.bookingWizard.noReviews")}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Stars value={rating.average} label={t("uiScheduling.bookingWizard.ratingAria", { value: rating.average })} />
      <span className="font-semibold text-gray-900 dark:text-surface-100">{rating.average.toFixed(1)}</span>
      <span className="text-gray-500 dark:text-surface-400">({t("uiScheduling.bookingWizard.reviewCount", { count: rating.count })})</span>
    </span>
  );
}

function Avatar({ name, dentistId, large }: { name: string; dentistId: string; large?: boolean }) {
  // The photo the clinic uploaded for the dentist (also on the home page), else initials.
  const photo = useSiteMedia().data?.dentists[dentistId];
  if (photo)
    return (
      <img
        src={mediaUrl(photo)}
        alt=""
        loading="lazy"
        className={cn("shrink-0 rounded-full object-cover", large ? "h-20 w-20" : "h-14 w-14")}
      />
    );
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
        large ? "h-20 w-20 text-2xl" : "h-14 w-14 text-lg",
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Step 1: services grouped by category, with a search box and the price of each. */
export function ServicePicker({
  services,
  value,
  onChange,
}: {
  services: BookingService[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(() => [...new Set(services.map((s) => s.category))], [services]);
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
  const shown = services.filter(
    (s) => (!category || s.category === category) && (!query.trim() || fold(s.name + " " + s.category).includes(fold(query.trim()))),
  );
  const groups = categories
    .map((c) => [c, shown.filter((s) => s.category === c)] as const)
    .filter(([, list]) => list.length > 0);
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("uiScheduling.bookingWizard.serviceSearch")}
          aria-label={t("uiScheduling.bookingWizard.serviceSearch")}
          className="block min-h-11 w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 dark:placeholder:text-surface-400"
        />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("uiScheduling.bookingWizard.serviceGroups")}>
        {["", ...categories].map((c) => (
          <button
            key={c || "all"}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              category === c
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:border-brand-400 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200",
            )}
          >
            {c || t("uiScheduling.bookingWizard.allServices")}
          </button>
        ))}
      </div>
      {groups.length === 0 && (
        <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-600 dark:bg-surface-800 dark:text-surface-300">
          {t("uiScheduling.bookingWizard.noServiceMatch", { query })}
        </p>
      )}
      <div role="radiogroup" aria-label={t("uiScheduling.service")} className="space-y-5">
        {groups.map(([group, list]) => (
          <section key={group} aria-label={group}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-surface-400">{group}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={value === s.id}
                  onClick={() => onChange(s.id)}
                  className={cn(
                    "flex min-h-[72px] flex-col justify-between rounded-lg border p-3 text-left transition-colors",
                    value === s.id
                      ? "border-brand-600 bg-brand-50 ring-2 ring-brand-500/30 dark:bg-brand-900/20"
                      : "border-gray-200 bg-white hover:border-brand-400 dark:border-surface-700 dark:bg-surface-800",
                  )}
                >
                  <span className="font-medium text-gray-900 dark:text-surface-100">{s.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-semibold text-brand-700 dark:text-brand-300">{servicePriceText(s, t)}</span>
                    <span className="inline-flex items-center gap-1 text-gray-500 dark:text-surface-400">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {t("uiScheduling.bookingWizard.minutes", { count: s.durationMinutes })}
                    </span>
                    <span className="text-gray-500 dark:text-surface-400">
                      {t("uiScheduling.bookingWizard.dentistCount", { count: s.dentists.length })}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-surface-400">{t("uiScheduling.bookingWizard.priceNote")}</p>
    </div>
  );
}

/** Step 2: the dentists who perform the service, with what a patient wants to know first. */
export function DentistPicker({
  dentists,
  value,
  onChange,
}: {
  dentists: BookingDentist[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [profileOf, setProfileOf] = useState<BookingDentist | null>(null);
  return (
    <>
      <div role="radiogroup" aria-label={t("uiScheduling.dentist")} className="space-y-3">
        {dentists.map((d) => {
          const selected = value === d.id;
          return (
            <div
              key={d.id}
              className={cn(
                "rounded-lg border p-4",
                selected
                  ? "border-brand-600 bg-brand-50 ring-2 ring-brand-500/30 dark:bg-brand-900/20"
                  : "border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-800",
              )}
            >
              <div className="flex gap-4">
                <Avatar name={d.fullName} dentistId={d.id} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-gray-900 dark:text-surface-100">{dentistDisplayName(d)}</p>
                  {d.position && <p className="text-sm text-gray-600 dark:text-surface-300">{d.position}</p>}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <RatingLine rating={d.rating} />
                    {d.yearsOfExperience != null && (
                      <span className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-surface-300">
                        <BriefcaseMedical className="h-4 w-4" aria-hidden />
                        {t("uiScheduling.bookingWizard.yearsExperience", { count: d.yearsOfExperience })}
                      </span>
                    )}
                  </div>
                  {d.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {d.specialties.map((c) => (
                        <span key={c} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-surface-700 dark:text-surface-200">
                          {SPECIALTY_LABEL[c] ?? c}
                        </span>
                      ))}
                    </div>
                  )}
                  {d.bio && <p className="line-clamp-2 pt-1 text-sm text-gray-600 dark:text-surface-300">{d.bio}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-surface-700">
                <span className="text-sm text-gray-700 dark:text-surface-200">
                  <span className="font-semibold text-brand-700 dark:text-brand-300">{dentistPriceText(d, t)}</span>
                  {d.durationMinutes ? (
                    <span className="text-gray-500 dark:text-surface-400"> · {t("uiScheduling.bookingWizard.minutes", { count: d.durationMinutes })}</span>
                  ) : null}
                </span>
                <span className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setProfileOf(d)}
                    className="min-h-11 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-surface-600 dark:text-surface-200 dark:hover:bg-surface-700"
                  >
                    {t("uiScheduling.bookingWizard.viewProfile")}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={t("uiScheduling.bookingWizard.chooseDentistAria", { name: dentistDisplayName(d) })}
                    onClick={() => onChange(d.id)}
                    className="min-h-11 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    {selected ? t("uiScheduling.bookingWizard.chosen") : t("uiScheduling.bookingWizard.chooseDentist")}
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {profileOf && (
        <DentistProfileModal
          dentist={profileOf}
          onClose={() => setProfileOf(null)}
          onChoose={() => {
            onChange(profileOf.id);
            setProfileOf(null);
          }}
        />
      )}
    </>
  );
}

type PublicProfile = {
  id: string;
  fullName: string;
  title: string | null;
  position: string | null;
  yearsOfExperience: number | null;
  practiceSince: number | null;
  specialties: string[];
  bio: string | null;
  education: string[];
  experience: string[];
  awards: string[];
  services: { id: string; name: string }[];
  rating: Rating;
  distribution: { stars: number; count: number }[];
  reviews: { id: string; rating: number; comment: string | null; createdAt: string; reviewer: string; service: string | null }[];
};

function Section({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 font-semibold text-gray-900 dark:text-surface-100">
        {icon}
        {title}
      </h3>
      <ul className="space-y-1.5 border-l-2 border-brand-200 pl-4 text-sm text-gray-700 dark:border-brand-800 dark:text-surface-200">
        {items.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/** The dentist's full public profile and patients' reviews. */
export function DentistProfileModal({
  dentist,
  onClose,
  onChoose,
}: {
  dentist: BookingDentist;
  onClose: () => void;
  onChoose?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .get<{ data: PublicProfile }>(`/public/booking/dentists/${dentist.id}`)
      .then((r) => live && setProfile(r.data.data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [dentist.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "vi-VN";
  const name = dentistDisplayName(profile ?? dentist);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("uiScheduling.bookingWizard.profileTitle", { name })}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-xl dark:bg-surface-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <Avatar name={dentist.fullName} dentistId={dentist.id} large />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-surface-100">{name}</h2>
            {(profile?.position ?? dentist.position) && (
              <p className="text-sm text-gray-600 dark:text-surface-300">{profile?.position ?? dentist.position}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <RatingLine rating={profile?.rating ?? dentist.rating} />
              {(profile?.yearsOfExperience ?? dentist.yearsOfExperience) != null && (
                <span className="text-sm text-gray-600 dark:text-surface-300">
                  {t("uiScheduling.bookingWizard.yearsExperience", { count: profile?.yearsOfExperience ?? dentist.yearsOfExperience ?? 0 })}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("uiScheduling.bookingWizard.close")} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-surface-800">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {failed && <p role="alert" className="mt-4 text-sm text-red-700">{t("uiScheduling.bookingWizard.profileError")}</p>}
        {!profile && !failed && <p role="status" className="mt-4 text-sm text-gray-500">{t("uiScheduling.loading")}</p>}
        {profile && (
          <div className="mt-5 space-y-5">
            {profile.bio && <p className="text-sm text-gray-700 dark:text-surface-200">{profile.bio}</p>}
            {profile.specialties.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profile.specialties.map((c) => (
                  <span key={c} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                    {SPECIALTY_LABEL[c] ?? c}
                  </span>
                ))}
              </div>
            )}
            <Section icon={<GraduationCap className="h-4 w-4 text-brand-600" aria-hidden />} title={t("uiScheduling.bookingWizard.education")} items={profile.education} />
            <Section icon={<BriefcaseMedical className="h-4 w-4 text-brand-600" aria-hidden />} title={t("uiScheduling.bookingWizard.experience")} items={profile.experience} />
            <Section icon={<Award className="h-4 w-4 text-brand-600" aria-hidden />} title={t("uiScheduling.bookingWizard.awards")} items={profile.awards} />
            {profile.services.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-2 font-semibold text-gray-900 dark:text-surface-100">
                  <Stethoscope className="h-4 w-4 text-brand-600" aria-hidden />
                  {t("uiScheduling.bookingWizard.servicesDone")}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {profile.services.map((s) => (
                    <span key={s.id} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 dark:border-surface-700 dark:text-surface-200">
                      {s.name}
                    </span>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h3 className="mb-2 font-semibold text-gray-900 dark:text-surface-100">{t("uiScheduling.bookingWizard.reviewsTitle")}</h3>
              {profile.rating.count === 0 ? (
                <p className="text-sm text-gray-500 dark:text-surface-400">{t("uiScheduling.bookingWizard.noReviewsYet")}</p>
              ) : (
                <>
                  <div className="mb-3 grid gap-4 rounded-lg bg-gray-50 p-3 dark:bg-surface-800 sm:grid-cols-[auto_1fr]">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-gray-900 dark:text-surface-100">{profile.rating.average?.toFixed(1)}</p>
                      <Stars value={profile.rating.average ?? 0} size={16} />
                      <p className="text-xs text-gray-500 dark:text-surface-400">{t("uiScheduling.bookingWizard.reviewCount", { count: profile.rating.count })}</p>
                    </div>
                    <div className="space-y-1">
                      {profile.distribution.map((d) => (
                        <div key={d.stars} className="flex items-center gap-2 text-xs text-gray-600 dark:text-surface-300">
                          <span className="w-8">{d.stars} ★</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-surface-700">
                            <span className="block h-full bg-amber-400" style={{ width: `${(d.count / profile.rating.count) * 100}%` }} />
                          </span>
                          <span className="w-8 text-right">{d.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <ul className="divide-y divide-gray-100 dark:divide-surface-800">
                    {profile.reviews.map((r) => (
                      <li key={r.id} className="py-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <Stars value={r.rating} />
                          <span className="font-medium text-gray-900 dark:text-surface-100">{r.reviewer}</span>
                          <span className="text-xs text-gray-500 dark:text-surface-400">
                            {t("uiScheduling.bookingWizard.verifiedVisit")} · {new Date(r.createdAt).toLocaleDateString(locale)}
                            {r.service ? ` · ${r.service}` : ""}
                          </span>
                        </div>
                        {r.comment && <p className="mt-1 text-sm text-gray-700 dark:text-surface-200">{r.comment}</p>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        )}
        </div>
        {onChoose && (
          <div className="shrink-0 border-t border-gray-100 p-4 dark:border-surface-800 sm:px-6">
            <button type="button" onClick={onChoose} className="min-h-11 w-full rounded-md bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700">
              {t("uiScheduling.bookingWizard.chooseThisDentist")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
