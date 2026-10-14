import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { DollarSign, Check, Receipt, AlertTriangle, AlertCircle } from 'lucide-react';
import { billingApi } from '@/features/billing/billingApi';
import { Button, Card, InvoiceStatusBadge, SearchInput, Select } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { Invoice, InvoiceStatus } from '@/types/billing';
import { MissingInvoicesBanner } from './MissingInvoicesBanner';

// 'unpaid' is a synthetic combined filter (ISSUED + PARTIAL) — the one thing
// dashboard "công nợ" cards actually want to link to; there's no single
// InvoiceStatus for "has an outstanding balance".
type StatusFilter = InvoiceStatus | 'all' | 'unpaid';

const VALID_STATUSES: InvoiceStatus[] = ['DRAFT', 'ISSUED', 'PARTIAL', 'PAID', 'VOIDED'];
const PAGE_SIZE = 25;

// Reads `?status=` from the URL once on first render — e.g. the Dashboard's
// "Xem chi tiết" công nợ card links here with `?status=ISSUED,PARTIAL`,
// which previously landed on this page and was silently ignored (state
// always initialized to 'all', regardless of the URL).
function parseInitialStatus(searchParams: URLSearchParams): StatusFilter {
  const raw = searchParams.get('status');
  if (!raw) return 'all';
  const parts = raw.split(',').filter((p): p is InvoiceStatus => VALID_STATUSES.includes(p as InvoiceStatus));
  if (parts.length === 0) return 'all';
  if (parts.length === 1) return parts[0];
  if (parts.includes('ISSUED') && parts.includes('PARTIAL') && parts.length === 2) return 'unpaid';
  return parts[0]; // Fallback: the dropdown can only represent one custom combo (unpaid).
}

export default function InvoiceListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>(() => parseInitialStatus(searchParams));
  const [cursor, setCursor] = useState<string | undefined>();
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['invoices', search, status, cursor],
    queryFn: () =>
      billingApi.listInvoices({
        q: search || undefined,
        status: status === 'all' ? undefined : status === 'unpaid' ? ['ISSUED', 'PARTIAL'] : [status],
        pageSize: PAGE_SIZE,
        cursor,
      }),
  });

  useEffect(() => {
    setCursor(undefined);
    setInvoices([]);
  }, [search, status]);

  useEffect(() => {
    if (!data) return;
    setInvoices((previous) => cursor
      ? [...previous, ...data.data.filter((invoice) => !previous.some((row) => row.id === invoice.id))]
      : data.data);
  }, [data, cursor]);

  const summary = data?.summary;
  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('uiOperations.allStatuses') },
    { value: 'unpaid', label: t('uiOperations.unpaidBalance') },
    { value: 'DRAFT', label: t('uiOperations.draft') },
    { value: 'ISSUED', label: t('uiOperations.issued') },
    { value: 'PARTIAL', label: t('uiOperations.partial') },
    { value: 'PAID', label: t('uiOperations.paid') },
    { value: 'VOIDED', label: t('uiOperations.voided') },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('uiOperations.billingTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('uiOperations.billingDescription')}
        </p>
      </div>

      <MissingInvoicesBanner />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-900">
              <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.filteredTotal')}</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">
                {summary ? formatCurrency(summary.totalInvoiced) : '—'}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.collected')}</p>
              <p className="text-xl font-semibold text-green-600 dark:text-green-400">
                {summary ? formatCurrency(summary.totalCollected) : '—'}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.outstanding')}</p>
              <p className="text-xl font-semibold text-amber-600 dark:text-amber-400">
                {summary ? formatCurrency(summary.totalOutstanding) : '—'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card noPadding>
        <div className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <SearchInput
                placeholder={t('uiOperations.invoiceSearch')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
              />
            </div>
            <Select
              className="sm:w-56"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              options={statusOptions}
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
        ) : isError && invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-10 w-10 text-red-400 dark:text-red-500" />
            <p className="mt-3 font-medium text-gray-900 dark:text-white">{t('uiOperations.loadInvoicesFailed')}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('uiOperations.loadDataFailedRetry')}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 text-sm font-medium text-brand-600 underline hover:no-underline dark:text-brand-400"
            >
              {t('uiOperations.retry')}
            </button>
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Receipt className="h-10 w-10 text-gray-400" />
            <p className="mt-3 font-medium text-gray-900 dark:text-white">{t('uiOperations.noInvoices')}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('uiOperations.invoiceAutoCreated')}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-surface-700 dark:bg-surface-800">
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('uiOperations.code')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('uiOperations.patient')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('uiOperations.createdDate')}</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">{t('uiOperations.total')}</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">{t('uiOperations.collected')}</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">{t('uiOperations.outstanding')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('uiOperations.status')}</th>
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
            {data?.pagination.hasMore && (
              <div className="flex items-center justify-center border-t border-gray-100 px-4 py-3 dark:border-surface-700">
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={isFetching}
                  onClick={() => data.pagination.nextCursor && setCursor(data.pagination.nextCursor)}
                >
                  {t('uiOperations.loadMore', { loaded: invoices.length, total: data.summary.invoiceCount })}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
