import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { ArrowLeft, X } from 'lucide-react';
import { inventoryApi, stockMovementLabel, type StockMovementType } from '@/types/inventory';
import { Card, EmptyState, Pagination, Select } from '@/components/ui';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 30;
/** The kinds the backend records (MovementType); the rest are legacy labels. */
const TYPES: StockMovementType[] = ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT'];
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Every stock movement, newest first: one item (?itemId=, from the item
 * page's "Xem tất cả") or all items, filtered by kind and date. Filters live
 * in the URL so the page can be linked and reloaded.
 */
export default function StockMovementsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const itemId = params.get('itemId') ?? undefined;
  const typeParam = params.get('type') as StockMovementType | null;
  const type = typeParam && TYPES.includes(typeParam) ? typeParam : undefined;
  const from = isDate(params.get('from')) ? params.get('from')! : undefined;
  const to = isDate(params.get('to')) ? params.get('to')! : undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const setFilter = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const { data: item } = useQuery({
    queryKey: ['inventory-item', itemId],
    queryFn: () => inventoryApi.get(itemId!),
    enabled: !!itemId,
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory-movements', 'page', { itemId, type, from, to, page }],
    queryFn: () => inventoryApi.listMovements({ itemId, type, from, to, page, pageSize: PAGE_SIZE }),
  });
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const dateField =
    'mt-1 block min-h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-surface-600 dark:bg-surface-900 dark:text-surface-100';

  return (
    <div className="space-y-3">
      <div>
        {itemId && (
          <Link
            to={`/inventory/items/${itemId}`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t('uiOperations.movementsBackToItem')}
          </Link>
        )}
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{t('uiOperations.stockMovementHistory')}</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t('uiOperations.movementsDescription')}</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          {itemId && (
            <span className="inline-flex items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:bg-surface-800 dark:text-brand-200">
              {t('uiOperations.movementsItem', { name: item ? `${item.code} · ${item.name}` : '…' })}
              <button
                type="button"
                onClick={() => setFilter('itemId')}
                className="no-touch-target rounded p-0.5 hover:bg-brand-100 dark:hover:bg-surface-700"
                aria-label={t('uiOperations.movementsAllItems')}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </span>
          )}
          <div className="w-48">
            <Select
              label={t('uiOperations.movementsType')}
              value={type ?? ''}
              onChange={(e) => setFilter('type', e.target.value || undefined)}
              options={[
                { value: '', label: t('uiOperations.movementsAllTypes') },
                ...TYPES.map((v) => ({ value: v, label: stockMovementLabel(v) })),
              ]}
            />
          </div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {t('uiOperations.movementsFrom')}
            <input type="date" className={dateField} value={from ?? ''} max={to} onChange={(e) => setFilter('from', e.target.value || undefined)} />
          </label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {t('uiOperations.movementsTo')}
            <input type="date" className={dateField} value={to ?? ''} min={from} onChange={(e) => setFilter('to', e.target.value || undefined)} />
          </label>
        </div>
      </Card>

      <Card noPadding>
        {isError ? (
          <p className="p-6 text-sm text-red-600 dark:text-red-400">{t('uiOperations.movementsLoadError')}</p>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded bg-gray-100 dark:bg-surface-800" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('uiOperations.noStockMovements')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 dark:border-surface-700 dark:text-gray-400">
                    <th scope="col" className="px-4 py-2.5">{t('uiOperations.movementsTime')}</th>
                    {!itemId && <th scope="col" className="px-4 py-2.5">{t('uiOperations.movementsItemColumn')}</th>}
                    <th scope="col" className="px-4 py-2.5">{t('uiOperations.movementsType')}</th>
                    <th scope="col" className="px-4 py-2.5 text-right">{t('uiOperations.quantity')}</th>
                    <th scope="col" className="px-4 py-2.5 text-right">{t('uiOperations.remaining')}</th>
                    <th scope="col" className="px-4 py-2.5">{t('uiOperations.reason')}</th>
                    <th scope="col" className="px-4 py-2.5">{t('uiOperations.movementsBy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100 last:border-0 dark:border-surface-800">
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-700 dark:text-gray-300">
                        {format(new Date(m.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                      </td>
                      {!itemId && (
                        <td className="px-4 py-2.5">
                          <Link to={`/inventory/items/${m.itemId}`} className="font-medium text-gray-900 hover:text-brand-600 hover:underline dark:text-gray-100">
                            {m.itemName}
                          </Link>
                          <span className="block font-mono text-xs text-gray-500 dark:text-gray-400">{m.itemCode}</span>
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{stockMovementLabel(m.type)}</td>
                      <td
                        className={cn(
                          'px-4 py-2.5 text-right font-medium',
                          m.quantity > 0 ? 'text-green-700 dark:text-green-400' : m.quantity < 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-500',
                        )}
                      >
                        {m.quantity > 0 ? '+' : ''}
                        {m.quantity}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-900 dark:text-gray-100">{m.balanceAfter}</td>
                      <td className="max-w-xs px-4 py-2.5 text-gray-600 dark:text-gray-400">{m.reason || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-600 dark:text-gray-400">{m.performedByUserName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > PAGE_SIZE && (
              <div className="border-t border-gray-100 px-4 py-3 dark:border-surface-800">
                <Pagination
                  currentPage={page}
                  totalPages={Math.ceil(total / PAGE_SIZE)}
                  totalItems={total}
                  pageSize={PAGE_SIZE}
                  onPageChange={(p) => setFilter('page', String(p))}
                />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
