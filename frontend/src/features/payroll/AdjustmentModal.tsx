import { useMemo, useState } from 'react';
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
import type { PayrollLineItem, PayrollAdjustmentType } from '@/types/payroll';

const schema = z
  .object({
    type: z.enum(['BONUS', 'PENALTY', 'DEDUCTION', 'MANUAL_OVERRIDE']),
    amountVnd: z.coerce.number().int().refine((v) => v !== 0, 'Số tiền phải khác 0'),
    reason: z.string().min(5, 'Lý do tối thiểu 5 ký tự').max(500, 'Lý do tối đa 500 ký tự'),
  })
  .refine((v) => v.type !== 'MANUAL_OVERRIDE' || v.reason.length >= 50, {
    message: 'MANUAL_OVERRIDE cần lý do ≥ 50 ký tự (BR-PAY-018)',
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
  const adj = useAddAdjustment(periodId);
  const type = watch('type');

  const onSubmit = handleSubmit(async (values) => {
    if (!lineItem) return;
    setServerError(null);
    try {
      await adj.mutateAsync({
        lineItemId: lineItem.id,
        type: values.type as PayrollAdjustmentType,
        amountVnd: values.amountVnd,
        reason: values.reason,
      });
      notify.success('Đã thêm điều chỉnh');
      reset();
      onClose();
    } catch (err) {
      setServerError(getApiErrorMessage(err, 'Không thể thêm điều chỉnh'));
    }
  });

  const signHelp = useMemo(() => {
    if (type === 'BONUS') return 'Số dương: cộng vào net pay.';
    if (type === 'PENALTY') return 'Nhập số dương — hệ thống sẽ trừ khỏi net pay.';
    if (type === 'DEDUCTION') return 'Số dương sẽ được trừ khỏi net pay (vd: tạm ứng).';
    return 'MANUAL_OVERRIDE — ghi đè thủ công, lý do phải ≥ 50 ký tự (BR-PAY-018).';
  }, [type]);

  if (!lineItem) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thêm điều chỉnh"
      description={`Bác sĩ: ${lineItem.dentistName} — Net hiện tại: ${formatVnd(lineItem.netPayVnd)}`}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={onSubmit} isLoading={isSubmitting || adj.isPending}>
            Lưu điều chỉnh
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {serverError && <Alert variant="error">{serverError}</Alert>}
        <Select
          label="Loại điều chỉnh"
          {...register('type')}
          error={errors.type?.message}
          options={[
            { value: 'BONUS', label: 'Thưởng (+)' },
            { value: 'PENALTY', label: 'Phạt (−)' },
            { value: 'DEDUCTION', label: 'Khấu trừ (−)' },
            { value: 'MANUAL_OVERRIDE', label: 'Sửa tay (override)' },
          ]}
        />
        <Input
          type="number"
          label="Số tiền (VND)"
          {...register('amountVnd', { valueAsNumber: true })}
          error={errors.amountVnd?.message}
          hint={signHelp}
          required
        />
        <Textarea
          label="Lý do"
          placeholder="Mô tả lý do điều chỉnh..."
          rows={3}
          {...register('reason')}
          error={errors.reason?.message}
          required
        />
        <Alert variant="warning">
          Điều chỉnh sẽ được audit log. MANUAL_OVERRIDE sẽ được log riêng với severity=HIGH.
        </Alert>
      </form>
    </Modal>
  );
}