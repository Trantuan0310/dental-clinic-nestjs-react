import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useAddAdjustment } from '@/features/payroll/payrollApi';
import { formatVnd } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { notify } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import { SELF_APPROVAL_REASON_MIN, type PayrollLineItem, type PayrollAdjustmentType } from '@/types/payroll';

const schema = z
  .object({
    type: z.enum(['BONUS', 'PENALTY', 'DEDUCTION', 'MANUAL_OVERRIDE']),
    amountVnd: z.coerce.number().int().refine((v) => v !== 0, 'uiWorkforce.payrollAdjustmentAmountNonZero'),
    reason: z.string().min(5, 'uiWorkforce.payrollReasonMinLength').max(500, 'uiWorkforce.payrollReasonMaxLength'),
  })
  .refine((v) => v.type !== 'MANUAL_OVERRIDE' || v.reason.length >= 50, {
    message: 'uiWorkforce.payrollManualOverrideReasonMinLength',
    path: ['reason'],
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  periodId: string;
  lineItem: PayrollLineItem | null;
}

export function AdjustmentModal({ open, onClose, periodId, lineItem }: Props) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'BONUS', amountVnd: 1000000, reason: '' },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [selfReason, setSelfReason] = useState('');
  const myId = useAuthStore((s) => s.user?.id);
  const isOwnLine = !!lineItem && lineItem.dentistId === myId;
  const adj = useAddAdjustment(periodId);
  const type = watch('type');

  const onSubmit = handleSubmit(async (values) => {
    if (!lineItem) return;
    setServerError(null);
    if (isOwnLine && selfReason.trim().length < SELF_APPROVAL_REASON_MIN) {
      setServerError(t('uiWorkforce.payrollSelfApprovalRequired', { count: SELF_APPROVAL_REASON_MIN }));
      return;
    }
    try {
      await adj.mutateAsync({
        lineItemId: lineItem.id,
        type: values.type as PayrollAdjustmentType,
        amountVnd: values.amountVnd,
        reason: values.reason,
        ...(isOwnLine && { selfApprovalReason: selfReason.trim() }),
      });
      notify.success(t('uiWorkforce.payrollAdjustmentCreated'));
      reset();
      setSelfReason('');
      onClose();
    } catch (err) {
      setServerError(getApiErrorMessage(err, t('uiWorkforce.payrollAdjustmentCreateError')));
    }
  });

  const signHelp = t({
    BONUS: 'uiWorkforce.payrollBonusHelp',
    PENALTY: 'uiWorkforce.payrollPenaltyHelp',
    DEDUCTION: 'uiWorkforce.payrollDeductionHelp',
    MANUAL_OVERRIDE: 'uiWorkforce.payrollManualHelp',
  }[type]);

  if (!lineItem) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('uiWorkforce.payrollAddAdjustment')}
      description={t('uiWorkforce.payrollAdjustmentDescription', { name: lineItem.dentistName, amount: formatVnd(lineItem.netPayVnd) })}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('uiWorkforce.payrollCancel')}
          </Button>
          <Button onClick={onSubmit} isLoading={isSubmitting || adj.isPending}>
            {t('uiWorkforce.payrollSaveAdjustment')}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <Select
          label={t('uiWorkforce.payrollAdjustmentType')}
          {...register('type')}
          error={errors.type?.message ? t(errors.type.message) : undefined}
          options={[
            { value: 'BONUS', label: t('uiWorkforce.payrollAdjustmentBonus') },
            { value: 'PENALTY', label: t('uiWorkforce.payrollAdjustmentPenalty') },
            { value: 'DEDUCTION', label: t('uiWorkforce.payrollAdjustmentDeduction') },
            { value: 'MANUAL_OVERRIDE', label: t('uiWorkforce.payrollAdjustmentManual') },
          ]}
        />
        <Input
          type="number"
          label={t('uiWorkforce.payrollAmountVnd')}
          {...register('amountVnd', { valueAsNumber: true })}
          error={errors.amountVnd?.message ? t(errors.amountVnd.message) : undefined}
          hint={signHelp}
          required
        />
        <Textarea
          label={t('uiWorkforce.payrollReason')}
          placeholder={t('uiWorkforce.payrollAdjustmentReasonPlaceholder')}
          rows={3}
          {...register('reason')}
          error={errors.reason?.message ? t(errors.reason.message) : undefined}
          required
        />
        {isOwnLine && (
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
              required
            />
          </>
        )}
        <Alert variant="warning">
          {t('uiWorkforce.payrollAdjustmentAuditNotice')}
        </Alert>
      </form>
    </Modal>
  );
}
