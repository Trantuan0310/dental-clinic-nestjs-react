import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { clinicIso, clinicParts } from "@/lib/clinicTime";
import { bookingErrorMessage } from "./errorMessage";
import { notify } from "@/components/ui/Toast";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

type RequestRow = {
  id: string;
  referenceCode: string;
  fullName: string;
  dob: string;
  gender: string;
  phone: string;
  email?: string | null;
  contactPersonName?: string | null;
  contactPersonPhone?: string | null;
  requestedStartAt: string;
  proposedStartAt?: string | null;
  status: string;
  reason?: string | null;
  responseMessage?: string | null;
  /** The requester's own note (withdrawal, a proposed time turned down). */
  patientMessage?: string | null;
  service: { id: string; name: string; durationMinutes: number };
  preferredDentist: { id: string; fullName: string };
  proposedDentist?: { id: string; fullName: string } | null;
  appointment?: {
    id: string;
    status: string;
    startAt: string;
    dentist?: { id: string; fullName: string } | null;
  } | null;
  /** Why an open request can no longer be confirmed as it stands (server check). */
  slotIssue?: { kind: string; message: string } | null;
  /** Open requests made with this phone (the public form refuses it at 6). */
  openFromPhone?: number;
  /** The dentist is not taking new patients and this phone has no finished visit with them. */
  newPatientForDentist?: boolean;
  /** The front desk's own note (not shown to the patient). */
  receptionistNote?: string | null;
  /** The last email to the patient did not go out (or there was no email): call them. */
  noticeFailedAt?: string | null;
  noticeFailedSubject?: string | null;
};
/** Other open requests and upcoming visits of the same phone or person. */
type Related = {
  requests: Array<{ id: string; referenceCode: string; fullName: string; status: string; startAt: string }>;
  visits: Array<{
    id: string;
    startAt: string;
    status: string;
    patient: { code: string; fullName: string };
    dentist?: { fullName: string } | null;
    bookingRequest?: { id: string } | null;
  }>;
};
/** A visit in the next two days whose email reminder did not go out. */
type ReminderIssue = {
  appointmentId: string;
  startAt: string;
  reminderStatus: "BLOCKED" | "FAILED";
  reminderNote: string | null;
  patient: { fullName: string; primaryPhone: string | null };
  dentist?: { fullName: string } | null;
  referenceCode: string | null;
};
type PatientMatch = {
  id: string;
  code: string;
  fullName: string;
  dob: string;
  primaryPhone: string | null;
  contactPersonName?: string | null;
  contactPersonPhone?: string | null;
  /** Which of the record's phones is one of the request's phones. */
  matchedBy?: Array<"primaryPhone" | "contactPersonPhone" | "phoneHistory">;
  sameNameAndDob?: boolean;
  /** On another phone: picking it needs the identity checked. */
  differentPhone?: boolean;
  email?: string | null;
};
/** Patient choice value meaning "create a new record for this request". */
const NEW_PATIENT = "__new__";
const matchLabel = (p: PatientMatch, t: TFunction) =>
  [
    p.code,
    p.fullName,
    String(p.dob).slice(0, 10),
    p.matchedBy?.includes("contactPersonPhone")
      ? t('uiScheduling.matchGuardianPhone', { phone:
        p.contactPersonPhone +
        (p.contactPersonName ? " (" + p.contactPersonName + ")" : "") })
      : p.matchedBy?.includes("primaryPhone")
        ? t('uiScheduling.matchPhone', { phone: p.primaryPhone ?? '' })
        : p.matchedBy?.includes("phoneHistory")
          ? t('uiScheduling.matchFormerPhone', { phone: p.primaryPhone ?? '—' })
          : t('uiScheduling.matchOtherPhone', { phone: p.primaryPhone ?? '—' }),
    p.sameNameAndDob ? t('uiScheduling.matchSameNameDob') : '',
  ]
    .filter(Boolean)
    .join(" · ");
const REQUEST_STATES = ["PENDING_REVIEW", "NEEDS_INFORMATION", "PROPOSED", "PATIENT_ACCEPTED", "CONFIRMED", "DECLINED", "CANCELLED", "EXPIRED"];
const requestState = (t: TFunction, status: string) => t(`uiScheduling.bookingState_${status}`);
const visitState = (t: TFunction, status: string) => {
  const key: Record<string, string> = { SCHEDULED: 'statusScheduled', CONFIRMED: 'statusConfirmed', CHECKED_IN: 'statusCheckedIn', IN_PROGRESS: 'statusInProgress', COMPLETED: 'statusCompleted', CANCELLED: 'statusCancelled', NO_SHOW: 'statusNoShow', LEFT: 'statusLeft' };
  return key[status] ? t(`uiScheduling.${key[status]}`) : status;
};
/** Age on the clinic's today from a "YYYY-MM-DD…" date of birth. */
const ageOf = (dob: string) => {
  const [y, m, d] = String(dob).slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = clinicParts(new Date()).date.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};
/** The list's status: a confirmed request whose visit was cancelled says so. */
const rowStatus = (row: RequestRow, t: TFunction) =>
  row.status === "CONFIRMED" && row.appointment && ["CANCELLED", "NO_SHOW", "LEFT"].includes(row.appointment.status)
    ? t("uiScheduling.bookingConfirmedWithVisitStatus", { status: t(`uiScheduling.status${row.appointment.status === 'NO_SHOW' ? 'NoShow' : row.appointment.status === 'LEFT' ? 'Left' : 'Cancelled'}`).toLowerCase() })
    : requestState(t, row.status);
const OPEN = ["PENDING_REVIEW", "NEEDS_INFORMATION", "PROPOSED", "PATIENT_ACCEPTED"];
const CONFIRMABLE = ["PENDING_REVIEW", "PATIENT_ACCEPTED"];
const PROPOSAL = ["PROPOSED", "PATIENT_ACCEPTED"];
const SOON_MS = 2 * 60 * 60_000;
/**
 * The time the request is about: the booked visit's (it may have been
 * moved), else the proposed one while a proposal stands.
 */
const effectiveAt = (row: RequestRow) =>
  row.appointment?.startAt ??
  (PROPOSAL.includes(row.status) && row.proposedStartAt
    ? row.proposedStartAt
    : row.requestedStartAt);
/** Same idea for the dentist. */
const effectiveDentist = (row: RequestRow) =>
  row.appointment?.dentist?.fullName ??
  (PROPOSAL.includes(row.status) && row.proposedDentist
    ? row.proposedDentist.fullName
    : row.preferredDentist.fullName);
/** Open requests past their time (the server expires them within minutes) or close to it. */
const urgency = (row: RequestRow, now: number) => {
  if (!OPEN.includes(row.status) || row.appointment) return null;
  const left = new Date(effectiveAt(row)).getTime() - now;
  return left <= 0 ? "overdue" : left < SOON_MS ? "soon" : null;
};
/** An open request whose dentist, day or time no longer takes it. */
function SlotIssueBadge({ issue }: { issue?: RequestRow["slotIssue"] }) {
  const { t } = useTranslation();
  if (!issue) return null;
  return (
    <span
      title={issue.message}
      className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
    >
      {issue.kind === "SLOT_CONFLICT"
        ? t('uiScheduling.slotConflict')
        : t('uiScheduling.slotNoLongerAvailable')}
    </span>
  );
}
/** Open requests at which the public form refuses a phone (backend MAX_OPEN_PER_PHONE). */
const MAX_OPEN_PER_PHONE = 6;
/**
 * A phone at the online limit: its owner cannot book online until some of
 * these are handled; possibly someone else used the number to block it.
 */
function PhoneLimitBadge({ count, phone }: { count?: number; phone: string }) {
  const { t } = useTranslation();
  if (!count || count < MAX_OPEN_PER_PHONE) return null;
  return (
    <span
      title={t('uiScheduling.phoneOpenRequestLimitTitle', { phone, count })}
      className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800"
    >
      {t('uiScheduling.phoneOpenRequestCount', { count })}
    </span>
  );
}
function UrgencyBadge({ kind }: { kind: "overdue" | "soon" | null }) {
  const { t } = useTranslation();
  if (!kind) return null;
  return kind === "overdue" ? (
    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      {t('uiScheduling.overdue')}
    </span>
  ) : (
    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      {t('uiScheduling.dueSoon')}
    </span>
  );
}
const format = (value: string, locale = "vi-VN") =>
  new Date(value).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  });
// The datetime-local field holds clinic wall-clock time, whatever the
// workstation's time zone.
const inputDate = (value: string | Date) => {
  const { date, time } = clinicParts(value);
  return date + "T" + time;
};
const fromInputDate = (value: string) =>
  clinicIso(value.slice(0, 10), value.slice(11, 16));
/** Actions whose outcome the patient is emailed about (the server says if it went out). */
const NOTIFIED: Record<string, string> = {
  confirm: "bookingActionConfirmed",
  propose: "bookingActionProposed",
  decline: "bookingActionDeclined",
  "need-information": "bookingActionInformationRequested",
  "resend-link": "bookingActionLinkResent",
  contact: "bookingActionContactUpdated",
};
/** A patient who could not be emailed and must be called. */
type CallNotice = { action: string; name: string; phone: string; noEmail: boolean };

export default function BookingRequestsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "vi-VN";
  const formatInLocale = (value: string) => format(value, locale);
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [matches, setMatches] = useState<PatientMatch[]>([]);
  // False while the candidate records load, and for good if they fail to.
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [message, setMessage] = useState("");
  const [proposeAt, setProposeAt] = useState("");
  const [proposeDentist, setProposeDentist] = useState("");
  const [error, setError] = useState("");
  const [callNotice, setCallNotice] = useState<CallNotice | null>(null);
  // Search by reference code, phone or name (a patient at the desk).
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  // Picking a record on another phone: who checked it and how.
  const [identityChecked, setIdentityChecked] = useState(false);
  const [identityNote, setIdentityNote] = useState("");
  const [updatePhone, setUpdatePhone] = useState(false);
  const [updateEmail, setUpdateEmail] = useState(false);
  // A new record while one with this name and date of birth exists: checked by a person.
  const [newChecked, setNewChecked] = useState(false);
  const [spam, setSpam] = useState(false);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState({ phone: "", email: "", fullName: "", dob: "", reason: "" });
  // Re-evaluated every minute so "Sắp đến giờ" / "Quá giờ" stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ["booking-requests", filter, q],
    queryFn: async () =>
      (
        await api.get<{ data: RequestRow[] }>("/booking-requests", {
          params: { ...(filter ? { status: filter } : {}), ...(q ? { q } : {}) },
        })
      ).data.data,
    // New online requests show up without a manual refresh.
    refetchInterval: 60_000,
  });
  // Visits whose email reminder did not go out: the front desk calls them.
  const reminderIssues = useQuery({
    queryKey: ["booking-requests", "reminder-issues"],
    queryFn: async () =>
      (await api.get<{ data: ReminderIssue[] }>("/booking-requests/reminder-issues")).data.data,
    refetchInterval: 5 * 60_000,
  });
  const related = useQuery({
    queryKey: ["booking-requests", selected?.id, "related"],
    enabled: !!selected,
    queryFn: async () =>
      (await api.get<{ data: Related }>("/booking-requests/" + selected!.id + "/related")).data
        .data,
  });
  // Dentists this request may be moved to (online booking or not).
  const dentistOptions = useQuery({
    queryKey: ["booking-requests", selected?.id, "dentists"],
    enabled: !!selected,
    queryFn: async () =>
      (
        await api.get<{ data: Array<{ id: string; fullName: string }> }>(
          "/booking-requests/" + selected!.id + "/dentists",
        )
      ).data.data,
  });
  const dentists = useMemo(() => dentistOptions.data ?? [], [dentistOptions.data]);
  // The requested dentist may no longer be offered (suspended, service
  // stopped): make the front desk pick one instead of sending a stale id.
  useEffect(() => {
    const list = dentistOptions.data;
    if (list && proposeDentist && !list.some((d) => d.id === proposeDentist))
      setProposeDentist("");
  }, [dentistOptions.data, proposeDentist]);
  useEffect(() => {
    setMatches([]);
    setMatchesLoaded(false);
    setPatientId("");
    setError("");
    setMessage("");
    setIdentityChecked(false);
    setIdentityNote("");
    setUpdatePhone(false);
    setUpdateEmail(false);
    setNewChecked(false);
    setSpam(false);
    setEditing(false);
    setNote(selected?.receptionistNote ?? "");
    if (!selected) return;
    setContact({
      phone: selected.phone,
      email: selected.email ?? "",
      fullName: selected.fullName,
      dob: String(selected.dob).slice(0, 10),
      reason: "",
    });
    api
      .get<{ data: PatientMatch[] }>(
        "/booking-requests/" + selected.id + "/patient-matches",
      )
      .then((r) => {
        setMatches(r.data.data);
        setMatchesLoaded(true);
        // A single record with the same name and date of birth is the
        // likely one (a returning patient, maybe on a new phone): suggested.
        const same = r.data.data.filter((p) => p.sameNameAndDob);
        if (same.length === 1) setPatientId(same[0].id);
      })
      .catch(() => setMatches([]));
    setProposeDentist(selected.preferredDentist.id);
    // Never suggest a time that has already passed.
    const start = effectiveAt(selected);
    setProposeAt(new Date(start).getTime() > Date.now() ? inputDate(start) : "");
    // Reset the form only when a different request is opened, not when the
    // list refetch hands back a new object for the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const action = useMutation({
    mutationFn: async ({
      path,
      body,
      method = "post",
    }: {
      path: string;
      body?: unknown;
      method?: "post" | "patch" | "put";
    }) =>
      api[method]<{
        notificationSent?: boolean | null;
        alreadyConfirmed?: boolean;
        patientChangesNotApplied?: string[];
      }>(
        "/booking-requests/" + selected?.id + "/" + path,
        body ?? {},
      ),
    onSuccess: async (response, { path }) => {
      setError("");
      const done = NOTIFIED[path] ? t(`uiScheduling.${NOTIFIED[path]}`) : undefined;
      if (response.data?.patientChangesNotApplied?.length) {
        // Booked, but this account may not change patient records.
        notify.error(t('uiScheduling.bookingPatientUpdatePermissionError', { fields: response.data.patientChangesNotApplied.join(', ') }));
      }
      if (response.data?.alreadyConfirmed) {
        notify.success(t('uiScheduling.bookingAlreadyConfirmed'));
      } else if (done) {
        notify.success(done);
        // No email went out (none given, or sending failed): the patient
        // must be called, so say it where it stays visible.
        if (selected && response.data?.notificationSent === false) {
          setCallNotice({
            action: done,
            name: selected.fullName,
            phone: selected.phone,
            noEmail: !selected.email,
          });
        }
      } else {
        notify.success(t('uiScheduling.bookingRequestUpdated'));
      }
      // A confirmed request is now a visit: calendars and dashboard change too.
      if (path === "confirm") {
        void qc.invalidateQueries({ queryKey: ["appointments"] });
        void qc.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("dashboard"),
        });
      }
      await qc.invalidateQueries({ queryKey: ["booking-requests"] });
      await query.refetch();
      setSelected(null);
    },
    onError: async (e: unknown) => {
      const text = bookingErrorMessage(e, t('uiScheduling.bookingActionError'));
      setError(text);
      // 409: the request changed or its time passed meanwhile. Say so and
      // reload, so the dialog shows its current state and actions.
      if ((e as { response?: { status?: number } })?.response?.status === 409) {
        notify.error(text);
        const fresh = await query.refetch();
        const row = fresh.data?.find((r) => r.id === selected?.id);
        if (row) setSelected(row);
        setNow(Date.now());
      }
    },
  });
  const counts = useMemo(() => {
    const rows = query.data ?? [];
    return rows.reduce(
      (acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }),
      {} as Record<string, number>,
    );
  }, [query.data]);
  const overdue = selected ? urgency(selected, now) === "overdue" : false;
  const chosen = matches.find((p) => p.id === patientId);
  const duplicates = patientId === NEW_PATIENT ? matches.filter((p) => p.sameNameAndDob) : [];
  // Needs a person's "somebody else" tick: duplicates found, or none could be looked for.
  const newNeedsCheck = patientId === NEW_PATIENT && (duplicates.length > 0 || !matchesLoaded);
  const newBlocked = newNeedsCheck && !newChecked;
  /** The record choice and its options, as confirm takes them. */
  const confirmBody = () =>
    patientId === NEW_PATIENT
      ? { createNewPatient: true, ...(newChecked ? { confirmDistinctPerson: true } : {}) }
      : patientId
        ? {
            patientId,
            ...(chosen?.differentPhone
              ? {
                  confirmIdentity: identityChecked,
                  identityNote: identityNote.trim() || undefined,
                  updatePatientPhone: updatePhone,
                }
              : {}),
            ...(updateEmail ? { updatePatientEmail: true } : {}),
          }
        : {};
  // Today's visits of this phone or person not yet linked to a request:
  // the walk-in made for a patient who came with an unconfirmed code.
  const todayVisits = (related.data?.visits ?? []).filter(
    (v) => !v.bookingRequest && clinicParts(v.startAt).date === clinicParts(new Date(now)).date,
  );
  // Any open request can get a (new) time or dentist, a standing proposal or
  // one waiting on details included.
  const canPropose = !!selected && OPEN.includes(selected.status);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">
          {t('uiScheduling.bookingRequestsTitle')}
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-surface-300">
          {t('uiScheduling.bookingRequestsDescription')}
        </p>
      </div>
      {callNotice && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p>
            <strong>{callNotice.action}</strong> —{" "}
            {callNotice.noEmail ? t('uiScheduling.bookingNoEmail') : t('uiScheduling.bookingEmailFailedShort')}. {t('uiScheduling.bookingCallInstruction', { name: callNotice.name })}{" "}
            <a href={"tel:" + callNotice.phone} className="font-semibold underline">
              {callNotice.phone}
            </a>{" "}{t('uiScheduling.reportBookingOutcome')}
          </p>
          <button
            onClick={() => setCallNotice(null)}
            aria-label={t('uiScheduling.dismissCallReminder')}
            className="rounded px-2 py-1 text-amber-800 hover:bg-amber-100"
          >
            ✕
          </button>
        </div>
      )}
      {!!reminderIssues.data?.length && (
        <section
          role="alert"
          className="rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900"
        >
          <h2 className="font-semibold">
            {t('uiScheduling.reminderFailuresHeading', { count: reminderIssues.data.length })}
          </h2>
          <ul className="mt-2 space-y-1">
            {reminderIssues.data.map((r) => (
              <li key={r.appointmentId}>
                <strong>{formatInLocale(r.startAt)}</strong> · {r.patient.fullName}
                {r.patient.primaryPhone ? (
                  <>
                    {" "}
                    ·{" "}
                    <a href={"tel:" + r.patient.primaryPhone} className="underline">
                      {r.patient.primaryPhone}
                    </a>
                  </>
                ) : null}
                {r.dentist ? " · " + r.dentist.fullName : ""}
                {r.referenceCode ? " · " + r.referenceCode : ""} —{" "}
                {r.reminderStatus === "BLOCKED"
                  ? t('uiScheduling.reminderBlockedReason', { reason: r.reminderNote ?? '' })
                  : r.reminderNote}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {["PENDING_REVIEW", "PROPOSED", "PATIENT_ACCEPTED", "CONFIRMED"].map(
          (k) => (
            <div key={k} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-surface-700 dark:bg-surface-900">
              <div className="text-xs text-gray-500 dark:text-surface-400">{requestState(t, k)}</div>
              <div className="mt-1 text-xl font-semibold">{counts[k] ?? 0}</div>
            </div>
          ),
        )}
      </div>
      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
        >
          <option value="">{t('uiScheduling.allStatuses')}</option>
          {REQUEST_STATES.map((s) => (
            <option key={s} value={s}>
              {requestState(t, s)}
            </option>
          ))}
        </select>
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search.trim());
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('uiScheduling.searchBookingRequests')}
            aria-label={t('uiScheduling.searchBookingRequests')}
            className="w-full max-w-sm rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
          />
          <button className="rounded-md border bg-white px-3 py-2 text-sm dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100">{t('uiScheduling.searchButton')}</button>
          {q && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setQ("");
              }}
              className="text-sm text-gray-500 underline dark:text-surface-400"
            >
              {t('uiScheduling.clearFilters')}
            </button>
          )}
        </form>
        <button
          onClick={() => query.refetch()}
          className="rounded-md border bg-white px-3 py-2 text-sm dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
        >
          {t('uiScheduling.refresh')}
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900">
        {query.isLoading ? (
          <p className="p-6 text-gray-500 dark:text-surface-400">{t('uiScheduling.loadingBookingRequests')}</p>
        ) : query.isError ? (
          <p className="p-6 text-red-700 dark:text-red-300">{t('uiScheduling.bookingRequestsLoadError')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-gray-600 dark:bg-surface-800 dark:text-surface-300">
              <tr>
                <th className="px-4 py-3">{t('uiScheduling.referencePatient')}</th>
                <th className="px-4 py-3">{t('uiScheduling.service')}</th>
                <th className="px-4 py-3">{t('uiScheduling.dentist')}</th>
                <th className="px-4 py-3">{t('uiScheduling.appointmentTime')}</th>
                <th className="px-4 py-3">{t('uiScheduling.status')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {query.data?.map((row) => (
                <tr className="border-t" key={row.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.fullName}</div>
                    <div className="text-xs text-gray-500 dark:text-surface-400">
                      {row.referenceCode} · {row.phone}
                    </div>
                  </td>
                  <td className="px-4 py-3">{row.service.name}</td>
                  <td className="px-4 py-3">{effectiveDentist(row)}</td>
                  <td className="px-4 py-3">
                    {formatInLocale(effectiveAt(row))}
                    {!row.appointment && effectiveAt(row) !== row.requestedStartAt && (
                      <div className="text-xs text-gray-500 dark:text-surface-400">{t('uiScheduling.proposedTime')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {rowStatus(row, t)}
                    {row.noticeFailedAt && (
                      <span
                        title={t('uiScheduling.noticeFailedFor', { subject: row.noticeFailedSubject ?? '' })}
                        className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                      >
                        {t('uiScheduling.callPatient')}
                      </span>
                    )}
                    <UrgencyBadge kind={urgency(row, now)} />
                    <SlotIssueBadge issue={row.slotIssue} />
                    <PhoneLimitBadge count={row.openFromPhone} phone={row.phone} />
                    {row.newPatientForDentist && (
                      <span
                        title={t('uiScheduling.newPatientForDentistTitle')}
                        className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
                      >
                        {t('uiScheduling.newPatientForDentist')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(row)}
                      className="rounded-md border px-3 py-1.5 text-teal-800 dark:border-surface-600 dark:text-teal-300"
                    >
                      {t('uiScheduling.handleRequest')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!query.isLoading && !query.isError && !query.data?.length && (
          <p className="p-8 text-center text-sm text-gray-500 dark:text-surface-400">
            {t('uiScheduling.noBookingRequests')}
          </p>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <section className="my-4 w-full max-w-2xl rounded-xl bg-white p-5 text-gray-900 shadow-xl dark:bg-surface-900 dark:text-surface-100 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{selected.fullName}</h2>
                <p className="text-sm text-gray-500 dark:text-surface-400">
                  {selected.referenceCode} · {requestState(t, selected.status)}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label={t('uiScheduling.close')}
                className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 dark:text-surface-400 dark:hover:bg-surface-700"
              >
                ✕
              </button>
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500 dark:text-surface-400">{t('uiScheduling.phoneNumber')} / {t('uiScheduling.email')}</dt>
                <dd>
                  {selected.phone}
                  {selected.email ? " · " + selected.email : ""}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-surface-400">{t('uiScheduling.dateOfBirth')}</dt>
                <dd>{String(selected.dob).slice(0, 10)}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-surface-400">{t('uiScheduling.service')}</dt>
                <dd>
                  {selected.service.name} · {t('uiScheduling.minutesValue', { count: selected.service.durationMinutes })}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-surface-400">{t('uiScheduling.requestedTime')}</dt>
                <dd>{formatInLocale(selected.requestedStartAt)}</dd>
              </div>
              {selected.proposedStartAt && (
                <div>
                  <dt className="text-gray-500 dark:text-surface-400">{t('uiScheduling.bookingProposedTime')}</dt>
                  <dd>{formatInLocale(selected.proposedStartAt)}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500 dark:text-surface-400">{t('uiScheduling.preferredDentist')}</dt>
                <dd>{selected.preferredDentist.fullName}</dd>
              </div>
              {PROPOSAL.includes(selected.status) && selected.proposedStartAt && (
                <div>
                  <dt className="text-gray-500 dark:text-surface-400">{t('uiScheduling.proposedDentist')}</dt>
                  <dd>
                    {(selected.proposedDentist ?? selected.preferredDentist).fullName}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500 dark:text-surface-400">{t('uiScheduling.guardian')}</dt>
                <dd>
                  {selected.contactPersonName || "—"}{" "}
                  {selected.contactPersonPhone || ""}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-500 dark:text-surface-400">{t('uiScheduling.visitReason')}</dt>
                <dd>{selected.reason || "—"}</dd>
              </div>
              {selected.patientMessage && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-500 dark:text-surface-400">{t('uiScheduling.patientMessage')}</dt>
                  <dd className="rounded bg-sky-50 p-2 text-sky-900">{selected.patientMessage}</dd>
                </div>
              )}
            </dl>
            {selected.appointment && (
              <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-800">
                {t('uiScheduling.bookingAppointmentCreated')} {formatInLocale(selected.appointment.startAt)}
                {selected.appointment.dentist
                  ? " · " + selected.appointment.dentist.fullName
                  : ""}{" "}
                ({visitState(t, selected.appointment.status)})
              </p>
            )}
            {ageOf(selected.dob) < 18 && (
              <p className="mt-3 rounded bg-sky-50 p-2 text-xs text-sky-900">
                {t('uiScheduling.minorPatientReminder', { age: ageOf(selected.dob) })}
              </p>
            )}
            {selected.noticeFailedAt && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded bg-amber-50 p-3 text-sm text-amber-900">
                <span>
                  {t('uiScheduling.noticeFailedFor', { subject: selected.noticeFailedSubject })} {selected.email ? t('uiScheduling.bookingEmailFailedShort') : t('uiScheduling.bookingNoEmail')}. {t('uiScheduling.callPatient')}{" "}
                  <a href={"tel:" + selected.phone} className="font-semibold underline">
                    {selected.phone}
                  </a>
                  .
                </span>
                <button
                  disabled={action.isPending}
                  onClick={() => action.mutate({ path: "called" })}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs dark:border-amber-700 dark:bg-surface-800 dark:text-surface-100"
                >
                  {t('uiScheduling.patientCalled')}
                </button>
              </div>
            )}
            {(!!related.data?.requests.length || !!related.data?.visits.length) && (
              <div className="mt-4 rounded bg-violet-50 p-3 text-sm text-violet-900">
                <p className="font-medium">
                  {t('uiScheduling.relatedBookingsHeading')}
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {related.data?.requests.map((r) => (
                    <li key={r.id}>
                      {t('uiScheduling.bookingRequestInline', { reference: r.referenceCode, name: r.fullName, time: formatInLocale(r.startAt) })}{" "}
                      {requestState(t, r.status)}
                    </li>
                  ))}
                  {related.data?.visits.map((v) => (
                    <li key={v.id}>
                      {t('uiScheduling.bookingVisitInline', { time: formatInLocale(v.startAt), name: v.patient.fullName, code: v.patient.code })}
                      {v.dentist ? " · " + v.dentist.fullName : ""} ·{" "}
                      {visitState(t, v.status)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {overdue && (
              <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
                {t('uiScheduling.bookingOverdueActionHint')}
              </p>
            )}
            {selected.slotIssue && !overdue && (
              <p className="mt-4 rounded bg-orange-50 p-3 text-sm text-orange-900">
                {t('uiScheduling.bookingSlotIssueHint', { reason: selected.slotIssue.message })}
              </p>
            )}
            {selected.status === "EXPIRED" && (
              <p className="mt-4 rounded bg-slate-100 p-3 text-sm text-gray-700 dark:bg-surface-800 dark:text-surface-200">
                {t('uiScheduling.bookingExpiredHint')}
              </p>
            )}
            {CONFIRMABLE.includes(selected.status) && (
              <div className="mt-5">
                <label className="block text-sm font-medium">
                  {t('uiScheduling.patientRecordForBooking')}
                  <select
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-white px-3 py-2 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
                  >
                    <option value="">
                      {t('uiScheduling.autoMatchOrCreatePatient')}
                    </option>
                    <option value={NEW_PATIENT}>
                      {t('uiScheduling.createNewRecordFor', { name: selected.fullName })}
                    </option>
                    {matches.map((p) => (
                      <option key={p.id} value={p.id}>
                        {matchLabel(p, t)}
                      </option>
                    ))}
                  </select>
                </label>
                {matches.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    {t('uiScheduling.patientMatchWarning', { count: matches.length })}
                  </p>
                )}
                {chosen?.sameNameAndDob && !chosen.differentPhone && (
                  <p className="mt-1 text-xs text-teal-700 dark:text-teal-300">
                    {t('uiScheduling.matchSuggestedHint')}
                  </p>
                )}
                {newNeedsCheck && (
                  <div className="mt-2 space-y-2 rounded bg-red-50 p-3 text-sm text-red-800">
                    <p>
                      {duplicates.length > 0
                        ? t('uiScheduling.newRecordDuplicateWarning', {
                            names: duplicates.map((p) => p.code + ' ' + p.fullName).join(', '),
                          })
                        : t('uiScheduling.newRecordUnchecked')}
                    </p>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newChecked}
                        onChange={(e) => setNewChecked(e.target.checked)}
                      />
                      {t('uiScheduling.newRecordDuplicateConfirm')}
                    </label>
                  </div>
                )}
                {chosen?.differentPhone && (
                  <div className="mt-2 space-y-2 rounded bg-amber-50 p-3 text-sm text-amber-900">
                    <p>
                      {t('uiScheduling.differentPhoneIdentityWarning', { phone: chosen.primaryPhone ?? '—' })}
                    </p>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={identityChecked}
                        onChange={(e) => setIdentityChecked(e.target.checked)}
                      />
                      {t('uiScheduling.identityVerified')}
                    </label>
                    <input
                      value={identityNote}
                      onChange={(e) => setIdentityNote(e.target.value)}
                      placeholder={t('uiScheduling.identityVerificationExample')}
                      className="w-full rounded-md border px-3 py-1.5"
                    />
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={updatePhone}
                        onChange={(e) => setUpdatePhone(e.target.checked)}
                      />
                      {t('uiScheduling.updatePatientPhone', { phone: selected.phone })}
                    </label>
                  </div>
                )}
                {chosen && selected.email && (
                  <p className="mt-2 text-xs text-gray-600 dark:text-surface-300">
                    {/* The email was typed on the public form: saved only when ticked (after checking with the patient). */}
                    {!chosen.email || chosen.email.toLowerCase() !== selected.email.toLowerCase() ? (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={updateEmail}
                          onChange={(e) => setUpdateEmail(e.target.checked)}
                        />
                        {chosen.email
                          ? t('uiScheduling.replacePatientEmail', { current: chosen.email, email: selected.email })
                          : t('uiScheduling.savePatientEmail', { email: selected.email })}
                      </label>
                    ) : null}
                  </p>
                )}
              </div>
            )}
            {canPropose && (
              <div className="mt-5 rounded-lg bg-slate-50 p-4 dark:bg-surface-800">
                <h3 className="font-semibold">{t('uiScheduling.alternativeTime')}</h3>
                {dentistOptions.isSuccess && dentists.length === 0 && (
                  <p className="mt-2 rounded bg-orange-50 p-2 text-sm text-orange-900">
                    {t('uiScheduling.noDentistCanProvideService')}
                  </p>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    {t('uiScheduling.dentist')}
                    <select
                      value={proposeDentist}
                      onChange={(e) => setProposeDentist(e.target.value)}
                      className="mt-1 w-full rounded-md border bg-white px-3 py-2 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
                    >
                      <option value="">
                        {dentistOptions.isLoading ? t('uiScheduling.loading') : t('uiScheduling.chooseDentist')}
                      </option>
                      {dentists.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    {t('uiScheduling.dateAndTime')}
                    <input
                      type="datetime-local"
                      min={inputDate(new Date(now))}
                      value={proposeAt}
                      onChange={(e) => setProposeAt(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2"
                    />
                  </label>
                </div>
              </div>
            )}
            {OPEN.includes(selected.status) && (
              <details className="mt-4 rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  {t('uiScheduling.patientAtReceptionWithReference', { reference: selected.referenceCode })}
                </summary>
                <p className="mt-2 text-gray-600 dark:text-surface-300">
                  {t('uiScheduling.linkWalkInToRequestHint')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {todayVisits.map((v) => (
                    <button
                      key={v.id}
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({ path: "arrived", body: { appointmentId: v.id } })
                      }
                      className="rounded-md border border-teal-700 px-3 py-1.5 text-teal-800 disabled:opacity-50 dark:border-teal-500 dark:text-teal-300"
                    >
                      {t('uiScheduling.linkVisit', { time: clinicParts(v.startAt).time, name: v.patient.fullName })}
                    </button>
                  ))}
                  <button
                    disabled={action.isPending}
                    onClick={() => action.mutate({ path: "arrived", body: {} })}
                    className="rounded-md border px-3 py-1.5 disabled:opacity-50"
                  >
                    {t('uiScheduling.closeRequestPatientArrived')}
                  </button>
                </div>
              </details>
            )}
            {OPEN.includes(selected.status) && (
              <details
                className="mt-3 rounded-lg border p-3 text-sm"
                open={editing}
                onToggle={(e) => setEditing((e.target as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer font-medium">
                  {t('uiScheduling.editBookingContactSummary')}
                </summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["fullName", t('uiScheduling.fullName')],
                      ["dob", t('uiScheduling.dateOfBirthFormat')],
                      ["phone", t('uiScheduling.phoneNumber')],
                      ["email", t('uiScheduling.emailClearToDelete')],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-xs text-gray-600 dark:text-surface-300">
                      {label}
                      <input
                        value={contact[key]}
                        onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
                        className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm text-gray-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
                      />
                    </label>
                  ))}
                  <label className="text-xs text-gray-600 sm:col-span-2 dark:text-surface-300">
                    {t('uiScheduling.contactEditReason')}
                    <input
                      value={contact.reason}
                      onChange={(e) => setContact((c) => ({ ...c, reason: e.target.value }))}
                      className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm text-gray-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
                    />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    disabled={action.isPending || contact.reason.trim().length < 3}
                    onClick={() =>
                      action.mutate({
                        path: "contact",
                        method: "patch",
                        body: {
                          reason: contact.reason.trim(),
                          ...(contact.fullName.trim() !== selected.fullName
                            ? { fullName: contact.fullName.trim() }
                            : {}),
                          ...(contact.dob !== String(selected.dob).slice(0, 10) ? { dob: contact.dob } : {}),
                          ...(contact.phone.trim() !== selected.phone ? { phone: contact.phone.trim() } : {}),
                          ...(contact.email.trim() !== (selected.email ?? "")
                            ? { email: contact.email.trim() }
                            : {}),
                        },
                      })
                    }
                    className="rounded-md bg-slate-700 px-3 py-1.5 text-white disabled:opacity-50"
                  >
                    {t('uiScheduling.saveInformation')}
                  </button>
                  {selected.email && (
                    <button
                      disabled={action.isPending}
                      onClick={() => action.mutate({ path: "resend-link" })}
                      className="rounded-md border px-3 py-1.5 disabled:opacity-50"
                    >
                      {t('uiScheduling.resendBookingLink')}
                    </button>
                  )}
                </div>
              </details>
            )}
            <label className="mt-3 block text-sm font-medium">
              {t('uiScheduling.receptionistNote')}
              <div className="mt-1 flex gap-2">
                <textarea
                  rows={1}
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('uiScheduling.receptionistNoteExample')}
                  className="w-full rounded-md border px-3 py-2 text-sm font-normal"
                />
                <button
                  type="button"
                  disabled={action.isPending || note === (selected.receptionistNote ?? "")}
                  onClick={() => action.mutate({ path: "note", method: "put", body: { note } })}
                  className="rounded-md border px-3 text-sm font-normal disabled:opacity-50"
                >
                  {t('uiScheduling.save')}
                </button>
              </div>
            </label>
            {OPEN.includes(selected.status) && (
              <label className="mt-4 block text-sm font-medium">
                {t('uiScheduling.messageToPatient')}
                <textarea
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    canPropose
                      ? t('uiScheduling.patientMessageProposalPlaceholder')
                      : t('uiScheduling.patientMessagePlaceholder')
                  }
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-normal"
                />
              </label>
            )}
            {error && (
              <p
                role="alert"
                className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t pt-4">
              {CONFIRMABLE.includes(selected.status) && !overdue && (
                <button
                  disabled={action.isPending || newBlocked}
                  onClick={() => action.mutate({ path: "confirm", body: confirmBody() })}
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {t('uiScheduling.confirmAppointment')}
                </button>
              )}
              {/* The patient asked for / agreed to the alternative time by phone: book it now. */}
              {canPropose && (
                <button
                  disabled={action.isPending || !proposeAt || !proposeDentist || newBlocked}
                  onClick={() =>
                    action.mutate({
                      path: "confirm",
                      body: {
                        ...confirmBody(),
                        dentistId: proposeDentist,
                        startAt: fromInputDate(proposeAt),
                      },
                    })
                  }
                  title={t('uiScheduling.confirmAgreedAlternativeByPhoneHint')}
                  className="rounded-md border border-teal-700 px-4 py-2 text-sm text-teal-800 disabled:opacity-50 dark:border-teal-500 dark:text-teal-300"
                >
                  {t('uiScheduling.confirmAlternativeTimeNow')}
                </button>
              )}
              {canPropose && (
                <button
                  disabled={
                    action.isPending ||
                    !message.trim() ||
                    !proposeAt ||
                    !proposeDentist
                  }
                  onClick={() =>
                    action.mutate({
                      path: "propose",
                      body: {
                        dentistId: proposeDentist,
                        startAt: fromInputDate(proposeAt),
                        message,
                      },
                    })
                  }
                  className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                >
                  {t('uiScheduling.proposeAnotherTime')}
                </button>
              )}
              {/* The patient answered by phone. */}
              {selected.status === "NEEDS_INFORMATION" && !overdue && (
                <button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: "information-received",
                      body: message.trim() ? { note: message.trim() } : {},
                    })
                  }
                  className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                >
                  {t('uiScheduling.informationReceived')}
                </button>
              )}
              {selected.status === "PROPOSED" && !overdue && (
                <button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: "accepted-by-phone",
                      body: message.trim() ? { note: message.trim() } : {},
                    })
                  }
                  className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                >
                  {t('uiScheduling.patientAcceptedByPhone')}
                </button>
              )}
              {/* Not while a proposal stands: it would drop the agreed time. */}
              {selected.status === "PENDING_REVIEW" && !overdue && (
                <button
                  disabled={action.isPending || !message.trim()}
                  onClick={() =>
                    action.mutate({
                      path: "need-information",
                      body: { message },
                    })
                  }
                  className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                >
                  {t('uiScheduling.requestMoreInformation')}
                </button>
              )}
              {!["CONFIRMED", "DECLINED", "CANCELLED", "EXPIRED"].includes(
                selected.status,
              ) && (
                <>
                  <button
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({
                        path: "cancelled-by-phone",
                        body: message.trim() ? { note: message.trim() } : {},
                      })
                    }
                    className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {t('uiScheduling.patientCancelledByPhone')}
                  </button>
                  <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-surface-300">
                    <input
                      type="checkbox"
                      checked={spam}
                      onChange={(e) => setSpam(e.target.checked)}
                    />
                    {t('uiScheduling.markAsSpam')}
                  </label>
                  <button
                    disabled={action.isPending || !message.trim()}
                    onClick={() =>
                      action.mutate({
                        path: "decline",
                        body: { message, ...(spam ? { spam: true } : {}) },
                      })
                    }
                    className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700 disabled:opacity-50"
                  >
                    {t('uiScheduling.declineRequest')}
                  </button>
                </>
              )}
              <button
                onClick={() => setSelected(null)}
                className="rounded-md border px-4 py-2 text-sm"
              >
                {t('uiScheduling.close')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
