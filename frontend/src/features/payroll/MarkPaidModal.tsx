import { useState } from 'react';
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
  paymentReference: z.string().min(1, 'Bắt buộc').max(200),
  paymentDate: z.string().min(1, 'Bắt buộc'),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  periodId: string;
}

export function MarkPaidModal({ open, onClose, periodId }: Props) {
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
      notify.success('Đã đánh dấu trả lương');
      reset();
      onClose();
    } catch (err) {
      setServerError(getApiErrorMessage(err, 'Không thể cập nhật'));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Xác nhận đã trả lương"
      description="Chuyển trạng thái APPROVED → PAID. Sau 7 ngày sẽ tự động LOCKED (BR-PAY-017)."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="success" onClick={onSubmit} isLoading={isSubmitting || markPaid.isPending}>
            Xác nhận đã trả
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <Input
          label="Mã tham chiếu thanh toán"
          placeholder="VD: VCB-2026-08-31-001"
          {...register('paymentReference')}
          error={errors.paymentReference?.message}
          required
        />
        <Input
          type="date"
          label="Ngày trả"
          {...register('paymentDate')}
          error={errors.paymentDate?.message}
          required
        />
      </form>
    </Modal>
  );
}