import { useTranslation } from 'react-i18next';
import { Card, Badge, EmptyState } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { DollarSign } from 'lucide-react';
import { useMyCompensation } from './payrollApi';

export default function MyCompensationPage() {
  const { t, i18n } = useTranslation();
  const { data: comp, isLoading } = useMyCompensation();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiWorkforce.payrollMyCompensationTitle')}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
          {t('uiWorkforce.payrollMyCompensationDescription')}
        </p>
      </div>

      {isLoading ? (
        <Card>
          <div className="h-40 animate-pulse rounded bg-gray-100 dark:bg-surface-800" />
        </Card>
      ) : !comp ? (
        <Card>
          <EmptyState
            icon={<DollarSign className="h-10 w-10 text-gray-400 dark:text-surface-500" />}
            title={t('uiWorkforce.payrollNoCurrentCompensation')}
            description={t('uiWorkforce.payrollContactAdministrator')}
          />
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-surface-100">{t('uiWorkforce.payrollCurrentPolicy')}</h2>
            <Badge variant="success">{t('uiWorkforce.payrollCurrentlyActive')}</Badge>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollBaseSalary')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-surface-100">{formatCurrency(comp.baseSalary)}</p>
              <p className="text-xs text-gray-400 dark:text-surface-500">{t('uiWorkforce.payrollPerMonth')}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollCommission')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-surface-100">{comp.commissionPercentage}%</p>
              <p className="text-xs text-gray-400 dark:text-surface-500">{t('uiWorkforce.payrollOfRevenue')}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollOvertimeRate')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-surface-100">{formatCurrency(comp.overtimeHourlyRate)}</p>
              <p className="text-xs text-gray-400 dark:text-surface-500">{t('uiWorkforce.payrollPerHour')}</p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-surface-700">
            <p className="text-sm text-gray-500 dark:text-surface-400">
              {t('uiWorkforce.payrollEffectiveFrom')}: {format(new Date(comp.effectiveFrom), 'dd/MM/yyyy', { locale: i18n.language === 'vi' ? vi : enUS })}
              {comp.effectiveTo &&
                ` — ${t('uiWorkforce.payrollEffectiveTo')}: ${format(new Date(comp.effectiveTo), 'dd/MM/yyyy', { locale: i18n.language === 'vi' ? vi : enUS })}`}
            </p>
            {comp.notes && <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollNotes', { notes: comp.notes })}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
