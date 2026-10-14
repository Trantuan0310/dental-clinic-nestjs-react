import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button, Card, SearchInput, Spinner } from '@/components/ui';
import { AUDIT_EXPORT_MAX, fetchAllAuditLogs, useAuditLogs } from './adminApi';
import type { AuditLog } from '@/types/admin';
import { exportCsv } from '@/lib/csv';
import { notify } from '@/components/ui/Toast';

const PAGE_SIZE = 20;

const ACTION_LABEL_KEYS: Record<string, string> = {
  'invoice.issued': 'auditInvoiceIssued', 'invoice.void': 'auditInvoiceVoid',
  'payment.created': 'auditPaymentCreated', 'payment.reversed': 'auditPaymentReversed',
  'user.created': 'auditUserCreated', 'user.updated': 'auditUserUpdated',
  'user.deactivated': 'auditUserDeactivated', 'user.password_reset': 'auditPasswordReset',
  'encounter.created': 'auditEncounterCreated', 'encounter.closed': 'auditEncounterClosed',
  'inventory.adjusted': 'auditInventoryAdjusted',
};
const TARGET_TYPE_LABEL_KEYS: Record<string, string> = {
  USR: 'auditEntityUser', APT: 'auditEntityAppointment', PTN: 'auditEntityPatient',
  ENC: 'auditEntityEncounter', INV: 'auditEntityInvoice', PAY: 'auditEntityPayment',
  ITM: 'auditEntityInventory', ROL: 'auditEntityRole',
};

export default function AuditLogsPage() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulatedLogs, setAccumulatedLogs] = useState<AuditLog[]>([]);

  const { data, isLoading, isFetching } = useAuditLogs({
    limit: PAGE_SIZE,
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(entityFilter ? { targetType: entityFilter } : {}),
    ...(dateFrom ? { from: dateFrom } : {}),
    ...(dateTo ? { to: dateTo } : {}),
    cursor,
  });

  // Backend pagination is cursor-based (no total page count), so "load more"
  // appends onto what's already shown rather than a numbered page picker.
  // Reset the accumulator whenever a non-cursor filter changes (fresh query).
  useEffect(() => {
    setCursor(undefined);
    setAccumulatedLogs([]);
  }, [actionFilter, entityFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!data) return;
    setAccumulatedLogs((prev) => (cursor ? [...prev, ...data.data] : data.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const logs = accumulatedLogs;
  const pagination = data?.pagination;

  const handleLoadMore = () => {
    if (pagination?.nextCursor) setCursor(pagination.nextCursor);
  };

  const matchesSearch = (log: AuditLog) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (log.actorEmailAtTime?.toLowerCase() ?? '').includes(q) ||
      (log.action.toLowerCase()).includes(q) ||
      (log.targetType?.toLowerCase() ?? '').includes(q) ||
      (log.targetId?.toLowerCase() ?? '').includes(q)
    );
  };

  // Exports every log matching the filters (not only the pages loaded so
  // far), via the shared exporter: BOM + formula neutralizing (A6-15/27).
  const [exporting, setExporting] = useState(false);
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const { rows, truncated } = await fetchAllAuditLogs({
        ...(actionFilter ? { action: actionFilter } : {}),
        ...(entityFilter ? { targetType: entityFilter } : {}),
        ...(dateFrom ? { from: dateFrom } : {}),
        ...(dateTo ? { to: dateTo } : {}),
      });
      exportCsv(`nhat-ky-${new Date().toISOString().slice(0, 10)}`, rows.filter(matchesSearch), [
        { header: t('uiWorkforce.auditTime'), accessor: (log) => new Date(log.occurredAt).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US', { timeZone: 'Asia/Ho_Chi_Minh' }) },
        { header: t('uiWorkforce.auditAction'), accessor: (log) => ACTION_LABEL_KEYS[log.action] ? t(`uiWorkforce.${ACTION_LABEL_KEYS[log.action]}`) : log.action },
        { header: t('uiWorkforce.auditActor'), accessor: (log) => log.actorEmailAtTime ?? t('uiWorkforce.auditSystem') },
        { header: t('uiWorkforce.auditTarget'), accessor: (log) => TARGET_TYPE_LABEL_KEYS[log.targetType ?? ''] ? t(`uiWorkforce.${TARGET_TYPE_LABEL_KEYS[log.targetType ?? '']}`) : log.targetType ?? '' },
        { header: t('uiWorkforce.auditEntityId'), accessor: (log) => log.targetId ?? '' },
        { header: t('uiWorkforce.auditIp'), accessor: (log) => log.ipAddress ?? '' },
      ]);
      if (truncated) {
        notify.info(t('uiWorkforce.auditExportLimit', { count: AUDIT_EXPORT_MAX }));
      }
    } catch {
      notify.error(t('uiWorkforce.auditExportError'));
    } finally {
      setExporting(false);
    }
  };

  const filteredLogs = search ? logs.filter(matchesSearch) : logs;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiWorkforce.auditTitle')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('uiWorkforce.auditDescription')}
          </p>
        </div>
        <Button variant="outline" onClick={handleExportCsv} disabled={filteredLogs.length === 0 || exporting}>
          <Download className="h-4 w-4" />
          {exporting ? t('uiWorkforce.auditExporting') : t('uiWorkforce.auditExport')}
        </Button>
      </div>

      <Card noPadding>
        <div className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <SearchInput
                placeholder={t('uiWorkforce.auditSearch')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
              />
            </div>
            <select
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
              aria-label={t('uiWorkforce.auditFilterAction')}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">{t('uiWorkforce.auditAllActions')}</option>
              <option value="invoice.issued">{t('uiWorkforce.auditInvoiceIssued')}</option>
              <option value="payment.created">{t('uiWorkforce.auditPaymentCreated')}</option>
              <option value="user.created">{t('uiWorkforce.auditUserCreated')}</option>
              <option value="user.deactivated">{t('uiWorkforce.auditUserDeactivated')}</option>
              <option value="encounter.closed">{t('uiWorkforce.auditEncounterClosed')}</option>
            </select>
            <select
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
              aria-label={t('uiWorkforce.auditFilterTarget')}
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
            >
              <option value="">{t('uiWorkforce.auditAllTargets')}</option>
              <option value="USR">{t('uiWorkforce.auditEntityUser')}</option>
              <option value="APT">{t('uiWorkforce.auditEntityAppointment')}</option>
              <option value="ENC">{t('uiWorkforce.auditEntityEncounter')}</option>
              <option value="INV">{t('uiWorkforce.auditEntityInvoice')}</option>
              <option value="PAY">{t('uiWorkforce.auditEntityPayment')}</option>
              <option value="ITM">{t('uiWorkforce.auditEntityInventory')}</option>
            </select>
            <input
              type="date"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
              aria-label={t('uiWorkforce.auditDateFrom')}
              max={dateTo || undefined}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <span className="self-center text-gray-400">—</span>
            <input
              type="date"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
              aria-label={t('uiWorkforce.auditDateTo')}
              min={dateFrom || undefined}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 dark:border-surface-800 dark:bg-surface-800">
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.auditTime')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.auditAction')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.auditActor')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.auditTarget')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.auditIp')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50 dark:border-surface-800 dark:hover:bg-surface-800/60">
                    <td className="px-4 py-3 text-gray-600 dark:text-surface-300">
                      {new Date(log.occurredAt).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono dark:bg-surface-700 dark:text-surface-200">
                        {(ACTION_LABEL_KEYS[log.action] ? t(`uiWorkforce.${ACTION_LABEL_KEYS[log.action]}`) : log.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-surface-100">
                          {log.actorEmailAtTime ?? t('uiWorkforce.auditSystem')}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-mono text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                        {(TARGET_TYPE_LABEL_KEYS[log.targetType ?? ''] ? t(`uiWorkforce.${TARGET_TYPE_LABEL_KEYS[log.targetType ?? '']}`) : log.targetType ?? '—')}
                      </span>
                      {log.targetId && (
                        <span className="ml-1 text-xs text-gray-500 dark:text-surface-400">{log.targetId}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs dark:text-surface-400">
                      {log.ipAddress ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredLogs.length === 0 && !isLoading && (
          <div className="p-6 text-center text-gray-500 dark:text-surface-400">{t('uiWorkforce.auditNoLogs')}</div>
        )}

        {pagination?.hasMore && (
          <div className="flex justify-center border-t border-gray-100 px-4 py-3">
            <Button variant="outline" size="sm" onClick={handleLoadMore} isLoading={isFetching}>
              {t('uiWorkforce.auditLoadMore')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
