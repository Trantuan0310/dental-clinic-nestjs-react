import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { DollarSign, Plus, AlertCircle } from 'lucide-react';
import { useCompensations, useCreateCompensation } from './payrollApi';
import { Modal, Input, Select, Button, Card, EmptyState } from '@/components/ui';
import { Alert } from '@/components/ui/Alert';
import { Textarea } from '@/components/ui/Textarea';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatCurrency } from '@/lib/format';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import { SELF_APPROVAL_REASON_MIN, type DentistCompensation } from '@/types/payroll';

export function CompensationListPage() {
  const { t, i18n } = useTranslation();
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
          <div className="divide-y divide-gray-100">
            {Object.entries(compensationsByDentist).map(([dentistId, dentistCompensations]) => {
              const latestComp = dentistCompensations[0];
              return (
                <div key={dentistId} className="p-4 hover:bg-gray-50 dark:hover:bg-surface-800/60">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-surface-100">{latestComp.dentistName}</p>
                      <p className="text-sm text-gray-500 dark:text-surface-400">
                        {t('uiWorkforce.payrollEffectiveFrom')}: {format(new Date(latestComp.effectiveFrom), 'dd/MM/yyyy', { locale: i18n.language === 'vi' ? vi : enUS })}
                      </p>
                    </div>
                    <div className="flex gap-6 text-right">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollBaseSalary')}</p>
                        <p className="font-medium">{formatCurrency(latestComp.baseSalary)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiWorkforce.payrollCommission')}</p>
                        <p className="font-medium">{latestComp.commissionPercentage}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

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
