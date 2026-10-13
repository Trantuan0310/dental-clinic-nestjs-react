import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useMarkPaid } from '@/features/payroll/payrollApi';
import { getApiErrorMessage } from '@/lib/errors';
import { notify } from '@/components/ui/Toast';

const schema = z.object({
  paymentReference: z.string().min(1, 'uiWorkforce.payrollFieldRequired').max(200),
  paymentDate: z.string().min(1, 'uiWorkforce.payrollFieldRequired'),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  periodId: string;
}

export function MarkPaidModal({ open, onClose, periodId }: Props) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      paymentReference: '',
      paymentDate: new Date().toISOString().slice(0, 10),
    },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const markPaid = useMarkPaid();

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await markPaid.mutateAsync({ id: periodId, payload: values });
      notify.success(t('uiWorkforce.payrollPaidToast'));
      reset();
      onClose();
    } catch (err) {
      setServerError(getApiErrorMessage(err, t('uiWorkforce.payrollPaymentUpdateError')));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('uiWorkforce.payrollMarkPaidTitle')}
      description={t('uiWorkforce.payrollMarkPaidDescription')}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('uiWorkforce.payrollCancel')}
          </Button>
          <Button variant="success" onClick={onSubmit} isLoading={isSubmitting || markPaid.isPending}>
            {t('uiWorkforce.payrollConfirmPaid')}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <Input
          label={t('uiWorkforce.payrollPaymentReference')}
          placeholder="VCB-2026-08-31-001"
          {...register('paymentReference')}
          error={errors.paymentReference?.message ? t(errors.paymentReference.message) : undefined}
          required
        />
        <Input
          type="date"
          label={t('uiWorkforce.payrollPaymentDate')}
          {...register('paymentDate')}
          error={errors.paymentDate?.message ? t(errors.paymentDate.message) : undefined}
          required
        />
      </form>
    </Modal>
  );
}
