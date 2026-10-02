import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { clinicIso, clinicParts } from "@/lib/clinicTime";
import { bookingErrorMessage } from "./errorMessage";
import { notify } from "@/components/ui/Toast";

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
const matchLabel = (p: PatientMatch) =>
  [
    p.code,
    p.fullName,
    String(p.dob).slice(0, 10),
    p.matchedBy?.includes("contactPersonPhone")
      ? "khớp SĐT người giám hộ " +
        p.contactPersonPhone +
        (p.contactPersonName ? " (" + p.contactPersonName + ")" : "")
      : p.matchedBy?.includes("primaryPhone")
        ? "khớp SĐT " + (p.primaryPhone ?? "")
        : p.matchedBy?.includes("phoneHistory")
          ? "SĐT cũ của hồ sơ, hiện là " + (p.primaryPhone ?? "—")
          : "SĐT khác: " + (p.primaryPhone ?? "—"),
    p.sameNameAndDob ? "trùng tên và ngày sinh" : "",
  ]
    .filter(Boolean)
    .join(" · ");
const stateLabel: Record<string, string> = {
  PENDING_REVIEW: "Chờ xử lý",
  NEEDS_INFORMATION: "Chờ bổ sung",
  PROPOSED: "Chờ bệnh nhân đồng ý",
  PATIENT_ACCEPTED: "Chờ lễ tân xác nhận",
  CONFIRMED: "Đã xác nhận",
  DECLINED: "Từ chối",
  CANCELLED: "Đã hủy / rút",
  EXPIRED: "Quá hạn",
};
const visitLabel: Record<string, string> = {
  SCHEDULED: "Đã đặt",
  CONFIRMED: "Đã xác nhận",
  CHECKED_IN: "Đã đến",
  IN_PROGRESS: "Đang khám",
  COMPLETED: "Đã khám xong",
  CANCELLED: "Đã hủy",
  NO_SHOW: "Vắng mặt",
  LEFT: "Đã về",
};
/** Age on the clinic's today from a "YYYY-MM-DD…" date of birth. */
const ageOf = (dob: string) => {
  const [y, m, d] = String(dob).slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = clinicParts(new Date()).date.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};
/** The list's status: a confirmed request whose visit was cancelled says so. */
const rowStatus = (row: RequestRow) =>
  row.status === "CONFIRMED" && row.appointment && ["CANCELLED", "NO_SHOW", "LEFT"].includes(row.appointment.status)
    ? "Đã xác nhận · lịch " + (visitLabel[row.appointment.status] ?? "").toLowerCase()
    : (stateLabel[row.status] ?? row.status);
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
  if (!issue) return null;
  return (
    <span
      title={issue.message}
      className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
    >
      {issue.kind === "SLOT_CONFLICT"
        ? "Giờ này đã có lịch khác"
        : "Bác sĩ/khung giờ không còn nhận lịch"}
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
  if (!count || count < MAX_OPEN_PER_PHONE) return null;
  return (
    <span
      title={`SĐT ${phone} đang có ${count} yêu cầu mở nên không đặt thêm trực tuyến được. Nếu khách không gửi các yêu cầu này, hãy từ chối những yêu cầu lạ.`}
      className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800"
    >
      SĐT có {count} yêu cầu mở
    </span>
  );
}
function UrgencyBadge({ kind }: { kind: "overdue" | "soon" | null }) {
  if (!kind) return null;
  return kind === "overdue" ? (
    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      Quá giờ
    </span>
  ) : (
    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      Sắp đến giờ
    </span>
  );
}
const format = (value: string) =>
  new Date(value).toLocaleString("vi-VN", {
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
  confirm: "Đã xác nhận lịch hẹn",
  propose: "Đã đề xuất giờ khác",
  decline: "Đã từ chối yêu cầu",
  "need-information": "Đã yêu cầu bổ sung thông tin",
  "resend-link": "Đã gửi lại đường link cho khách",
  contact: "Đã sửa thông tin liên hệ",
};
/** A patient who could not be emailed and must be called. */
type CallNotice = { action: string; name: string; phone: string; noEmail: boolean };

export default function BookingRequestsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [matches, setMatches] = useState<PatientMatch[]>([]);
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
    setPatientId("");
    setError("");
    setMessage("");
    setIdentityChecked(false);
    setIdentityNote("");
    setUpdatePhone(false);
    setUpdateEmail(false);
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
      api[method]<{ notificationSent?: boolean | null; alreadyConfirmed?: boolean }>(
        "/booking-requests/" + selected?.id + "/" + path,
        body ?? {},
      ),
    onSuccess: async (response, { path }) => {
      setError("");
      const done = NOTIFIED[path];
      if (response.data?.alreadyConfirmed) {
        notify.success("Yêu cầu đã được xác nhận trước đó, không tạo thêm lịch");
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
        notify.success("Đã cập nhật yêu cầu");
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
      const text = bookingErrorMessage(e, "Không thực hiện được thao tác.");
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
  /** The record choice and its options, as confirm takes them. */
  const confirmBody = () =>
    patientId === NEW_PATIENT
      ? { createNewPatient: true }
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
        <h1 className="text-2xl font-semibold text-gray-900">
          Yêu cầu đặt lịch trực tuyến
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Lễ tân kiểm tra thông tin, giờ trống và xác nhận trước khi tạo lịch
          chính thức.
        </p>
      </div>
      {callNotice && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p>
            <strong>{callNotice.action}</strong> —{" "}
            {callNotice.noEmail ? "khách không có email" : "gửi email cho khách bị lỗi"}.
            Hãy gọi {callNotice.name} theo số{" "}
            <a href={"tel:" + callNotice.phone} className="font-semibold underline">
              {callNotice.phone}
            </a>{" "}
            để báo kết quả.
          </p>
          <button
            onClick={() => setCallNotice(null)}
            aria-label="Đã gọi, ẩn thông báo"
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
            {reminderIssues.data.length} lịch hẹn sắp tới chưa được nhắc qua email — hãy gọi khách
          </h2>
          <ul className="mt-2 space-y-1">
            {reminderIssues.data.map((r) => (
              <li key={r.appointmentId}>
                <strong>{format(r.startAt)}</strong> · {r.patient.fullName}
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
                  ? "không nhắc vì lịch không còn hợp lệ: " + (r.reminderNote ?? "") + ". Hãy dời hoặc hủy lịch và báo khách."
                  : r.reminderNote}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {["PENDING_REVIEW", "PROPOSED", "PATIENT_ACCEPTED", "CONFIRMED"].map(
          (k) => (
            <div key={k} className="rounded-lg border bg-white p-3">
              <div className="text-xs text-gray-500">{stateLabel[k]}</div>
              <div className="mt-1 text-xl font-semibold">{counts[k] ?? 0}</div>
            </div>
          ),
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border bg-white px-3 py-2 text-sm"
        >
          <option value="">Tất cả trạng thái</option>
          {Object.keys(stateLabel).map((s) => (
            <option key={s} value={s}>
              {stateLabel[s]}
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
            placeholder="Tìm theo mã đặt lịch, SĐT hoặc tên"
            aria-label="Tìm yêu cầu"
            className="w-full max-w-sm rounded-md border bg-white px-3 py-2 text-sm"
          />
          <button className="rounded-md border bg-white px-3 py-2 text-sm">Tìm</button>
          {q && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setQ("");
              }}
              className="text-sm text-gray-500 underline"
            >
              Bỏ lọc
            </button>
          )}
        </form>
        <button
          onClick={() => query.refetch()}
          className="rounded-md border bg-white px-3 py-2 text-sm"
        >
          Tải lại
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        {query.isLoading ? (
          <p className="p-6 text-gray-500">Đang tải yêu cầu…</p>
        ) : query.isError ? (
          <p className="p-6 text-red-700">Không tải được yêu cầu.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-gray-600">
              <tr>
                <th className="px-4 py-3">Mã / bệnh nhân</th>
                <th className="px-4 py-3">Dịch vụ</th>
                <th className="px-4 py-3">Bác sĩ</th>
                <th className="px-4 py-3">Giờ hẹn</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {query.data?.map((row) => (
                <tr className="border-t" key={row.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.fullName}</div>
                    <div className="text-xs text-gray-500">
                      {row.referenceCode} · {row.phone}
                    </div>
                  </td>
                  <td className="px-4 py-3">{row.service.name}</td>
                  <td className="px-4 py-3">{effectiveDentist(row)}</td>
                  <td className="px-4 py-3">
                    {format(effectiveAt(row))}
                    {!row.appointment && effectiveAt(row) !== row.requestedStartAt && (
                      <div className="text-xs text-gray-500">Giờ đề xuất</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {rowStatus(row)}
                    {row.noticeFailedAt && (
                      <span
                        title={"Chưa báo được khách: " + (row.noticeFailedSubject ?? "")}
                        className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                      >
                        Cần gọi báo khách
                      </span>
                    )}
                    <UrgencyBadge kind={urgency(row, now)} />
                    <SlotIssueBadge issue={row.slotIssue} />
                    <PhoneLimitBadge count={row.openFromPhone} phone={row.phone} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(row)}
                      className="rounded-md border px-3 py-1.5 text-teal-800"
                    >
                      Xử lý
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!query.isLoading && !query.isError && !query.data?.length && (
          <p className="p-8 text-center text-sm text-gray-500">
            Chưa có yêu cầu đặt lịch.
          </p>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <section className="my-4 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{selected.fullName}</h2>
                <p className="text-sm text-gray-500">
                  {selected.referenceCode} · {stateLabel[selected.status]}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Đóng"
                className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Điện thoại / email</dt>
                <dd>
                  {selected.phone}
                  {selected.email ? " · " + selected.email : ""}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Ngày sinh</dt>
                <dd>{String(selected.dob).slice(0, 10)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Dịch vụ</dt>
                <dd>
                  {selected.service.name} · {selected.service.durationMinutes}{" "}
                  phút
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Giờ mong muốn</dt>
                <dd>{format(selected.requestedStartAt)}</dd>
              </div>
              {selected.proposedStartAt && (
                <div>
                  <dt className="text-gray-500">Giờ phòng khám đề xuất</dt>
                  <dd>{format(selected.proposedStartAt)}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Bác sĩ mong muốn</dt>
                <dd>{selected.preferredDentist.fullName}</dd>
              </div>
              {PROPOSAL.includes(selected.status) && selected.proposedStartAt && (
                <div>
                  <dt className="text-gray-500">Bác sĩ đề xuất</dt>
                  <dd>
                    {(selected.proposedDentist ?? selected.preferredDentist).fullName}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Người giám hộ</dt>
                <dd>
                  {selected.contactPersonName || "—"}{" "}
                  {selected.contactPersonPhone || ""}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-500">Lý do khám</dt>
                <dd>{selected.reason || "—"}</dd>
              </div>
              {selected.patientMessage && (
                <div className="sm:col-span-2">
                  <dt className="text-gray-500">Lời nhắn của khách</dt>
                  <dd className="rounded bg-sky-50 p-2 text-sky-900">{selected.patientMessage}</dd>
                </div>
              )}
            </dl>
            {selected.appointment && (
              <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-800">
                Lịch đã tạo: {format(selected.appointment.startAt)}
                {selected.appointment.dentist
                  ? " · " + selected.appointment.dentist.fullName
                  : ""}{" "}
                ({visitLabel[selected.appointment.status] ?? selected.appointment.status})
              </p>
            )}
            {ageOf(selected.dob) < 18 && (
              <p className="mt-3 rounded bg-sky-50 p-2 text-xs text-sky-900">
                Người khám {ageOf(selected.dob)} tuổi (vị thành niên): cần cha mẹ hoặc người giám hộ
                đi cùng khi đến khám.
              </p>
            )}
            {selected.noticeFailedAt && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded bg-amber-50 p-3 text-sm text-amber-900">
                <span>
                  Chưa báo được khách “{selected.noticeFailedSubject}”
                  {selected.email ? " (gửi email lỗi)" : " (khách không có email)"}. Hãy gọi{" "}
                  <a href={"tel:" + selected.phone} className="font-semibold underline">
                    {selected.phone}
                  </a>
                  .
                </span>
                <button
                  disabled={action.isPending}
                  onClick={() => action.mutate({ path: "called" })}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs"
                >
                  Đã gọi báo khách
                </button>
              </div>
            )}
            {(!!related.data?.requests.length || !!related.data?.visits.length) && (
              <div className="mt-4 rounded bg-violet-50 p-3 text-sm text-violet-900">
                <p className="font-medium">
                  Cùng số điện thoại / cùng người — tránh đặt trùng hai lịch:
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {related.data?.requests.map((r) => (
                    <li key={r.id}>
                      Yêu cầu {r.referenceCode} ({r.fullName}) · {format(r.startAt)} ·{" "}
                      {stateLabel[r.status] ?? r.status}
                    </li>
                  ))}
                  {related.data?.visits.map((v) => (
                    <li key={v.id}>
                      Lịch hẹn {format(v.startAt)} · {v.patient.fullName} ({v.patient.code})
                      {v.dentist ? " · " + v.dentist.fullName : ""} ·{" "}
                      {visitLabel[v.status] ?? v.status}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {overdue && (
              <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
                Giờ hẹn {format(effectiveAt(selected))} đã qua. Hãy đề xuất giờ
                khác hoặc từ chối; nếu không, yêu cầu sẽ tự chuyển sang “Quá
                hạn”.
              </p>
            )}
            {selected.slotIssue && !overdue && (
              <p className="mt-4 rounded bg-orange-50 p-3 text-sm text-orange-900">
                Không thể xác nhận như yêu cầu hiện tại: {selected.slotIssue.message}.
                Hãy đề xuất giờ hoặc bác sĩ khác, hoặc từ chối yêu cầu.
              </p>
            )}
            {selected.status === "EXPIRED" && (
              <p className="mt-4 rounded bg-slate-100 p-3 text-sm text-gray-700">
                Yêu cầu đã quá giờ mà chưa được xác nhận. Khách được hướng dẫn
                đặt lịch mới hoặc gọi phòng khám.
              </p>
            )}
            {CONFIRMABLE.includes(selected.status) && (
              <div className="mt-5">
                <label className="block text-sm font-medium">
                  Hồ sơ bệnh nhân cho lịch này
                  <select
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-white px-3 py-2"
                  >
                    <option value="">
                      Tự ghép nếu trùng SĐT, tên và ngày sinh; không có thì tạo hồ sơ mới
                    </option>
                    <option value={NEW_PATIENT}>
                      Tạo hồ sơ mới cho {selected.fullName}
                    </option>
                    {matches.map((p) => (
                      <option key={p.id} value={p.id}>
                        {matchLabel(p)}
                      </option>
                    ))}
                  </select>
                </label>
                {matches.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    Có {matches.length} hồ sơ dùng số điện thoại của yêu cầu (kể
                    cả SĐT người giám hộ). Nếu chọn hồ sơ sai, lịch khám sẽ gắn
                    nhầm bệnh nhân. Hãy đối chiếu tên và ngày sinh; khám cho
                    người khác (ví dụ con dùng số của mẹ) thì chọn “Tạo hồ sơ
                    mới”.
                  </p>
                )}
                {chosen?.differentPhone && (
                  <div className="mt-2 space-y-2 rounded bg-amber-50 p-3 text-sm text-amber-900">
                    <p>
                      Hồ sơ này dùng số điện thoại khác ({chosen.primaryPhone ?? "—"}). Chỉ chọn khi đã
                      xác minh đúng người (khách đổi số, người nhà đặt hộ).
                    </p>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={identityChecked}
                        onChange={(e) => setIdentityChecked(e.target.checked)}
                      />
                      Đã xác minh danh tính
                    </label>
                    <input
                      value={identityNote}
                      onChange={(e) => setIdentityNote(e.target.value)}
                      placeholder="Cách xác minh, ví dụ: khách đọc đúng ngày sinh và SĐT cũ"
                      className="w-full rounded-md border px-3 py-1.5"
                    />
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={updatePhone}
                        onChange={(e) => setUpdatePhone(e.target.checked)}
                      />
                      Đổi SĐT hồ sơ thành {selected.phone} (giữ lịch sử số cũ)
                    </label>
                  </div>
                )}
                {chosen && selected.email && (
                  <p className="mt-2 text-xs text-gray-600">
                    {!chosen.email ? (
                      <>Email {selected.email} sẽ được lưu vào hồ sơ để gửi nhắc lịch.</>
                    ) : chosen.email.toLowerCase() !== selected.email.toLowerCase() ? (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={updateEmail}
                          onChange={(e) => setUpdateEmail(e.target.checked)}
                        />
                        Thay email hồ sơ ({chosen.email}) bằng {selected.email}
                      </label>
                    ) : null}
                  </p>
                )}
              </div>
            )}
            {canPropose && (
              <div className="mt-5 rounded-lg bg-slate-50 p-4">
                <h3 className="font-semibold">Giờ thay thế</h3>
                {dentistOptions.isSuccess && dentists.length === 0 && (
                  <p className="mt-2 rounded bg-orange-50 p-2 text-sm text-orange-900">
                    Không còn bác sĩ nào thực hiện dịch vụ này (bác sĩ đã nghỉ hoặc dịch vụ đã
                    ngừng). Hãy gọi khách để đặt dịch vụ khác qua điện thoại, rồi từ chối yêu cầu này
                    kèm lời nhắn giải thích.
                  </p>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Bác sĩ
                    <select
                      value={proposeDentist}
                      onChange={(e) => setProposeDentist(e.target.value)}
                      className="mt-1 w-full rounded-md border bg-white px-3 py-2"
                    >
                      <option value="">
                        {dentistOptions.isLoading ? "Đang tải…" : "Chọn bác sĩ"}
                      </option>
                      {dentists.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Ngày và giờ
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
                  Khách đang ở quầy với mã đặt lịch này
                </summary>
                <p className="mt-2 text-gray-600">
                  Tạo lượt khám vãng lai cho khách (Hàng chờ / Lịch hẹn) rồi gắn vào yêu cầu, hoặc chỉ
                  đóng yêu cầu. Không gửi email cho khách.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {todayVisits.map((v) => (
                    <button
                      key={v.id}
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({ path: "arrived", body: { appointmentId: v.id } })
                      }
                      className="rounded-md border border-teal-700 px-3 py-1.5 text-teal-800 disabled:opacity-50"
                    >
                      Gắn lượt {clinicParts(v.startAt).time} · {v.patient.fullName}
                    </button>
                  ))}
                  <button
                    disabled={action.isPending}
                    onClick={() => action.mutate({ path: "arrived", body: {} })}
                    className="rounded-md border px-3 py-1.5 disabled:opacity-50"
                  >
                    Đóng yêu cầu (khách đã đến)
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
                  Sửa thông tin khách (gõ sai SĐT, email, tên)
                </summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["fullName", "Họ và tên"],
                      ["dob", "Ngày sinh (YYYY-MM-DD)"],
                      ["phone", "Số điện thoại"],
                      ["email", "Email (để trống để xóa)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-xs text-gray-600">
                      {label}
                      <input
                        value={contact[key]}
                        onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
                        className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm text-gray-900"
                      />
                    </label>
                  ))}
                  <label className="text-xs text-gray-600 sm:col-span-2">
                    Lý do sửa (ghi vào lịch sử)
                    <input
                      value={contact.reason}
                      onChange={(e) => setContact((c) => ({ ...c, reason: e.target.value }))}
                      className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm text-gray-900"
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
                    Lưu thông tin
                  </button>
                  {selected.email && (
                    <button
                      disabled={action.isPending}
                      onClick={() => action.mutate({ path: "resend-link" })}
                      className="rounded-md border px-3 py-1.5 disabled:opacity-50"
                    >
                      Gửi lại đường link cho khách
                    </button>
                  )}
                </div>
              </details>
            )}
            <label className="mt-3 block text-sm font-medium">
              Ghi chú nội bộ (khách không thấy)
              <div className="mt-1 flex gap-2">
                <textarea
                  rows={1}
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: đã gọi 2 lần, không nghe máy"
                  className="w-full rounded-md border px-3 py-2 text-sm font-normal"
                />
                <button
                  type="button"
                  disabled={action.isPending || note === (selected.receptionistNote ?? "")}
                  onClick={() => action.mutate({ path: "note", method: "put", body: { note } })}
                  className="rounded-md border px-3 text-sm font-normal disabled:opacity-50"
                >
                  Lưu
                </button>
              </div>
            </label>
            {OPEN.includes(selected.status) && (
              <label className="mt-4 block text-sm font-medium">
                Lời nhắn cho khách
                <textarea
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    canPropose
                      ? "Giải thích giờ thay thế, thông tin cần bổ sung hoặc lý do từ chối"
                      : "Ghi chú (không bắt buộc khi ghi nhận trả lời qua điện thoại); bắt buộc khi từ chối"
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
                  disabled={action.isPending}
                  onClick={() => action.mutate({ path: "confirm", body: confirmBody() })}
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Xác nhận lịch
                </button>
              )}
              {/* The patient asked for / agreed to the alternative time by phone: book it now. */}
              {canPropose && (
                <button
                  disabled={action.isPending || !proposeAt || !proposeDentist}
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
                  title="Khách đã đồng ý giờ thay thế qua điện thoại: tạo lịch ngay, chỉ gửi email xác nhận"
                  className="rounded-md border border-teal-700 px-4 py-2 text-sm text-teal-800 disabled:opacity-50"
                >
                  Xác nhận luôn giờ thay thế
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
                  Đề xuất giờ khác
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
                  Đã nhận đủ thông tin
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
                  Khách đồng ý qua điện thoại
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
                  Yêu cầu bổ sung
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
                    Khách hủy qua điện thoại
                  </button>
                  <label className="flex items-center gap-1 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={spam}
                      onChange={(e) => setSpam(e.target.checked)}
                    />
                    Yêu cầu rác (không gửi email)
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
                    Từ chối
                  </button>
                </>
              )}
              <button
                onClick={() => setSelected(null)}
                className="rounded-md border px-4 py-2 text-sm"
              >
                Đóng
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
