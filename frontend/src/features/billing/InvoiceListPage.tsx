import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { DollarSign, Check, Receipt, AlertTriangle } from 'lucide-react';
import { billingApi } from '@/features/billing/billingApi';
import { Card, InvoiceStatusBadge, SearchInput, Select } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { InvoiceStatus } from '@/types/billing';

const STATUS_OPTIONS: { value: InvoiceStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'ISSUED', label: 'Đã phát hành' },
  { value: 'PARTIAL', label: 'Thanh toán một phần' },
  { value: 'PAID', label: 'Đã thanh toán' },
  { value: 'VOIDED', label: 'Đã hủy' },
];

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | 'all'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', search, status],
    queryFn: () =>
      billingApi.listInvoices({
        q: search || undefined,
        status: status === 'all' ? undefined : status,
        pageSize: 100,
      }),
  });

  const invoices = data?.data ?? [];
  // `total`/`paidAmount`/`outstandingAmount` are Prisma Decimal columns —
  // they serialize as strings over the wire despite the `number` type, so
  // summing them without Number() does string concatenation instead of
  // addition (silently wrong, or NaN once any value has a decimal point).
  const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
  const totalCollected = invoices.reduce((sum, inv) => sum + Number(inv.paidAmount), 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.outstandingAmount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Hóa đơn</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Danh sách hóa đơn của phòng khám
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900">
              <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Tổng hóa đơn</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">{formatCurrency(totalInvoiced)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Đã thu</p>
              <p className="text-xl font-semibold text-green-600 dark:text-green-400">{formatCurrency(totalCollected)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Còn nợ</p>
              <p className="text-xl font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(totalOutstanding)}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card noPadding>
        <div className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <SearchInput
                placeholder="Tìm theo mã hóa đơn, tên bệnh nhân..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
              />
            </div>
            <Select
              className="sm:w-56"
              value={status}
              onChange={(e) => setStatus(e.target.value as InvoiceStatus | 'all')}
              options={STATUS_OPTIONS}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-gray-100 dark:bg-surface-800" />
              ))}
            </div>
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Receipt className="h-10 w-10 text-gray-400" />
            <p className="mt-3 font-medium text-gray-900 dark:text-white">Không có hóa đơn nào</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Hóa đơn được tạo tự động khi đóng phiên khám
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-surface-700 dark:bg-surface-800">
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Mã</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Bệnh nhân</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Ngày tạo</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Tổng tiền</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Đã thu</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Còn nợ</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="cursor-pointer border-b border-gray-50 hover:bg-gray-50 dark:border-surface-800 dark:hover:bg-surface-800"
                    onClick={() => navigate(`/billing/invoices/${inv.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{inv.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{inv.patientName}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {format(new Date(inv.createdAt), 'dd/MM/yyyy', { locale: vi })}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{formatCurrency(inv.total)}</td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">{formatCurrency(inv.paidAmount)}</td>
                    <td className={`px-4 py-3 text-right ${inv.outstandingAmount > 0 ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                      {formatCurrency(inv.outstandingAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
