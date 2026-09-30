import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { bookingErrorMessage } from "./errorMessage";
import { PublicTopBar } from "./PublicTopBar";
import { saveBooking } from "./savedBookings";
import { SPECIALTY_LABEL } from "@/features/staff/labels";
import { clinic } from "@/config/clinic";
import { clinicToday } from "@/lib/clinicTime";

type Dentist = { id: string; fullName: string; specialties: string[]; bio?: string | null };
type Service = {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  basePrice: string | number;
  dentists: Dentist[];
};
type BookingResult = {
  referenceCode: string;
  accessToken: string;
  notificationSent: boolean;
};

// The clinic's date, not the browser's: a visitor abroad (or a PC set to
// another zone) must not be offered yesterday or refused today.
const today = () => clinicToday();
const SLOT_ERROR = "Không tải được giờ trống. Chọn ngày khác hoặc liên hệ lễ tân.";
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
/** Why the chosen day has no time left, in the patient's words. */
const emptyReasonText = (
  reason: string | null | undefined,
  minLead: number,
  closedReason?: string | null,
) => {
  switch (reason) {
    case "CLINIC_CLOSED":
      return (closedReason || "Phòng khám nghỉ ngày này") + ".";
    case "CLOSED":
      return "Bác sĩ không nhận lịch ngày này (phòng khám đóng lịch).";
    case "NO_SCHEDULE":
      return "Bác sĩ không làm việc ngày này.";
    case "TIME_OFF":
      return "Bác sĩ nghỉ ngày này.";
    case "TOO_SOON":
      return (
        "Các giờ còn lại trong ngày quá gần: cần đặt trước ít nhất " +
        (minLead % 60 === 0 ? minLead / 60 + " giờ" : minLead + " phút") +
        "."
      );
    case "FULL":
      return "Ngày này đã kín lịch.";
    default:
      return "";
  }
};

export default function PublicBookingPage() {
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
  const [form, setForm] = useState({
    fullName: "",
    dob: "",
    gender: "UNDISCLOSED",
    phone: "",
    email: "",
    contactPersonName: "",
    contactPersonPhone: "",
    reason: "",
    consent: false,
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
        setError("Không tải được danh sách dịch vụ. Vui lòng thử lại sau."),
      )
      .finally(() => setLoading(false));
  }, [preselected]);

  useEffect(() => {
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
      .catch((e: unknown) => setSlotError(bookingErrorMessage(e, SLOT_ERROR)))
      .finally(() => setSlotLoading(false));
  }, [serviceId, dentistId, date]);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((old) => ({ ...old, [key]: value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!serviceId || !dentistId || !date || !time) {
      setError("Vui lòng chọn dịch vụ, bác sĩ, ngày và giờ.");
      return;
    }
    setSubmitting(true);
    try {
      const startAt = new Date(date + "T" + time + ":00+07:00").toISOString();
      const response = await api.post<{ data: BookingResult }>(
        "/public/booking/requests",
        { ...form, serviceId, dentistId, startAt },
      );
      const result = response.data.data;
      // Remember it on this device so the status page opens without typing.
      saveBooking({
        ref: result.referenceCode,
        token: result.accessToken,
        phone: form.phone.trim(),
      });
      navigate(
        "/booking/status?new=1&ref=" + encodeURIComponent(result.referenceCode),
      );
    } catch (e: unknown) {
      setError(bookingErrorMessage(e, "Chưa gửi được yêu cầu. Khung giờ có thể vừa được người khác chọn."));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <main className="mx-auto max-w-3xl p-6 text-gray-600">
        Đang tải lịch khám…
      </main>
    );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <PublicTopBar>
          <Link
            to="/booking/status"
            className="text-brand-600 hover:underline"
          >
            Tra cứu lịch hẹn
          </Link>
        </PublicTopBar>
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            Đặt lịch khám
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Gửi yêu cầu để lễ tân kiểm tra. Lịch chỉ được giữ sau khi phòng khám
            xác nhận.
          </p>
          {services.length === 0 ? (
            <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
              Phòng khám chưa mở dịch vụ đặt lịch trực tuyến. Vui lòng gọi trực
              tiếp cho lễ tân.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-6">
              <div>
                <h2 className="mb-3 font-semibold text-gray-900">
                  1. Chọn dịch vụ và giờ mong muốn
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700">
                    Dịch vụ
                    <select
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2"
                      value={serviceId}
                      onChange={(e) => {
                        setServiceId(e.target.value);
                        setDentistId("");
                      }}
                      required
                    >
                      <option value="">Chọn dịch vụ</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.durationMinutes} phút
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const bio = service?.dentists.find((d) => d.id === dentistId)?.bio;
                      return bio ? (
                        <span className="mt-1 block text-xs font-normal text-gray-500">{bio}</span>
                      ) : null;
                    })()}
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Bác sĩ
                    <select
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2"
                      value={dentistId}
                      onChange={(e) => setDentistId(e.target.value)}
                      required
                      disabled={!service}
                    >
                      <option value="">Chọn bác sĩ</option>
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
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Ngày
                    <input
                      type="date"
                      min={today()}
                      max={lastDate}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                    <span className="mt-1 block text-xs font-normal text-gray-500">
                      Nhận đặt trực tuyến đến ngày {showDate(lastDate)}.
                    </span>
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Giờ còn trống
                    <select
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      required
                      disabled={!dentistId || slotLoading || slots.length === 0}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2"
                    >
                      <option value="">
                        {slotLoading
                          ? "Đang tải giờ…"
                          : slots.length
                            ? "Chọn giờ"
                            : "Không có giờ trống"}
                      </option>
                      {slots.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                    {minLead > 0 && (
                      <span className="mt-1 block text-xs font-normal text-gray-500">
                        Đặt trực tuyến trước ít nhất{" "}
                        {minLead % 60 === 0
                          ? minLead / 60 + " giờ"
                          : minLead + " phút"}
                        ; cần sớm hơn vui lòng gọi phòng khám
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
                              Ngày gần nhất còn giờ trống: {showDate(nextDate)}
                            </button>
                          ) : (
                            "Chưa thấy giờ trống trong 2 tuần tới, vui lòng chọn bác sĩ khác hoặc gọi phòng khám."
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <h2 className="mb-3 font-semibold text-gray-900">
                  2. Thông tin người đăng ký
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                    Họ và tên
                    <input
                      required
                      maxLength={200}
                      value={form.fullName}
                      onChange={(e) => set("fullName", e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Ngày sinh
                    <input
                      required
                      type="date"
                      max={today()}
                      value={form.dob}
                      onChange={(e) => set("dob", e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Giới tính
                    <select
                      value={form.gender}
                      onChange={(e) => set("gender", e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2"
                    >
                      <option value="UNDISCLOSED">Không muốn nêu</option>
                      <option value="FEMALE">Nữ</option>
                      <option value="MALE">Nam</option>
                      <option value="OTHER">Khác</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Số điện thoại
                    <input
                      required
                      type="tel"
                      maxLength={20}
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Email (để nhận thông báo)
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Người giám hộ (nếu dưới 12 tuổi)
                    <input
                      value={form.contactPersonName}
                      onChange={(e) => set("contactPersonName", e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    SĐT người giám hộ
                    <input
                      type="tel"
                      value={form.contactPersonPhone}
                      onChange={(e) =>
                        set("contactPersonPhone", e.target.value)
                      }
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm font-medium text-gray-700 sm:col-span-2">
                    Lý do khám (không nhập thông tin khẩn cấp)
                    <textarea
                      maxLength={1000}
                      rows={3}
                      value={form.reason}
                      onChange={(e) => set("reason", e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </label>
                </div>
              </div>
              <label className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm text-gray-700">
                <input
                  required
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => set("consent", e.target.checked)}
                  className="mt-1"
                />
                <span>
                  Tôi đồng ý để phòng khám sử dụng thông tin trên nhằm xử lý yêu
                  cầu đặt lịch và liên hệ về lịch khám.
                </span>
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
                disabled={submitting}
                className="w-full rounded-md bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {submitting ? "Đang gửi…" : "Gửi yêu cầu đặt lịch"}
              </button>
            </form>
          )}
          <p className="mt-5 text-xs text-gray-500">
            Nếu cần hỗ trợ, hãy gọi trực tiếp phòng khám. Không gửi thông tin
            cấp cứu qua biểu mẫu này.
          </p>
        </section>
      </div>
    </main>
  );
}
