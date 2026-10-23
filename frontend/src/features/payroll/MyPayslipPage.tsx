import { useTranslation } from 'react-i18next';
import { Card, Button, Badge, EmptyState } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileDown, FileX } from 'lucide-react';
import { useState } from 'react';
import { downloadPdf } from '@/lib/pdf';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { useMyPayslip } from './payrollApi';

export default function MyPayslipPage() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'vi' ? vi : enUS;
  const { periodId } = useParams<{ periodId: string }>();
  const { data: payslip, isLoading } = useMyPayslip(periodId);
  const [pdfBusy, setPdfBusy] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-100 dark:bg-surface-800" />
        <div className="h-96 animate-pulse rounded bg-gray-100 dark:bg-surface-800" />
      </div>
    );
  }

  if (!payslip) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link to="/my-payroll/history">
            <ArrowLeft className="h-4 w-4" />
            {t('uiWorkforce.payrollBack')}
          </Link>
        </Button>
        <Card>
          <EmptyState
            icon={<FileX className="h-10 w-10 text-gray-400 dark:text-surface-500" />}
            title={t('uiWorkforce.payrollPayslipNotFound')}
            description={t('uiWorkforce.payrollPayslipNotAvailable')}
          />
        </Card>
      </div>
    );
  }

  // PayrollConfig's bhxh/bhyt/bhtn rates are summed into one combined rate
  // before computation (payroll.service.ts) — there's only ever one
  // deducted amount, not three; show it as one line rather than inventing
  // a 3-way split the backend never computed.
  const totalDeductions = payslip.taxTncnVnd + payslip.bhxhVnd + payslip.penaltyVnd;
  const bonusAdjustments = payslip.adjustments.filter((a) => a.type === 'BONUS');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" asChild>
          <Link to="/my-payroll/history">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">
            {t('uiWorkforce.payrollMyPayslips')} {format(new Date(payslip.periodStart), 'MM/yyyy', { locale: dateLocale })}
          </h1>
        </div>
        <Button
          variant="outline"
          isLoading={pdfBusy}
          onClick={async () => {
            setPdfBusy(true);
            try {
              await downloadPdf(`/payroll/me/payslip/${periodId}/pdf`, 'phieu-luong.pdf');
            } catch (err) {
              notify.error(getApiErrorMessage(err, t('uiWorkforce.payrollPdfError')));
            } finally {
              setPdfBusy(false);
            }
          }}
        >
          <FileDown className="h-4 w-4" /> PDF
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Earnings */}
          <Card title={t('uiWorkforce.payrollEarnings')}>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-surface-300">{t('uiWorkforce.payrollBaseSalary')}</span>
                <span className="font-medium">{formatCurrency(payslip.baseSalaryVnd)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-surface-300">{t('uiWorkforce.payrollCommission')}</span>
                <span className="font-medium">{formatCurrency(payslip.commissionVnd)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-surface-300">{t('uiWorkforce.payrollOvertimeRate')}</span>
                <span className="font-medium">{formatCurrency(payslip.overtimePayVnd)}</span>
              </div>
              {bonusAdjustments.map((adj) => (
                <div key={adj.id} className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-surface-300">{t('uiWorkforce.payrollBonus')} — {adj.reason}</span>
                  <span className="font-medium text-green-600 dark:text-green-400">{formatCurrency(adj.amountVnd)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-200 pt-3 font-semibold">
                <span>{t('uiWorkforce.payrollTotalEarnings')}</span>
                <span>{formatCurrency(payslip.grossPayVnd)}</span>
              </div>
            </div>
          </Card>

          {/* Deductions */}
          <Card title={t('uiWorkforce.payrollDeductionsTitle')}>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-surface-300">{t('uiWorkforce.payrollIncomeTax')}</span>
                <span className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(payslip.taxTncnVnd)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-surface-300">{t('uiWorkforce.payrollInsurance')}</span>
                <span className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(payslip.bhxhVnd)}</span>
              </div>
              {payslip.penaltyVnd > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-surface-300">{t('uiWorkforce.payrollOtherDeductions')}</span>
                  <span className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(payslip.penaltyVnd)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-3 font-semibold text-red-600 dark:border-surface-700 dark:text-red-400">
                <span>{t('uiWorkforce.payrollTotalDeductions')}</span>
                <span>-{formatCurrency(totalDeductions)}</span>
              </div>
            </div>
          </Card>

          {/* Encounters */}
          <Card title={t('uiWorkforce.payrollTreatmentHistory')}>
            {payslip.encounters.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollNoEncountersInPeriod')}</p>
            ) : (
              <div className="space-y-2">
                {payslip.encounters.map((enc) => (
                  <div key={enc.id} className="flex items-center justify-between rounded border border-gray-100 p-3 dark:border-surface-700">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-surface-100">{enc.patientName}</p>
                      <p className="text-sm text-gray-500 dark:text-surface-400">
                        {enc.patientCode} · {t('uiWorkforce.payrollDentistServiceDuration', { minutes: enc.durationMinutes })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900 dark:text-surface-100">{formatCurrency(enc.treatmentRevenueVnd)}</p>
                      <span className="text-xs text-gray-500 dark:text-surface-400">
                        {format(new Date(enc.startedAt), 'dd/MM/yyyy', { locale: dateLocale })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div>
          {/* Summary */}
          <Card className="sticky top-4">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollNet')}</p>
              <p className="mt-2 text-4xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(payslip.netPayVnd)}
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-surface-400">
                {t('uiWorkforce.period')} {format(new Date(payslip.periodStart), 'MM/yyyy', { locale: dateLocale })}
              </p>
              <Badge variant="success">{t('uiWorkforce.payrollCalculated')}</Badge>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
