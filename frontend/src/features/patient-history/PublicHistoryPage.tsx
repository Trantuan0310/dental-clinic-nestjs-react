import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ClipboardList, FileText, Pill, Receipt, Stethoscope } from 'lucide-react';
import { api, unwrap } from '@/lib/api';
import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PublicTopBar } from '@/features/booking/PublicTopBar';

type History = {
  patient: { code: string; fullName: string };
  expiresAt: string;
  visits: Array<{
    date: string;
    dentistName: string;
    chiefComplaint: string | null;
    diagnosis: string | null;
    summary: string | null;
    treatments: Array<{ name: string; teeth: number[]; quantity: number }>;
    prescription: Array<{ drugName: string; dosage: string; frequency: string; duration: string }>;
  }>;
  plans: Array<{
    title: string;
    status: string;
    done: number;
    total: number;
    items: Array<{ procedure: string; teeth: number[]; status: string }>;
  }>;
  upcoming: Array<{ startAt: string; status: string; reason: string | null; dentistName: string }>;
  invoices: Array<{ code: string; issuedAt: string | null; status: string; total: number; paid: number; outstanding: number }>;
};

const TZ = 'Asia/Ho_Chi_Minh';
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString('vi-VN', { timeZone: TZ }) : '—');
const dateTime = (v: string) =>
  new Date(v).toLocaleString('vi-VN', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const money = (n: number) => `${n.toLocaleString('vi-VN')} ₫`;
const teethText = (teeth: number[]) => (teeth.length ? ` — răng ${teeth.join(', ')}` : '');

const PLAN_STATUS: Record<string, string> = { ACCEPTED: 'Đã đồng ý', IN_PROGRESS: 'Đang điều trị', COMPLETED: 'Hoàn thành' };
const INVOICE_STATUS: Record<string, { label: string; tone: string }> = {
  PAID: { label: 'Đã thanh toán', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PARTIAL: { label: 'Còn nợ', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  ISSUED: { label: 'Chưa thanh toán', tone: 'bg-red-50 text-red-700 border-red-200' },
};

function Section({ icon: Icon, title, children }: { icon: typeof FileText; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-surface-100">
        <Icon className="h-4 w-4 text-brand-600" aria-hidden /> {title}
      </h2>
      {children}
    </section>
  );
}

const empty = (text: string) => <p className="text-sm text-gray-500 dark:text-surface-400">{text}</p>;

/** What the patient sees behind their history link: read-only, no staff notes. */
export default function PublicHistoryPage() {
  const { ma = '' } = useParams();
  const history = useQuery({
    queryKey: ['public-patient-history', ma],
    queryFn: async () => unwrap((await api.get(`/public/patient-history/${encodeURIComponent(ma)}`)).data) as History,
    retry: false,
  });
  const h = history.data;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 dark:bg-surface-950">
      <div className="mx-auto max-w-2xl">
        <PublicTopBar />
        <Card className="p-5 sm:p-7">
          {history.isPending ? (
            <p role="status">Đang tải lịch sử khám…</p>
          ) : history.isError || !h ? (
            <div role="alert">
              <h1 className="text-xl font-semibold">Đường dẫn không hợp lệ hoặc đã hết hạn</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-surface-300">
                Bạn có thể <Link to="/tra-cuu-lich-su" className="text-brand-700 hover:underline dark:text-brand-300">yêu cầu đường dẫn mới</Link> hoặc liên hệ phòng khám.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-surface-100">Lịch sử khám của {h.patient.fullName}</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
                Mã hồ sơ {h.patient.code} · Đường dẫn hết hạn ngày {day(h.expiresAt)}. Vui lòng không chia sẻ đường dẫn này.
              </p>

              <Section icon={CalendarClock} title="Lịch hẹn sắp tới">
                {h.upcoming.length === 0
                  ? empty('Chưa có lịch hẹn sắp tới.')
                  : (
                    <ul className="space-y-2">
                      {h.upcoming.map((a) => (
                        <li key={a.startAt} className="rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-900">
                          <strong className="font-semibold">{dateTime(a.startAt)}</strong> · {a.dentistName}
                          {a.reason ? <span className="text-gray-600 dark:text-surface-300"> · {a.reason}</span> : null}
                          {a.status === 'CONFIRMED' && <span className="ml-1 text-emerald-700"> (đã xác nhận)</span>}
                        </li>
                      ))}
                    </ul>
                  )}
              </Section>

              <Section icon={Stethoscope} title={`Các lần khám (${h.visits.length})`}>
                {h.visits.length === 0
                  ? empty('Chưa có lần khám nào được ghi nhận.')
                  : (
                    <ol className="relative space-y-4 border-l border-gray-200 pl-5 dark:border-surface-700" data-testid="history-visits">
                      {h.visits.map((v, i) => (
                        <li key={`${v.date}-${i}`} className="relative">
                          <span className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500 dark:border-surface-900" aria-hidden />
                          <p className="text-sm">
                            <strong className="font-semibold text-gray-900 dark:text-surface-100">{day(v.date)}</strong>
                            <span className="text-gray-500 dark:text-surface-400"> · {v.dentistName}</span>
                          </p>
                          {(v.chiefComplaint || v.diagnosis) && (
                            <p className="mt-0.5 text-sm text-gray-600 dark:text-surface-300">
                              {v.chiefComplaint && <>Lý do khám: {v.chiefComplaint}. </>}
                              {v.diagnosis && <>Chẩn đoán: {v.diagnosis}.</>}
                            </p>
                          )}
                          {v.treatments.length > 0 && (
                            <ul className="mt-1 list-disc pl-5 text-sm text-gray-900 dark:text-surface-100">
                              {v.treatments.map((t, j) => (
                                <li key={j}>
                                  {t.name}
                                  {teethText(t.teeth)}
                                  {t.quantity > 1 ? ` × ${t.quantity}` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                          {v.prescription.length > 0 && (
                            <div className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-surface-800">
                              <p className="flex items-center gap-1 font-medium text-gray-700 dark:text-surface-200">
                                <Pill className="h-3.5 w-3.5" aria-hidden /> Đơn thuốc
                              </p>
                              <ul className="mt-1 space-y-0.5 text-gray-700 dark:text-surface-300">
                                {v.prescription.map((p, j) => (
                                  <li key={j}>
                                    {p.drugName} {p.dosage} — {p.frequency}, {p.duration}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {v.summary && <p className="mt-1 text-xs text-gray-500 dark:text-surface-400">{v.summary}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
              </Section>

              <Section icon={ClipboardList} title="Kế hoạch điều trị">
                {h.plans.length === 0
                  ? empty('Chưa có kế hoạch điều trị.')
                  : (
                    <ul className="space-y-3">
                      {h.plans.map((p, i) => (
                        <li key={i} className="rounded-lg border border-gray-200 p-3 dark:border-surface-700">
                          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                            <strong className="font-semibold text-gray-900 dark:text-surface-100">{p.title}</strong>
                            <span className="text-gray-500 dark:text-surface-400">
                              {PLAN_STATUS[p.status] ?? p.status} · {p.done}/{p.total} bước
                            </span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-surface-800" aria-hidden>
                            <div className="h-full bg-brand-500" style={{ width: `${p.total ? (100 * p.done) / p.total : 0}%` }} />
                          </div>
                          <ul className="mt-2 space-y-0.5 text-sm">
                            {p.items.map((it, j) => (
                              <li key={j} className={cn(it.status === 'DONE' ? 'text-gray-500 line-through dark:text-surface-500' : it.status === 'SKIPPED' ? 'text-gray-400' : 'text-gray-900 dark:text-surface-100')}>
                                {it.procedure}
                                {teethText(it.teeth)}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
              </Section>

              <Section icon={Receipt} title="Hóa đơn">
                {h.invoices.length === 0
                  ? empty('Chưa có hóa đơn.')
                  : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-surface-700 dark:text-surface-400">
                            <th className="py-1.5 pr-2 font-medium">Số</th>
                            <th className="py-1.5 pr-2 font-medium">Ngày</th>
                            <th className="py-1.5 pr-2 text-right font-medium">Tổng</th>
                            <th className="py-1.5 pr-2 text-right font-medium">Còn nợ</th>
                            <th className="py-1.5 font-medium">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody>
                          {h.invoices.map((inv) => {
                            const s = INVOICE_STATUS[inv.status];
                            return (
                              <tr key={inv.code} className="border-b border-gray-100 dark:border-surface-800">
                                <td className="py-1.5 pr-2 font-mono text-xs">{inv.code}</td>
                                <td className="py-1.5 pr-2">{day(inv.issuedAt)}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">{money(inv.total)}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums">{inv.outstanding > 0 ? money(inv.outstanding) : '—'}</td>
                                <td className="py-1.5">
                                  <span className={cn('rounded-full border px-2 py-0.5 text-xs', s?.tone)}>{s?.label ?? inv.status}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
              </Section>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
