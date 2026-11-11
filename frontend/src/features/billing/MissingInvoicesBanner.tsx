import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { billingApi } from '@/features/billing/billingApi';
import { Button } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

type MissingInvoiceScope = 'all' | 'free' | 'actionable';

export function MissingInvoicesBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canCreate = useAuthStore((s) => s.hasPermission('invoice.create'));
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState<MissingInvoiceScope>('actionable');
  const [page, setPage] = useState(1);
  const summaryQuery = useQuery({
    queryKey: ['invoices', 'missing', 'summary'],
    queryFn: () => billingApi.listMissingInvoices({ summary: true, scope: 'all' }),
    enabled: canCreate,
    staleTime: 60_000,
  });
  const summary = summaryQuery.data?.pagination;
  const pageQuery = useQuery({
    queryKey: ['invoices', 'missing', scope, page],
    queryFn: () => billingApi.listMissingInvoices({ page, scope }),
    enabled: canCreate && expanded,
    staleTime: 60_000,
  });
  const rows = pageQuery.data?.data ?? [];
  const backfill = useMutation({
    mutationFn: (encounterId: string) => billingApi.createFromEncounter(encounterId),
    onSuccess: (res) => {
      notify.success(res.created ? t('uiOperations.draftInvoiceCreated', { code: res.data.code }) : t('uiOperations.encounterAlreadyHasInvoice', { code: res.data.code }));
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate(`/billing/invoices/${res.data.id}`);
    },
    onError: (err) => notify.error(getApiErrorMessage(err, t('uiOperations.createInvoiceFailed'))),
  });
  const scopeTotal = scope === 'all' ? summary?.total ?? 0 : scope === 'free' ? summary?.explicitlyFree ?? 0 : summary?.actionable ?? 0;
  const pageCount = Math.max(1, Math.ceil(scopeTotal / 50));
  const changeScope = (value: MissingInvoiceScope) => { setScope(value); setPage(1); };

  if (!canCreate || !summary?.total) return null;
  const actionable = summary.actionable > 0;
  return (
    <div className={`rounded-lg border p-3 text-sm ${actionable ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200' : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-medium">{actionable && <AlertTriangle className="h-4 w-4" />}{t('uiOperations.missingInvoiceSummary', { actionable: summary.actionable, free: summary.explicitlyFree })}</p>
        <button type="button" className="text-sm underline" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(value => !value)}>
          {expanded ? t('uiOperations.collapse') : t('uiOperations.view')}
        </button>
      </div>
      {expanded && <div id={listId}>
        <label className="mt-2 block">{t('uiOperations.missingInvoiceFilter')}
          <select className="ml-2 rounded border bg-white p-1 text-gray-900" value={scope} onChange={event => changeScope(event.target.value as MissingInvoiceScope)}>
            <option value="actionable">{t('uiOperations.missingInvoiceActionable', { count: summary.actionable })}</option>
            <option value="free">{t('uiOperations.missingInvoiceFree', { count: summary.explicitlyFree })}</option>
            <option value="all">{t('uiOperations.missingInvoiceAll', { count: summary.total })}</option>
          </select>
        </label>
        {pageQuery.isLoading && <p role="status">{t('uiOperations.loadingMissingInvoices')}</p>}
        {!pageQuery.isLoading && rows.length === 0 && <p role="status">{t('uiOperations.missingInvoiceEmpty')}</p>}
        <ul className="mt-2 divide-y divide-current/20">
          {rows.map(row => <li key={row.encounterId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span>{row.patientName} ({row.patientCode}) • {t('uiOperations.dentistAbbrev')} {row.dentistName} • {t('uiOperations.closedAt')} {formatDateTime(row.closedAt)}{row.voidedInvoice && <> • {t('uiOperations.invoiceCode')} {row.voidedInvoice.code} {t('uiOperations.voided')}</>}</span>
            {row.voidedInvoice ? <Button size="sm" variant="outline" onClick={() => navigate(`/billing/invoices/${row.voidedInvoice!.id}`)}>{t('uiOperations.openVoidedInvoice')}</Button> : <Button size="sm" onClick={() => backfill.mutate(row.encounterId)} isLoading={backfill.isPending && backfill.variables === row.encounterId}>{t('uiOperations.createInvoice')}</Button>}
          </li>)}
        </ul>
        <div className="mt-2 flex items-center gap-2" aria-label={t('uiOperations.missingInvoicePage', { page, pages: pageCount })}>
          <Button size="sm" variant="outline" disabled={page <= 1 || pageQuery.isFetching} onClick={() => setPage(value => value - 1)}>{t('uiOperations.previousPage')}</Button>
          <span aria-live="polite">{t('uiOperations.missingInvoicePage', { page, pages: pageCount })}</span>
          <Button size="sm" variant="outline" disabled={page >= pageCount || pageQuery.isFetching} onClick={() => setPage(value => value + 1)}>{t('uiOperations.nextPage')}</Button>
        </div>
      </div>}
    </div>
  );
}
