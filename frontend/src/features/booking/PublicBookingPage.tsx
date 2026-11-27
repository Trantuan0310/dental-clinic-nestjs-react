import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { bookingErrorMessage } from "./errorMessage";
import { PublicTopBar } from "./PublicTopBar";
import { saveBooking } from "./savedBookings";
import { clearSavedProfile, loadSavedProfile, saveProfile } from "./savedProfile";
import { Input, Select, Textarea } from "@/components/ui";
import { ArrowLeft, CalendarDays, Check, Clock, Stethoscope, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { DentistPicker, ServicePicker } from "./bookingCatalog";
import { dentistDisplayName, dentistPriceText, type BookingService } from "./bookingCatalogUtils";
import { clinic } from "@/config/clinic";
import { clinicToday } from "@/lib/clinicTime";
import { i18n } from "@/locales";
import { useTranslation } from "react-i18next";
import type { BookingPrefill } from "@/features/landing/LandingPage";

type Service = BookingService;
type BookingResult = {
  referenceCode: string;
  accessToken: string;
  notificationSent: boolean;
  status?: string;
};

// The clinic's date, not the browser's: a visitor abroad (or a PC set to
// another zone) must not be offered yesterday or refused today.
const today = () => clinicToday();
/** "YYYY-MM-DD" `days` after `date`. */
const addDays = (date: string, days: number) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** "dd/MM/yyyy" of a "YYYY-MM-DD". */
const showDate = (date: string) => date.split("-").reverse().join("/");
type SlotsResponse = {
  availableSlots: string[];
  minLeadMinutes?: number;
  emptyReason?: string | null;
  /** Set only for a clinic-wide closure (its reason is written for patients). */
  closedReason?: string | null;
  nextAvailableDate?: string | null;
  lastDate?: string;
};
/** The minimum notice (e.g. 2 hours, 90 minutes) in the UI language. */
const leadText = (minLead: number) =>
  minLead % 60 === 0
    ? i18n.t("uiScheduling.bookingLeadHours", { count: minLead / 60 })
    : i18n.t("uiScheduling.minutesValue", { count: minLead });
/** Why the chosen day has no time left, in the patient's words. */
const emptyReasonText = (
  reason: string | null | undefined,
  minLead: number,
  closedReason?: string | null,
) => {
  switch (reason) {
    case "CLINIC_CLOSED":
      return (closedReason || i18n.t("uiScheduling.clinicClosedDay")) + ".";
    case "CLOSED":
      return i18n.t("uiScheduling.dentistClosed");
    case "NO_SCHEDULE":
      return i18n.t("uiScheduling.dentistNoSchedule");
    case "TIME_OFF":
      return i18n.t("uiScheduling.dentistTimeOff");
    case "DAY_OVER":
      return i18n.t("uiScheduling.dayEnded");
    case "TOO_SOON":
      return i18n.t("uiScheduling.bookingTooSoon", { lead: leadText(minLead) });
    case "FULL":
      return i18n.t("uiScheduling.dayFull");
    case "HELD":
      return i18n.t("uiScheduling.bookingDayHeld");
    default:
      return "";
  }
};

export default function PublicBookingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // The landing page links each service to /booking?service=<id>.
  const [searchParams] = useSearchParams();
  const preselected = searchParams.get("service") ?? "";
  // An open time tapped on the home page: dentist, day and time to start from.
  const preDentist = searchParams.get("dentist") ?? "";
  const preDate = searchParams.get("date") ?? "";
  const preTime = useRef(searchParams.get("time") ?? "");
  const [services, setServices] = useState<Service[]>([]);
  // 1 service, 2 dentist, 3 date and time, 4 patient details.
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [serviceId, setServiceId] = useState("");
  const service = useMemo(
    () => services.find((x) => x.id === serviceId),
    [services, serviceId],
  );
  const [dentistId, setDentistId] = useState("");
  const [date, setDate] = useState(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(preDate) && preDate >= today() ? preDate : today(),
  );
  const [slots, setSlots] = useState<string[]>([]);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [slotError, setSlotError] = useState("");
  // Online requests are taken this far ahead (the slots API reports it).
  const [lastDate, setLastDate] = useState(() => addDays(today(), 60));
  // Minimum notice for online requests; the slots API reports the setting.
  const [minLead, setMinLead] = useState(120);
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Details from this device's last booking, if any (never fetched from the server).
  const [remembered, setRemembered] = useState(() => loadSavedProfile());
  const [remember, setRemember] = useState(true);
  // Name and phone typed in the home page's quick form (router state, never the URL).
  const prefill = (useLocation().state ?? null) as BookingPrefill | null;
  const [form, setForm] = useState(() => {
    const saved = loadSavedProfile();
    return {
      fullName: prefill?.fullName ?? saved?.fullName ?? "",
      dob: saved?.dob ?? "",
      gender: saved?.gender || "UNDISCLOSED",
      phone: prefill?.phone ?? saved?.phone ?? "",
      email: saved?.email ?? "",
      contactPersonName: saved?.contactPersonName ?? "",
      contactPersonPhone: saved?.contactPersonPhone ?? "",
      reason: prefill?.reason ?? "",
      consent: false,
    };
  });

  useEffect(() => {
    api
      .get<{ data: Service[] }>("/public/booking/options")
      .then((r) => {
        setServices(r.data.data);
        const pick = r.data.data.find((x) => x.id === preselected);
        if (pick) {
          setServiceId(pick.id);
          const dentist = pick.dentists.some((d) => d.id === preDentist)
            ? preDentist
            : pick.dentists.length === 1
              ? pick.dentists[0].id
              : "";
          setDentistId(dentist);
          setStep(dentist ? 3 : 2);
        }
      })
      .catch(() =>
        setError(i18n.t("uiScheduling.bookingServicesError")),
      )
      .finally(() => setLoading(false));
  }, [preselected, preDentist]);

  useEffect(() => {
    let active = true;
    setSlotLoading(false);
    setSlots([]);
    setTime("");
    setEmptyReason(null);
    setClosedReason(null);
    setNextDate(null);
    setSlotError("");
    if (!serviceId || !dentistId || !date) return;
    setSlotLoading(true);
    api
      .get<{ data: SlotsResponse }>("/public/booking/slots", {
        // next=1: on an empty day, also name the next day with a free time.
        params: { serviceId, dentistId, date, next: 1 },
      })
      .then((r) => {
        if (!active) return;
        const data = r.data.data;
        setSlots(data.availableSlots);
        // The home page's time, once, if it is still free.
        if (preTime.current && data.availableSlots.includes(preTime.current)) setTime(preTime.current);
        preTime.current = "";
        setEmptyReason(data.emptyReason ?? null);
        setClosedReason(data.closedReason ?? null);
        setNextDate(data.nextAvailableDate ?? null);
        if (data.lastDate) setLastDate(data.lastDate);
        if (typeof data.minLeadMinutes === "number")
          setMinLead(data.minLeadMinutes);
      })
      // The server says what is wrong (a day too far ahead, for one).
      .catch((e: unknown) => {
        if (active) setSlotError(bookingErrorMessage(e, i18n.t("uiScheduling.slotsLoadError")));
      })
      .finally(() => {
        if (active) setSlotLoading(false);
      });
    return () => { active = false; };
  }, [serviceId, dentistId, date]);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((old) => ({ ...old, [key]: value }));
  // Age of the person to be seen, on the clinic's today (null until a date is typed).
  const age = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dob)) return null;
    const [y, m, d] = form.dob.split("-").map(Number);
    const [ty, tm, td] = today().split("-").map(Number);
    return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  }, [form.dob]);
  // Booking for someone else (or a child under 12): contact person fields.
  const [onBehalf, setOnBehalf] = useState(() => loadSavedProfile()?.onBehalf ?? false);
  const showContact = onBehalf || (age !== null && age < 12);
  // A returning patient: phone + date of birth fetch the details on file.
  type ReturningMatch = {
    fullName: string;
    gender: string;
    email: string;
    contactPersonName: string;
    contactPersonPhone: string;
  };
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookupChoices, setLookupChoices] = useState<ReturningMatch[]>([]);
  const applyReturning = (m: ReturningMatch) => {
    setForm((old) => ({
      ...old,
      fullName: m.fullName,
      gender: m.gender || old.gender,
      email: m.email || old.email,
      contactPersonName: m.contactPersonName,
      contactPersonPhone: m.contactPersonPhone,
    }));
    setOnBehalf(!!m.contactPersonName || !!m.contactPersonPhone);
    setLookupChoices([]);
    setLookupMessage(t("uiScheduling.returningFound", { name: m.fullName }));
  };
  const lookupReturning = async () => {
    setLookupMessage("");
    setLookupChoices([]);
    if (form.phone.trim().length < 9 || !form.dob) {
      setLookupMessage(t("uiScheduling.returningNeedBoth"));
      return;
    }
    setLookupBusy(true);
    try {
      const response = await api.post<{ data: { matches: ReturningMatch[] } }>(
        "/public/booking/returning-patient",
        { phone: form.phone.trim(), dob: form.dob },
      );
      const matches = response.data.data.matches;
      if (matches.length === 0) setLookupMessage(t("uiScheduling.returningNone"));
      else if (matches.length === 1) applyReturning(matches[0]);
      else {
        setLookupChoices(matches);
        setLookupMessage(t("uiScheduling.returningChoose"));
      }
    } catch (e: unknown) {
      setLookupMessage(bookingErrorMessage(e, t("uiScheduling.returningNone")));
    } finally {
      setLookupBusy(false);
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!serviceId || !dentistId || !date || !time) {
      setError(t("uiScheduling.bookingMissingSelection"));
      return;
    }
    setSubmitting(true);
    try {
      const startAt = new Date(date + "T" + time + ":00+07:00").toISOString();
      const response = await api.post<{ data: BookingResult }>(
        "/public/booking/requests",
        {
          ...form,
          consentLanguage: i18n.language.startsWith('en') ? 'en' : 'vi',
          consentVersion: '1',
          // Fields hidden again (box unticked) are not sent.
          ...(showContact ? {} : { contactPersonName: "", contactPersonPhone: "" }),
          serviceId,
          dentistId,
          startAt,
        },
      );
      const result = response.data.data;
      // The status page gets the token in the URL fragment (never sent to
      // the server, removed from the address bar on arrival); this device's
      // copy is only a fallback (storage may be unavailable).
      saveBooking({
        ref: result.referenceCode,
        token: result.accessToken,
        phone: form.phone.trim(),
      });
      if (remember) {
        saveProfile({
          fullName: form.fullName.trim(),
          dob: form.dob,
          gender: form.gender,
          phone: form.phone.trim(),
          email: form.email.trim(),
          contactPersonName: showContact ? form.contactPersonName.trim() : "",
          contactPersonPhone: showContact ? form.contactPersonPhone.trim() : "",
          onBehalf,
        });
      } else {
        clearSavedProfile();
      }
      // An email was given but could not be sent: the status page says so.
      const mailFailed = !!form.email.trim() && result.notificationSent === false;
      navigate(
        "/booking/status?new=1" +
          (mailFailed ? "&mail=0" : "") +
          // Set by this submission only: a later reload after the front desk
          // confirms a normal request must not read as an instant confirmation.
          (result.status === "CONFIRMED" ? "&auto=1" : "") +
          "&ref=" +
          encodeURIComponent(result.referenceCode) +
          "#token=" +
          encodeURIComponent(result.accessToken),
      );
    } catch (e: unknown) {
      setError(bookingErrorMessage(e, t("uiScheduling.bookingSubmitFailed")));
    } finally {
      setSubmitting(false);
    }
  };

  const dentist = service?.dentists.find((d) => d.id === dentistId);
  const steps = [
    { n: 1 as const, label: t("uiScheduling.bookingWizard.stepService"), done: !!serviceId },
    { n: 2 as const, label: t("uiScheduling.bookingWizard.stepDentist"), done: !!dentistId },
    { n: 3 as const, label: t("uiScheduling.bookingWizard.stepTime"), done: !!time },
    { n: 4 as const, label: t("uiScheduling.bookingWizard.stepInfo"), done: false },
  ];
  // A step can be opened once everything before it is chosen.
  const reachable = (n: number) =>
    n === 1 || (n === 2 && !!serviceId) || (n === 3 && !!dentistId) || (n === 4 && !!time);
  const go = (n: 1 | 2 | 3 | 4) => {
    if (!reachable(n)) return;
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const chooseService = (id: string) => {
    setServiceId(id);
    const dentists = services.find((s) => s.id === id)?.dentists ?? [];
    const only = dentists.length === 1 ? dentists[0].id : "";
    setDentistId(only);
    // State is not updated yet, so step straight there (go() would check the old choice).
    setStep(only ? 3 : 2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const backButton = (to: 1 | 2 | 3) => (
    <button
      type="button"
      onClick={() => go(to)}
      className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {t("uiScheduling.bookingWizard.back")}
    </button>
  );

  if (loading)
    return (
      <main role="status" className="mx-auto max-w-3xl p-6 text-gray-600 dark:text-surface-300">
        {t("uiScheduling.bookingPageLoading")}
      </main>
    );

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-surface-950 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <PublicTopBar>
          <Link to="/booking/status" className="text-brand-600 hover:underline">
            {t("uiScheduling.bookingLookup")}
          </Link>
        </PublicTopBar>
        <section className="rounded-xl border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t("uiScheduling.publicBooking")}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-surface-300">{t("uiScheduling.bookingIntro")}</p>
          {error && services.length === 0 && (
            <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>
          )}
          {services.length === 0 ? (
            <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
              {error ? t("uiScheduling.bookingReloadOrCall") : t("uiScheduling.bookingOnlineClosed")}
            </div>
          ) : (
            <>
              <nav aria-label={t("uiScheduling.bookingWizard.progress")} className="mt-6">
                <ol className="grid grid-cols-4 gap-2">
                  {steps.map((s) => {
                    const current = step === s.n;
                    return (
                      <li key={s.n}>
                        <button
                          type="button"
                          onClick={() => go(s.n)}
                          disabled={!reachable(s.n)}
                          aria-current={current ? "step" : undefined}
                          className="flex w-full flex-col items-center gap-1 text-center disabled:cursor-not-allowed"
                        >
                          <span
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold",
                              current
                                ? "border-brand-600 bg-brand-600 text-white"
                                : s.done
                                  ? "border-brand-600 bg-white text-brand-700 dark:bg-surface-900 dark:text-brand-300"
                                  : "border-gray-300 bg-white text-gray-400 dark:border-surface-600 dark:bg-surface-900",
                            )}
                          >
                            {s.done && !current ? <Check className="h-4 w-4" aria-hidden /> : s.n}
                          </span>
                          <span className={cn("text-xs sm:text-sm", current ? "font-semibold text-gray-900 dark:text-surface-100" : "text-gray-500 dark:text-surface-400")}>
                            {s.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>

              {/* What is chosen so far, from step 2 on. */}
              {step > 1 && service && (
                <dl className="mt-5 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-surface-800 sm:grid-cols-2">
                  <div className="flex items-start gap-2">
                    <Stethoscope className="mt-0.5 h-4 w-4 text-brand-600" aria-hidden />
                    <div>
                      <dt className="sr-only">{t("uiScheduling.service")}</dt>
                      <dd className="font-medium text-gray-900 dark:text-surface-100">{service.name}</dd>
                    </div>
                  </div>
                  {dentist && step > 2 && (
                    <div className="flex items-start gap-2">
                      <UserRound className="mt-0.5 h-4 w-4 text-brand-600" aria-hidden />
                      <div>
                        <dt className="sr-only">{t("uiScheduling.dentist")}</dt>
                        <dd className="text-gray-900 dark:text-surface-100">
                          {dentistDisplayName(dentist)} · <span className="font-semibold text-brand-700 dark:text-brand-300">{dentistPriceText(dentist, t)}</span>
                        </dd>
                      </div>
                    </div>
                  )}
                  {time && step > 3 && (
                    <div className="flex items-start gap-2">
                      <CalendarDays className="mt-0.5 h-4 w-4 text-brand-600" aria-hidden />
                      <div>
                        <dt className="sr-only">{t("uiScheduling.bookingWizard.stepTime")}</dt>
                        <dd className="text-gray-900 dark:text-surface-100">{time} · {showDate(date)}</dd>
                      </div>
                    </div>
                  )}
                  {dentist?.durationMinutes && step > 2 ? (
                    <div className="flex items-start gap-2">
                      <Clock className="mt-0.5 h-4 w-4 text-brand-600" aria-hidden />
                      <dd className="text-gray-700 dark:text-surface-200">{t("uiScheduling.bookingEstimatedDuration", { minutes: dentist.durationMinutes })}</dd>
                    </div>
                  ) : null}
                </dl>
              )}

              <form onSubmit={submit} className="mt-6">
                {step === 1 && (
                  <div>
                    <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-surface-100">1. {t("uiScheduling.bookingWizard.chooseService")}</h2>
                    <ServicePicker services={services} value={serviceId} onChange={chooseService} />
                  </div>
                )}

                {step === 2 && service && (
                  <div>
                    {backButton(1)}
                    <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-surface-100">2. {t("uiScheduling.bookingWizard.chooseDentistTitle")}</h2>
                    <p className="mb-3 text-sm text-gray-600 dark:text-surface-300">{t("uiScheduling.bookingWizard.chooseDentistHint")}</p>
                    <DentistPicker
                      dentists={service.dentists}
                      value={dentistId}
                      onChange={(id) => {
                        setDentistId(id);
                        setStep(3);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    />
                  </div>
                )}

                {step === 3 && service && dentist && (
                  <div className="space-y-4">
                    {backButton(2)}
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-surface-100">3. {t("uiScheduling.bookingWizard.chooseTimeTitle")}</h2>
                    <div className="max-w-xs">
                      <Input
                        label={t("uiScheduling.bookingDate")}
                        type="date"
                        min={today()}
                        max={lastDate}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                        hint={`${t("uiScheduling.onlineBookingUntil")} ${showDate(lastDate)}.`}
                      />
                    </div>
                    <fieldset>
                      <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-surface-200">
                        {t("uiScheduling.availableTime")}
                        <span className="ml-1 text-red-500" aria-hidden>*</span>
                      </legend>
                      {slotLoading ? (
                        <p role="status" className="text-sm text-gray-500">{t("uiScheduling.loading")}</p>
                      ) : slots.length > 0 ? (
                        <div role="radiogroup" aria-label={t("uiScheduling.availableTime")} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                          {slots.map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              role="radio"
                              aria-checked={time === slot}
                              onClick={() => setTime(slot)}
                              className={cn(
                                "min-h-11 rounded-md border text-sm font-medium",
                                time === slot
                                  ? "border-brand-600 bg-brand-600 text-white"
                                  : "border-gray-300 bg-white text-gray-800 hover:border-brand-500 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100",
                              )}
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {slotError && (
                        <p role="alert" className="mt-1 text-sm text-red-700">{slotError}</p>
                      )}
                      {!slotLoading && !slotError && slots.length === 0 && (
                        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                          {emptyReasonText(emptyReason, minLead, closedReason)}{" "}
                          {nextDate ? (
                            <button type="button" onClick={() => setDate(nextDate)} className="font-medium text-brand-700 underline">
                              {t("uiScheduling.nextAvailableDate")}: {showDate(nextDate)}
                            </button>
                          ) : (
                            t("uiScheduling.noSlotsTwoWeeks")
                          )}
                        </p>
                      )}
                      {minLead > 0 && (
                        <p className="mt-2 text-xs text-gray-500 dark:text-surface-300">
                          {t("uiScheduling.bookingLeadTime", { lead: leadText(minLead) })}
                          {t("uiScheduling.bookingLeadContact")}
                          {clinic.phone ? (
                            <>
                              {" "}
                              <a href={`tel:${clinic.phoneHref}`} className="font-medium text-brand-600 hover:underline">
                                {clinic.phone}
                              </a>
                            </>
                          ) : null}
                          .
                        </p>
                      )}
                    </fieldset>
                    <button
                      type="button"
                      disabled={!time}
                      onClick={() => go(4)}
                      className="min-h-11 w-full rounded-md bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {t("uiScheduling.bookingWizard.continue")}
                    </button>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-6">
                    <div>
                      {backButton(3)}
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-surface-100">4. {t("uiScheduling.bookingPatientInfo")}</h2>
                      <p className="mt-1 text-xs text-gray-500 dark:text-surface-400">{t("uiScheduling.bookingPatientInfoHint")}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-surface-400">
                        <span className="text-red-500">*</span> {t("uiScheduling.bookingWizard.requiredNote")}
                      </p>
                    </div>
                    {remembered && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-brand-50 dark:bg-surface-800 px-3 py-2 text-sm text-gray-700 dark:text-surface-200">
                        <span>{t("uiScheduling.bookingPrefilled", { name: remembered.fullName })}</span>
                        <button
                          type="button"
                          className="font-medium text-brand-700 underline underline-offset-2"
                          onClick={() => {
                            clearSavedProfile();
                            setRemembered(null);
                            setOnBehalf(false);
                            setForm((old) => ({
                              ...old,
                              fullName: "",
                              dob: "",
                              gender: "UNDISCLOSED",
                              phone: "",
                              email: "",
                              contactPersonName: "",
                              contactPersonPhone: "",
                            }));
                          }}
                        >
                          {t("uiScheduling.bookingPrefilledClear")}
                        </button>
                      </div>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input
                        label={t("uiScheduling.phoneNumber")}
                        required
                        type="tel"
                        maxLength={20}
                        autoComplete="tel"
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        placeholder={t("uiScheduling.bookingWizard.phonePlaceholder")}
                      />
                      <Input
                        label={t("uiScheduling.bookingDob")}
                        required
                        type="date"
                        max={today()}
                        value={form.dob}
                        onChange={(e) => set("dob", e.target.value)}
                      />
                      <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 dark:text-surface-400">{t("uiScheduling.returningHint")}</p>
                        <button
                          type="button"
                          onClick={lookupReturning}
                          disabled={lookupBusy}
                          className="mt-2 min-h-11 rounded-md border border-brand-600 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60 dark:text-brand-300 dark:hover:bg-surface-800"
                        >
                          {lookupBusy ? t("uiScheduling.returningSearching") : t("uiScheduling.returningSearch")}
                        </button>
                        {lookupMessage && (
                          <p role="status" className="mt-2 rounded-md bg-slate-50 dark:bg-surface-800 p-2 text-sm text-gray-700 dark:text-surface-200">
                            {lookupMessage}
                          </p>
                        )}
                        {lookupChoices.length > 1 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {lookupChoices.map((c) => (
                              <button
                                key={c.fullName}
                                type="button"
                                onClick={() => applyReturning(c)}
                                className="min-h-11 rounded-md border border-gray-300 px-3 text-sm hover:bg-brand-50 dark:border-surface-600 dark:hover:bg-surface-800"
                              >
                                {c.fullName}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <Input
                          label={t("uiScheduling.bookingFullName")}
                          required
                          maxLength={100}
                          autoComplete="name"
                          value={form.fullName}
                          onChange={(e) => set("fullName", e.target.value)}
                          placeholder={t("uiScheduling.bookingWizard.namePlaceholder")}
                        />
                      </div>
                      <Select
                        label={t("uiScheduling.gender").replace(/\s*\*$/, "")}
                        required
                        value={form.gender}
                        onChange={(e) => set("gender", e.target.value)}
                        options={[
                          { value: "UNDISCLOSED", label: t("uiScheduling.genderUndisclosed") },
                          { value: "FEMALE", label: t("uiScheduling.genderFemale") },
                          { value: "MALE", label: t("uiScheduling.genderMale") },
                          { value: "OTHER", label: t("uiScheduling.genderOther") },
                        ]}
                      />
                      <Input
                        label={t("uiScheduling.bookingEmail")}
                        type="email"
                        autoComplete="email"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                        placeholder={t("uiScheduling.bookingWizard.emailPlaceholder")}
                        hint={t("uiScheduling.bookingWizard.emailHint")}
                      />
                      {age !== null && age < 18 && (
                        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 sm:col-span-2">
                          {t("uiScheduling.minorBookingNotice")}
                          {age < 12 ? ` ${t("uiScheduling.minorGuardianDetails")}` : ""}
                        </p>
                      )}
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-surface-200 sm:col-span-2">
                        <input type="checkbox" checked={onBehalf} onChange={(e) => setOnBehalf(e.target.checked)} />
                        {t("uiScheduling.bookingOnBehalf")}
                      </label>
                      {showContact && (
                        <>
                          <Input
                            label={t("uiScheduling.bookingContactPerson")}
                            maxLength={100}
                            required={age !== null && age < 12}
                            value={form.contactPersonName}
                            onChange={(e) => set("contactPersonName", e.target.value)}
                            placeholder={t("uiScheduling.bookingWizard.contactNamePlaceholder")}
                          />
                          <Input
                            label={t("uiScheduling.bookingContactPhone")}
                            type="tel"
                            required={age !== null && age < 12}
                            value={form.contactPersonPhone}
                            onChange={(e) => set("contactPersonPhone", e.target.value)}
                            placeholder={t("uiScheduling.bookingWizard.phonePlaceholder")}
                          />
                        </>
                      )}
                      <div className="sm:col-span-2">
                        <Textarea
                          label={t("uiScheduling.bookingReason")}
                          maxLength={1000}
                          rows={3}
                          value={form.reason}
                          onChange={(e) => set("reason", e.target.value)}
                          placeholder={t("uiScheduling.bookingWizard.reasonPlaceholder")}
                        />
                      </div>
                    </div>
                    <label className="flex gap-3 rounded-lg bg-slate-50 dark:bg-surface-800 p-3 text-sm text-gray-700 dark:text-surface-200">
                      <input required type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1" />
                      <span>
                        {t("uiScheduling.consent")}
                        <span className="ml-1 text-red-500" aria-hidden>*</span>
                      </span>
                    </label>
                    <label className="flex gap-3 px-3 text-sm text-gray-600 dark:text-surface-300">
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-1" />
                      <span>{t("uiScheduling.bookingRemember")}</span>
                    </label>
                    {error && (
                      <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
                    )}
                    <button
                      disabled={submitting || slotLoading || !time}
                      className="w-full rounded-md bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? t("uiScheduling.sending") : t("uiScheduling.bookingSubmit")}
                    </button>
                  </div>
                )}
              </form>
            </>
          )}
          <p className="mt-5 text-xs text-gray-500 dark:text-surface-400">{t("uiScheduling.bookingHelp")}</p>
        </section>
      </div>
    </main>
  );
}
