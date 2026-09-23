import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

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
  appointment?: { id: string; status: string; startAt: string } | null;
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
};
const stateLabel: Record<string, string> = {
  PENDING_REVIEW: "Chờ xử lý",
  NEEDS_INFORMATION: "Chờ bổ sung",
  PROPOSED: "Chờ bệnh nhân đồng ý",
  PATIENT_ACCEPTED: "Chờ lễ tân xác nhận",
  CONFIRMED: "Đã xác nhận",
  DECLINED: "Từ chối",
  CANCELLED: "Đã rút",
};
const format = (value: string) =>
  new Date(value).toLocaleString("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  });
const inputDate = (value: string) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

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
  const query = useQuery({
    queryKey: ["booking-requests", filter],
    queryFn: async () =>
      (
        await api.get<{ data: RequestRow[] }>("/booking-requests", {
          params: filter ? { status: filter } : {},
        })
      ).data.data,
  });
  const options = useQuery({
    queryKey: ["public-booking-options"],
    queryFn: async () =>
      (await api.get<{ data: ServiceOption[] }>("/public/booking/options")).data
        .data,
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
    setProposeAt(inputDate(selected.requestedStartAt));
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
    onError: (e: any) =>
      setError(e?.response?.data?.message || "Không thực hiện được thao tác."),
  });
  const counts = useMemo(() => {
    const rows = query.data ?? [];
    return rows.reduce(
      (acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }),
      {} as Record<string, number>,
    );
  }, [query.data]);

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
                <th className="px-4 py-3">Giờ yêu cầu</th>
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
                  <td className="px-4 py-3">{row.preferredDentist.fullName}</td>
                  <td className="px-4 py-3">{format(row.requestedStartAt)}</td>
                  <td className="px-4 py-3">
                    {stateLabel[row.status] ?? row.status}
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
              <div>
                <dt className="text-gray-500">Bác sĩ mong muốn</dt>
                <dd>{selected.preferredDentist.fullName}</dd>
              </div>
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
                Lịch đã tạo: {format(selected.appointment.startAt)} (
                {selected.appointment.status})
              </p>
            )}
            {selected.status === "PATIENT_ACCEPTED" && (
              <div className="mt-5">
                <label className="block text-sm font-medium">
                  Ghép hồ sơ bệnh nhân nếu đã tồn tại
                  <select
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-white px-3 py-2"
                  >
                    <option value="">
                      Tự tạo hoặc ghép theo số điện thoại, tên và ngày sinh
                    </option>
                    {matches.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.fullName} · {String(p.dob).slice(0, 10)} ·{" "}
                        {p.primaryPhone}
                      </option>
                    ))}
                  </select>
                </label>
                {matches.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    Nếu chọn hồ sơ sai, lịch khám sẽ gắn nhầm bệnh nhân. Hãy đối
                    chiếu tên và ngày sinh.
                  </p>
                )}
              </div>
            )}
            {["PENDING_REVIEW", "PATIENT_ACCEPTED"].includes(
              selected.status,
            ) && (
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
                      value={proposeAt}
                      onChange={(e) => setProposeAt(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2"
                    />
                  </label>
                </div>
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Lời nhắn giải thích giờ thay thế"
                  className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
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
              {["PENDING_REVIEW", "PATIENT_ACCEPTED"].includes(
                selected.status,
              ) && (
                <button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      path: "confirm",
                      body: patientId ? { patientId } : {},
                    })
                  }
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  Xác nhận lịch
                </button>
              )}
              {["PENDING_REVIEW", "PATIENT_ACCEPTED"].includes(
                selected.status,
              ) && (
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
                        startAt: new Date(proposeAt).toISOString(),
                        message,
                      },
                    })
                  }
                  className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
                >
                  Đề xuất giờ khác
                </button>
              )}
              {["PENDING_REVIEW", "PROPOSED", "PATIENT_ACCEPTED"].includes(
                selected.status,
              ) && (
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
              {!["CONFIRMED", "DECLINED", "CANCELLED"].includes(
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
