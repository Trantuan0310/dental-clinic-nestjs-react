import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";

type Status = {
  referenceCode: string;
  status: string;
  requestedStartAt: string;
  service?: { name: string };
  dentist?: { fullName: string | null };
  proposedStartAt?: string | null;
  responseMessage?: string | null;
  appointment?: { startAt: string; status: string } | null;
};
const labels: Record<string, string> = {
  PENDING_REVIEW: "Đang chờ lễ tân xem xét",
  NEEDS_INFORMATION: "Cần bổ sung thông tin",
  PROPOSED: "Phòng khám đề xuất giờ khác",
  PATIENT_ACCEPTED: "Bạn đã đồng ý giờ mới, đang chờ xác nhận",
  CONFIRMED: "Lịch hẹn đã được xác nhận",
  DECLINED: "Phòng khám chưa thể tiếp nhận yêu cầu",
  CANCELLED: "Yêu cầu đã được rút",
};
const format = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : "";

export default function PublicBookingStatusPage() {
  const [params] = useSearchParams();
  const [reference, setReference] = useState(params.get("ref") ?? "");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState({
    fullName: "",
    dob: "",
    gender: "UNDISCLOSED",
    phone: "",
    email: "",
    contactPersonName: "",
    contactPersonPhone: "",
    reason: "",
  });

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    const saved = sessionStorage.getItem(
      "booking:" + (params.get("ref") ?? ""),
    );
    const access = fragment || saved || "";
    if (access) {
      setToken(access);
      const ref = params.get("ref") ?? "";
      if (ref) sessionStorage.setItem("booking:" + ref, access);
      api
        .get<{ data: Status }>(
          "/public/booking/requests/" + encodeURIComponent(ref),
          {
            headers: { "x-booking-access-token": access },
          },
        )
        .then((response) => setStatus(response.data.data))
        .catch(() =>
          setError("Không tìm thấy yêu cầu hoặc mã tra cứu không đúng."),
        );
    }
    if (fragment)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
  }, [params]);

  const load = async (ref = reference, access = token) => {
    setError("");
    setBusy(true);
    try {
      const response = await api.get<{ data: Status }>(
        "/public/booking/requests/" + encodeURIComponent(ref),
        { headers: { "x-booking-access-token": access } },
      );
      setStatus(response.data.data);
      setReference(ref);
      setToken(access);
      sessionStorage.setItem("booking:" + ref, access);
    } catch (e: any) {
      setStatus(null);
      setError(
        e?.response?.data?.message ||
          "Không tìm thấy yêu cầu hoặc mã tra cứu không đúng.",
      );
    } finally {
      setBusy(false);
    }
  };

  const action = async (path: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      const result = await api.post<{ data: Status }>(
        "/public/booking/requests/" +
          encodeURIComponent(reference) +
          "/" +
          path,
        body,
        { headers: { "x-booking-access-token": token } },
      );
      setStatus(result.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Không thực hiện được thao tác.");
    } finally {
      setBusy(false);
    }
  };

  const submitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api.put<{ data: Status }>(
        "/public/booking/requests/" +
          encodeURIComponent(reference) +
          "/details",
        details,
        { headers: { "x-booking-access-token": token } },
      );
      setStatus(response.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Không cập nhật được thông tin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/booking" className="text-xl font-bold text-teal-700">
            GENSMILE
          </Link>
          <Link to="/booking" className="text-sm text-teal-700 hover:underline">
            Đặt lịch mới
          </Link>
        </div>
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            Tra cứu yêu cầu đặt lịch
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Nhập mã yêu cầu và mã tra cứu đã nhận sau khi gửi biểu mẫu.
          </p>
          <form
            className="mt-5 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
          >
            <input
              required
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              placeholder="Mã yêu cầu"
              className="rounded-md border border-gray-300 px-3 py-2"
            />
            <input
              required
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Mã tra cứu bí mật"
              className="rounded-md border border-gray-300 px-3 py-2"
            />
            <button
              disabled={busy}
              className="rounded-md bg-teal-700 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              Tra cứu
            </button>
          </form>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          {token && (
            <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-semibold text-amber-900">
                Lưu mã tra cứu bí mật
              </p>
              <p className="mt-1 break-all font-mono text-xs text-amber-900">
                {token}
              </p>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(token)}
                className="mt-2 rounded border border-amber-300 px-2 py-1 text-xs"
              >
                Sao chép mã
              </button>
              <p className="mt-1 text-xs text-amber-800">
                Không chia sẻ mã này. Nếu không nhận email, bạn cần giữ mã để
                tra cứu lại sau.
              </p>
            </div>
          )}
          {status && (
            <div className="mt-6 rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-gray-900">
                  Yêu cầu {status.referenceCode}
                </h2>
                <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-800">
                  {labels[status.status] ?? status.status}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500">Dịch vụ</dt>
                  <dd className="font-medium">{status.service?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Bác sĩ</dt>
                  <dd className="font-medium">
                    {status.dentist?.fullName ?? "Chưa phân công"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Giờ mong muốn</dt>
                  <dd>{format(status.requestedStartAt)}</dd>
                </div>
                {status.proposedStartAt && (
                  <div>
                    <dt className="text-gray-500">Giờ phòng khám đề xuất</dt>
                    <dd className="font-semibold">
                      {format(status.proposedStartAt)}
                    </dd>
                  </div>
                )}
                {status.appointment && (
                  <div>
                    <dt className="text-gray-500">Lịch hẹn chính thức</dt>
                    <dd className="font-semibold">
                      {format(status.appointment.startAt)}
                    </dd>
                  </div>
                )}
              </dl>
              {status.responseMessage && (
                <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-gray-700">
                  {status.responseMessage}
                </p>
              )}
              {status.status === "PROPOSED" && (
                <button
                  disabled={busy}
                  onClick={() => action("accept-proposal")}
                  className="mt-4 rounded-md bg-teal-700 px-4 py-2 font-medium text-white disabled:opacity-60"
                >
                  Đồng ý giờ phòng khám đề xuất
                </button>
              )}
              {[
                "PENDING_REVIEW",
                "NEEDS_INFORMATION",
                "PROPOSED",
                "PATIENT_ACCEPTED",
              ].includes(status.status) && (
                <button
                  disabled={busy}
                  onClick={() => action("withdraw")}
                  className="ml-2 mt-4 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-60"
                >
                  Rút yêu cầu
                </button>
              )}
              {status.status === "NEEDS_INFORMATION" && (
                <form
                  onSubmit={submitDetails}
                  className="mt-5 space-y-3 border-t pt-4"
                >
                  <h3 className="font-semibold">Bổ sung/cập nhật thông tin</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      required
                      placeholder="Họ và tên"
                      value={details.fullName}
                      onChange={(e) =>
                        setDetails({ ...details, fullName: e.target.value })
                      }
                      className="rounded-md border px-3 py-2"
                    />
                    <input
                      required
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={details.dob}
                      onChange={(e) =>
                        setDetails({ ...details, dob: e.target.value })
                      }
                      className="rounded-md border px-3 py-2"
                    />
                    <select
                      value={details.gender}
                      onChange={(e) =>
                        setDetails({ ...details, gender: e.target.value })
                      }
                      className="rounded-md border bg-white px-3 py-2"
                    >
                      <option value="UNDISCLOSED">Không muốn nêu</option>
                      <option value="FEMALE">Nữ</option>
                      <option value="MALE">Nam</option>
                      <option value="OTHER">Khác</option>
                    </select>
                    <input
                      required
                      placeholder="Số điện thoại"
                      value={details.phone}
                      onChange={(e) =>
                        setDetails({ ...details, phone: e.target.value })
                      }
                      className="rounded-md border px-3 py-2"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={details.email}
                      onChange={(e) =>
                        setDetails({ ...details, email: e.target.value })
                      }
                      className="rounded-md border px-3 py-2"
                    />
                    <input
                      placeholder="Tên người giám hộ"
                      value={details.contactPersonName}
                      onChange={(e) =>
                        setDetails({
                          ...details,
                          contactPersonName: e.target.value,
                        })
                      }
                      className="rounded-md border px-3 py-2"
                    />
                    <input
                      placeholder="SĐT người giám hộ"
                      value={details.contactPersonPhone}
                      onChange={(e) =>
                        setDetails({
                          ...details,
                          contactPersonPhone: e.target.value,
                        })
                      }
                      className="rounded-md border px-3 py-2"
                    />
                  </div>
                  <textarea
                    placeholder="Lý do khám"
                    value={details.reason}
                    onChange={(e) =>
                      setDetails({ ...details, reason: e.target.value })
                    }
                    className="w-full rounded-md border px-3 py-2"
                  />
                  <button
                    disabled={busy}
                    className="rounded-md bg-teal-700 px-4 py-2 font-medium text-white"
                  >
                    Gửi thông tin bổ sung
                  </button>
                </form>
              )}
            </div>
          )}
          <p className="mt-6 text-xs text-gray-500">
            Không chia sẻ mã tra cứu với người khác. Trang này chỉ hiển thị tình
            trạng đặt lịch, không hiển thị hồ sơ khám.
          </p>
        </section>
      </div>
    </main>
  );
}
