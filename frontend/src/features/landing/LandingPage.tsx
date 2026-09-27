import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  Clock,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { clinic } from '@/config/clinic';
import { SPECIALTY_LABEL } from '@/features/staff/labels';

/**
 * Public home page for patients (gensmile.online/). Services, prices and
 * dentists come from the same public endpoint as the booking form, so the
 * page always shows what can actually be booked; contact details come from
 * the build-time clinic config.
 */

type PublicDentist = { id: string; fullName: string; specialties: string[] };
type PublicService = {
  id: string;
  name: string;
  category: string;
  durationMinutes: number;
  basePrice: string | number;
  dentists: PublicDentist[];
};

const NAV = [
  { href: '#dich-vu', label: 'Dịch vụ & bảng giá' },
  { href: '#bac-si', label: 'Bác sĩ' },
  { href: '#quy-trinh', label: 'Đặt lịch' },
  { href: '#lien-he', label: 'Liên hệ' },
];

const HIGHLIGHTS = [
  {
    icon: Stethoscope,
    title: 'Đúng bác sĩ, đúng chuyên môn',
    text: 'Nội nha, phục hình, chỉnh nha, Implant hay nha khoa trẻ em: mỗi ca do bác sĩ phụ trách đúng lĩnh vực đảm nhận.',
  },
  {
    icon: BadgeDollarSign,
    title: 'Giá rõ ràng trước khi làm',
    text: 'Bảng giá công khai ngay trên trang. Bác sĩ báo chi phí cụ thể sau khi khám, bạn đồng ý rồi mới điều trị.',
  },
  {
    icon: ShieldCheck,
    title: 'Vô khuẩn từng ca',
    text: 'Dụng cụ được làm sạch, đóng gói và hấp tiệt trùng sau mỗi lượt dùng; vật tư tiêu hao dùng một lần.',
  },
  {
    icon: CalendarClock,
    title: 'Đặt lịch online, ít phải chờ',
    text: 'Chọn giờ theo lịch trống thật của bác sĩ và theo dõi trạng thái yêu cầu bằng mã tra cứu.',
  },
];

const STEPS = [
  {
    icon: CalendarCheck,
    title: 'Chọn dịch vụ, bác sĩ và giờ',
    text: 'Trang đặt lịch chỉ hiện những giờ bác sĩ còn trống. Điền họ tên và số điện thoại là xong.',
  },
  {
    icon: Phone,
    title: 'Lễ tân xác nhận',
    text: 'Phòng khám kiểm tra và xác nhận lịch. Bạn tra cứu trạng thái bất cứ lúc nào bằng mã đặt lịch.',
  },
  {
    icon: ClipboardCheck,
    title: 'Đến khám đúng giờ',
    text: 'Mang theo giấy tờ tùy thân, phim X-quang hoặc đơn thuốc cũ nếu có để bác sĩ tư vấn chính xác hơn.',
  },
];

const FAQ = [
  {
    q: 'Đặt lịch online có mất phí không?',
    a: 'Không. Đặt lịch hoàn toàn miễn phí; bạn chỉ thanh toán cho dịch vụ đã thực hiện sau khi khám.',
  },
  {
    q: 'Giá trên trang đã là giá cuối cùng chưa?',
    a: 'Đây là giá tham khảo cho một đơn vị dịch vụ (một răng, một hàm hoặc một liệu trình như ghi trong tên). Bác sĩ sẽ báo chi phí chính xác sau khi khám và bạn đồng ý mới bắt đầu điều trị.',
  },
  {
    q: 'Muốn đổi hoặc hủy lịch thì làm thế nào?',
    a: 'Gọi hotline hoặc nhắn Zalo cho lễ tân, kèm mã đặt lịch bạn nhận được sau khi gửi yêu cầu.',
  },
  {
    q: 'Trẻ em có khám được không?',
    a: 'Có. Phòng khám nhận khám răng cho trẻ em; người giám hộ đặt lịch và đi cùng bé khi đến khám.',
  },
];

const money = new Intl.NumberFormat('vi-VN');
const formatPrice = (value: string | number) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return amount === 0 ? 'Miễn phí' : `${money.format(amount)} đ`;
};

const initials = (fullName: string) =>
  fullName
    .replace(/^(BS|ThS|TS|BSCKI|BSCKII)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

function useBookingOptions() {
  return useQuery({
    queryKey: ['public-booking-options'],
    queryFn: async () =>
      (await api.get<{ data: PublicService[] }>('/public/booking/options')).data.data,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

function PrimaryCta({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/booking"
      className={
        'inline-flex items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ' +
        className
      }
    >
      <CalendarCheck className="h-5 w-5" aria-hidden />
      Đặt lịch khám
    </Link>
  );
}

function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <a href="#top" className="flex items-center gap-2" aria-label={clinic.name}>
          <img src="/logo-icon.svg" alt="" className="h-9 w-9" />
          <span className="text-lg font-bold tracking-wide text-brand-600">GENSMILE</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm font-medium text-gray-700 md:flex" aria-label="Điều hướng chính">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-brand-600">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {clinic.phone && (
            <a
              href={`tel:${clinic.phoneHref}`}
              className="hidden items-center gap-1.5 text-sm font-semibold text-brand-600 lg:inline-flex"
            >
              <Phone className="h-4 w-4" aria-hidden />
              {clinic.phone}
            </a>
          )}
          <Link
            to="/booking"
            className="hidden rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 sm:inline-flex"
          >
            Đặt lịch
          </Link>
          <button
            type="button"
            className="rounded-md p-2 text-gray-700 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Đóng menu' : 'Mở menu'}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-gray-100 bg-white px-4 py-3 md:hidden" aria-label="Điều hướng">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-2.5 font-medium text-gray-700 hover:bg-brand-50"
            >
              {item.label}
            </a>
          ))}
          <Link
            to="/booking/status"
            className="block rounded-md px-2 py-2.5 font-medium text-gray-700 hover:bg-brand-50"
          >
            Tra cứu lịch đã đặt
          </Link>
        </nav>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 md:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-medium text-brand-600 shadow-sm ring-1 ring-brand-100">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
            {clinic.tagline} · Đặt lịch online
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">
            Nụ cười khỏe đẹp, <span className="text-brand-600">bắt đầu từ một lần khám</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-gray-600">
            Khám, tư vấn và điều trị răng miệng cho cả gia đình tại {clinic.name}. Chọn dịch vụ,
            bác sĩ và giờ phù hợp ngay trên điện thoại, lễ tân sẽ xác nhận lịch cho bạn.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PrimaryCta />
            {clinic.phone ? (
              <a
                href={`tel:${clinic.phoneHref}`}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-200 bg-white px-6 py-3 font-semibold text-brand-600 hover:bg-brand-50"
              >
                <Phone className="h-5 w-5" aria-hidden />
                Gọi {clinic.phone}
              </a>
            ) : (
              <a
                href="#dich-vu"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-200 bg-white px-6 py-3 font-semibold text-brand-600 hover:bg-brand-50"
              >
                Xem bảng giá
              </a>
            )}
          </div>
          <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-500" aria-hidden />
              <dt className="sr-only">Giờ làm việc</dt>
              <dd>
                {clinic.hours[0].days}: {clinic.hours[0].time}
              </dd>
            </div>
            {clinic.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-brand-500" aria-hidden />
                <dt className="sr-only">Địa chỉ</dt>
                <dd>{clinic.address}</dd>
              </div>
            )}
          </dl>
        </div>
        <div className="relative mx-auto w-full max-w-sm" aria-hidden>
          <div className="absolute inset-0 -z-0 rounded-full bg-brand-100 blur-3xl" />
          <div className="relative rounded-[2.5rem] bg-white p-10 shadow-xl ring-1 ring-brand-100">
            <img src="/logo-full.svg" alt="" className="mx-auto w-full max-w-[260px]" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Highlights() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14" aria-labelledby="vi-sao">
      <h2 id="vi-sao" className="text-center text-3xl font-bold text-gray-900">
        Vì sao chọn GENSMILE
      </h2>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <h3 className="mt-4 font-semibold text-gray-900">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Services({ services, isLoading, isError }: { services: PublicService[]; isLoading: boolean; isError: boolean }) {
  const categories = useMemo(() => [...new Set(services.map((s) => s.category))], [services]);
  const [active, setActive] = useState('');
  const current = categories.includes(active) ? active : categories[0] ?? '';
  const visible = services.filter((s) => s.category === current);

  return (
    <section id="dich-vu" className="scroll-mt-20 bg-slate-50 py-14" aria-labelledby="dich-vu-title">
      <div className="mx-auto max-w-6xl px-4">
        <h2 id="dich-vu-title" className="text-center text-3xl font-bold text-gray-900">
          Dịch vụ & bảng giá
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
          Giá tham khảo cho từng dịch vụ. Chi phí cụ thể được bác sĩ báo sau khi khám.
        </p>

        {isLoading ? (
          <p className="mt-10 text-center text-gray-500">Đang tải bảng giá…</p>
        ) : isError || services.length === 0 ? (
          <div className="mx-auto mt-10 max-w-xl rounded-xl bg-white p-6 text-center text-gray-600 shadow-sm">
            Bảng giá đang được cập nhật.{' '}
            {clinic.phone ? (
              <>
                Gọi{' '}
                <a className="font-semibold text-brand-600" href={`tel:${clinic.phoneHref}`}>
                  {clinic.phone}
                </a>{' '}
                để được tư vấn.
              </>
            ) : (
              'Vui lòng liên hệ lễ tân để được tư vấn.'
            )}
          </div>
        ) : (
          <>
            <div className="mt-8 flex gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:justify-center" role="tablist" aria-label="Nhóm dịch vụ">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={c === current}
                  onClick={() => setActive(c)}
                  className={
                    'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ' +
                    (c === current
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-brand-200')
                  }
                >
                  {c}
                </button>
              ))}
            </div>
            <ul className="mt-6 grid gap-3 md:grid-cols-2" role="tabpanel" aria-label={current}>
              {visible.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <p className="mt-0.5 text-sm text-gray-500">khoảng {s.durationMinutes} phút</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold text-brand-600">{formatPrice(s.basePrice)}</span>
                    <Link
                      to={`/booking?service=${encodeURIComponent(s.id)}`}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
                      aria-label={`Đặt lịch ${s.name}`}
                    >
                      Đặt <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function Dentists({ services }: { services: PublicService[] }) {
  const dentists = useMemo(() => {
    const byId = new Map<string, PublicDentist>();
    for (const s of services) for (const d of s.dentists) byId.set(d.id, d);
    return [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  }, [services]);
  if (dentists.length === 0) return null;

  return (
    <section id="bac-si" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14" aria-labelledby="bac-si-title">
      <h2 id="bac-si-title" className="text-center text-3xl font-bold text-gray-900">
        Đội ngũ bác sĩ
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
        Bạn có thể chọn bác sĩ khi đặt lịch, hoặc để phòng khám sắp xếp người phù hợp.
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {dentists.map((d) => (
          <div key={d.id} className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-2xl font-bold text-white">
              {initials(d.fullName) || <UserRound className="h-8 w-8" aria-hidden />}
            </span>
            <h3 className="mt-4 font-semibold text-gray-900">{d.fullName}</h3>
            {d.specialties.length > 0 && (
              <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
                {d.specialties.map((code) => (
                  <li key={code} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                    {SPECIALTY_LABEL[code] ?? code}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Steps() {
  return (
    <section id="quy-trinh" className="scroll-mt-20 bg-brand-600 py-14 text-white" aria-labelledby="quy-trinh-title">
      <div className="mx-auto max-w-6xl px-4">
        <h2 id="quy-trinh-title" className="text-center text-3xl font-bold">
          Đặt lịch trong 3 bước
        </h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="rounded-2xl bg-white/10 p-6 ring-1 ring-white/15">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-gray-900">
                  {i + 1}
                </span>
                <Icon className="h-6 w-6 text-brand-100" aria-hidden />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-50">{text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/booking"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-brand-700 shadow-sm hover:bg-brand-50"
          >
            <CalendarCheck className="h-5 w-5" aria-hidden />
            Đặt lịch ngay
          </Link>
          <Link
            to="/booking/status"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white ring-1 ring-white/40 hover:bg-white/10"
          >
            <Search className="h-5 w-5" aria-hidden />
            Tra cứu lịch đã đặt
          </Link>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-14" aria-labelledby="faq-title">
      <h2 id="faq-title" className="text-center text-3xl font-bold text-gray-900">
        Câu hỏi thường gặp
      </h2>
      <div className="mt-8 divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-sm">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-gray-900">
              {q}
              <span className="text-xl leading-none text-brand-500 transition group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Contact() {
  const mapEmbed = clinic.address
    ? `https://www.google.com/maps?q=${encodeURIComponent(clinic.address)}&output=embed`
    : '';
  const mapLink =
    clinic.mapUrl ||
    (clinic.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinic.address)}` : '');

  return (
    <section id="lien-he" className="scroll-mt-20 bg-slate-50 py-14" aria-labelledby="lien-he-title">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-2">
        <div>
          <h2 id="lien-he-title" className="text-3xl font-bold text-gray-900">
            Giờ làm việc & liên hệ
          </h2>
          <table className="mt-6 w-full overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-gray-100">
            <tbody className="divide-y divide-gray-100">
              {clinic.hours.map((h) => (
                <tr key={h.days}>
                  <th scope="row" className="px-4 py-3 font-medium text-gray-900">
                    {h.days}
                  </th>
                  <td className="px-4 py-3 text-gray-600">{h.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-6 space-y-3 text-gray-700">
            {clinic.address && (
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
                {mapLink ? (
                  <a href={mapLink} target="_blank" rel="noreferrer" className="hover:text-brand-600">
                    {clinic.address}
                  </a>
                ) : (
                  clinic.address
                )}
              </li>
            )}
            {clinic.phone && (
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
                <a href={`tel:${clinic.phoneHref}`} className="font-semibold hover:text-brand-600">
                  {clinic.phone}
                </a>
              </li>
            )}
            {clinic.zaloHref && (
              <li className="flex gap-3">
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
                <a href={clinic.zaloHref} target="_blank" rel="noreferrer" className="hover:text-brand-600">
                  Nhắn Zalo cho lễ tân
                </a>
              </li>
            )}
            {clinic.email && (
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
                <a href={`mailto:${clinic.email}`} className="hover:text-brand-600">
                  {clinic.email}
                </a>
              </li>
            )}
            {clinic.facebookUrl && (
              <li className="flex gap-3">
                <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
                <a href={clinic.facebookUrl} target="_blank" rel="noreferrer" className="hover:text-brand-600">
                  Fanpage Facebook
                </a>
              </li>
            )}
          </ul>
          <PrimaryCta className="mt-8" />
        </div>
        {mapEmbed ? (
          <iframe
            title={`Bản đồ đường đến ${clinic.name}`}
            src={mapEmbed}
            className="h-80 w-full rounded-2xl border-0 shadow-sm md:h-full md:min-h-[22rem]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
            <img src="/logo-icon.svg" alt="" className="h-16 w-16" />
            <p className="mt-4 font-semibold text-gray-900">{clinic.name}</p>
            <p className="mt-1 text-sm text-gray-500">{clinic.tagline}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-gray-500 sm:flex-row">
        <p>
          © {new Date().getFullYear()} {clinic.name}
        </p>
        <div className="flex gap-5">
          <Link to="/booking/status" className="hover:text-brand-600">
            Tra cứu lịch đã đặt
          </Link>
          <Link to="/login" className="hover:text-brand-600">
            Nhân viên đăng nhập
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  const { data: services = [], isLoading, isError } = useBookingOptions();

  useEffect(() => {
    const previous = document.title;
    document.title = `${clinic.name} — Đặt lịch khám răng online`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <SiteHeader />
      <main>
        <Hero />
        <Highlights />
        <Services services={services} isLoading={isLoading} isError={isError} />
        <Dentists services={services} />
        <Steps />
        <Faq />
        <Contact />
      </main>
      <SiteFooter />
      {clinic.phone && (
        <a
          href={`tel:${clinic.phoneHref}`}
          className="fixed bottom-5 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg hover:bg-brand-600 md:hidden"
          aria-label={`Gọi ${clinic.phone}`}
        >
          <Phone className="h-6 w-6" aria-hidden />
        </a>
      )}
    </div>
  );
}
