import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, vndCompact } from '@/lib/format';
import { useChartTheme } from '@/lib/chartTheme';
import { dashboardApi, type RangeQuery } from './dashboardApi';
import type { DentistPanel, FinancialWaterfall, MonthlyAging } from './financialTypes';

function PanelState({ pending, error, retry, children }: { pending: boolean; error: boolean; retry: () => void; children: ReactNode }) {
  const { i18n } = useTranslation();
  const en = i18n.resolvedLanguage?.startsWith('en');
  if (pending) return <p role="status">{en ? 'Loading…' : 'Đang tải…'}</p>;
  if (error) return <p role="alert">{en ? 'Report unavailable.' : 'Không tải được báo cáo.'} <button type="button" className="underline" onClick={retry}>{en ? 'Retry' : 'Thử lại'}</button></p>;
  return children;
}

const STEP_LABELS: Record<string, [string, string]> = {
  gross: ['Điều trị trước giảm giá', 'Gross treatment'], discount: ['Giảm giá', 'Discounts'],
  refund: ['Hoàn tiền', 'Refunds'], adjustment: ['Điều chỉnh giảm', 'Write-downs'], void: ['Huỷ hoá đơn', 'Voids'],
  netRevenue: ['Doanh thu ròng', 'Net revenue'], collectionBridge: ['Chênh lệch kỳ thu', 'Collection timing bridge'],
  collected: ['Đã thu ròng', 'Net collected'], expense: ['Chi phí', 'Expenses'], payroll: ['Lương đã trả', 'Payroll paid'], remaining: ['Còn lại', 'Remaining cash'],
};

function Waterfall({ data, en }: { data: FinancialWaterfall; en: boolean }) {
  const chart = useChartTheme();
  const steps = data.steps.map(row => ({ ...row, label: STEP_LABELS[row.key]?.[en ? 1 : 0] ?? row.key, span: [row.from, row.to] }));
  return <>
    <p className="mb-3 text-xs text-gray-500 dark:text-surface-400">{en ? 'Revenue: issue date, less dated refunds, write-downs and voids. The timing bridge includes collections of earlier debt and current unpaid revenue. Expenses: approved/reimbursed by expense date; payroll: paid/locked by payment date. Remaining cash is not accounting profit.' : 'Doanh thu theo ngày phát hành, trừ hoàn tiền, điều chỉnh và huỷ theo ngày phát sinh. Chênh lệch kỳ thu gồm thu nợ cũ và doanh thu chưa thu. Chi phí đã duyệt/hoàn theo ngày chi; lương đã trả/khoá theo ngày trả. Còn lại là dòng tiền, không phải lợi nhuận kế toán.'}</p>
    <div className="h-[440px]" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={steps} layout="vertical" margin={{ left: 10, right: 20 }}>
        <CartesianGrid stroke={chart.grid} horizontal={false} />
        <XAxis type="number" stroke={chart.axis} tickFormatter={value => vndCompact(value)} /><YAxis type="category" stroke={chart.axis} dataKey="label" width={145} tick={{ fontSize: 11 }} />
        <Tooltip {...chart.tooltip} formatter={(_value, _name, item) => formatCurrency((item.payload as { amount: number }).amount)} />
        <Bar dataKey="span" isAnimationActive={false}>{steps.map(step => <Cell key={step.key} fill={step.total ? chart.series[0] : step.amount < 0 ? chart.series[4] : chart.series[2]} />)}</Bar>
      </BarChart>
    </ResponsiveContainer></div>
    <dl className="grid grid-cols-2 gap-x-4 text-sm">{steps.map(step => <div key={step.key} className="contents"><dt>{step.label}</dt><dd className="text-right tabular-nums">{formatCurrency(step.amount)}</dd></div>)}</dl>
  </>;
}

function Dentists({ data, en }: { data: DentistPanel[]; en: boolean }) {
  const chart = useChartTheme();
  const revenueMin = Math.min(0, ...data.map(d => d.revenue));
  const revenueMax = Math.max(1, ...data.map(d => d.revenue));
  const visitMax = Math.max(1, ...data.map(d => d.visits));
  if (!data.length) return <p>{en ? 'No dentists in this period.' : 'Không có bác sĩ trong kỳ.'}</p>;
  return <>
    <p className="mb-3 text-xs text-gray-500 dark:text-surface-400">{en ? 'Each metric uses the same scale across dentists. Visits are started encounters. Acceptance is accepted / proposed plans proposed in this period, as recorded now.' : 'Cùng thang đo cho từng chỉ số giữa các bác sĩ. Lượt khám là phiên đã bắt đầu. Chấp nhận = đã chấp nhận / đã đề xuất trong kỳ, theo trạng thái hiện tại.'}</p>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.map(d => <section key={d.dentistId} className="rounded border p-3 dark:border-surface-700">
      <h3 className="font-semibold">{d.dentistName}</h3>
      {([
        [en ? 'Net revenue' : 'Doanh thu ròng', d.revenue, revenueMin, revenueMax, true],
        [en ? 'Visits' : 'Lượt khám', d.visits, 0, visitMax, false],
        [en ? 'Plan acceptance (%)' : 'Chấp nhận kế hoạch (%)', d.acceptancePct, 0, 100, false],
      ] as const).map(([label, value, min, max, money]) => <div key={label}>
        <p className="mt-3 text-sm">{label}: <strong>{value === null ? '—' : money ? formatCurrency(value) : value}</strong></p>
        {value !== null && <div className="h-14" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={[{ value }]} margin={{ left: 5, right: 15, top: 0, bottom: 0 }}>
            <XAxis type="number" stroke={chart.axis} domain={[min, max]} tickFormatter={money ? value => vndCompact(value) : undefined} tick={{ fontSize: 10 }} ticks={min === 0 ? [0, max] : [min, 0, max]} />
            <YAxis type="category" hide /><Bar dataKey="value" fill={chart.series[0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer></div>}
      </div>)}
      <p className="text-xs">{en ? 'Accepted / proposed' : 'Chấp nhận / đề xuất'}: {d.accepted} / {d.proposed}</p>
    </section>)}</div>
  </>;
}

function Aging({ data, en }: { data: MonthlyAging[]; en: boolean }) {
  const chart = useChartTheme();
  const buckets = ['D0_30', 'D31_60', 'D61_90', 'D90_PLUS'] as const;
  const names = en ? ['0–30 days', '31–60 days', '61–90 days', '>90 days'] : ['0–30 ngày', '31–60 ngày', '61–90 ngày', '>90 ngày'];
  if (!data.length) return <p>{en ? 'No snapshots in this range.' : 'Không có mốc chốt trong khoảng này.'}</p>;
  return <>
    <p className="text-xs text-gray-500 dark:text-surface-400">{en ? 'Outstanding at each month-end; the last month stops at the selected end date or now. Aging is measured from issue date in clinic days. Refunds do not reopen debt; later receipts and voids do not erase earlier balances.' : 'Dư nợ tại cuối mỗi tháng; tháng cuối chốt tại ngày kết thúc đã chọn hoặc hiện tại. Tuổi nợ tính từ ngày phát hành theo ngày phòng khám. Hoàn tiền không mở lại nợ; thu tiền và huỷ sau mốc chốt không xoá số dư trước đó.'}</p>
    <div className="mt-3 h-72" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}><CartesianGrid stroke={chart.grid} vertical={false} />
        <XAxis dataKey="month" stroke={chart.axis} /><YAxis stroke={chart.axis} tickFormatter={value => vndCompact(value)} /><Tooltip {...chart.tooltip} formatter={value => formatCurrency(Number(value))} /><Legend />
        {buckets.map((key, i) => <Bar key={key} dataKey={key} name={names[i]} stackId="aging" fill={chart.series[i % chart.series.length]} isAnimationActive={false} />)}
      </BarChart>
    </ResponsiveContainer></div>
    <div className="overflow-x-auto"><table className="w-full text-right text-sm"><caption className="sr-only">{en ? 'Monthly outstanding by age' : 'Dư nợ hàng tháng theo tuổi nợ'}</caption>
      <thead><tr><th scope="col">{en ? 'Month' : 'Tháng'}</th>{names.map(name => <th scope="col" key={name}>{name}</th>)}<th scope="col">{en ? 'Total' : 'Tổng'}</th></tr></thead>
      <tbody>{data.map(row => <tr key={row.month}><th scope="row">{row.month}</th>{buckets.map(key => <td key={key}>{formatCurrency(row[key])}</td>)}<td>{formatCurrency(row.total)}</td></tr>)}</tbody>
    </table></div>
  </>;
}

export function FinancialPanels({ range, enabled = true }: { range: RangeQuery; enabled?: boolean }) {
  const { i18n } = useTranslation();
  const en = !!i18n.resolvedLanguage?.startsWith('en');
  const revenue = useAuthStore(s => s.hasPermission('report.revenue.read'));
  const debt = useAuthStore(s => s.hasPermission('report.outstanding.read'));
  const waterfall = useQuery({ queryKey: ['dashboard-waterfall', range], queryFn: () => dashboardApi.financialWaterfall(range), enabled: enabled && revenue });
  const dentists = useQuery({ queryKey: ['dashboard-dentist-panels', range], queryFn: () => dashboardApi.dentistPanels(range), enabled: enabled && revenue });
  const aging = useQuery({ queryKey: ['dashboard-monthly-aging', range], queryFn: () => dashboardApi.monthlyAging(range), enabled: enabled && debt });
  if (!enabled) return null;
  return <div className="space-y-4">
    {revenue && <Card title={en ? 'Financial waterfall' : 'Thác nước tài chính'}><PanelState pending={waterfall.isPending} error={waterfall.isError} retry={() => void waterfall.refetch()}>{waterfall.data && <Waterfall data={waterfall.data} en={en} />}</PanelState></Card>}
    {revenue && <Card title={en ? 'Dentist panels' : 'Chỉ số theo bác sĩ'}><PanelState pending={dentists.isPending} error={dentists.isError} retry={() => void dentists.refetch()}>{dentists.data && <Dentists data={dentists.data} en={en} />}</PanelState></Card>}
    {debt && <Card title={en ? 'Monthly aging' : 'Tuổi nợ hàng tháng'}><PanelState pending={aging.isPending} error={aging.isError} retry={() => void aging.refetch()}>{aging.data && <Aging data={aging.data} en={en} />}</PanelState></Card>}
  </div>;
}
