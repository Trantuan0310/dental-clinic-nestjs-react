import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DollarSign, Plus, AlertCircle } from 'lucide-react';
import { useCompensations, useCreateCompensation, useDeleteCompensation } from './payrollApi';
import { Modal, Input, Select, Button, Card, EmptyState, Badge, ConfirmDialog } from '@/components/ui';
import { Alert } from '@/components/ui/Alert';
import { Textarea } from '@/components/ui/Textarea';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatCurrency, formatDate } from '@/lib/format';
import { clinicToday } from '@/lib/clinicTime';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import { SELF_APPROVAL_REASON_MIN, type DentistCompensation } from '@/types/payroll';

/** yyyy-MM-dd of a DATE column value. */
const day = (value: string) => value.slice(0, 10);

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function CompensationListPage() {
  const { t } = useTranslation();
  const canCreateCompensation = useAuthStore((s) => s.hasPermission('payroll.compensation.update'));
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDentist, setSelectedDentist] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [commission, setCommission] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [selfReason, setSelfReason] = useState('');
  const myId = useAuthStore((s) => s.user?.id);
  // The only admin setting their own pay (owner who also practises).
  const isSelf = !!selectedDentist && selectedDentist === myId;

  const { data: compensations, isLoading, isError, refetch } = useCompensations();

  const { data: dentists } = useDentistOptions();

  const createMutation = useCreateCompensation();
  const stopMutation = useDeleteCompensation();
  const [stopTarget, setStopTarget] = useState<DentistCompensation | null>(null);
  const today = clinicToday();

  // A new policy ends the dentist's open-ended one the day before (server
  // side, same transaction); say so before the admin confirms.
  const endsPrevious =
    selectedDentist && effectiveFrom
      ? compensations?.find(
          (c) => c.dentistId === selectedDentist && !c.effectiveTo && day(c.effectiveFrom) < effectiveFrom,
        )
      : undefined;

  const handleStop = async () => {
    if (!stopTarget) return;
    try {
      await stopMutation.mutateAsync(stopTarget.id);
      notify.success(t('uiWorkforce.payrollCompensationStopped'));
      setStopTarget(null);
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.payrollCompensationStopError')));
    }
  };

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync({
        dentistId: selectedDentist,
        effectiveFrom,
        baseSalary: parseInt(baseSalary, 10),
        commissionPercentage: parseFloat(commission),
        ...(isSelf && { selfApprovalReason: selfReason.trim() }),
      });
      notify.success(t('uiWorkforce.payrollCompensationCreated'));
      setShowAddModal(false);
      setSelfReason('');
      setSelectedDentist('');
      setBaseSalary('');
      setCommission('');
      setEffectiveFrom('');
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.payrollCompensationCreateError')));
    }
  };

  // Group compensations by dentist
  const compensationsByDentist = compensations?.reduce((acc, comp) => {
    if (!acc[comp.dentistId]) {
      acc[comp.dentistId] = [];
    }
    acc[comp.dentistId].push(comp);
    return acc;
  }, {} as Record<string, DentistCompensation[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <PermissionGuard permission="payroll.compensation.update">
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            {t('uiWorkforce.payrollAddCompensation')}
          </Button>
        </PermissionGuard>
      </div>

      <Card noPadding>
        {isLoading ? (
          <div className="p-6">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded bg-gray-100 dark:bg-surface-800" />
              ))}
            </div>
          </div>
        ) : isError && !compensations?.length ? (
          <EmptyState
            icon={<AlertCircle className="h-10 w-10 text-red-400 dark:text-red-500" />}
            title={t('uiWorkforce.payrollLoadError')}
            description={t('uiWorkforce.loadErrorDescription')}
            action={{ label: t('uiWorkforce.retry'), onClick: () => refetch() }}
          />
        ) : !compensationsByDentist || Object.keys(compensationsByDentist).length === 0 ? (
          <EmptyState
            icon={<DollarSign className="h-10 w-10 text-gray-400 dark:text-surface-500" />}
            title={t('uiWorkforce.payrollNoCompensation')}
            description={t('uiWorkforce.payrollMissingCompensation')}
            action={
              canCreateCompensation
                ? { label: t('uiWorkforce.payrollAddCompensation'), onClick: () => setShowAddModal(true) }
                : undefined
            }
          />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-surface-800">
            {Object.entries(compensationsByDentist).map(([dentistId, dentistCompensations]) => (
              <div key={dentistId} className="p-4">
                <p className="font-medium text-gray-900 dark:text-surface-100">{dentistCompensations[0].dentistName}</p>
                <ul className="mt-2 space-y-2">
                  {dentistCompensations.map((comp) => {
                    const from = day(comp.effectiveFrom);
                    const to = comp.effectiveTo ? day(comp.effectiveTo) : null;
                    const active = from <= today && (!to || to >= today);
                    // The server ends a policy today, removes one not yet in
                    // force, and refuses one already ended.
                    const stoppable = !to || to > today;
                    return (
                      <li
                        key={comp.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-gray-50 dark:hover:bg-surface-800/60"
                      >
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-surface-300">
                          <span>
                            {formatDate(from)} → {to ? formatDate(to) : t('uiWorkforce.payrollOpenEnded')}
                          </span>
                          {active && <Badge variant="success">{t('uiWorkforce.payrollCurrentlyActive')}</Badge>}
                        </div>
                        <div className="flex items-center gap-6 text-right">
                          <div>
                            <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollBaseSalary')}</p>
                            <p className="font-medium">{formatCurrency(comp.baseSalary)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollCommission')}</p>
                            <p className="font-medium">{comp.commissionPercentage}%</p>
                          </div>
                          {canCreateCompensation && stoppable && (
                            <Button variant="outline" size="sm" onClick={() => setStopTarget(comp)}>
                              {t('uiWorkforce.payrollCompensationStop')}
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!stopTarget}
        onClose={() => setStopTarget(null)}
        onConfirm={handleStop}
        title={t('uiWorkforce.payrollCompensationStopTitle')}
        description={
          stopTarget && day(stopTarget.effectiveFrom) > today
            ? t('uiWorkforce.payrollCompensationRemoveFutureDescription')
            : t('uiWorkforce.payrollCompensationStopDescription', { date: formatDate(today) })
        }
        confirmLabel={t('uiWorkforce.payrollCompensationStop')}
        variant="danger"
        isLoading={stopMutation.isPending}
      />

      {/* Add Compensation Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={t('uiWorkforce.payrollAddCompensation')}
        size="sm"
      >
        <div className="space-y-4">
          <Select
            label={t('uiWorkforce.payrollDentist')}
            value={selectedDentist}
            onChange={(e) => setSelectedDentist(e.target.value)}
            options={[
              { value: '', label: t('uiWorkforce.noSelection') },
              ...(dentists ?? []).map((d) => ({ value: d.id, label: d.fullName })),
            ]}
          />
          <Input
            label={t('uiWorkforce.payrollBaseSalaryVnd')}
            type="number"
            value={baseSalary}
            onChange={(e) => setBaseSalary(e.target.value)}
            placeholder="15000000"
          />
          <Input
            label={t('uiWorkforce.payrollCommissionPercentage')}
            type="number"
            step="0.1"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            placeholder="30"
          />
          <Input
            label={t('uiWorkforce.payrollEffectiveFrom')}
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
          {endsPrevious ? (
            <Alert variant="info">
              {t('uiWorkforce.payrollCompensationEndsPrevious', {
                from: formatDate(day(endsPrevious.effectiveFrom)),
                to: formatDate(dayBefore(effectiveFrom)),
              })}
            </Alert>
          ) : (
            <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollCompensationChangeHint')}</p>
          )}
          {isSelf && (
            <>
              <Alert variant="warning" title={t('uiWorkforce.payrollSelfApprovalTitle')}>
                {t('uiWorkforce.payrollSelfApprovalDescription')}
              </Alert>
              <Textarea
                label={t('uiWorkforce.payrollSelfApprovalReason')}
                placeholder={t('uiWorkforce.payrollSelfApprovalPlaceholder')}
                rows={2}
                value={selfReason}
                onChange={(e) => setSelfReason(e.target.value)}
                hint={t('uiWorkforce.payrollSelfApprovalRequired', { count: SELF_APPROVAL_REASON_MIN })}
                required
              />
            </>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-surface-700">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              {t('uiWorkforce.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              isLoading={createMutation.isPending}
              disabled={
                !selectedDentist ||
                !baseSalary ||
                !commission ||
                !effectiveFrom ||
                (isSelf && selfReason.trim().length < SELF_APPROVAL_REASON_MIN)
              }
            >
              {t('uiWorkforce.create')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
