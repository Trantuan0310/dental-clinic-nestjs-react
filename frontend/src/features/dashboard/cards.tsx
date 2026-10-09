// =============================================================================
// Dashboard Card components — split from DashboardPage for code-splitting
// Each card is a self-contained, lazy-loadable module.
// =============================================================================
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Calendar,
  CreditCard,
  DollarSign,
  Eye,
  Megaphone,
  PlusCircle,
  RefreshCw,
  Stethoscope,
  Users,
  Wallet,
  BarChart3,
} from 'lucide-react';
import { Card, CardSkeleton, EmptyState, KpiCard, Tooltip, Alert } from '@/components/ui';
import { PermissionGuard } from '@/components/PermissionGuard';
import { formatCurrency, formatNumber } from '@/lib/format';
import {
  ACCENT_AMBER,
  RANGE_DESCRIPTIONS,
  RANGE_TITLES,
  SOURCE_COLORS,
  TEAL,
  TEAL_DARK,
  TEAL_LIGHT,
  formatDayLabel,
  formatMonthLabel,
  vndCompact,
  type AppointmentPoint,
  type AppointmentStats,
  type CustomerType,
  type DailyRevenuePoint,
  type DashboardKpis,
  type FinanceSummary,
  type MonthlyRevenuePoint,
  type OutstandingSummary,
  type RevenueByCustomerType,
  type RevenueByDentistRow,
  type RevenueByProcedure,
  type RevenueBySource,
  type TimeRange,
} from './types';

// -----------------------------------------------------------------------------
// Shared card error state — a genuine API failure, distinct from "still
// loading" or "genuinely no data yet" so the admin gets a signal and a retry.
// -----------------------------------------------------------------------------

interface CardErrorStateProps {
  onRetry?: () => void;
}

function CardErrorState({ onRetry }: CardErrorStateProps) {
  return (
    <EmptyState
      icon={<AlertTriangle className="h-10 w-10 text-red-500" />}
      title="Không thể tải dữ liệu"
      description="Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại."
      action={
        onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Thử lại
          </button>
        ) : undefined
      }
    />
  );
}

// -----------------------------------------------------------------------------
// KPI Row
// -----------------------------------------------------------------------------

interface KpiRowProps {
  kpis: DashboardKpis | undefined;
  range: TimeRange;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function KpiRow({ kpis, range, isLoading, isError, onRetry }: KpiRowProps) {
  const comparisonLabel = `So với ${RANGE_DESCRIPTIONS[range]} cùng kỳ trước`;

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError || !kpis) {
    return (
      <Alert type="danger" title="Không thể tải số liệu KPI">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-surface-900 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử lại
            </button>
          )}
        </div>
      </Alert>
    );
  }

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Bệnh nhân"
        value={formatNumber(kpis.patients.total)}
        delta={kpis.patients.pctChange}
        icon={<Users className="h-5 w-5" />}
        iconBgClass="bg-sky-100"
        iconFgClass="text-sky-600"
        sublabel={
          kpis.patients.newCount !== undefined ? (
            <span className="flex items-center gap-2 text-[11px]">
              <Tooltip
                label={
                  <span>
                    Bệnh nhân lần đầu đến khám (đã check-in) trong khoảng thời gian đã chọn.
                  </span>
                }
              >
                <span className="cursor-help rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                  Mới: {kpis.patients.newCount}
                </span>
              </Tooltip>
              <Tooltip
                label={
                  <span>
                    Bệnh nhân đã từng đến khám trước khoảng thời gian đang xem.
                  </span>
                }
              >
                <span className="cursor-help rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700">
                  Cũ: {kpis.patients.returningCount}
                </span>
              </Tooltip>
            </span>
          ) : undefined
        }
        sparkline={kpis.patients.sparkline}
        deltaLabel={comparisonLabel}
      />
      <KpiCard
        label="Lịch hẹn (không tính lịch hủy)"
        value={formatNumber(kpis.appointments.total)}
        delta={kpis.appointments.pctChange}
        icon={<Calendar className="h-5 w-5" />}
        iconBgClass="bg-indigo-100"
        iconFgClass="text-indigo-600"
        deltaLabel={comparisonLabel}
      />
      <KpiCard
        label="Doanh số điều trị"
        value={formatCurrency(kpis.treatmentRevenue.total)}
        delta={kpis.treatmentRevenue.pctChange}
        icon={<DollarSign className="h-5 w-5" />}
        iconBgClass="bg-emerald-100"
        iconFgClass="text-emerald-600"
        deltaLabel={comparisonLabel}
      />
      <KpiCard
        label="Tiền đã thu"
        value={formatCurrency(kpis.collected.total)}
        delta={kpis.collected.pctChange}
        icon={<Wallet className="h-5 w-5" />}
        iconBgClass="bg-teal-100"
        iconFgClass="text-teal-600"
        deltaLabel={comparisonLabel}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Customer type donut
// -----------------------------------------------------------------------------

interface CustomerTypeCardProps {
  /** Real split from the backend (A6-13), no longer pro-rated by head count. */
  rows: RevenueByCustomerType[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function CustomerTypeCard({ rows: data, isLoading, isError, onRetry }: CustomerTypeCardProps) {
  const totalRevenue = data.reduce((acc, d) => acc + d.revenue, 0);
  const labels: Record<CustomerType, string> = { NEW: 'Khách mới', RETURNING: 'Khách cũ' };
  const colors: Record<CustomerType, string> = { NEW: TEAL, RETURNING: TEAL_LIGHT };

  if (isLoading) {
    return (
      <Card title="Doanh số theo loại khách" description="Phân bổ doanh thu giữa khách mới và quay lại">
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title="Doanh số theo loại khách" description="Phân bổ doanh thu giữa khách mới và quay lại">
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  // Net of refunds the total can be 0 (or below) with invoices issued.
  const invoiceCount = data.reduce((acc, d) => acc + (d.count ?? 0), 0);
  const showPie = totalRevenue > 0 && data.every((d) => d.revenue >= 0);
  if (invoiceCount === 0 && totalRevenue === 0) {
    return (
      <Card title="Doanh số theo loại khách" description="Phân bổ doanh thu giữa khách mới và quay lại">
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="Chưa có doanh số"
          description="Trong khoảng thời gian này chưa có hóa đơn nào được phát hành."
          action={
            <Link
              to="/billing/list"
              className="inline-flex items-center gap-1 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              <PlusCircle className="h-4 w-4" /> Tạo hóa đơn
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Card
      title="Doanh số theo loại khách"
      description="Khách mới = lần đầu đến khám trong kỳ; tính trên hóa đơn đã phát hành"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        {showPie ? (
        <div className="relative mx-auto h-44 w-full max-w-[200px] md:mx-0 md:w-5/12 md:max-w-none">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="revenue" nameKey="type" innerRadius={50} outerRadius={78} paddingAngle={2}>
                {data.map((entry) => (
                  <Cell key={entry.type} fill={colors[entry.type]} />
                ))}
              </Pie>
              <ReTooltip
                formatter={(value: any) => [formatCurrency(Number(value)), 'Doanh thu']}
                labelFormatter={(_, payload: any) => labels[payload?.[0]?.payload?.type as CustomerType] ?? ''}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tổng</span>
            <span className="text-base font-bold text-gray-900">{formatCurrency(totalRevenue)}</span>
          </div>
        </div>
        ) : (
          <div className="text-center md:w-5/12">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Tổng (sau hoàn tiền)</p>
            <p className="text-base font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
          </div>
        )}
        <div className="flex-1 space-y-2">
          {data.map((d) => (
            <div key={d.type} className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ background: colors[d.type] }} />
                <span className="text-sm font-medium text-gray-700">{labels[d.type]}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(d.revenue)}</p>
                <p className="text-xs text-gray-500">
                  {d.percentage}% · {d.count} hóa đơn
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Source breakdown
// -----------------------------------------------------------------------------

interface SourceCardProps {
  rows: RevenueBySource[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function SourceCard({ rows, isLoading, isError, onRetry }: SourceCardProps) {
  if (isLoading) {
    return (
      <Card title="Doanh số theo nguồn khách hàng" description="Top kênh đưa khách đến phòng khám">
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title="Doanh số theo nguồn khách hàng" description="Top kênh đưa khách đến phòng khám">
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  const FALLBACK_SOURCES: RevenueBySource[] = [
    { source: 'WALK_IN', sourceLabel: 'Khách vãng lai', revenue: 0, percentage: 0, count: 0 },
    { source: 'PHONE', sourceLabel: 'Qua điện thoại', revenue: 0, percentage: 0, count: 0 },
    { source: 'ONLINE', sourceLabel: 'Trực tuyến', revenue: 0, percentage: 0, count: 0 },
    { source: 'RETURNING', sourceLabel: 'Khách quay lại', revenue: 0, percentage: 0, count: 0 },
  ];
  const byKey = new Map(rows.map((r) => [r.source, r]));
  const merged = FALLBACK_SOURCES.map((f) => byKey.get(f.source) ?? f);
  const hasAny = rows.some((r) => r.revenue > 0);

  return (
    <Card title="Doanh số theo nguồn khách hàng" description="Top kênh đưa khách đến phòng khám">
      {!hasAny ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="Chưa có nguồn khách"
          description="Hãy cập nhật nguồn cho từng lịch hẹn (vãng lai, điện thoại, trực tuyến) để phân tích kênh hiệu quả."
          action={
            <Link
              to="/appointments/list"
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Calendar className="h-4 w-4" /> Mở lịch hẹn
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {merged.map((row) => (
            <li key={row.source}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{row.sourceLabel}</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(row.revenue)}{' '}
                  <span className="text-xs font-normal text-gray-500">
                    ({row.percentage.toFixed(1)}% · {row.count} ca)
                  </span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(Math.max(row.percentage, 2), 100)}%`,
                    background: SOURCE_COLORS[row.source] ?? TEAL,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Procedure revenue
// -----------------------------------------------------------------------------

interface ProcedureCardProps {
  rows: RevenueByProcedure[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function ProcedureCard({ rows, isLoading, isError, onRetry }: ProcedureCardProps) {
  if (isLoading) {
    return (
      <Card title="Doanh số nhóm thủ thuật" description="Top 10 thủ thuật đem lại doanh thu cao nhất">
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title="Doanh số nhóm thủ thuật" description="Top 10 thủ thuật đem lại doanh thu cao nhất">
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title="Doanh số nhóm thủ thuật" description="Top 10 thủ thuật đem lại doanh thu cao nhất">
        <EmptyState
          icon={<Stethoscope className="h-10 w-10" />}
          title="Chưa có thủ thuật nào"
          description="Hoàn tất phiên khám và phát hành hóa đơn để thấy top thủ thuật."
          action={
            <Link
              to="/today"
              className="inline-flex items-center gap-1 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
            >
              <Calendar className="h-4 w-4" /> Mở hàng chờ hôm nay
            </Link>
          }
        />
      </Card>
    );
  }

  if (rows.length <= 2) {
    const isSingle = rows.length === 1;
    return (
      <Card title="Doanh số nhóm thủ thuật" description="Top thủ thuật đem lại doanh thu cao nhất">
        <ul className="space-y-2">
          {rows.map((r, idx) => (
            <li
              key={r.procedure}
              className="flex items-center justify-between rounded-lg border border-teal-100 bg-teal-50/40 px-3 py-2.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500 text-xs font-bold text-white">
                  {idx + 1}
                </span>
                <span className="truncate text-sm font-medium text-gray-800">{r.procedure}</span>
              </div>
              <div className="text-right">
                <p className={`font-semibold text-gray-900 ${isSingle ? 'text-lg' : 'text-sm'}`}>
                  {formatCurrency(r.revenue)}
                </p>
                <p className="text-xs text-gray-500">{r.count} lượt</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs italic text-gray-500">
          Biểu đồ so sánh sẽ xuất hiện khi có từ 3 thủ thuật trở lên trong kỳ.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Doanh số nhóm thủ thuật" description="Top 10 thủ thuật đem lại doanh thu cao nhất">
      <div className="h-52">
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 16, bottom: 5, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
            <XAxis type="number" tickFormatter={vndCompact} stroke="#9ca3af" fontSize={11} />
            <YAxis type="category" dataKey="procedure" width={130} stroke="#9ca3af" fontSize={11} />
            <ReTooltip formatter={(value: any) => [formatCurrency(Number(value)), 'Doanh thu']} />
            <Bar dataKey="revenue" radius={[0, 4, 4, 0]} fill={TEAL} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Dentist ranking
// -----------------------------------------------------------------------------

interface DentistRankingCardProps {
  rows: RevenueByDentistRow[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function DentistRankingCard({ rows, isLoading, isError, onRetry }: DentistRankingCardProps) {
  if (isLoading) {
    return (
      <Card title="Doanh số bác sĩ" description="Xếp hạng doanh thu theo bác sĩ">
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title="Doanh số bác sĩ" description="Xếp hạng doanh thu theo bác sĩ">
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title="Doanh số bác sĩ" description="Xếp hạng doanh thu theo bác sĩ">
        <EmptyState
          icon={<Stethoscope className="h-10 w-10" />}
          title="Chưa có dữ liệu bác sĩ"
          description="Chưa có hóa đơn nào được gắn với bác sĩ trong kỳ này."
        />
      </Card>
    );
  }

  const compact = rows.length <= 3;

  if (compact) {
    return (
      <Card title="Doanh số bác sĩ" description="Xếp hạng doanh thu theo bác sĩ">
        <ol className="space-y-3">
          {rows.map((row, idx) => {
            const initials = row.dentistName
              .split(' ')
              .map((p) => p[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase();
            const medal = ['🥇', '🥈', '🥉'][idx] ?? '·';
            return (
              <li
                key={row.dentistId}
                className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-3 hover:bg-gray-50"
              >
                <span className="text-lg" aria-hidden>
                  {medal}
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-700">
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900">{row.dentistName}</p>
                  <p className="text-xs text-gray-500">{row.count} ca đã khám</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(row.revenue)}</p>
                  <p className="text-xs text-gray-500">{row.percentage.toFixed(1)}%</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs italic text-gray-500">
          Lưu ý: hệ thống hiện chưa tách dữ liệu phụ tá — chỉ hiển thị doanh số bác sĩ.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Doanh số bác sĩ" description="Xếp hạng doanh thu theo bác sĩ">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-500">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-4">Bác sĩ</th>
              <th className="py-2 pr-4 text-right">Số ca</th>
              <th className="py-2 pr-4 text-right">Doanh thu</th>
              <th className="py-2 text-right">Tỷ lệ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const initials = row.dentistName
                .split(' ')
                .map((p) => p[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase();
              return (
                <tr key={row.dentistId} className="border-b border-gray-50 last:border-0">
                  <td className="py-3 pr-3 text-gray-500">{idx + 1}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
                        {initials}
                      </span>
                      <span className="font-medium text-gray-900">{row.dentistName}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right text-gray-700">{row.count}</td>
                  <td className="py-3 pr-4 text-right font-semibold text-gray-900">{formatCurrency(row.revenue)}</td>
                  <td className="py-3 text-right">
                    <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                      {row.percentage.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs italic text-gray-500">
          Lưu ý: hệ thống hiện chưa tách dữ liệu phụ tá — chỉ hiển thị doanh số bác sĩ.
        </p>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Daily 15-day chart
// -----------------------------------------------------------------------------

interface DailyChartCardProps {
  rows: DailyRevenuePoint[];
  range: TimeRange;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function DailyChartCard({ rows, range, isLoading, isError, onRetry }: DailyChartCardProps) {
  // Title follows the selected range (A6-18), it used to always say 15 days.
  const title = `Doanh số theo ngày — ${RANGE_TITLES[range]}`;
  const description = 'Theo ngày phát hành hóa đơn; số hóa đơn đã phát hành mỗi ngày';
  const data = useMemo(
    () => rows.map((r) => ({ ...r, label: formatDayLabel(r.date), revenueM: r.revenue / 1_000_000 })),
    [rows],
  );

  if (isLoading) {
    return (
      <Card title={title} description={description}>
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title={title} description={description}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title={title} description={description}>
        <EmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title="Chưa có hóa đơn phát hành trong kỳ"
          description="Hãy mở rộng khoảng thời gian sang 30 ngày hoặc 6 tháng."
        />
      </Card>
    );
  }

  return (
    <Card
      title={title}
      description={description}
      actions={
        <span className="inline-flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: TEAL }} />
            Doanh thu
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: ACCENT_AMBER }} />
            Số hóa đơn
          </span>
        </span>
      }
    >
      <div className="h-56 md:h-64">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 16, bottom: 5, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} />
            <YAxis yAxisId="left" tickFormatter={(v: number) => `${v.toFixed(1)}tr`} stroke="#9ca3af" fontSize={11} />
            <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={11} />
            <ReTooltip
              formatter={(value: any, name: any) => {
                if (name === 'Doanh thu (triệu)') return [`${Number(value).toFixed(1)} tr ₫`, name];
                return [value, 'Số hóa đơn'];
              }}
            />
            <Bar yAxisId="left" dataKey="revenueM" name="Doanh thu (triệu)" fill={TEAL} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="invoiceCount" name="Số hóa đơn" fill={ACCENT_AMBER} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Monthly 6-month area
// -----------------------------------------------------------------------------

interface MonthlyChartCardProps {
  rows: MonthlyRevenuePoint[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function MonthlyChartCard({ rows, isLoading, isError, onRetry }: MonthlyChartCardProps) {
  const data = useMemo(
    () => rows.map((r) => ({ ...r, label: formatMonthLabel(r.month), revenueM: r.revenue / 1_000_000 })),
    [rows],
  );

  if (isLoading) {
    return (
      <Card title="Thống kê doanh số 6 tháng" description="Xu hướng doanh thu theo tháng">
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title="Thống kê doanh số 6 tháng" description="Xu hướng doanh thu theo tháng">
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title="Thống kê doanh số 6 tháng" description="Xu hướng doanh thu theo tháng">
        <EmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title="Chưa có dữ liệu 6 tháng"
          description="Chưa có hóa đơn nào được phát hành trong 6 tháng gần nhất."
        />
      </Card>
    );
  }

  return (
    <Card title="Thống kê doanh số 6 tháng" description="Xu hướng doanh thu theo tháng">
      <div className="h-52 md:h-56">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 10, right: 16, bottom: 5, left: 8 }}>
            <defs>
              <linearGradient id="monthlyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TEAL} stopOpacity={0.4} />
                <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} />
            <YAxis tickFormatter={(v: number) => `${v.toFixed(1)}tr`} stroke="#9ca3af" fontSize={11} />
            <ReTooltip formatter={(value: any) => [`${Number(value).toFixed(1)} tr ₫`, 'Doanh thu']} />
            <Area type="monotone" dataKey="revenueM" stroke={TEAL} fill="url(#monthlyFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// 7-day appointments line
// -----------------------------------------------------------------------------

interface AppointmentsCardProps {
  rows: AppointmentPoint[];
  range: TimeRange;
  /** Own calendar only (a dentist), so the title does not read as clinic-wide. */
  ownOnly?: boolean;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function AppointmentsCard({ rows, range, ownOnly, isLoading, isError, onRetry }: AppointmentsCardProps) {
  const data = useMemo(() => rows.map((r) => ({ ...r, label: formatDayLabel(r.date) })), [rows]);
  const title = `${ownOnly ? 'Lịch hẹn của tôi' : 'Lịch hẹn'} — ${RANGE_TITLES[range]}`;
  const description = 'Số lịch hẹn theo ngày (không tính lịch hủy)';

  if (isLoading) {
    return (
      <Card title={title} description={description}>
        <CardSkeleton />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card title={title} description={description}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card title={title} description={description}>
        <EmptyState
          icon={<Calendar className="h-10 w-10" />}
          title="Chưa có lịch hẹn trong kỳ"
          description="Đặt lịch mới để bắt đầu sử dụng."
          action={
            // 'hide' mode, not the default 'disable': PermissionGuard's
            // disable mode sets a `disabled` prop, which a router <Link>
            // (a plain anchor under the hood) doesn't honor — it would
            // still navigate. A dentist has no appointment.create, so this
            // used to be a working-looking CTA that landed on a form that
            // 403s on submit.
            <PermissionGuard permission="appointment.create" mode="hide">
              <Link
                to="/appointments?action=create"
                className="inline-flex items-center gap-1 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
              >
                <Calendar className="h-4 w-4" /> Tạo lịch hẹn
              </Link>
            </PermissionGuard>
          }
        />
      </Card>
    );
  }

  return (
    <Card title={title} description={description}>
      <div className="h-48 md:h-56">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 5, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} />
            <YAxis allowDecimals={false} stroke="#9ca3af" fontSize={11} />
            <ReTooltip formatter={(value: any) => [value, 'Số lịch hẹn']} />
            <Line
              type="monotone"
              dataKey="count"
              stroke={TEAL_DARK}
              strokeWidth={2.5}
              dot={{ r: 3, fill: TEAL }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Finance + Outstanding
// -----------------------------------------------------------------------------

interface FinanceCardProps {
  finance: FinanceSummary | undefined;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function FinanceCard({ finance, isLoading, isError, onRetry }: FinanceCardProps) {
  if (isLoading) {
    return (
      <Card title="Thu chi" description="Tổng thu và chi phí đã duyệt trong kỳ">
        <CardSkeleton />
      </Card>
    );
  }

  if (isError || !finance) {
    return (
      <Card title="Thu chi" description="Tổng thu và chi phí đã duyệt trong kỳ">
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  return (
    <Card title="Thu chi" description="Tổng thu và chi phí đã duyệt trong kỳ">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-emerald-100 bg-emerald-50/60 p-4 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <Wallet className="h-4 w-4" /> Tổng thu
          </div>
          <p className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-300">
            {formatCurrency(finance.totalIncome)}
          </p>
        </div>
        <div className="rounded-md border border-rose-100 bg-rose-50/60 p-4 dark:border-rose-900/30 dark:bg-rose-900/20 dark:p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">
            <CreditCard className="h-4 w-4" /> Tổng chi
          </div>
          <p className="mt-1 text-xl font-semibold text-rose-700 dark:text-rose-300">
            {formatCurrency(finance.totalExpense)}
          </p>
        </div>
      </div>
      {finance.totalExpense === 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Chưa có khoản chi nào được duyệt trong kỳ. Nhập và duyệt chi phí ở mục Chi phí.
        </p>
      )}
      <p className="mt-2 text-xs text-gray-500">Tổng thu tính theo ngày thu, đã trừ tiền hoàn.</p>
    </Card>
  );
}

interface OutstandingCardProps {
  outstanding: OutstandingSummary | undefined;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function OutstandingCard({ outstanding, isLoading, isError, onRetry }: OutstandingCardProps) {
  if (isLoading) {
    return (
      <Card title="Tổng KH nợ" description="Số dư công nợ hiện tại">
        <CardSkeleton />
      </Card>
    );
  }

  if (isError || !outstanding) {
    return (
      <Card title="Tổng KH nợ" description="Số dư công nợ hiện tại">
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }

  if (outstanding.invoiceCount === 0) {
    return (
      <Card title="Tổng KH nợ" description="Số dư công nợ hiện tại">
        <EmptyState
          icon={<CreditCard className="h-10 w-10" />}
          title="Không có công nợ"
          description="Tất cả hóa đơn đã được thanh toán đầy đủ."
        />
      </Card>
    );
  }

  return (
    <Card title="Tổng KH nợ" description="Số dư công nợ hiện tại">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold text-amber-700">{formatCurrency(outstanding.totalDebt)}</p>
          <p className="mt-1 text-sm text-gray-500">{outstanding.invoiceCount} hóa đơn chưa thanh toán</p>
        </div>
        <Link
          to="/billing/list?status=ISSUED,PARTIAL"
          className="inline-flex items-center gap-1 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          <Eye className="h-4 w-4" /> Xem chi tiết
        </Link>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Appointment outcomes (A6-12) — the front desk's "today" KPIs
// -----------------------------------------------------------------------------

interface AppointmentStatsCardProps {
  stats: AppointmentStats | undefined;
  range: TimeRange;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function AppointmentStatsCard({ stats, range, isLoading, isError, onRetry }: AppointmentStatsCardProps) {
  const own = stats?.scope === 'own';
  const title = `${own ? 'Lịch khám của tôi' : 'Lịch khám'} — ${RANGE_TITLES[range]}`;
  const description = 'Theo trạng thái cuối của lịch hẹn';
  if (isLoading) {
    return (
      <Card title={title} description={description}>
        <CardSkeleton />
      </Card>
    );
  }
  if (isError || !stats) {
    return (
      <Card title={title} description={description}>
        <CardErrorState onRetry={onRetry} />
      </Card>
    );
  }
  const s = stats.summary;
  const tiles: Array<{ label: string; value: number; hint: string; cls: string }> = [
    { label: 'Tổng lịch', value: s.total, hint: 'Mọi lịch hẹn trong kỳ, kể cả lịch hủy', cls: 'text-gray-900' },
    { label: 'Chưa đến', value: s.pending, hint: 'Đã đặt / đã xác nhận, chưa check-in', cls: 'text-sky-700' },
    { label: 'Đã đến', value: s.arrived, hint: 'Đã check-in, đang khám, đã xong hoặc về trước khi khám', cls: 'text-emerald-700' },
    { label: 'Đang ở phòng khám', value: s.inClinic, hint: 'Đã check-in hoặc đang khám', cls: 'text-teal-700' },
    { label: 'Vắng', value: s.noShow, hint: `Tỷ lệ vắng ${stats.rates.noShowPct}% số lịch đã tới giờ`, cls: 'text-amber-700' },
    {
      label: 'Hủy',
      value: s.cancelled,
      hint: s.cancelledAfterCheckIn
        ? `${s.cancelledAfterCheckIn} lịch hủy sau khi đã check-in`
        : 'Lịch bị hủy (bệnh nhân hoặc phòng khám)',
      cls: 'text-rose-700',
    },
    { label: 'Về trước khi khám', value: s.left, hint: 'Đã check-in rồi về, chưa được khám', cls: 'text-orange-700' },
    { label: 'Vãng lai', value: s.walkIn, hint: 'Khách đến không hẹn trước', cls: 'text-indigo-700' },
    { label: 'Đặt online', value: s.online, hint: 'Lịch đến từ trang đặt lịch online', cls: 'text-violet-700' },
  ];
  return (
    <Card title={title} description={description}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {tiles.map((t) => (
          <Tooltip key={t.label} label={<span>{t.hint}</span>}>
            <div className="cursor-help rounded-md border border-gray-100 px-2 py-2 dark:border-surface-700">
              <p className="text-[11px] font-medium text-gray-500 dark:text-surface-400">{t.label}</p>
              <p className={`text-xl font-semibold ${t.cls} dark:text-surface-100`}>{formatNumber(t.value)}</p>
            </div>
          </Tooltip>
        ))}
      </div>
      {stats.onlineFunnel && stats.onlineFunnel.requests > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Yêu cầu đặt online trong kỳ: {stats.onlineFunnel.requests} · đã thành lịch:{' '}
          {stats.onlineFunnel.booked} · đã đến: {stats.onlineFunnel.arrived} · khách tự hủy:{' '}
          {stats.onlineFunnel.patientCancelled} · phòng khám từ chối: {stats.onlineFunnel.declined} · hết hạn:{' '}
          {stats.onlineFunnel.expired}
          {stats.onlineFunnel.spam > 0 && ` (không tính ${stats.onlineFunnel.spam} yêu cầu rác)`}
        </p>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Empty placeholder (re-export to keep all card components in one barrel)
// -----------------------------------------------------------------------------
export type { ReactNode };
