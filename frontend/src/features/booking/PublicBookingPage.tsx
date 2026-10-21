import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { bookingErrorMessage } from "./errorMessage";
import { PublicTopBar } from "./PublicTopBar";
import { saveBooking } from "./savedBookings";
import { clearSavedProfile, loadSavedProfile, saveProfile } from "./savedProfile";
import { SPECIALTY_LABEL } from "@/features/staff/labels";
import { clinic } from "@/config/clinic";
import { clinicToday } from "@/lib/clinicTime";
import { i18n } from "@/locales";
import { useTranslation } from "react-i18next";

type Dentist = {
  id: string;
  fullName: string;
  specialties: string[];
  bio?: string | null;
  /** This dentist's own visit length for the service. */
  durationMinutes?: number;
};
type Service = {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  /** Left out when the clinic does not publish the price. */
  basePrice?: string | number;
  dentists: Dentist[];
};
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
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const service = useMemo(
    () => services.find((x) => x.id === serviceId),
    [services, serviceId],
  );
  const [dentistId, setDentistId] = useState("");
  const [date, setDate] = useState(today());
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
  const [form, setForm] = useState(() => {
    const saved = loadSavedProfile();
    return {
      fullName: saved?.fullName ?? "",
      dob: saved?.dob ?? "",
      gender: saved?.gender || "UNDISCLOSED",
      phone: saved?.phone ?? "",
      email: saved?.email ?? "",
      contactPersonName: saved?.contactPersonName ?? "",
      contactPersonPhone: saved?.contactPersonPhone ?? "",
      reason: "",
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
          if (pick.dentists.length === 1) setDentistId(pick.dentists[0].id);
        }
      })
      .catch(() =>
        setError(i18n.t("uiScheduling.bookingServicesError")),
      )
      .finally(() => setLoading(false));
  }, [preselected]);

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
          <Link
            to="/booking/status"
            className="text-brand-600 hover:underline"
          >
            {t('uiScheduling.bookingLookup')}
          </Link>
        </PublicTopBar>
        <section className="rounded-xl border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">
            {t('uiScheduling.publicBooking')}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-surface-300">
            {t('uiScheduling.bookingIntro')}
          </p>
          {error && services.length === 0 && (
            <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>
          )}
          {services.length === 0 ? (
            <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
              {error ? t("uiScheduling.bookingReloadOrCall") : t("uiScheduling.bookingOnlineClosed")}
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-6">
              <div>
                <h2 className="mb-3 font-semibold text-gray-900 dark:text-surface-100">
                  1. {t('uiScheduling.bookingChooseTime')}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
                    {t('uiScheduling.service')}
                    <select aria-label={t('uiScheduling.service')}
                      className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 bg-white dark:bg-surface-900 px-3 py-2"
                      value={serviceId}
                      onChange={(e) => {
                        setServiceId(e.target.value);
                        const dentists = services.find((s) => s.id === e.target.value)?.dentists;
                        setDentistId(dentists?.length === 1 ? dentists[0].id : "");
                      }}
                      required
                    >
                      <option value="">{t('uiScheduling.bookingServiceSelect')}</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
                    {t('uiScheduling.dentist')}
                    <select aria-label={t('uiScheduling.dentist')}
                      className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 bg-white dark:bg-surface-900 px-3 py-2"
                      value={dentistId}
                      onChange={(e) => setDentistId(e.target.value)}
                      required
                      disabled={!service}
                    >
                      <option value="">{t('uiScheduling.bookingDentistSelect')}</option>
                      {service?.dentists.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.fullName}
                          {d.specialties.length
                            ? " · " +
                              d.specialties
                                .map((c) => SPECIALTY_LABEL[c] ?? c)
                                .join(", ")
                            : ""}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const bio = service?.dentists.find((d) => d.id === dentistId)?.bio;
                      return bio ? (
                        <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-surface-400">{bio}</span>
                      ) : null;
                    })()}
                    {/* The length depends on the dentist (their own duration first). */}
                    {(() => {
                      const minutes = service?.dentists.find((d) => d.id === dentistId)?.durationMinutes;
                      return minutes ? (
                        <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-surface-400">
                          {t("uiScheduling.bookingEstimatedDuration", { minutes })}
                        </span>
                      ) : null;
                    })()}
                  </label>
                  <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
                    {t('uiScheduling.bookingDate')}
                    <input
                      type="date"
                      aria-label={t('uiScheduling.bookingDate')}
                      min={today()}
                      max={lastDate}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 px-3 py-2"
                    />
                    <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-surface-400">
                      {t('uiScheduling.onlineBookingUntil')} {showDate(lastDate)}.
                    </span>
                  </label>
                  <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
                    {t('uiScheduling.availableTime')}
                    <select aria-label={t('uiScheduling.availableTime')}
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      required
                      disabled={!dentistId || slotLoading || slots.length === 0}
                      className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 bg-white dark:bg-surface-900 px-3 py-2"
                    >
                      <option value="">
                        {!dentistId
                          ? t('uiScheduling.bookingChooseDentistFirst')
                          : !date
                            ? t('uiScheduling.bookingChooseDateFirst')
                            : slotLoading
                          ? t('uiScheduling.loading')
                          : slots.length
                            ? t('uiScheduling.bookingChooseTimeSlot')
                            : t('uiScheduling.noAvailableTime')}
                      </option>
                      {slots.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                    {minLead > 0 && (
                      <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-surface-300">
                        {t('uiScheduling.bookingLeadTime', { lead: leadText(minLead) })}
                        {t('uiScheduling.bookingLeadContact')}
                        {clinic.phone ? (
                          <>
                            {" "}
                            <a
                              href={`tel:${clinic.phoneHref}`}
                              className="font-medium text-brand-600 hover:underline"
                            >
                              {clinic.phone}
                            </a>
                          </>
                        ) : null}
                        .
                      </span>
                    )}
                  </label>
                  {(slotError || (!slotLoading && dentistId && slots.length === 0)) && (
                    <div className="text-sm sm:col-span-2">
                      {slotError && (
                        <span
                          role="alert"
                          className="mt-1 block text-xs font-normal text-red-700"
                        >
                          {slotError}
                        </span>
                      )}
                      {!slotLoading && !slotError && dentistId && slots.length === 0 && (
                        <span className="mt-1 block text-xs font-normal text-amber-800">
                          {emptyReasonText(emptyReason, minLead, closedReason)}{" "}
                          {nextDate ? (
                            <button
                              type="button"
                              onClick={() => setDate(nextDate)}
                              className="font-medium text-brand-600 underline"
                            >
                              {t('uiScheduling.nextAvailableDate')}: {showDate(nextDate)}
                            </button>
                          ) : (
                            t('uiScheduling.noSlotsTwoWeeks')
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h2 className="mb-3 font-semibold text-gray-900 dark:text-surface-100">
                  2. {t('uiScheduling.bookingPatientInfo')}
                </h2>
                <p className="-mt-2 mb-3 text-xs text-gray-500 dark:text-surface-400">
                  {t('uiScheduling.bookingPatientInfoHint')}
                </p>
                {remembered && (
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-brand-50 dark:bg-surface-800 px-3 py-2 text-sm text-gray-700 dark:text-surface-200">
                    <span>{t('uiScheduling.bookingPrefilled', { name: remembered.fullName })}</span>
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
                      {t('uiScheduling.bookingPrefilledClear')}
                    </button>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
                    {t('uiScheduling.phoneNumber')}
                    <input
                      required
                      type="tel"
                      maxLength={20}
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      placeholder="0901 234 567"
                      className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
                    {t('uiScheduling.bookingDob')}
                    <input
                      required
                      type="date"
                      max={today()}
                      value={form.dob}
                      onChange={(e) => set("dob", e.target.value)}
                      className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 px-3 py-2"
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiScheduling.returningHint')}</p>
                    <button
                      type="button"
                      onClick={lookupReturning}
                      disabled={lookupBusy}
                      className="mt-2 min-h-11 rounded-md border border-brand-600 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                    >
                      {lookupBusy ? t('uiScheduling.returningSearching') : t('uiScheduling.returningSearch')}
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
                            className="min-h-11 rounded-md border border-gray-300 px-3 text-sm hover:bg-brand-50"
                          >
                            {c.fullName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <label className="text-sm font-medium text-gray-700 dark:text-surface-200 sm:col-span-2">
                    {t('uiScheduling.bookingFullName')}
                    <input
                      required
                      maxLength={100}
                      autoComplete="name"
                      value={form.fullName}
                      onChange={(e) => set("fullName", e.target.value)}
                      className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
                    {t('uiScheduling.gender')}
                    <select
                      value={form.gender}
                      onChange={(e) => set("gender", e.target.value)}
                      className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 bg-white dark:bg-surface-900 px-3 py-2"
                    >
                      <option value="UNDISCLOSED">{t('uiScheduling.genderUndisclosed')}</option>
                      <option value="FEMALE">{t('uiScheduling.genderFemale')}</option>
                      <option value="MALE">{t('uiScheduling.genderMale')}</option>
                      <option value="OTHER">{t('uiScheduling.genderOther')}</option>
                    </select>
                  </label>
                  {age !== null && age < 18 && (
                    <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 sm:col-span-2">
                      {t('uiScheduling.minorBookingNotice')}{age < 12 ? ` ${t('uiScheduling.minorGuardianDetails')}` : ''}
                    </p>
                  )}
                  <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
                    {t('uiScheduling.bookingEmail')}
                    <input
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 px-3 py-2"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-surface-200 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={onBehalf}
                      onChange={(e) => setOnBehalf(e.target.checked)}
                    />
                    {t('uiScheduling.bookingOnBehalf')}
                  </label>
                  {showContact && (
                    <>
                      <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
                        {t('uiScheduling.bookingContactPerson')}{age !== null && age < 12 ? ` (${t('uiScheduling.required')})` : ""}
                        <input
                          maxLength={100}
                          required={age !== null && age < 12}
                          value={form.contactPersonName}
                          onChange={(e) => set("contactPersonName", e.target.value)}
                          className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 px-3 py-2"
                        />
                      </label>
                      <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
                        {t('uiScheduling.bookingContactPhone')}
                        <input
                          type="tel"
                          required={age !== null && age < 12}
                          value={form.contactPersonPhone}
                          onChange={(e) =>
                            set("contactPersonPhone", e.target.value)
                          }
                          className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 px-3 py-2"
                        />
                      </label>
                    </>
                  )}
                  <label className="text-sm font-medium text-gray-700 dark:text-surface-200 sm:col-span-2">
                    {t('uiScheduling.bookingReason')}
                    <textarea
                      maxLength={1000}
                      rows={3}
                      value={form.reason}
                      onChange={(e) => set("reason", e.target.value)}
                      className="mt-1 block min-h-11 w-full min-w-0 rounded-md border border-gray-300 dark:border-surface-600 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-100 dark:disabled:bg-surface-800 disabled:text-gray-500 dark:text-surface-400 px-3 py-2"
                    />
                  </label>
                </div>
              </div>
              <label className="flex gap-3 rounded-lg bg-slate-50 dark:bg-surface-950 p-3 text-sm text-gray-700 dark:text-surface-200">
                <input
                  required
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => set("consent", e.target.checked)}
                  className="mt-1"
                />
                <span>{t('uiScheduling.consent')}</span>
              </label>
              <label className="flex gap-3 px-3 text-sm text-gray-600 dark:text-surface-300">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="mt-1"
                />
                <span>{t('uiScheduling.bookingRemember')}</span>
              </label>
              {error && (
                <p
                  role="alert"
                  className="rounded-md bg-red-50 p-3 text-sm text-red-700"
                >
                  {error}
                </p>
              )}
              <button
                disabled={submitting || slotLoading || !time}
                className="w-full rounded-md bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? t('uiScheduling.sending') : t('uiScheduling.bookingSubmit')}
              </button>
            </form>
          )}
          <p className="mt-5 text-xs text-gray-500 dark:text-surface-400">
            {t('uiScheduling.bookingHelp')}
          </p>
        </section>
      </div>
    </main>
  );
}
