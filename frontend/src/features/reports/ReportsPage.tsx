/**
 * ReportsPage — Revenue Reports with proper backend data shape alignment.
 * Backend returns: totalInvoiced, totalCollected, byMonth (not totalRevenue/totalPaid/daily)
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import {
  Receipt,
  TrendingUp,
  Download,
  AlertCircle,
  DollarSign,
} from 'lucide-react';
import { billingApi } from '@/features/billing/billingApi';
import { Button, Card } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

const CHART_COLORS_LIGHT = ['#2BA3A0', '#4F46E5', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2'];
const CHART_COLORS_DARK = ['#2DD4BF', '#818CF8', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#22D3EE'];

type TooltipFormatter = (value: unknown, name: unknown) => [string, string];
const tooltipFormatter = ((value: unknown, name: unknown) => {
  if (typeof value === 'number') {
    return [`${formatCurrency(value)}`, String(name ?? '')];
  }
  return [String(value ?? ''), String(name ?? '')];
}) as TooltipFormatter;

const paymentMethodLabels: Record<string, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  card: 'Thẻ',
  insurance: 'BHYT',
  other: 'Khác',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Nháp',
  ISSUED: 'Đã phát hành',
  PARTIAL: 'Một phần',
  PAID: 'Đã thanh toán',
  VOIDED: 'Đã hủy',
};

function exportToCSV<T extends Record<string, unknown>>(data: T[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h];
      const str = val === null || val === undefined ? '' : String(val);
      return str.includes(',') ? `"${str}"` : str;
    }).join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDark = () => setIsDark(document.documentElement.classList.contains('dark'));
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const colors = isDark ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;

  // Main revenue report
  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['revenue-report', fromDate, toDate],
    queryFn: () => billingApi.getRevenueReport({ from: fromDate, to: toDate }),
  });

  // Daily revenue for line chart
  const { data: dailyData } = useQuery({
    queryKey: ['revenue-by-day', fromDate, toDate],
    queryFn: () => billingApi.getRevenueByDay({ from: fromDate, to: toDate }),
    enabled: !!report,
  });

  // Revenue by procedure
  const { data: byProcedure } = useQuery({
    queryKey: ['revenue-by-procedure', fromDate, toDate],
    queryFn: () => billingApi.getRevenueByProcedure({ from: fromDate, to: toDate }),
    enabled: !!report,
  });

  // Revenue by source
  const { data: bySource } = useQuery({
    queryKey: ['revenue-by-source', fromDate, toDate],
    queryFn: () => billingApi.getRevenueBySource({ from: fromDate, to: toDate }),
    enabled: !!report,
  });

  // Outstanding aging
  const { data: outstandingData } = useQuery({
    queryKey: ['outstanding-report'],
    queryFn: () => billingApi.getOutstandingReport(90),
    enabled: !!report,
  });

  // Chart data from daily revenue
  const dailyChartData = (dailyData ?? []).map(d => ({
    date: format(new Date(d.date), 'dd/MM'),
    revenue: d.revenue / 1_000_000, // Millions VND
    count: d.count,
  }));

  // Chart data from monthly revenue in report
  const monthlyChartData = (report?.byMonth ?? []).map(m => ({
    month: m.month,
    revenue: m.total / 1_000_000,
    collected: m.paid / 1_000_000,
  }));

  // Revenue by dentist chart data
  const dentistChartData = (report?.byDentist ?? []).map(d => ({
    name: d.dentistName.replace(/^BS\.\s*/i, ''),
    revenue: d.revenue / 1_000_000,
    paid: d.paid / 1_000_000,
    percent: d.count,
  }));

  // Revenue by payment method chart data
  const totalRevenue = report?.totalInvoiced ?? 0;
  const paymentChartData = (report?.byPaymentMethod ?? []).map(m => ({
    method: paymentMethodLabels[m.method] ?? m.method,
    amount: m.amount,
    percent: totalRevenue > 0 ? (m.amount / totalRevenue) * 100 : 0,
    count: m.count,
  }));

  // Revenue by procedure chart data (top 10)
  const procedureChartData = (byProcedure ?? []).slice(0, 10).map(p => ({
    procedure: p.procedure,
    revenue: p.revenue / 1_000_000,
    count: p.count,
  }));

  // Revenue by source chart data
  const sourceChartData = (bySource ?? []).map(s => ({
    source: s.sourceLabel,
    revenue: s.revenue / 1_000_000,
    percent: s.percentage,
    count: s.count,
  }));

  const outstandingList = outstandingData?.data ?? [];

  const outstandingByDays = {
    overdue90: outstandingList.filter(i => i.daysOld > 90),
    overdue60: outstandingList.filter(i => i.daysOld > 60 && i.daysOld <= 90),
    overdue30: outstandingList.filter(i => i.daysOld > 30 && i.daysOld <= 60),
    overdue7: outstandingList.filter(i => i.daysOld > 7 && i.daysOld <= 30),
    current: outstandingList.filter(i => i.daysOld <= 7),
  };

  const handleExportRevenue = () => {
    const exportData = (dailyData ?? []).map(d => ({
      date: d.date,
      revenue: d.revenue,
      invoice_count: d.count,
    }));
    exportToCSV(exportData, 'revenue_report');
  };

  const handleExportOutstanding = () => {
    const exportData = outstandingList.map(i => ({
      code: i.code,
      patient_name: i.patientName,
      patient_code: i.patientCode,
      outstanding: i.outstanding,
      issued_at: i.issuedAt,
      days_old: i.daysOld,
    }));
    exportToCSV(exportData, 'outstanding_report');
  };

  const gridColor = isDark ? '#374151' : '#E5E7EB';
  const axisColor = isDark ? '#9CA3AF' : '#9CA3AF';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Báo cáo doanh thu</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Thống kê doanh thu, công nợ và biến động tồn kho
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportRevenue}>
            <Download className="h-4 w-4" />
            Xuất doanh thu
          </Button>
          <Button variant="outline" onClick={handleExportOutstanding}>
            <Download className="h-4 w-4" />
            Xuất công nợ
          </Button>
        </div>
      </div>

      {/* Date Range Filter */}
      <Card noPadding className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Từ ngày</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Đến ngày</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-brand-100 dark:bg-brand-900 p-3">
              <Receipt className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Tổng doanh thu</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {reportLoading ? '—' : formatCurrency(report?.totalInvoiced ?? 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
              <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Đã thu</p>
              <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
                {reportLoading ? '—' : formatCurrency(report?.totalCollected ?? 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900 p-3">
              <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Còn nợ</p>
              <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">
                {reportLoading ? '—' : formatCurrency(report?.totalOutstanding ?? 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-3">
              <Receipt className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Số hóa đơn</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {reportLoading ? '—' : (report?.invoiceCount ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Revenue by Status */}
      {report?.byStatus && report.byStatus.length > 0 && (
        <Card title="Doanh thu theo trạng thái">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {report.byStatus.map((s) => (
              <div key={s.status} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">{statusLabels[s.status] ?? s.status}</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(s.total)}</p>
                <p className="text-xs text-gray-400">{s.count} hóa đơn</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Revenue Chart */}
        <Card title="Doanh thu theo ngày">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke={axisColor} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke={axisColor}
                  tickFormatter={(value) => `${value}M`}
                />
                <Tooltip formatter={tooltipFormatter} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={colors[0]}
                  strokeWidth={2}
                  dot={{ fill: colors[0], strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: colors[0] }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Monthly Revenue Chart */}
        <Card title="Doanh thu theo tháng">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke={axisColor} />
                <YAxis tick={{ fontSize: 12 }} stroke={axisColor} tickFormatter={(v) => `${v}M`} />
                <Tooltip formatter={tooltipFormatter} />
                <Bar dataKey="revenue" fill={colors[0]} name="Tổng" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" fill={colors[2]} name="Đã thu" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue by Dentist */}
        <Card title="Doanh thu theo bác sĩ">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dentistChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}M`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                <Tooltip formatter={tooltipFormatter} />
                <Bar dataKey="revenue" fill={colors[0]} name="Doanh thu" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Revenue by Procedure */}
        <Card title="Doanh thu theo dịch vụ (Top 10)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={procedureChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}M`} />
                <YAxis type="category" dataKey="procedure" tick={{ fontSize: 12 }} width={100} />
                <Tooltip formatter={tooltipFormatter} />
                <Bar dataKey="revenue" fill={colors[1]} name="Doanh thu" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Revenue by Payment Method */}
      <Card title="Doanh thu theo phương thức thanh toán">
        <div className="space-y-3">
          {paymentChartData.map((method) => (
            <div key={method.method} className="flex items-center gap-4">
              <div className="w-28 text-sm font-medium text-gray-700 dark:text-gray-300">
                {method.method}
              </div>
              <div className="flex-1">
                <div className="h-6 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded bg-brand-500 transition-all"
                    style={{ width: `${Math.max(method.percent, 0)}%` }}
                  />
                </div>
              </div>
              <div className="w-36 text-right text-sm font-medium text-gray-900 dark:text-white">
                {formatCurrency(method.amount)}
              </div>
              <div className="w-16 text-right text-sm text-gray-500 dark:text-gray-400">
                {method.percent.toFixed(1)}%
              </div>
              <div className="w-16 text-right text-xs text-gray-400">
                {method.count} lần
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Revenue by Source */}
      {sourceChartData.length > 0 && (
        <Card title="Doanh thu theo nguồn đặt lịch">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}M`} />
                <YAxis type="category" dataKey="source" tick={{ fontSize: 12 }} width={100} />
                <Tooltip formatter={tooltipFormatter} />
                <Bar dataKey="revenue" fill={colors[2]} name="Doanh thu" radius={[0, 4, 4, 0]}>
                  {sourceChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Outstanding Aging Report */}
      <Card
        title="Báo cáo công nợ theo thời gian"
        description={`${outstandingList.length} hóa đơn chưa thanh toán`}
      >
        {/* Aging summary */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Quá hạn > 90 ngày', items: outstandingByDays.overdue90, color: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' },
            { label: '61-90 ngày', items: outstandingByDays.overdue60, color: 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' },
            { label: '31-60 ngày', items: outstandingByDays.overdue30, color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
            { label: '8-30 ngày', items: outstandingByDays.overdue7, color: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' },
            { label: 'Dưới 7 ngày', items: outstandingByDays.current, color: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' },
          ].map(({ label, items, color }) => (
            <div key={label} className={`rounded-lg p-3 ${color}`}>
              <p className="text-xs font-medium">{label}</p>
              <p className="text-lg font-semibold">{items.length}</p>
              <p className="text-xs">
                {formatCurrency(items.reduce((s, i) => s + i.outstanding, 0))}
              </p>
            </div>
          ))}
        </div>

        {/* Outstanding table */}
        {outstandingList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Mã hóa đơn</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Bệnh nhân</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Còn nợ</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Ngày phát hành</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600 dark:text-gray-400">Số ngày quá hạn</th>
                </tr>
              </thead>
              <tbody>
                {outstandingList.slice(0, 50).map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-2 px-3 font-mono text-gray-900 dark:text-white">{item.code}</td>
                    <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                      {item.patientName}
                      <span className="ml-2 text-xs text-gray-400">({item.patientCode})</span>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-amber-600 dark:text-amber-400">
                      {formatCurrency(item.outstanding)}
                    </td>
                    <td className="py-2 px-3 text-center text-gray-500 dark:text-gray-400">
                      {item.issuedAt ? format(new Date(item.issuedAt), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className={`py-2 px-3 text-right ${
                      item.daysOld > 90 ? 'text-red-600 dark:text-red-400' :
                      item.daysOld > 60 ? 'text-orange-600 dark:text-orange-400' :
                      item.daysOld > 30 ? 'text-amber-600 dark:text-amber-400' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {item.daysOld} ngày
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {outstandingList.length > 50 && (
              <p className="text-center py-2 text-sm text-gray-500">
                Hiển thị 50/{outstandingList.length} hóa đơn
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <DollarSign className="h-12 w-12 mb-2" />
            <p>Không có công nợ</p>
          </div>
        )}
      </Card>
    </div>
  );
}
