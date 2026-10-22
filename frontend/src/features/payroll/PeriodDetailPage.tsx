import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calculator, Lock, CheckCircle, Wallet, SlidersHorizontal } from 'lucide-react';
import { Card, Button, StatusBadge, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatVnd, formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { clinicToday } from '@/lib/clinicTime';
import { Alert } from '@/components/ui/Alert';
import { useAuthStore } from '@/stores/authStore';
import {
  usePeriodDetail,
  usePeriodWarnings,
  useComputePeriod,
  useLockPeriod,
  useApprovePeriod,
} from './payrollApi';
import { LineItemBreakdownDrawer } from './LineItemBreakdownDrawer';
import { AdjustmentModal } from './AdjustmentModal';
import { MarkPaidModal } from './MarkPaidModal';
import { Textarea } from '@/components/ui/Textarea';
import {
  SELF_APPROVAL_REASON_MIN,
  type PayrollLineItem,
  type PayrollPeriodWarnings,
} from '@/types/payroll';

function warningCount(w: PayrollPeriodWarnings | undefined) {
  if (!w) return 0;
  return (
    w.draftInvoices.length +
    w.dentistsWithoutCompensation.length +
    w.outsideHoursEncounters.length +
    w.terminatedDentists.length
  );
}

/** Things to settle before locking the period (H4/H5 warnings). */
function PeriodWarningsCard({ warnings }: { warnings: PayrollPeriodWarnings }) {
  const { t } = useTranslation();
  return (
    <Card title={t('uiWorkforce.payrollWarningCardTitle')}>
      <div className="space-y-4 text-sm">
        {warnings.draftInvoices.length > 0 && (
          <section>
            <p className="font-medium text-amber-700">
              {t('uiWorkforce.payrollDraftInvoiceWarning', { count: warnings.draftInvoices.length, days: warnings.draftInvoiceDays })}
            </p>
            <p className="text-gray-500 dark:text-surface-400">
              {t('uiWorkforce.payrollDraftInvoiceInstructions')}
            </p>
            <ul className="mt-1 list-disc pl-5 text-gray-700 dark:text-surface-200">
              {warnings.draftInvoices.slice(0, 20).map((d) => (
                <li key={d.invoiceId}>
                  {d.code} — {d.patientName} — {d.dentistName} — {formatVnd(d.totalVnd)} ({d.ageDays} {t('uiWorkforce.days')})
                </li>
              ))}
              {warnings.draftInvoices.length > 20 && <li>{t('uiWorkforce.payrollOtherDraftInvoices', { count: warnings.draftInvoices.length - 20 })}</li>}
            </ul>
          </section>
        )}
        {warnings.dentistsWithoutCompensation.length > 0 && (
          <section>
            <p className="font-medium text-amber-700 dark:text-amber-300">{t('uiWorkforce.payrollDentistsMissingPay')}</p>
            <p className="text-gray-500 dark:text-surface-400">
              {t('uiWorkforce.payrollMissingPayDescription')}
            </p>
            <ul className="mt-1 list-disc pl-5 text-gray-700 dark:text-surface-200">
              {warnings.dentistsWithoutCompensation.map((d) => (
                <li key={d.dentistId}>
                  {d.dentistName} — {t('uiWorkforce.payrollDentistEncounterCount', { count: d.encounterCount })}
                </li>
              ))}
            </ul>
          </section>
        )}
        {warnings.outsideHoursEncounters.length > 0 && (
          <section>
            <p className="font-medium text-amber-700 dark:text-amber-300">{t('uiWorkforce.payrollOutsideHoursTitle')}</p>
            <p className="text-gray-500 dark:text-surface-400">
              {t('uiWorkforce.payrollOutsideHoursDescription')}
            </p>
            <ul className="mt-1 list-disc pl-5 text-gray-700 dark:text-surface-200">
              {warnings.outsideHoursEncounters.slice(0, 20).map((e) => (
                <li key={e.encounterId}>
                  {e.dentistName} — {formatDateTime(e.startedAt)} → {formatDateTime(e.closedAt)} ({t('uiWorkforce.payrollOutsideDuration', { minutes: e.minutes })})
                </li>
              ))}
            </ul>
          </section>
        )}
        {warnings.terminatedDentists.length > 0 && (
          <section>
            <p className="font-medium text-gray-700 dark:text-surface-200">{t('uiWorkforce.payrollTerminatedDuringPeriod')}</p>
            <ul className="mt-1 list-disc pl-5 text-gray-700 dark:text-surface-200">
              {warnings.terminatedDentists.map((d) => (
                <li key={d.dentistId ?? d.dentistName}>
                  {d.dentistName} — {d.terminationDate ? formatDate(d.terminationDate) : ''}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Card>
  );
}

export default function PeriodDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { data: period, isLoading } = usePeriodDetail(id);
  const computePeriod = useComputePeriod();
  const lockPeriod = useLockPeriod();
  const approvePeriod = useApprovePeriod();
  const isOpenPeriod = period?.status === 'DRAFT' || period?.status === 'REVIEWING';
  const { data: warnings } = usePeriodWarnings(id, isOpenPeriod);
  const [confirmLock, setConfirmLock] = useState(false);
  const myId = useAuthStore((s) => s.user?.id);
  const [confirmSelfApprove, setConfirmSelfApprove] = useState(false);
  const [selfReason, setSelfReason] = useState('');

  const [breakdownItem, setBreakdownItem] = useState<PayrollLineItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<PayrollLineItem | null>(null);
  const [showMarkPaid, setShowMarkPaid] = useState(false);

  if (isLoading) return <PageLoader />;

  if (!period) {
    return (
      <Card>
        <EmptyState title={t('uiWorkforce.payrollNotFound')} description={t('uiWorkforce.payrollNotFoundDescription')} />
      </Card>
    );
  }

  // grossPayVnd/netPayVnd/taxTncnVnd/bhxhVnd are Prisma Decimal fields, which
  // serialize as strings over JSON — coerce with Number() before summing so
  // `+` adds instead of concatenating.
  const totals = period.lineItems.reduce(
    (acc, li) => ({
      gross: acc.gross + Number(li.grossPayVnd),
      net: acc.net + Number(li.netPayVnd),
      tax: acc.tax + Number(li.taxTncnVnd),
      bhxh: acc.bhxh + Number(li.bhxhVnd),
    }),
    { gross: 0, net: 0, tax: 0, bhxh: 0 },
  );

  const runCompute = async () => {
    try {
      await computePeriod.mutateAsync(period.id);
      notify.success(t('uiWorkforce.payrollComputedToast'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.payrollComputeError')));
    }
  };

  const runLock = async () => {
    setConfirmLock(false);
    try {
      await lockPeriod.mutateAsync(period.id);
      notify.success(t('uiWorkforce.payrollLockSuccess'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.payrollLockError')));
    }
  };

  // The approver has their own payslip here (owner who also practises).
  const ownLine = period.lineItems.find((li) => li.dentistId === myId);

  const runApprove = async () => {
    if (ownLine && selfReason.trim().length < SELF_APPROVAL_REASON_MIN) {
      notify.error(t('uiWorkforce.payrollSelfApprovalRequired', { count: SELF_APPROVAL_REASON_MIN }));
      return;
    }
    try {
      await approvePeriod.mutateAsync(
        ownLine ? { id: period.id, selfApprovalReason: selfReason.trim() } : period.id,
      );
      setConfirmSelfApprove(false);
      setSelfReason('');
      notify.success(t('uiWorkforce.payrollApprovedToast'));
    } catch (err) {
      setConfirmSelfApprove(false);
      notify.error(getApiErrorMessage(err, t('uiWorkforce.payrollApproveError')));
    }
  };

  const canCompute = hasPermission('payroll.period.compute') && (period.status === 'DRAFT' || period.status === 'REVIEWING');
  const canAdjust = hasPermission('payroll.period.adjust') && (period.status === 'DRAFT' || period.status === 'REVIEWING');
  const canLock = hasPermission('payroll.period.lock') && period.status === 'DRAFT';
  const canApprove = hasPermission('payroll.period.approve') && period.status === 'REVIEWING';
  // Lock/approve open the day after the period's last clinic day (the
  // server refuses earlier: invoices issued on the last days would be lost).
  const periodEnded = clinicToday() > period.periodEnd.slice(0, 10);
  const notEndedHint = t('uiWorkforce.payrollPeriodNotEnded', { date: formatDate(period.periodEnd.slice(0, 10)) });
  const canMarkPaid = hasPermission('payroll.period.mark_paid') && period.status === 'APPROVED';

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          {/* Periods list lives in the "Kỳ lương" tab of the payroll dashboard. */}
          <Link
            to="/payroll"
            className="mb-1 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-surface-400 dark:hover:text-surface-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t('uiWorkforce.payrollBackToPeriods')}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">
              {t('uiWorkforce.period')} {formatDate(period.periodStart)} — {formatDate(period.periodEnd)}
            </h1>
            <StatusBadge status={period.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCompute && (
            <Button variant="outline" onClick={runCompute} isLoading={computePeriod.isPending}>
              <Calculator className="h-4 w-4" /> {t('uiWorkforce.payrollCalculate')}
            </Button>
          )}
          {canLock && (
            <Button
              variant="outline"
              onClick={() => (warningCount(warnings) > 0 ? setConfirmLock(true) : runLock())}
              isLoading={lockPeriod.isPending}
              disabled={!periodEnded}
              title={periodEnded ? undefined : notEndedHint}
            >
              <Lock className="h-4 w-4" /> {t('uiWorkforce.payrollLock')}
            </Button>
          )}
          {canApprove && (
            <Button
              variant="outline"
              onClick={() => (ownLine ? setConfirmSelfApprove(true) : runApprove())}
              isLoading={approvePeriod.isPending}
              disabled={!periodEnded}
              title={periodEnded ? t('uiWorkforce.payrollApproveRecomputes') : notEndedHint}
            >
              <CheckCircle className="h-4 w-4" /> {t('uiWorkforce.payrollReviewApprove')}
            </Button>
          )}
          {canMarkPaid && (
            <Button onClick={() => setShowMarkPaid(true)}>
              <Wallet className="h-4 w-4" /> {t('uiWorkforce.payrollPaid')}
            </Button>
          )}
        </div>
      </div>

      {(canLock || canApprove) && !periodEnded && <Alert variant="info">{notEndedHint}</Alert>}

      {period.openedFromPeriodId && <Alert variant="warning">{t('uiWorkforce.payrollAdjustmentPeriodNote')}</Alert>}

      {isOpenPeriod && warnings && warningCount(warnings) > 0 && <PeriodWarningsCard warnings={warnings} />}

      <p className="text-xs text-gray-500 dark:text-surface-400">
        {t('uiWorkforce.payrollCommissionCalculationNote')}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollGrossTotal')}</p>
          <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-surface-100">{formatVnd(totals.gross)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollNetTotal')}</p>
          <p className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-400">{formatVnd(totals.net)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollTaxTotal')}</p>
          <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-surface-100">{formatVnd(totals.tax)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollSocialInsuranceTotal')}</p>
          <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-surface-100">{formatVnd(totals.bhxh)}</p>
        </Card>
      </div>

      <Card title={t('uiWorkforce.payrollDentistCount', { count: period.lineItems.length })} noPadding>
        {period.lineItems.length === 0 ? (
          <EmptyState
            title={t('uiWorkforce.payrollNoLineItems')}
            description={canCompute ? t('uiWorkforce.payrollComputeToCreateItems') : t('uiWorkforce.payrollPeriodNotCalculated')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('uiWorkforce.payrollDentist')}</th>
                  <th className="text-right">{t('uiWorkforce.payrollEncounters')}</th>
                  <th className="text-right">{t('uiWorkforce.payrollHoursWorked')}</th>
                  <th className="text-right">{t('uiWorkforce.payrollOvertimeHours')}</th>
                  <th className="text-right">{t('uiWorkforce.payrollGross')}</th>
                  <th className="text-right">{t('uiWorkforce.payrollIncomeTaxDefault')}</th>
                  <th className="text-right">{t('uiWorkforce.payrollSocialInsurance')}</th>
                  <th className="text-right">{t('uiWorkforce.payrollNet')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {period.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td className="font-medium text-gray-900 dark:text-surface-100">
                      {li.dentistName}
                      {li.manuallyAdjusted && (
                        <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">({t('uiWorkforce.payrollAdjusted')})</span>
                      )}
                    </td>
                    <td className="text-right">{li.encountersCount}</td>
                    <td className="text-right">{formatNumber(li.totalHours)}</td>
                    <td className={`text-right ${Number(li.overtimeHours) > 0 ? 'font-medium text-amber-600' : ''}`}>
                      {formatNumber(li.overtimeHours)}
                    </td>
                    <td className="text-right">{formatVnd(li.grossPayVnd)}</td>
                    <td className="text-right">{formatVnd(li.taxTncnVnd)}</td>
                    <td className="text-right">{formatVnd(li.bhxhVnd)}</td>
                    <td className="text-right font-semibold text-emerald-700">{formatVnd(li.netPayVnd)}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button variant="outline" size="sm" onClick={() => setBreakdownItem(li)}>
                        {t('uiWorkforce.payrollViewDetails')}
                      </Button>
                      {canAdjust && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-2"
                          onClick={() => setAdjustItem(li)}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" /> {t('uiWorkforce.payrollAdjust')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <LineItemBreakdownDrawer
        open={!!breakdownItem}
        onClose={() => setBreakdownItem(null)}
        dentistName={breakdownItem?.dentistName ?? ''}
        encounters={breakdownItem?.encounterDetails ?? []}
        adjustments={breakdownItem?.adjustments ?? []}
        computationLog={breakdownItem?.computationLog}
      />

      <AdjustmentModal
        open={!!adjustItem}
        onClose={() => setAdjustItem(null)}
        periodId={period.id}
        lineItem={adjustItem}
      />

      <ConfirmDialog
        open={confirmSelfApprove}
        onClose={() => setConfirmSelfApprove(false)}
        onConfirm={runApprove}
        title={t('uiWorkforce.payrollSelfApproveTitle')}
        description={
          <div className="space-y-2">
            <p>
              {t('uiWorkforce.payrollSelfApproveDescription', { amount: formatVnd(ownLine?.netPayVnd ?? 0) })}
            </p>
            <Textarea
              label={t('uiWorkforce.payrollSelfApprovalReason')}
              placeholder={t('uiWorkforce.payrollSelfApprovalPlaceholder')}
              rows={2}
              value={selfReason}
              onChange={(e) => setSelfReason(e.target.value)}
              hint={t('uiWorkforce.payrollSelfApprovalRequired', { count: SELF_APPROVAL_REASON_MIN })}
              required
            />
          </div>
        }
        confirmLabel={t('uiWorkforce.payrollSelfApprove')}
        isLoading={approvePeriod.isPending}
      />

      <ConfirmDialog
        open={confirmLock}
        onClose={() => setConfirmLock(false)}
        onConfirm={runLock}
        title={t('uiWorkforce.payrollLockWarningsTitle')}
        description={t('uiWorkforce.payrollLockWarningsDescription', { count: warningCount(warnings) })}
        confirmLabel={t('uiWorkforce.payrollLockAnyway')}
        isLoading={lockPeriod.isPending}
      />

      <MarkPaidModal open={showMarkPaid} onClose={() => setShowMarkPaid(false)} periodId={period.id} />
    </div>
  );
}
