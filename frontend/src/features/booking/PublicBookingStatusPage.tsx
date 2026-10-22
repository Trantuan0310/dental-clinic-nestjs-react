import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarCheck,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  MessageCircle,
  Phone,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { clinic } from "@/config/clinic";
import { clinicToday } from "@/lib/clinicTime";
import { i18n } from "@/locales";
import { bookingErrorMessage } from "./errorMessage";
import { PublicTopBar } from "./PublicTopBar";
import {
  findSavedBooking,
  loadSavedBookings,
  normalizeReference,
  saveBooking,
} from "./savedBookings";
import { useTranslation } from "react-i18next";

type Status = {
  /** Left out of a lookup by phone alone (it would open the request). */
  referenceCode?: string;
  /** Changes need the token from the confirmation link; the phone only shows the status. */
  canManage?: boolean;
  status: string;
  /** Left out of a lookup by phone alone, like every time (where the person will be when). */
  requestedStartAt?: string;
  /** While set, the requested time is held for this request. */
  holdUntil?: string | null;
  service?: { name: string | null; durationMinutes?: number | null };
  dentist?: { fullName: string | null };
  proposedStartAt?: string | null;
  /** Open, but its time has passed (server clock). */
  overdue?: boolean;
  /** The time no longer works (clinic closed, dentist away): the front desk will call. */
  slotIssue?: { kind: string; message: string } | null;
  /** A confirmed visit the patient may cancel from the link until then. */
  cancelUntil?: string | null;
  /** Lookup by phone alone: who the request is for, masked ("N*** V** A*"). */
  patientInitials?: string;
  responseMessage?: string | null;
  appointment?: {
    startAt?: string;
    endAt?: string;
    status: string;
    /** The clinic moved the visit after confirming it. */
    rescheduled?: boolean;
  } | null;
};
type Access = { token?: string; phone?: string };
type Tone = "wait" | "action" | "good" | "bad";

/**
 * What the patient sees for each state: a headline and what happens next
 * (i18n keys, translated when shown).
 */
const STATE: Record<string, { title: string; text: string; tone: Tone; step: number }> = {
  PENDING_REVIEW: {
    title: "uiScheduling.bookingState_PENDING_REVIEW",
    text: "uiScheduling.bookingStateText_PENDING_REVIEW",
    tone: "wait",
    step: 2,
  },
  NEEDS_INFORMATION: {
    title: "uiScheduling.bookingState_NEEDS_INFORMATION",
    text: "uiScheduling.bookingStateText_NEEDS_INFORMATION",
    tone: "action",
    step: 2,
  },
  PROPOSED: {
    title: "uiScheduling.bookingState_PROPOSED",
    text: "uiScheduling.bookingProposedStateText",
    tone: "action",
    step: 2,
  },
  PATIENT_ACCEPTED: {
    title: "uiScheduling.bookingState_PATIENT_ACCEPTED",
    text: "uiScheduling.bookingStateText_PATIENT_ACCEPTED",
    tone: "wait",
    step: 2,
  },
  CONFIRMED: {
    title: "uiScheduling.bookingState_CONFIRMED",
    text: "uiScheduling.bookingStateText_CONFIRMED",
    tone: "good",
    step: 3,
  },
  DECLINED: {
    title: "uiScheduling.bookingState_DECLINED",
    text: "uiScheduling.bookingStateText_DECLINED",
    tone: "bad",
    step: 0,
  },
  CANCELLED: {
    title: "uiScheduling.bookingState_CANCELLED",
    text: "uiScheduling.bookingStateText_CANCELLED",
    tone: "bad",
    step: 0,
  },
  EXPIRED: {
    title: "uiScheduling.bookingState_EXPIRED",
    text: "uiScheduling.bookingStateText_EXPIRED",
    tone: "bad",
    step: 0,
  },
};
/** A confirmed request whose visit was later changed at the clinic. */
const VISIT_STATE: Record<string, { title: string; text: string; tone: Tone }> = {
  CANCELLED: {
    title: "uiScheduling.bookingVisitState_CANCELLED",
    text: "uiScheduling.bookingVisitStateText_CANCELLED",
    tone: "bad",
  },
  NO_SHOW: {
    title: "uiScheduling.bookingVisitState_NO_SHOW",
    text: "uiScheduling.bookingVisitStateText_NO_SHOW",
    tone: "bad",
  },
  CHECKED_IN: {
    title: "uiScheduling.bookingVisitState_AT_CLINIC",
    text: "uiScheduling.bookingVisitStateText_CHECKED_IN",
    tone: "good",
  },
  IN_PROGRESS: {
    title: "uiScheduling.bookingVisitState_AT_CLINIC",
    text: "uiScheduling.bookingVisitStateText_IN_PROGRESS",
    tone: "good",
  },
  LEFT: {
    title: "uiScheduling.bookingVisitState_LEFT",
    text: "uiScheduling.bookingVisitStateText_LEFT",
    tone: "bad",
  },
  COMPLETED: {
    title: "uiScheduling.bookingVisitState_COMPLETED",
    text: "uiScheduling.bookingVisitStateText_COMPLETED",
    tone: "good",
  },
};
const RESCHEDULED = {
  title: "uiScheduling.bookingVisitState_RESCHEDULED",
  text: "uiScheduling.bookingVisitStateText_RESCHEDULED",
  tone: "good" as Tone,
};
/** Visit states in which the booked time no longer stands. */
const VISIT_OVER = ["CANCELLED", "NO_SHOW", "LEFT", "COMPLETED"];
/**
 * What to show for a request: its own state, or for a confirmed one the
 * state of the visit it became (cancelled, missed, moved…).
 */
const stateOf = (s: Status) => {
  const visit =
    s.status === "CONFIRMED" && s.appointment
      ? VISIT_STATE[s.appointment.status] ??
        (s.appointment.rescheduled ? RESCHEDULED : undefined)
      : undefined;
  const state = visit ? { ...STATE.CONFIRMED, ...visit } : STATE[shownStatus(s)];
  return { visit, state };
};
const ACTIVE = ["PENDING_REVIEW", "NEEDS_INFORMATION", "PROPOSED", "PATIENT_ACCEPTED"];
/** Requests that can no longer change (confirmed, declined, withdrawn, expired). */
const CLOSED = ["CONFIRMED", "DECLINED", "CANCELLED", "EXPIRED"];
/**
 * An open request whose time has passed (the server says so, by its clock)
 * is shown as EXPIRED straight away; the server closes it within minutes.
 */
const shownStatus = (s: Status) =>
  s.overdue && ACTIVE.includes(s.status) ? "EXPIRED" : s.status;
const TONE_STYLE: Record<Tone, { box: string; icon: typeof Clock }> = {
  wait: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: Clock },
  action: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: AlertCircle },
  good: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2 },
  bad: { box: "border-gray-200 dark:border-surface-700 bg-gray-50 text-gray-800 dark:text-surface-200", icon: XCircle },
};

const when = (value?: string | null, language = "vi") =>
  value
    ? new Date(value).toLocaleString(language.toLowerCase().startsWith("en") ? "en-US" : "vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : "";

const googleCalendarUrl = (status: Status) => {
  const start = new Date(status.appointment!.startAt!);
  const end = status.appointment?.endAt
    ? new Date(status.appointment.endAt)
    : new Date(start.getTime() + (status.service?.durationMinutes ?? 30) * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${status.service?.name ?? i18n.t("uiScheduling.bookingCalendarTitleFallback")} — ${clinic.name}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: status.referenceCode
      ? i18n.t("uiScheduling.bookingCalendarDetailsWithRef", {
          reference: status.referenceCode,
          url: `${window.location.origin}/booking/status?ref=${status.referenceCode}`,
        })
      : i18n.t("uiScheduling.bookingCalendarDetails", { url: `${window.location.origin}/booking/status` }),
  });
  if (clinic.address) params.set("location", clinic.address);
  return "https://calendar.google.com/calendar/render?" + params.toString();
};

/** The server says the link was replaced by a newer email (ACCESS_ROTATED). */
const rotated = (e: unknown) =>
  (e as { response?: { data?: { code?: string } } })?.response?.data?.code === "ACCESS_ROTATED";

const headers = (a: Access) => ({
  ...(a.token ? { "x-booking-access-token": a.token } : {}),
  ...(a.phone ? { "x-booking-phone": a.phone } : {}),
});

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-300 dark:border-surface-600 px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

function CopyCode({ code, label }: { code: string; label?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(code).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
          () => undefined,
        );
      }}
      className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-2 py-1 text-xs font-medium text-gray-700 dark:text-surface-200 hover:bg-gray-50"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? t('uiScheduling.copied') : label ?? t('uiScheduling.copy')}
    </button>
  );
}

function Progress({ step }: { step: number }) {
  const { t } = useTranslation();
  const steps = [t('uiScheduling.bookingSent'), t('uiScheduling.clinicReview'), t('uiScheduling.statusConfirmed')];
  return (
    <ol className="mt-5 grid grid-cols-3 gap-2" aria-label={t('uiScheduling.bookingProgress')}>
      {steps.map((label, i) => {
        const done = i + 1 < step || step === 3;
        const current = i + 1 === step && step !== 3;
        return (
          <li key={label} className="text-center">
            <div
              className={
                "h-1.5 rounded-full " +
                (done ? "bg-brand-500" : current ? "bg-amber-400" : "bg-gray-200")
              }
            />
            <p
              className={
                "mt-2 text-xs sm:text-sm " +
                (done || current ? "font-medium text-gray-900 dark:text-surface-100" : "text-gray-400")
              }
              aria-current={current ? "step" : undefined}
            >
              {label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function ContactButtons() {
  const { t } = useTranslation();
  if (!clinic.phone && !clinic.zaloHref) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {clinic.phone && (
        <a
          href={`tel:${clinic.phoneHref}`}
          className="inline-flex items-center gap-2 rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          <Phone className="h-4 w-4" aria-hidden /> {t('uiScheduling.call')} {clinic.phone}
        </a>
      )}
      {clinic.zaloHref && (
        <a
          href={clinic.zaloHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          <MessageCircle className="h-4 w-4" aria-hidden /> {t('uiScheduling.messageZalo')}
        </a>
      )}
    </div>
  );
}

function DetailsForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (details: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  // The status page never shows the details sent earlier, so nothing is
  // prefilled; a field left empty keeps its old value. The phone and email
  // are changed only by calling the clinic.
  const [d, setD] = useState({
    fullName: "",
    dob: "",
    gender: "",
    contactPersonName: "",
    contactPersonPhone: "",
    reason: "",
  });
  const set = (key: keyof typeof d) => (e: { target: { value: string } }) =>
    setD((old) => ({ ...old, [key]: e.target.value }));
  const filled = Object.fromEntries(
    Object.entries(d)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v !== ""),
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(filled);
      }}
      className="mt-6 space-y-4 border-t border-gray-100 dark:border-surface-700 pt-5"
    >
      <h3 className="font-semibold text-gray-900 dark:text-surface-100">{t('uiScheduling.supplementDetails')}</h3>
      <p className="text-sm text-gray-600 dark:text-surface-300">
        {t('uiScheduling.detailsFormHint')}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700 dark:text-surface-200 sm:col-span-2">
          {t('uiScheduling.bookingFullName')}
          <input maxLength={200} value={d.fullName} onChange={set("fullName")} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
          {t('uiScheduling.bookingDob')}
          <input
            type="date"
            max={clinicToday()}
            value={d.dob}
            onChange={set("dob")}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
          {t('uiScheduling.gender')}
          <select value={d.gender} onChange={set("gender")} className={inputClass + " bg-white dark:bg-surface-900"}>
            <option value="">{t('uiScheduling.keepUnchanged')}</option>
            <option value="UNDISCLOSED">{t('uiScheduling.genderUndisclosed')}</option>
            <option value="FEMALE">{t('uiScheduling.genderFemale')}</option>
            <option value="MALE">{t('uiScheduling.genderMale')}</option>
            <option value="OTHER">{t('uiScheduling.genderOther')}</option>
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
          {t('uiScheduling.guardianIfChild')}
          <input value={d.contactPersonName} onChange={set("contactPersonName")} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-gray-700 dark:text-surface-200">
          {t('uiScheduling.guardianPhone')}
          <input type="tel" inputMode="tel" value={d.contactPersonPhone} onChange={set("contactPersonPhone")} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-gray-700 dark:text-surface-200 sm:col-span-2">
          {t('uiScheduling.bookingReason')}
          <textarea rows={3} value={d.reason} onChange={set("reason")} className={inputClass} />
        </label>
      </div>
      <button
        disabled={busy || Object.keys(filled).length === 0}
        className="w-full rounded-full bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60 sm:w-auto"
      >
        {t('uiScheduling.submitDetails')}
      </button>
    </form>
  );
}

export default function PublicBookingStatusPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const [params, setParams] = useSearchParams();
  const justBooked = params.get("new") === "1";
  const autoConfirmed = justBooked && params.get("auto") === "1";
  // Prefill the phone this device last booked or looked up with.
  const [phone, setPhone] = useState(() => loadSavedBookings().find((b) => b.phone)?.phone ?? "");
  // Every request made with the phone just looked up (when there are several).
  const [results, setResults] = useState<Status[] | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [declining, setDeclining] = useState(false);
  // The requester's optional note (withdrawing, turning a proposal down).
  const [note, setNote] = useState("");
  const [cancellingVisit, setCancellingVisit] = useState(false);
  // Information that is not an error (an old link replaced by a newer email).
  const [notice, setNotice] = useState("");
  const mailFailed = params.get("mail") === "0";

  const open = useCallback(async (ref: string, a: Access, quiet = false) => {
    setBusy(true);
    if (!quiet) setError("");
    try {
      const response = await api.get<{ data: Status }>(
        "/public/booking/requests/" + encodeURIComponent(ref),
        { headers: headers(a) },
      );
      const data = response.data.data;
      // A closed request cannot be changed any more: its token is not kept
      // on this device (the phone still shows the status). A confirmed visit
      // the patient may still cancel keeps it.
      const kept =
        CLOSED.includes(data.status) && !data.cancelUntil ? { phone: a.phone, token: undefined } : a;
      setStatus(data);
      setAccess(a);
      saveBooking({ ref: data.referenceCode ?? ref, ...kept });
      return true;
    } catch (e: unknown) {
      // A link replaced by a newer email: say so, and still show the status by phone.
      if (a.token && a.phone) {
        if (rotated(e)) setNotice(bookingErrorMessage(e, ""));
        return open(ref, { phone: a.phone }, quiet);
      }
      if (!quiet || rotated(e))
        setError(bookingErrorMessage(e, t("uiScheduling.bookingLookupWrongCode")));
      return false;
    } finally {
      setBusy(false);
    }
  }, [t]);

  // Open straight away when this device (or the email link) already knows how.
  // The token comes in the URL fragment (never sent to the server) and is
  // removed from the address bar at once; this device's copy is a fallback.
  useEffect(() => {
    const ref = normalizeReference(params.get("ref") ?? "");
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (fragment) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!ref) return;
    const known = findSavedBooking(ref);
    const a: Access | null = fragment
      ? { token: fragment, phone: known?.phone }
      : known?.token || known?.phone
        ? { token: known.token, phone: known.phone }
        : null;
    if (a) void open(ref, a, true);
    // Only on first load; later lookups go through the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A lookup by phone alone only shows the status (no code, no changes).
  const choose = (item: Status) => {
    setStatus(item);
    setAccess(null);
    setError("");
  };

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const byPhone = phone.trim();
    // An email link without the token (?ref=…): the code and the phone open
    // that request (still view only).
    const wanted = normalizeReference(params.get("ref") ?? "");
    if (wanted && (await open(wanted, { phone: byPhone }, true))) return;
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const response = await api.get<{ data: Status[] }>("/public/booking/lookup", {
        headers: { "x-booking-phone": byPhone },
      });
      const list = response.data.data;
      if (list.length === 0) {
        setError(t("uiScheduling.bookingLookupNoneByPhone"));
        return;
      }
      setResults(list);
      // One request: show it directly.
      if (list.length === 1) choose(list[0]);
    } catch (e: unknown) {
      setError(bookingErrorMessage(e, t("uiScheduling.bookingLookupFailed")));
    } finally {
      setBusy(false);
    }
  };

  const act = async (request: () => Promise<{ data: { data: Status } }>, fallback: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await request();
      setStatus((old) => ({ ...old, ...result.data.data }) as Status);
      // Withdrawn: nothing left to change, so the token is not kept.
      const ref = result.data.data.referenceCode ?? status?.referenceCode;
      if (ref && CLOSED.includes(result.data.data.status) && !result.data.data.cancelUntil)
        saveBooking({ ref, phone: access?.phone, token: undefined });
    } catch (e: unknown) {
      setError(bookingErrorMessage(e, fallback));
      // The link was replaced while this page was open: from now on the page
      // only shows the status (by phone), and says where the new link is.
      if (rotated(e)) {
        setAccess((old) => (old ? { phone: old.phone } : old));
        setStatus((old) => (old ? { ...old, canManage: false } : old));
      }
    } finally {
      setBusy(false);
      setConfirmCancel(false);
      setCancellingVisit(false);
      setDeclining(false);
      setNote("");
    }
  };
  const path = (suffix: string) =>
    "/public/booking/requests/" + encodeURIComponent(status!.referenceCode ?? "") + suffix;
  // Changes need the link token; a status shown by phone is read only.
  const canManage = !!status?.canManage && !!access?.token;
  const manageLink =
    status?.referenceCode && access?.token
      ? window.location.origin +
        "/booking/status?ref=" +
        encodeURIComponent(status.referenceCode) +
        "#token=" +
        encodeURIComponent(access.token)
      : "";

  const reset = () => {
    setStatus(null);
    setAccess(null);
    setResults(null);
    setError("");
    setNotice("");
    setParams({}, { replace: true });
  };

  const current = status ? shownStatus(status) : "";
  const { visit, state } = status ? stateOf(status) : { visit: undefined, state: undefined };
  // The visit still holds its (possibly moved) time.
  const visitStands =
    status?.status === "CONFIRMED" &&
    !!status.appointment &&
    !VISIT_OVER.includes(status.appointment.status);
  const tone = TONE_STYLE[state?.tone ?? "wait"];
  const ToneIcon = tone.icon;
  const time = status
    ? status.appointment?.startAt ??
      (["PROPOSED", "PATIENT_ACCEPTED"].includes(status.status) && status.proposedStartAt
        ? status.proposedStartAt
        : status.requestedStartAt)
    : "";
  const timeLabel = status?.appointment
    ? t('uiScheduling.bookingAppointmentTime')
    : ["PROPOSED", "PATIENT_ACCEPTED"].includes(status?.status ?? "") && status?.proposedStartAt
      ? t('uiScheduling.bookingProposedTime')
      : t('uiScheduling.bookingRequestedTime');

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-surface-950 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <PublicTopBar>
          <Link to="/booking" className="text-brand-600 hover:underline">
            {t('uiScheduling.publicBooking')}
          </Link>
        </PublicTopBar>

        {justBooked && status && (
          <section className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
              <div>
                <h1 className="text-lg font-semibold">
                  {autoConfirmed && status.status === "CONFIRMED" ? t('uiScheduling.bookingAutoConfirmedTitle') : t('uiScheduling.bookingSent')}
                </h1>
                <p className="mt-1 text-sm">
                  {autoConfirmed && status.status === "CONFIRMED" ? t('uiScheduling.bookingAutoConfirmedDetails') : t('uiScheduling.bookingSentDetails')} <strong className="font-mono">{status.referenceCode}</strong>.
                </p>
                {status.status === "PENDING_REVIEW" && (
                  <p className="mt-2 text-sm">
                    {status.holdUntil ? `${t('uiScheduling.bookingHeldNote')} ` : ''}
                    {t('uiScheduling.bookingResponsePromise', {
                      hours: clinic.hours[0]?.time ?? '',
                    })}
                  </p>
                )}
                {mailFailed && (
                  <p role="alert" className="mt-2 rounded-md bg-amber-100 p-2 text-sm text-amber-900">
                    {t('uiScheduling.bookingEmailFailed')}
                  </p>
                )}
                {manageLink && (
                  <div className="mt-2">
                    <CopyCode code={manageLink} label={t("uiScheduling.bookingCopyManageLink")} />
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {!status && results && results.length > 1 ? (
          <section className="rounded-2xl border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-5 shadow-sm sm:p-8">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiScheduling.yourAppointment')}</h1>
            <p className="mt-2 text-gray-600 dark:text-surface-300">
              {t('uiScheduling.bookingResultsFor', { phone, count: results.length })}
            </p>
            <ul className="mt-6 space-y-3">
              {results.map((item, index) => {
                const itemState = stateOf(item).state;
                const itemTime =
                  item.appointment?.startAt ??
                  (["PROPOSED", "PATIENT_ACCEPTED"].includes(item.status) && item.proposedStartAt
                    ? item.proposedStartAt
                    : item.requestedStartAt);
                return (
                  <li key={item.referenceCode ?? index}>
                    <button
                      type="button"
                      onClick={() => choose(item)}
                      className="w-full rounded-xl border border-gray-200 dark:border-surface-700 p-4 text-left hover:border-brand-200 hover:bg-brand-50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold capitalize text-gray-900 dark:text-surface-100">
                          {itemTime ? when(itemTime, language) : t('uiScheduling.bookingRequestNumber', { number: index + 1 })}
                        </span>
                        <span
                          className={
                            "rounded-full border px-2.5 py-0.5 text-xs font-medium " +
                            TONE_STYLE[itemState?.tone ?? "wait"].box
                          }
                        >
                          {itemState ? t(itemState.title) : item.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-surface-300">
                        {item.patientInitials
                          ? t('uiScheduling.bookingPatientInitials', { initials: item.patientInitials })
                          : (item.service?.name ?? "—") +
                            (item.dentist?.fullName ? " · " + item.dentist.fullName : "")}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={reset} className="mt-6 text-sm text-brand-600 hover:underline">
              ← {t('uiScheduling.lookupAnotherPhone')}
            </button>
          </section>
        ) : !status ? (
          <section className="rounded-2xl border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-5 shadow-sm sm:p-8">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiScheduling.bookingLookup')}</h1>
            <p className="mt-2 text-gray-600 dark:text-surface-300">{t('uiScheduling.bookingLookupHint')}</p>
            <form onSubmit={lookup} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-surface-200">
                {t('uiScheduling.phoneNumber')}
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901 234 567"
                  className={inputClass}
                />
              </label>
              {error && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              <button
                disabled={busy}
                className="w-full rounded-full bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {busy ? t('uiScheduling.bookingLookingUp') : t('uiScheduling.viewAppointments')}
              </button>
            </form>

            <div className="mt-8 border-t border-gray-100 dark:border-surface-700 pt-5 text-sm text-gray-600 dark:text-surface-300">
              <p>{t('uiScheduling.noAppointmentLookup')}</p>
              <div className="mt-3">
                <ContactButtons />
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-5 shadow-sm sm:p-8">
            {!justBooked && <h1 className="sr-only">{t('uiScheduling.bookingStatus')}</h1>}
            {status.referenceCode && access && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-500 dark:text-surface-400">
                  {t('uiScheduling.bookingReference')}{" "}
                  <span className="font-mono text-base font-semibold text-gray-900 dark:text-surface-100">{status.referenceCode}</span>
                </p>
                <div className="flex items-center gap-2">
                  <CopyCode code={status.referenceCode} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void open(status.referenceCode!, access)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-surface-700 px-2 py-1 text-xs font-medium text-gray-700 dark:text-surface-200 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <RefreshCw className={"h-3.5 w-3.5 " + (busy ? "animate-spin" : "")} aria-hidden /> {t('uiScheduling.refresh')}
                  </button>
                </div>
              </div>
            )}

            <div className={"mt-4 rounded-xl border p-4 " + tone.box} role="status">
              <div className="flex items-start gap-3">
                <ToneIcon className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
                <div>
                  <h2 className="text-lg font-semibold">{state ? t(state.title) : status.status}</h2>
                  {state && <p className="mt-1 text-sm leading-relaxed">{t(state.text)}</p>}
                </div>
              </div>
            </div>

            {status.slotIssue && (ACTIVE.includes(current) || visitStands) && (
              <p role="alert" className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                {status.slotIssue.message}
              </p>
            )}
            {notice && (
              <p className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{notice}</p>
            )}

            {(!visit || visitStands) && state && state.step > 0 && <Progress step={state.step} />}

            <dl className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-100 dark:border-surface-700">
              {time ? (
                <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                  <dt className="text-sm text-gray-500 dark:text-surface-400">{timeLabel}</dt>
                  <dd className="font-semibold capitalize text-gray-900 dark:text-surface-100">{when(time, language)}</dd>
                </div>
              ) : (
                // Looked up by phone alone: the time is only in the email's link.
                <p className="px-4 py-3 text-sm text-gray-600 dark:text-surface-300">{t('uiScheduling.bookingTimeHiddenByPhone')}</p>
              )}
              {status.patientInitials ? (
                // Shown by phone alone: who it is for, masked; no service or dentist.
                <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                  <dt className="text-sm text-gray-500 dark:text-surface-400">{t('uiScheduling.bookingPatient')}</dt>
                  <dd className="font-medium text-gray-900 dark:text-surface-100">{status.patientInitials}</dd>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                    <dt className="text-sm text-gray-500 dark:text-surface-400">{t('uiScheduling.service')}</dt>
                    <dd className="font-medium text-gray-900 dark:text-surface-100">
                      {status.service?.name ?? "—"}
                      {status.service?.durationMinutes ? (
                        <span className="font-normal text-gray-500 dark:text-surface-400"> · {t('uiScheduling.approximatelyMinutes', { minutes: status.service.durationMinutes })}</span>
                      ) : null}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                    <dt className="text-sm text-gray-500 dark:text-surface-400">{t('uiScheduling.dentist')}</dt>
                    <dd className="font-medium text-gray-900 dark:text-surface-100">{status.dentist?.fullName ?? t('uiScheduling.clinicWillArrange')}</dd>
                  </div>
                </>
              )}
              {status.status === "PROPOSED" && status.proposedStartAt && status.requestedStartAt && (
                <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                  <dt className="text-sm text-gray-500 dark:text-surface-400">{t('uiScheduling.bookingOriginalTime')}</dt>
                  <dd className="capitalize text-gray-500 dark:text-surface-400 line-through">{when(status.requestedStartAt, language)}</dd>
                </div>
              )}
              {clinic.address && (
                <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                  <dt className="text-sm text-gray-500 dark:text-surface-400">{t('uiScheduling.bookingAddress')}</dt>
                  <dd className="text-gray-900 dark:text-surface-100 sm:text-right">{clinic.address}</dd>
                </div>
              )}
            </dl>

            {status.responseMessage && (
              <div className="mt-4 rounded-xl bg-slate-50 dark:bg-surface-950 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-surface-400">{t('uiScheduling.clinicMessage')}</p>
                <p className="mt-1 text-gray-800 dark:text-surface-200">{status.responseMessage}</p>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            {ACTIVE.includes(current) && !canManage && (
              <p className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
                  {t('uiScheduling.bookingReadOnlyHint')}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-3 empty:hidden sm:flex-row sm:flex-wrap">
              {current === "PROPOSED" && canManage && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(
                      // The time on screen: refused if the clinic changed it meanwhile.
                      () =>
                        api.post(
                          path("/accept-proposal"),
                          { proposedStartAt: status.proposedStartAt ?? undefined },
                          { headers: headers(access!) },
                        ),
                      t('uiScheduling.errorAcceptProposal'),
                    )
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  <CalendarCheck className="h-5 w-5" aria-hidden /> {t('uiScheduling.acceptNewTime')}
                </button>
              )}
              {current === "PROPOSED" && canManage && !declining && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDeclining(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 dark:border-surface-600 px-5 py-3 font-semibold text-gray-700 dark:text-surface-200 hover:bg-gray-50 disabled:opacity-60"
                >
                  {t('uiScheduling.declineNewTime')}
                </button>
              )}
              {visitStands && !!status.appointment?.startAt && (
                <a
                  href={googleCalendarUrl(status)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600"
                >
                  <CalendarPlus className="h-5 w-5" aria-hidden /> {t('uiScheduling.addGoogleCalendar')}
                </a>
              )}
              {["DECLINED", "CANCELLED", "EXPIRED"].includes(current) || (visit && !visitStands) ? (
                <Link
                  to="/booking"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600"
                >
                  <CalendarCheck className="h-5 w-5" aria-hidden /> {t('uiScheduling.publicBooking')}
                </Link>
              ) : null}
            </div>

            {current === "PROPOSED" && canManage && declining && (
              <div className="mt-4 rounded-xl border border-gray-200 dark:border-surface-700 bg-slate-50 dark:bg-surface-950 p-4 text-sm">
                <label className="block font-medium text-gray-700 dark:text-surface-200">
                  {t('uiScheduling.bookingPreferredTimeHint')}
                  <textarea
                    rows={2}
                    maxLength={900}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('uiScheduling.bookingPreferredTimePlaceholder')}
                    className={inputClass}
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () =>
                          api.post(
                            path("/decline-proposal"),
                            {
                              proposedStartAt: status.proposedStartAt ?? undefined,
                              message: note.trim() || undefined,
                            },
                            { headers: headers(access!) },
                          ),
                        t('uiScheduling.errorDeclineProposal'),
                      )
                    }
                    className="rounded-full bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                  >
                    {t('uiScheduling.sendToReception')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeclining(false)}
                    className="rounded-full border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-4 py-2 font-medium text-gray-700 dark:text-surface-200"
                  >
                    {t('uiScheduling.back')}
                  </button>
                </div>
              </div>
            )}

            {current === "NEEDS_INFORMATION" && canManage && (
              <DetailsForm
                busy={busy}
                onSubmit={(details) =>
                  void act(
                    () => api.put<{ data: Status }>(path("/details"), details, { headers: headers(access!) }),
                    t('uiScheduling.errorUpdateDetails'),
                  )
                }
              />
            )}

            <div className="mt-8 border-t border-gray-100 dark:border-surface-700 pt-5">
              <p className="text-sm text-gray-600 dark:text-surface-300">{t('uiScheduling.bookingContactHint')}</p>
              <div className="mt-3">
                <ContactButtons />
              </div>
            </div>

            {ACTIVE.includes(current) && canManage && (
              <div className="mt-6 text-sm">
                {!confirmCancel ? (
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    className="text-gray-500 dark:text-surface-400 underline-offset-2 hover:text-red-600 hover:underline"
                  >
                    {t('uiScheduling.withdrawRequest')}
                  </button>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="font-medium text-red-800">{t('uiScheduling.confirmWithdraw', { reference: status.referenceCode })}</p>
                    <p className="mt-1 text-red-700">{t('uiScheduling.cancelFollowup')}</p>
                    <label className="mt-3 block text-red-800">
                      {t('uiScheduling.optionalReason')}
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className={inputClass}
                      />
                    </label>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () =>
                              api.post(
                                path("/withdraw"),
                                { message: note.trim() || undefined },
                                { headers: headers(access!) },
                              ),
                            t('uiScheduling.errorWithdraw'),
                          )
                        }
                        className="rounded-full bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {t('uiScheduling.withdrawRequestAction')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(false)}
                        className="rounded-full border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-4 py-2 font-medium text-gray-700 dark:text-surface-200"
                      >
                        {t('uiScheduling.keepRequest')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {visitStands && canManage && status.cancelUntil && (
              <div className="mt-6 text-sm">
                {new Date(status.cancelUntil).getTime() <= Date.now() ? (
                  <p className="text-gray-600 dark:text-surface-300">
                    {t('uiScheduling.cannotCancelOnline')}
                  </p>
                ) : !cancellingVisit ? (
                  <button
                    type="button"
                    onClick={() => setCancellingVisit(true)}
                    className="text-gray-500 dark:text-surface-400 underline-offset-2 hover:text-red-600 hover:underline"
                  >
                    {t('uiScheduling.cancelAppointmentRequest')}
                  </button>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="font-medium text-red-800">{t('uiScheduling.confirmCancelVisit', { time: when(time, language) })}</p>
                    <p className="mt-1 text-red-700">
                      {t('uiScheduling.cancelVisitNotice')}
                    </p>
                    <label className="mt-3 block text-red-800">
                      {t('uiScheduling.optionalReason')}
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className={inputClass}
                      />
                    </label>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () =>
                              api.post(
                                path("/cancel-visit"),
                                { message: note.trim() || undefined },
                                { headers: headers(access!) },
                              ),
                            t('uiScheduling.errorCancelVisit'),
                          )
                        }
                        className="rounded-full bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {t('uiScheduling.cancelAppointment')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancellingVisit(false)}
                        className="rounded-full border border-gray-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-4 py-2 font-medium text-gray-700 dark:text-surface-200"
                      >
                        {t('uiScheduling.keepAppointment')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {results && results.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setStatus(null);
                    setError("");
                  }}
                  className="text-brand-600 hover:underline"
                >
                  ← {t('uiScheduling.otherBookingsForPhone')}
                </button>
              )}
              <button type="button" onClick={reset} className="text-brand-600 hover:underline">
                {t('uiScheduling.lookupAnotherPhone')}
              </button>
            </div>
          </section>
        )}

        <p className="mt-6 text-center text-xs text-gray-500 dark:text-surface-400">
          {t('uiScheduling.bookingPrivacyNote')}
        </p>
      </div>
    </main>
  );
}
