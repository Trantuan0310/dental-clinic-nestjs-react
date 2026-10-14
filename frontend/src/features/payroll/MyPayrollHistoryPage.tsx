import { useTranslation } from 'react-i18next';
import { DollarSign, Calendar, Eye } from 'lucide-react';
import { Card, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { useMyPayrollHistory } from './payrollApi';

const STATUS_STYLES: Record<string, { bg: string; text: string; labelKey: string }> = {
  DRAFT: { bg: 'bg-gray-50 dark:bg-surface-800', text: 'text-gray-700 dark:text-surface-300', labelKey: 'draft' },
  REVIEWING: { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', labelKey: 'reviewing' },
  APPROVED: { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', labelKey: 'approved' },
  PAID: { bg: 'bg-green-50 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', labelKey: 'paid' },
  LOCKED: { bg: 'bg-gray-50 dark:bg-surface-800', text: 'text-gray-700 dark:text-surface-300', labelKey: 'locked' },
};

function getStatusBadge(status: string, t: (key: string) => string) {
  const style = STATUS_STYLES[status] ?? { bg: 'bg-gray-50 dark:bg-surface-800', text: 'text-gray-700 dark:text-surface-300', labelKey: '' };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      {style.labelKey ? t(`uiWorkforce.${style.labelKey}`) : status}
    </span>
  );
}

export default function MyPayrollHistoryPage() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'vi' ? vi : enUS;
  const { data: payslips, isLoading } = useMyPayrollHistory();

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">{t('uiWorkforce.payrollMyPayslips')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
            {t('uiWorkforce.payrollHistoryDescription')}
          </p>
        </div>
      </div>

      <Tabs defaultValue="paid">
        <TabsList>
          <TabsTrigger value="paid">
            <DollarSign className="h-4 w-4 mr-2" />
            {t('uiWorkforce.payrollPaidTotal')}
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="h-4 w-4 mr-2" />
            {t('uiWorkforce.payrollMonthlyEstimate')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="paid">
          <Card noPadding>
            {isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-gray-100 dark:bg-surface-800" />
                ))}
              </div>
            ) : !payslips || payslips.length === 0 ? (
              <EmptyState
                icon={<DollarSign className="h-10 w-10 text-gray-400 dark:text-surface-500" />}
                title={t('uiWorkforce.payrollNoPeriods')}
                description={t('uiWorkforce.payrollFirstPeriodAppears')}
              />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-surface-800 dark:bg-surface-800">
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.period')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right dark:text-surface-300">{t('uiWorkforce.payrollTableNetPay')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.status')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-surface-300">{t('uiWorkforce.payrollPayDate')}</th>
                    <th className="px-4 py-3 font-medium text-gray-600 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((payslip) => (
                    <tr key={payslip.id} className="border-b border-gray-50 hover:bg-gray-50 dark:border-surface-800 dark:hover:bg-surface-800/60">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-surface-100">
                        {format(new Date(payslip.periodStart), 'dd/MM', { locale: dateLocale })}
                        {' – '}
                        {format(new Date(payslip.periodEnd), 'dd/MM/yyyy', { locale: dateLocale })}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 font-semibold dark:text-green-400">
                        {formatCurrency(payslip.netSalary)}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(payslip.status, t)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-surface-400">
                        {payslip.paidAt
                          ? format(new Date(payslip.paidAt), 'dd/MM/yyyy', { locale: dateLocale })
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/my-payroll/payslip/${payslip.periodId}`}
                          className="text-brand-600 hover:underline"
                        >
                          {t('uiWorkforce.payrollDetails')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4 dark:text-surface-500" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-surface-100">{t('uiWorkforce.payrollEstimateTitle')}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
                {t('uiWorkforce.payrollEstimateComingSoon')}
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
