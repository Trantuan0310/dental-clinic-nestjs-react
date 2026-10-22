import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { vi } from 'date-fns/locale';
import { Plus, Calculator, Calendar, CheckCircle, Wallet, AlertCircle } from 'lucide-react';
import { Button, Card, StatusBadge, EmptyState, Modal, Input, Select } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { clinicToday } from '@/lib/clinicTime';
import { formatDate } from '@/lib/format';
import {
  usePeriods,
  useCreatePeriod,
  useComputePeriod,
  useApprovePeriod,
} from './payrollApi';
import { MarkPaidModal } from './MarkPaidModal';

/** Lock/approve open the day after the period's last clinic day. */
const hasEnded = (periodEnd: string) => clinicToday() > periodEnd.slice(0, 10);

export function PayrollListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [newPeriodCycle, setNewPeriodCycle] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('MONTHLY');
  const [markPaidPeriodId, setMarkPaidPeriodId] = useState<string | null>(null);

  const { data: periods, isLoading, isError, refetch } = usePeriods(
    statusFilter !== 'all' ? { status: statusFilter } : undefined,
  );

  const createPeriod = useCreatePeriod();
  const computePeriod = useComputePeriod();
  const approvePeriod = useApprovePeriod();

  const handleCreate = async () => {
    try {
      await createPeriod.mutateAsync({
        periodStart: newPeriodStart,
        periodEnd: newPeriodEnd,
        payrollCycle: newPeriodCycle,
      });
      notify.success(t('uiWorkforce.createNewPeriod'));
      setShowCreateModal(false);
      setNewPeriodStart('');
      setNewPeriodEnd('');
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.createNewPeriod')));
    }
  };

  const handleCompute = async (id: string) => {
    try {
      await computePeriod.mutateAsync(id);
      notify.success(t('uiWorkforce.computePayroll'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.computePayroll')));
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approvePeriod.mutateAsync(id);
      notify.success(t('uiWorkforce.approve'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.approve')));
    }
  };

  const rows = periods ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          <select
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">{t('uiWorkforce.allStatuses')}</option>
            <option value="DRAFT">{t('uiWorkforce.draft')}</option>
            <option value="REVIEWING">{t('uiWorkforce.reviewing')}</option>
            <option value="APPROVED">{t('uiWorkforce.approved')}</option>
            <option value="PAID">{t('uiWorkforce.paid')}</option>
            <option value="LOCKED">{t('uiWorkforce.locked')}</option>
          </select>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          {t('uiWorkforce.createPeriod')}
        </Button>
      </div>

      <Card noPadding>
        {isLoading ? (
          <div className="p-6">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-gray-100 dark:bg-surface-800" />
              ))}
            </div>
          </div>
        ) : isError && rows.length === 0 ? (
          <EmptyState
            icon={<AlertCircle className="h-10 w-10 text-red-400 dark:text-red-500" />}
            title={t('uiWorkforce.payrollLoadError')}
            description={t('uiWorkforce.loadErrorDescription')}
            action={{ label: t('uiWorkforce.retry'), onClick: () => refetch() }}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-10 w-10 text-gray-400 dark:text-surface-500" />}
            title={t('uiWorkforce.noPayrollPeriods')}
            description={t('uiWorkforce.createFirstPeriod')}
            action={{
              label: t('uiWorkforce.createPeriod'),
              onClick: () => setShowCreateModal(true),
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-gray-600 dark:border-surface-800 dark:bg-surface-800 dark:text-surface-300">
                  <th className="px-4 py-3 font-medium">{t('uiWorkforce.period')}</th>
                  <th className="px-4 py-3 font-medium">{t('uiWorkforce.cycle')}</th>
                  <th className="px-4 py-3 font-medium">{t('uiWorkforce.status')}</th>
                  <th className="px-4 py-3 font-medium text-gray-600 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((period) => (
                  <tr
                    key={period.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer dark:border-surface-800 dark:hover:bg-surface-800/60"
                    onClick={() => navigate(`/payroll/periods/${period.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-surface-100">
                      {format(new Date(period.periodStart), 'dd/MM/yyyy')} —{' '}
                      {format(new Date(period.periodEnd), 'dd/MM/yyyy', { locale: i18n.language === 'vi' ? vi : enUS })}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-surface-300">{t(`uiWorkforce.${period.payrollCycle.toLowerCase()}`)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={period.status} />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {(period.status === 'DRAFT' || period.status === 'REVIEWING') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCompute(period.id)}
                            isLoading={computePeriod.isPending && computePeriod.variables === period.id}
                            title={t('uiWorkforce.computePayroll')}
                          >
                            <Calculator className="h-4 w-4" />
                          </Button>
                        )}
                        {period.status === 'REVIEWING' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(period.id)}
                            isLoading={approvePeriod.isPending && approvePeriod.variables === period.id}
                            disabled={!hasEnded(period.periodEnd)}
                            title={
                              hasEnded(period.periodEnd)
                                ? t('uiWorkforce.approve')
                                : t('uiWorkforce.payrollPeriodNotEnded', { date: formatDate(period.periodEnd.slice(0, 10)) })
                            }
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {period.status === 'APPROVED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMarkPaidPeriodId(period.id)}
                            title={t('uiWorkforce.markPaid')}
                          >
                            <Wallet className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Period Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('uiWorkforce.createNewPeriod')}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label={t('uiWorkforce.startDate')}
            type="date"
            value={newPeriodStart}
            onChange={(e) => setNewPeriodStart(e.target.value)}
          />
          <Input
            label={t('uiWorkforce.endDate')}
            type="date"
            value={newPeriodEnd}
            onChange={(e) => setNewPeriodEnd(e.target.value)}
          />
          <Select
            label={t('uiWorkforce.cycle')}
            value={newPeriodCycle}
            onChange={(e) => setNewPeriodCycle(e.target.value as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY')}
            options={[
              { value: 'MONTHLY', label: t('uiWorkforce.monthly') },
              { value: 'BIWEEKLY', label: t('uiWorkforce.biweekly') },
              { value: 'WEEKLY', label: t('uiWorkforce.weekly') },
            ]}
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-surface-700">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              {t('uiWorkforce.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              isLoading={createPeriod.isPending}
              disabled={!newPeriodStart || !newPeriodEnd}
            >
              {t('uiWorkforce.create')}
            </Button>
          </div>
        </div>
      </Modal>

      <MarkPaidModal
        open={!!markPaidPeriodId}
        onClose={() => setMarkPaidPeriodId(null)}
        periodId={markPaidPeriodId ?? ''}
      />
    </div>
  );
}
