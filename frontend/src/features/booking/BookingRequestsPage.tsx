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
  service: { id: string; name: string; durationMinutes: number };
  preferredDentist: { id: string; fullName: string };
  proposedDentist?: { id: string; fullName: string } | null;
  appointment?: {
    id: string;
    status: string;
    startAt: string;
    dentist?: { id: string; fullName: string } | null;
  } | null;
};
type ServiceOption = {
  id: string;
  name: string;
  dentists: Array<{ id: string; fullName: string }>;
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
  matchedBy?: Array<"primaryPhone" | "contactPersonPhone">;
  sameNameAndDob?: boolean;
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
      : "khớp SĐT " + (p.primaryPhone ?? ""),
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
  CANCELLED: "Đã rút",
  EXPIRED: "Quá hạn",
};
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
  // Re-evaluated every minute so "Sắp đến giờ" / "Quá giờ" stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ["booking-requests", filter],
    queryFn: async () =>
      (
        await api.get<{ data: RequestRow[] }>("/booking-requests", {
          params: filter ? { status: filter } : {},
        })
      ).data.data,
    // New online requests show up without a manual refresh.
    refetchInterval: 60_000,
  });
  // Every service, also those taken offline since the request came in.
  const options = useQuery({
    queryKey: ["public-booking-options", "include-offline"],
    queryFn: async () =>
      (
        await api.get<{ data: ServiceOption[] }>("/public/booking/options", {
          params: { includeOffline: true },
        })
      ).data.data,
  });
  const dentists = useMemo(
    () =>
      options.data?.find((x) => x.id === selected?.service.id)?.dentists ?? [],
    [options.data, selected],
  );
  useEffect(() => {
    setMatches([]);
    setPatientId("");
    setError("");
    setMessage("");
    if (!selected) return;
    api
      .get<{ data: PatientMatch[] }>(
        "/booking-requests/" + selected.id + "/patient-matches",
      )
      .then((r) => setMatches(r.data.data))
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
    mutationFn: async ({ path, body }: { path: string; body?: unknown }) =>
      api.post("/booking-requests/" + selected?.id + "/" + path, body ?? {}),
    onSuccess: async () => {
      setError("");
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
  // Any overdue open request can be rescued with a new time.
  const canPropose =
    !!selected &&
    (["PENDING_REVIEW", "PATIENT_ACCEPTED"].includes(selected.status) ||
      (overdue && OPEN.includes(selected.status)));

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
                    {stateLabel[row.status] ?? row.status}
                    <UrgencyBadge kind={urgency(row, now)} />
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
            </dl>
            {selected.appointment && (
              <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-800">
                Lịch đã tạo: {format(selected.appointment.startAt)}
                {selected.appointment.dentist
                  ? " · " + selected.appointment.dentist.fullName
                  : ""}{" "}
                ({selected.appointment.status})
              </p>
            )}
            {overdue && (
              <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
                Giờ hẹn {format(effectiveAt(selected))} đã qua. Hãy đề xuất giờ
                khác hoặc từ chối; nếu không, yêu cầu sẽ tự chuyển sang “Quá
                hạn”.
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
                      Tự tạo hoặc ghép theo số điện thoại, tên và ngày sinh
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
              </div>
            )}
            {canPropose && (
              <div className="mt-5 rounded-lg bg-slate-50 p-4">
                <h3 className="font-semibold">Giờ thay thế</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Bác sĩ
                    <select
                      value={proposeDentist}
                      onChange={(e) => setProposeDentist(e.target.value)}
                      className="mt-1 w-full rounded-md border bg-white px-3 py-2"
                    >
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
                  onClick={() =>
                    action.mutate({
                      path: "confirm",
                      body:
                        patientId === NEW_PATIENT
                          ? { createNewPatient: true }
                          : patientId
                            ? { patientId }
                            : {},
                    })
                  }
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Xác nhận lịch
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
                <button
                  disabled={action.isPending || !message.trim()}
                  onClick={() =>
                    action.mutate({ path: "decline", body: { message } })
                  }
                  className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700 disabled:opacity-50"
                >
                  Từ chối
                </button>
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
