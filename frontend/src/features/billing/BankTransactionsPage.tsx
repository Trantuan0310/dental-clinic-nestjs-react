import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, EmptyState, Modal, Tabs, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { notify } from '@/components/ui/Toast';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { notificationKeys } from '@/features/notifications/notificationsApi';
import { billingApi, type BankTransaction } from './billingApi';

type Scope = 'NEEDS_REVIEW' | 'RESOLVED';

/**
 * Transfers the bank reported that the system did not apply to an invoice
 * itself (no code in the note, an invoice that is not owed, more than is
 * owed…). The cashier deals with each by hand, then marks it handled.
 */
export default function BankTransactionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>('NEEDS_REVIEW');
  const [resolving, setResolving] = useState<BankTransaction | null>(null);
  const [note, setNote] = useState('');

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['bank-transactions', scope],
    queryFn: () => billingApi.listBankTransactions(scope),
    refetchInterval: scope === 'NEEDS_REVIEW' ? 30_000 : false,
  });

  const resolve = useMutation({
    mutationFn: (v: { id: string; note: string }) => billingApi.resolveBankTransaction(v.id, v.note),
    onSuccess: () => {
      notify.success(t('uiOperations.bankTxResolved'));
      setResolving(null);
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: (err) => notify.error(getApiErrorMessage(err, t('uiOperations.bankTxResolveError'))),
  });

  return (
    <div className="space-y-4">
      <PageHeader title={t('uiOperations.bankTxTitle')} description={t('uiOperations.bankTxDescription')} />

      <Card>
        <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <TabsList>
            <TabsTrigger value="NEEDS_REVIEW">{t('uiOperations.bankTxScopeReview')}</TabsTrigger>
            <TabsTrigger value="RESOLVED">{t('uiOperations.bankTxScopeResolved')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </Card>

      {error ? (
        <Alert type="danger">{getApiErrorMessage(error, t('uiOperations.bankTxLoadError'))}</Alert>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-left text-gray-600 dark:bg-surface-800 dark:text-surface-300">
                <tr>
                  <th className="px-3 py-2">{t('uiOperations.bankTxTime')}</th>
                  <th className="px-3 py-2 text-right">{t('uiOperations.bankTxAmount')}</th>
                  <th className="px-3 py-2">{t('uiOperations.bankTxNote')}</th>
                  <th className="px-3 py-2">{t(scope === 'NEEDS_REVIEW' ? 'uiOperations.bankTxReason' : 'uiOperations.bankTxResolveNote')}</th>
                  <th className="px-3 py-2">{t('uiOperations.bankTxInvoice')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-500">{t('uiClinical.loading')}</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title={t(scope === 'NEEDS_REVIEW' ? 'uiOperations.bankTxEmptyReview' : 'uiOperations.bankTxEmptyResolved')}
                      />
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} data-testid="bank-tx-row" className="border-t border-gray-100 align-top dark:border-surface-700">
                      <td className="whitespace-nowrap px-3 py-2">{formatDateTime(r.transactionAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">{formatCurrency(r.amount)}</td>
                      <td className="max-w-xs break-words px-3 py-2 font-mono text-xs">{r.content || '—'}</td>
                      <td className="px-3 py-2">
                        {scope === 'NEEDS_REVIEW'
                          ? r.reason
                            ? t(`uiOperations.bankTxReasons.${r.reason}`)
                            : '—'
                          : t('uiOperations.bankTxResolvedBy', { name: r.resolvedBy ?? '—', note: r.resolutionNote ?? '' })}
                      </td>
                      <td className="px-3 py-2">
                        {r.invoice ? (
                          <Link to={`/billing/invoices/${r.invoice.id}`} className="font-medium text-brand-600 hover:underline">
                            {r.invoice.code}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {scope === 'NEEDS_REVIEW' && (
                          <Button size="sm" variant="outline" onClick={() => setResolving(r)}>
                            {t('uiOperations.bankTxResolve')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        isOpen={!!resolving}
        onClose={() => {
          setResolving(null);
          setNote('');
        }}
        title={t('uiOperations.bankTxResolveTitle')}
      >
        {resolving && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-surface-200">
              <span className="font-mono font-semibold">{formatCurrency(resolving.amount)}</span> · {formatDateTime(resolving.transactionAt)}
              <span className="mt-1 block font-mono text-xs text-gray-500">{resolving.content}</span>
            </p>
            <Textarea
              label={t('uiOperations.bankTxResolveNote')}
              placeholder={t('uiOperations.bankTxResolvePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setResolving(null)}>{t('uiClinical.cancel')}</Button>
              <Button
                isLoading={resolve.isPending}
                disabled={note.trim().length < 3}
                onClick={() => resolve.mutate({ id: resolving.id, note: note.trim() })}
              >
                {t('uiOperations.bankTxResolve')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
