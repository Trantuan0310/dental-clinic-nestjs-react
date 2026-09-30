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
import { bookingErrorMessage } from "./errorMessage";
import { PublicTopBar } from "./PublicTopBar";
import {
  findSavedBooking,
  loadSavedBookings,
  normalizeReference,
  saveBooking,
} from "./savedBookings";

type Status = {
  /** Left out of a lookup by phone alone (it would open the request). */
  referenceCode?: string;
  /** Changes need the token from the confirmation link; the phone only shows the status. */
  canManage?: boolean;
  status: string;
  requestedStartAt: string;
  service?: { name: string | null; durationMinutes?: number | null };
  dentist?: { fullName: string | null };
  proposedStartAt?: string | null;
  /** Open, but its time has passed (server clock). */
  overdue?: boolean;
  responseMessage?: string | null;
  appointment?: {
    startAt: string;
    endAt?: string;
    status: string;
    /** The clinic moved the visit after confirming it. */
    rescheduled?: boolean;
  } | null;
};
type Access = { token?: string; phone?: string };
type Tone = "wait" | "action" | "good" | "bad";

/** What the patient sees for each state: a headline and what happens next. */
const STATE: Record<string, { title: string; text: string; tone: Tone; step: number }> = {
  PENDING_REVIEW: {
    title: "Đang chờ lễ tân xem xét",
    text: "Phòng khám đã nhận yêu cầu của bạn. Lễ tân sẽ gọi hoặc nhắn tin để xác nhận trong giờ làm việc. Bạn chưa cần làm gì thêm.",
    tone: "wait",
    step: 2,
  },
  NEEDS_INFORMATION: {
    title: "Cần bổ sung thông tin",
    text: "Phòng khám cần thêm thông tin để giữ lịch. Đọc lời nhắn bên dưới rồi điền lại biểu mẫu.",
    tone: "action",
    step: 2,
  },
  PROPOSED: {
    title: "Phòng khám đề xuất giờ khác",
    text: "Giờ bạn chọn không còn phù hợp. Bấm “Đồng ý giờ mới” để giữ giờ phòng khám đề xuất, hoặc “Không đồng ý giờ này” để lễ tân chọn giờ khác.",
    tone: "action",
    step: 2,
  },
  PATIENT_ACCEPTED: {
    title: "Bạn đã đồng ý giờ mới",
    text: "Lễ tân sẽ xác nhận lần cuối và báo lại cho bạn.",
    tone: "wait",
    step: 2,
  },
  CONFIRMED: {
    title: "Lịch hẹn đã được xác nhận",
    text: "Vui lòng đến trước giờ hẹn khoảng 10 phút, mang theo giấy tờ tùy thân và phim X-quang hoặc đơn thuốc cũ nếu có.",
    tone: "good",
    step: 3,
  },
  DECLINED: {
    title: "Phòng khám chưa thể tiếp nhận yêu cầu",
    text: "Rất tiếc, lịch này chưa thể sắp xếp. Bạn có thể chọn giờ khác hoặc gọi lễ tân để được hỗ trợ.",
    tone: "bad",
    step: 0,
  },
  CANCELLED: {
    title: "Yêu cầu đã được hủy",
    text: "Yêu cầu này không còn hiệu lực. Bạn có thể đặt lịch mới bất cứ lúc nào.",
    tone: "bad",
    step: 0,
  },
  EXPIRED: {
    title: "Yêu cầu đã quá hạn",
    text: "Đã qua giờ hẹn mà phòng khám chưa kịp xác nhận yêu cầu này, nên lịch không được giữ. Vui lòng đặt lịch mới hoặc gọi lễ tân để được sắp xếp.",
    tone: "bad",
    step: 0,
  },
};
/** A confirmed request whose visit was later changed at the clinic. */
const VISIT_STATE: Record<string, { title: string; text: string; tone: Tone }> = {
  CANCELLED: {
    title: "Lịch hẹn đã bị hủy",
    text: "Lịch hẹn này đã được hủy. Gọi lễ tân nếu bạn cần đặt lại.",
    tone: "bad",
  },
  NO_SHOW: {
    title: "Lịch hẹn đã qua",
    text: "Phòng khám ghi nhận bạn chưa đến khám theo lịch này. Bạn có thể đặt lịch mới.",
    tone: "bad",
  },
  CHECKED_IN: {
    title: "Bạn đang ở phòng khám",
    text: "Phòng khám đã ghi nhận bạn đến. Vui lòng chờ đến lượt khám.",
    tone: "good",
  },
  IN_PROGRESS: {
    title: "Bạn đang ở phòng khám",
    text: "Bạn đang được khám theo lịch hẹn này.",
    tone: "good",
  },
  LEFT: {
    title: "Bạn đã rời phòng khám",
    text: "Phòng khám ghi nhận bạn đã về trước khi được khám theo lịch này. Gọi lễ tân hoặc đặt lịch mới nếu bạn vẫn cần khám.",
    tone: "bad",
  },
  COMPLETED: {
    title: "Đã khám xong",
    text: "Cảm ơn bạn đã tin tưởng phòng khám. Hẹn gặp lại bạn ở lần tái khám.",
    tone: "good",
  },
};
const RESCHEDULED = {
  title: "Lịch hẹn đã được dời",
  text: "Phòng khám đã đổi giờ hẹn của bạn. Giờ mới ở bên dưới; gọi lễ tân nếu giờ này không phù hợp.",
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
  bad: { box: "border-gray-200 bg-gray-50 text-gray-800", icon: XCircle },
};

const when = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("vi-VN", {
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
  const start = new Date(status.appointment!.startAt);
  const end = status.appointment?.endAt
    ? new Date(status.appointment.endAt)
    : new Date(start.getTime() + (status.service?.durationMinutes ?? 30) * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${status.service?.name ?? "Lịch khám"} — ${clinic.name}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: status.referenceCode
      ? `Mã đặt lịch ${status.referenceCode}. Tra cứu: ${window.location.origin}/booking/status?ref=${status.referenceCode}`
      : `Tra cứu: ${window.location.origin}/booking/status`,
  });
  if (clinic.address) params.set("location", clinic.address);
  return "https://calendar.google.com/calendar/render?" + params.toString();
};

const headers = (a: Access) => ({
  ...(a.token ? { "x-booking-access-token": a.token } : {}),
  ...(a.phone ? { "x-booking-phone": a.phone } : {}),
});

const inputClass =
  "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

function CopyCode({ code, label = "Sao chép" }: { code: string; label?: string }) {
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
      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {copied ? "Đã chép" : label}
    </button>
  );
}

function Progress({ step }: { step: number }) {
  const steps = ["Đã gửi yêu cầu", "Phòng khám xem xét", "Đã xác nhận"];
  return (
    <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="Tiến trình đặt lịch">
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
                (done || current ? "font-medium text-gray-900" : "text-gray-400")
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
  if (!clinic.phone && !clinic.zaloHref) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {clinic.phone && (
        <a
          href={`tel:${clinic.phoneHref}`}
          className="inline-flex items-center gap-2 rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          <Phone className="h-4 w-4" aria-hidden /> Gọi {clinic.phone}
        </a>
      )}
      {clinic.zaloHref && (
        <a
          href={clinic.zaloHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          <MessageCircle className="h-4 w-4" aria-hidden /> Nhắn Zalo
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
      className="mt-6 space-y-4 border-t border-gray-100 pt-5"
    >
      <h3 className="font-semibold text-gray-900">Bổ sung thông tin</h3>
      <p className="text-sm text-gray-600">
        Chỉ điền những thông tin phòng khám cần hoặc cần sửa. Ô để trống sẽ giữ nguyên thông tin bạn đã gửi.
        Muốn đổi số điện thoại hoặc email, vui lòng gọi phòng khám.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Họ và tên người khám
          <input maxLength={200} value={d.fullName} onChange={set("fullName")} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Ngày sinh
          <input
            type="date"
            max={clinicToday()}
            value={d.dob}
            onChange={set("dob")}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Giới tính
          <select value={d.gender} onChange={set("gender")} className={inputClass + " bg-white"}>
            <option value="">Giữ nguyên</option>
            <option value="UNDISCLOSED">Không muốn nêu</option>
            <option value="FEMALE">Nữ</option>
            <option value="MALE">Nam</option>
            <option value="OTHER">Khác</option>
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Người giám hộ (nếu khám cho trẻ)
          <input value={d.contactPersonName} onChange={set("contactPersonName")} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-gray-700">
          SĐT người giám hộ
          <input type="tel" inputMode="tel" value={d.contactPersonPhone} onChange={set("contactPersonPhone")} className={inputClass} />
        </label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Lý do khám
          <textarea rows={3} value={d.reason} onChange={set("reason")} className={inputClass} />
        </label>
      </div>
      <button
        disabled={busy || Object.keys(filled).length === 0}
        className="w-full rounded-full bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60 sm:w-auto"
      >
        Gửi thông tin bổ sung
      </button>
    </form>
  );
}

export default function PublicBookingStatusPage() {
  const [params, setParams] = useSearchParams();
  const justBooked = params.get("new") === "1";
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

  const open = useCallback(async (ref: string, a: Access, quiet = false) => {
    setBusy(true);
    if (!quiet) setError("");
    try {
      const response = await api.get<{ data: Status }>(
        "/public/booking/requests/" + encodeURIComponent(ref),
        { headers: headers(a) },
      );
      const data = response.data.data;
      setStatus(data);
      setAccess(a);
      saveBooking({ ref: data.referenceCode ?? ref, ...a });
      return true;
    } catch (e: unknown) {
      if (!quiet) setError(bookingErrorMessage(e, "Mã đặt lịch hoặc số điện thoại không đúng."));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

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
        setError(
          "Chưa có lịch đặt nào với số điện thoại này trong 6 tháng gần đây. Kiểm tra lại số, hoặc gọi lễ tân để được hỗ trợ.",
        );
        return;
      }
      setResults(list);
      // One request: show it directly.
      if (list.length === 1) choose(list[0]);
    } catch (e: unknown) {
      setError(bookingErrorMessage(e, "Không tra cứu được. Vui lòng kiểm tra số điện thoại và thử lại."));
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
    } catch (e: unknown) {
      setError(bookingErrorMessage(e, fallback));
    } finally {
      setBusy(false);
      setConfirmCancel(false);
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
    ? "Giờ hẹn"
    : ["PROPOSED", "PATIENT_ACCEPTED"].includes(status?.status ?? "") && status?.proposedStartAt
      ? "Giờ phòng khám đề xuất"
      : "Giờ bạn chọn";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <PublicTopBar>
          <Link to="/booking" className="text-brand-600 hover:underline">
            Đặt lịch mới
          </Link>
        </PublicTopBar>

        {justBooked && status && (
          <section className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
              <div>
                <h1 className="text-lg font-semibold">Đã gửi yêu cầu đặt lịch</h1>
                <p className="mt-1 text-sm">
                  Mã đặt lịch của bạn là <strong className="font-mono">{status.referenceCode}</strong>.
                  Lễ tân sẽ liên hệ để xác nhận. Để thay đổi hoặc hủy yêu cầu sau này, hãy dùng đường
                  link trong email xác nhận (nếu bạn có nhập email) hoặc lưu đường link bên dưới; tra
                  cứu bằng số điện thoại chỉ xem được tình trạng.
                </p>
                {manageLink && (
                  <div className="mt-2">
                    <CopyCode code={manageLink} label="Sao chép đường link quản lý" />
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {!status && results && results.length > 1 ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
            <h1 className="text-2xl font-semibold text-gray-900">Lịch hẹn của bạn</h1>
            <p className="mt-2 text-gray-600">
              Số <span className="font-medium text-gray-900">{phone}</span> có {results.length} yêu cầu đặt
              lịch. Chọn một lịch để xem chi tiết.
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
                      className="w-full rounded-xl border border-gray-200 p-4 text-left hover:border-brand-200 hover:bg-brand-50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold capitalize text-gray-900">{when(itemTime)}</span>
                        <span
                          className={
                            "rounded-full border px-2.5 py-0.5 text-xs font-medium " +
                            TONE_STYLE[itemState?.tone ?? "wait"].box
                          }
                        >
                          {itemState?.title ?? item.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {item.service?.name ?? "—"}
                        {item.dentist?.fullName ? " · " + item.dentist.fullName : ""}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={reset} className="mt-6 text-sm text-brand-600 hover:underline">
              ← Tra cứu số điện thoại khác
            </button>
          </section>
        ) : !status ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
            <h1 className="text-2xl font-semibold text-gray-900">Tra cứu lịch hẹn</h1>
            <p className="mt-2 text-gray-600">Nhập số điện thoại bạn đã dùng khi đặt lịch.</p>
            <form onSubmit={lookup} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                Số điện thoại
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
                {busy ? "Đang tra cứu…" : "Xem lịch hẹn"}
              </button>
            </form>

            <div className="mt-8 border-t border-gray-100 pt-5 text-sm text-gray-600">
              <p>Không tìm thấy lịch của bạn? Gọi hoặc nhắn lễ tân để được hỗ trợ.</p>
              <div className="mt-3">
                <ContactButtons />
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
            {!justBooked && <h1 className="sr-only">Tình trạng lịch hẹn</h1>}
            {status.referenceCode && access && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-500">
                  Mã đặt lịch{" "}
                  <span className="font-mono text-base font-semibold text-gray-900">{status.referenceCode}</span>
                </p>
                <div className="flex items-center gap-2">
                  <CopyCode code={status.referenceCode} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void open(status.referenceCode!, access)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <RefreshCw className={"h-3.5 w-3.5 " + (busy ? "animate-spin" : "")} aria-hidden /> Cập nhật
                  </button>
                </div>
              </div>
            )}

            <div className={"mt-4 rounded-xl border p-4 " + tone.box} role="status">
              <div className="flex items-start gap-3">
                <ToneIcon className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
                <div>
                  <h2 className="text-lg font-semibold">{state?.title ?? status.status}</h2>
                  {state && <p className="mt-1 text-sm leading-relaxed">{state.text}</p>}
                </div>
              </div>
            </div>

            {(!visit || visitStands) && state && state.step > 0 && <Progress step={state.step} />}

            <dl className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-100">
              <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                <dt className="text-sm text-gray-500">{timeLabel}</dt>
                <dd className="font-semibold capitalize text-gray-900">{when(time)}</dd>
              </div>
              <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                <dt className="text-sm text-gray-500">Dịch vụ</dt>
                <dd className="font-medium text-gray-900">
                  {status.service?.name ?? "—"}
                  {status.service?.durationMinutes ? (
                    <span className="font-normal text-gray-500"> · khoảng {status.service.durationMinutes} phút</span>
                  ) : null}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                <dt className="text-sm text-gray-500">Bác sĩ</dt>
                <dd className="font-medium text-gray-900">{status.dentist?.fullName ?? "Phòng khám sắp xếp"}</dd>
              </div>
              {status.status === "PROPOSED" && status.proposedStartAt && (
                <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                  <dt className="text-sm text-gray-500">Giờ bạn chọn ban đầu</dt>
                  <dd className="capitalize text-gray-500 line-through">{when(status.requestedStartAt)}</dd>
                </div>
              )}
              {clinic.address && (
                <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
                  <dt className="text-sm text-gray-500">Địa chỉ</dt>
                  <dd className="text-gray-900 sm:text-right">{clinic.address}</dd>
                </div>
              )}
            </dl>

            {status.responseMessage && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lời nhắn từ phòng khám</p>
                <p className="mt-1 text-gray-800">{status.responseMessage}</p>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            {ACTIVE.includes(current) && !canManage && (
              <p className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
                Trang này chỉ xem được tình trạng. Để thay đổi (đồng ý hoặc không đồng ý giờ mới, bổ
                sung thông tin, hủy yêu cầu), mở đường link trong email xác nhận hoặc gọi phòng khám.
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
                      "Không xác nhận được giờ mới.",
                    )
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  <CalendarCheck className="h-5 w-5" aria-hidden /> Đồng ý giờ mới
                </button>
              )}
              {current === "PROPOSED" && canManage && !declining && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDeclining(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Không đồng ý giờ này, nhờ lễ tân chọn giờ khác
                </button>
              )}
              {visitStands && (
                <a
                  href={googleCalendarUrl(status)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600"
                >
                  <CalendarPlus className="h-5 w-5" aria-hidden /> Thêm vào Google Calendar
                </a>
              )}
              {["DECLINED", "CANCELLED", "EXPIRED"].includes(current) || (visit && !visitStands) ? (
                <Link
                  to="/booking"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-3 font-semibold text-white hover:bg-brand-600"
                >
                  <CalendarCheck className="h-5 w-5" aria-hidden /> Đặt lịch mới
                </Link>
              ) : null}
            </div>

            {current === "PROPOSED" && canManage && declining && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-slate-50 p-4 text-sm">
                <label className="block font-medium text-gray-700">
                  Giờ nào phù hợp với bạn? (không bắt buộc)
                  <textarea
                    rows={2}
                    maxLength={900}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ví dụ: tôi chỉ rảnh buổi chiều các ngày trong tuần"
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
                        "Không gửi được yêu cầu chọn giờ khác.",
                      )
                    }
                    className="rounded-full bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                  >
                    Gửi cho lễ tân
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeclining(false)}
                    className="rounded-full border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700"
                  >
                    Quay lại
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
                    "Không cập nhật được thông tin.",
                  )
                }
              />
            )}

            <div className="mt-8 border-t border-gray-100 pt-5">
              <p className="text-sm text-gray-600">Cần đổi giờ hoặc có thắc mắc? Liên hệ lễ tân:</p>
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
                    className="text-gray-500 underline-offset-2 hover:text-red-600 hover:underline"
                  >
                    Tôi muốn hủy yêu cầu này
                  </button>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="font-medium text-red-800">Hủy yêu cầu đặt lịch {status.referenceCode}?</p>
                    <p className="mt-1 text-red-700">Sau khi hủy, bạn cần đặt lịch mới nếu muốn khám.</p>
                    <label className="mt-3 block text-red-800">
                      Lý do (không bắt buộc)
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
                            "Không hủy được yêu cầu.",
                          )
                        }
                        className="rounded-full bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Hủy yêu cầu
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(false)}
                        className="rounded-full border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700"
                      >
                        Giữ lại
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
                  ← Các lịch khác của số này
                </button>
              )}
              <button type="button" onClick={reset} className="text-brand-600 hover:underline">
                Tra cứu số điện thoại khác
              </button>
            </div>
          </section>
        )}

        <p className="mt-6 text-center text-xs text-gray-500">
          Trang này chỉ hiển thị tình trạng đặt lịch, không hiển thị hồ sơ khám.
        </p>
      </div>
    </main>
  );
}
