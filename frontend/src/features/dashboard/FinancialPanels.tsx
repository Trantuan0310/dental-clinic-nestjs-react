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
  const { t } = useTranslation();
  const k = (key: string) => t(`uiEntry.financialPanels.${key}`);
  if (pending) return <p role="status">{k('loading')}</p>;
  if (error) return <p role="alert">{k('reportUnavailable')} <button type="button" className="underline" onClick={retry}>{k('retry')}</button></p>;
  return children;
}


function Waterfall({ data }: { data: FinancialWaterfall }) {
  const { t } = useTranslation();
  const k = (key: string) => t(`uiEntry.financialPanels.${key}`);
  const chart = useChartTheme();
  const steps = data.steps.map(row => ({ ...row, label: t(`uiEntry.financialPanels.step.${row.key}`, { defaultValue: row.key }), span: [row.from, row.to] }));
  return <>
    <p className="mb-3 text-xs text-gray-500 dark:text-surface-400">{k('revenueIssueDateLessDated')}</p>
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

function Dentists({ data }: { data: DentistPanel[] }) {
  const { t } = useTranslation();
  const k = (key: string) => t(`uiEntry.financialPanels.${key}`);
  const chart = useChartTheme();
  const revenueMin = Math.min(0, ...data.map(d => d.revenue));
  const revenueMax = Math.max(1, ...data.map(d => d.revenue));
  const visitMax = Math.max(1, ...data.map(d => d.visits));
  if (!data.length) return <p>{k('noDentistsInThisPeriod')}</p>;
  return <>
    <p className="mb-3 text-xs text-gray-500 dark:text-surface-400">{k('eachMetricUsesTheSame')}</p>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.map(d => <section key={d.dentistId} className="rounded border p-3 dark:border-surface-700">
      <h3 className="font-semibold">{d.dentistName}</h3>
      {([
        [k('netRevenue'), d.revenue, revenueMin, revenueMax, true],
        [k('visits'), d.visits, 0, visitMax, false],
        [k('planAcceptance'), d.acceptancePct, 0, 100, false],
      ] as const).map(([label, value, min, max, money]) => <div key={label}>
        <p className="mt-3 text-sm">{label}: <strong>{value === null ? '—' : money ? formatCurrency(value) : value}</strong></p>
        {value !== null && <div className="h-14" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={[{ value }]} margin={{ left: 5, right: 15, top: 0, bottom: 0 }}>
            <XAxis type="number" stroke={chart.axis} domain={[min, max]} tickFormatter={money ? value => vndCompact(value) : undefined} tick={{ fontSize: 10 }} ticks={min === 0 ? [0, max] : [min, 0, max]} />
            <YAxis type="category" hide /><Bar dataKey="value" fill={chart.series[0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer></div>}
      </div>)}
      <p className="text-xs">{k('acceptedProposed')}: {d.accepted} / {d.proposed}</p>
    </section>)}</div>
  </>;
}

function Aging({ data }: { data: MonthlyAging[] }) {
  const { t } = useTranslation();
  const k = (key: string) => t(`uiEntry.financialPanels.${key}`);
  const chart = useChartTheme();
  const buckets = ['D0_30', 'D31_60', 'D61_90', 'D90_PLUS'] as const;
  const names = buckets.map(b => k(`aging.${b}`));
  if (!data.length) return <p>{k('noSnapshotsInThisRange')}</p>;
  return <>
    <p className="text-xs text-gray-500 dark:text-surface-400">{k('outstandingAtEachMonthEnd')}</p>
    <div className="mt-3 h-72" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}><CartesianGrid stroke={chart.grid} vertical={false} />
        <XAxis dataKey="month" stroke={chart.axis} /><YAxis stroke={chart.axis} tickFormatter={value => vndCompact(value)} /><Tooltip {...chart.tooltip} formatter={value => formatCurrency(Number(value))} /><Legend />
        {buckets.map((key, i) => <Bar key={key} dataKey={key} name={names[i]} stackId="aging" fill={chart.series[i % chart.series.length]} isAnimationActive={false} />)}
      </BarChart>
    </ResponsiveContainer></div>
    <div className="overflow-x-auto"><table className="w-full text-right text-sm"><caption className="sr-only">{k('monthlyOutstandingByAge')}</caption>
      <thead><tr><th scope="col">{k('month')}</th>{names.map(name => <th scope="col" key={name}>{name}</th>)}<th scope="col">{k('total')}</th></tr></thead>
      <tbody>{data.map(row => <tr key={row.month}><th scope="row">{row.month}</th>{buckets.map(key => <td key={key}>{formatCurrency(row[key])}</td>)}<td>{formatCurrency(row.total)}</td></tr>)}</tbody>
    </table></div>
  </>;
}

export function FinancialPanels({ range, enabled = true }: { range: RangeQuery; enabled?: boolean }) {
  const { t } = useTranslation();
  const k = (key: string) => t(`uiEntry.financialPanels.${key}`);
  const revenue = useAuthStore(s => s.hasPermission('report.revenue.read'));
  const debt = useAuthStore(s => s.hasPermission('report.outstanding.read'));
  const waterfall = useQuery({ queryKey: ['dashboard-waterfall', range], queryFn: () => dashboardApi.financialWaterfall(range), enabled: enabled && revenue });
  const dentists = useQuery({ queryKey: ['dashboard-dentist-panels', range], queryFn: () => dashboardApi.dentistPanels(range), enabled: enabled && revenue });
  const aging = useQuery({ queryKey: ['dashboard-monthly-aging', range], queryFn: () => dashboardApi.monthlyAging(range), enabled: enabled && debt });
  if (!enabled) return null;
  return <div className="space-y-4">
    {revenue && <Card title={k('financialWaterfall')}><PanelState pending={waterfall.isPending} error={waterfall.isError} retry={() => void waterfall.refetch()}>{waterfall.data && <Waterfall data={waterfall.data} />}</PanelState></Card>}
    {revenue && <Card title={k('dentistPanels')}><PanelState pending={dentists.isPending} error={dentists.isError} retry={() => void dentists.refetch()}>{dentists.data && <Dentists data={dentists.data} />}</PanelState></Card>}
    {debt && <Card title={k('monthlyAging')}><PanelState pending={aging.isPending} error={aging.isError} retry={() => void aging.refetch()}>{aging.data && <Aging data={aging.data} />}</PanelState></Card>}
  </div>;
}
