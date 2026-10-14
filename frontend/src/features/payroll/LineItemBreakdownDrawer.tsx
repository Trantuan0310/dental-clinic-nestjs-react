import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { AdjustmentTypeBadge } from '@/components/ui/StatusBadge';
import { formatVnd, formatDateTime } from '@/lib/format';
import type { PayrollEncounterDetail, PayrollAdjustment } from '@/types/payroll';

/** Bonus (and a positive manual override) adds; everything else is deducted. */
const isAddition = (a: PayrollAdjustment) =>
  a.type === 'BONUS' || (a.type === 'MANUAL_OVERRIDE' && Number(a.amountVnd) > 0);

const breakdownOf = (e: PayrollEncounterDetail) =>
  (e.treatmentBreakdown && !Array.isArray(e.treatmentBreakdown) ? e.treatmentBreakdown : {}) as {
    invoiceCode?: string;
    description?: string;
  };

interface Props {
  open: boolean;
  onClose: () => void;
  dentistName: string;
  encounters: PayrollEncounterDetail[];
  adjustments: PayrollAdjustment[];
  computationLog: Record<string, unknown> | undefined;
}

export function LineItemBreakdownDrawer({ open, onClose, dentistName, encounters, adjustments, computationLog }: Props) {
  const { t } = useTranslation();
  const [showLog, setShowLog] = useState(false);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('uiWorkforce.payrollBreakdownTitle', { name: dentistName })}
      width="xl"
      footer={
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setShowLog((s) => !s)}>
            {showLog ? t('uiWorkforce.payrollHide') : t('uiWorkforce.payrollShow')} {t('uiWorkforce.payrollComputationLog')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('uiWorkforce.payrollClose')}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-surface-100">{t('uiWorkforce.payrollAdjustments')}</h3>
          {adjustments.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollNoAdjustments')}</p>
          ) : (
            <div className="space-y-2">
              {adjustments.map((a) => (
                <div key={a.id} className="flex items-start gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-surface-700">
                  <AdjustmentTypeBadge type={a.type} />
                  <div className="flex-1">
                    <p className="text-gray-900 dark:text-surface-100">{a.reason}</p>
                    <p className="text-xs text-gray-500 dark:text-surface-400">
                      {formatDateTime(a.adjustedAt)}
                      {a.sourceInvoiceId && ` · ${t('uiWorkforce.payrollAdjustmentSourceVoidedInvoice')}`}
                    </p>
                  </div>
                  <span className={isAddition(a) ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>
                    {isAddition(a) ? '+' : '−'}
                    {formatVnd(Math.abs(Number(a.amountVnd)))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-surface-100">
            {t('uiWorkforce.payrollCommissionInvoiceCount', { count: encounters.length })}
          </h3>
          <p className="mb-2 text-xs text-gray-500 dark:text-surface-400">
            {t('uiWorkforce.payrollIssuedInvoiceDiscountNote')}
          </p>
          {encounters.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollNoEncounters')}</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-gray-200 dark:border-surface-700">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>{t('uiWorkforce.payrollEncounterDate')}</th>
                    <th>{t('uiWorkforce.payrollInvoice')}</th>
                    <th className="text-right">{t('uiWorkforce.payrollCommissionBasis')}</th>
                  </tr>
                </thead>
                <tbody>
                  {encounters.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <p className="text-gray-900 dark:text-surface-100">{formatDateTime(e.encounterStartAt)}</p>
                        <p className="text-xs text-gray-500 dark:text-surface-400">→ {formatDateTime(e.encounterEndAt)}</p>
                      </td>
                      <td className="text-xs">
                        <p className="text-gray-900 dark:text-surface-100">{breakdownOf(e).invoiceCode ?? '—'}</p>
                        <p className="text-gray-500 dark:text-surface-400">{breakdownOf(e).description ?? t('uiWorkforce.payrollDentistServiceDuration', { minutes: e.durationMinutes })}</p>
                      </td>
                      <td className="text-right font-medium">{formatVnd(e.treatmentRevenueVnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {showLog && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-surface-100">{t('uiWorkforce.payrollComputationLog')}</h3>
            <pre className="overflow-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100 scrollbar-thin">
              {JSON.stringify(computationLog ?? {}, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </Drawer>
  );
}
