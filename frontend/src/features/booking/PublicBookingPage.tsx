import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { bookingErrorMessage } from "./errorMessage";
import { SPECIALTY_LABEL } from "@/features/staff/labels";

type Dentist = { id: string; fullName: string; specialties: string[] };
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

const today = () => {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
};

export default function PublicBookingPage() {
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const service = useMemo(
    () => services.find((x) => x.id === serviceId),
    [services, serviceId],
  );
  const [dentistId, setDentistId] = useState("");
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<string[]>([]);
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
      .then((r) => setServices(r.data.data))
      .catch(() =>
        setError("Không tải được danh sách dịch vụ. Vui lòng thử lại sau."),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setSlots([]);
    setTime("");
    if (!serviceId || !dentistId || !date) return;
    setSlotLoading(true);
    api
      .get<{ data: { availableSlots: string[] } }>("/public/booking/slots", {
        params: { serviceId, dentistId, date },
      })
      .then((r) => setSlots(r.data.data.availableSlots))
      .catch(() =>
        setError(
          "Không tải được giờ trống. Chọn ngày khác hoặc liên hệ lễ tân.",
        ),
      )
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
      sessionStorage.setItem(
        "booking:" + result.referenceCode,
        result.accessToken,
      );
      navigate(
        "/booking/status?ref=" + encodeURIComponent(result.referenceCode),
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
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-teal-700">
            GENSMILE
          </Link>
          <Link
            to="/booking/status"
            className="text-sm font-medium text-teal-700 hover:underline"
          >
            Tra cứu yêu cầu
          </Link>
        </div>
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
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    />
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
                  </label>
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
