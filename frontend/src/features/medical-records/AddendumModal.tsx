import { useForm } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { notify } from '@/components/ui/Toast';
import { useCreateAddendum } from './medicalRecordsApi';
import { getApiErrorMessage } from '@/lib/errors';
import type { Encounter } from '@/types/medical-records';

interface AddendumModalProps {
  encounter: Encounter;
  open: boolean;
  onClose: () => void;
}

interface AddendumFormValues {
  targetSection: 'plan' | 'assessment' | 'subjective' | 'objective';
  text: string;
  reason: string;
}

const SECTION_OPTIONS: Array<{ value: AddendumFormValues['targetSection']; label: string }> = [
  { value: 'plan', label: 'Kế hoạch điều trị' },
  { value: 'assessment', label: 'Chẩn đoán' },
  { value: 'subjective', label: 'Lý do khám' },
  { value: 'objective', label: 'Khám thực thể' },
];

export function AddendumModal({ encounter, open, onClose }: AddendumModalProps) {
  const closedAt = encounter.closedAt ? new Date(encounter.closedAt) : null;
  const now = new Date();
  const daysRemaining = closedAt
    ? Math.max(0, 30 - Math.floor((now.getTime() - closedAt.getTime()) / (24 * 3600 * 1000)))
    : 0;
  const allowed = daysRemaining > 0;

  const { register, handleSubmit, formState, reset } = useForm<AddendumFormValues>({
    defaultValues: { targetSection: 'plan', text: '', reason: '' },
  });

  const create = useCreateAddendum(encounter.id);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const idempotencyKey = `addendum_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await create.mutateAsync({
        text: `${values.targetSection.toUpperCase()} (${SECTION_OPTIONS.find((o) => o.value === values.targetSection)?.label}): ${values.text}`,
        reason: values.reason || undefined,
        idempotencyKey,
      });
      notify.success('Đã thêm addendum');
      reset({ targetSection: 'plan', text: '', reason: '' });
      onClose();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể thêm addendum'));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Thêm addendum"
      description={
        encounter.closedAt
          ? `Encounter đóng lúc ${new Date(encounter.closedAt).toLocaleString('vi-VN')}. Còn ${daysRemaining} ngày để bổ sung.`
          : ''
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Hủy
          </Button>
          <Button onClick={onSubmit} disabled={!allowed} isLoading={create.isPending} leftIcon={<Plus className="h-4 w-4" />}>
            Lưu addendum
          </Button>
        </>
      }
    >
      {!allowed && (
        <Alert variant="error" title="Đã hết hạn thêm addendum">
          Encounter đã đóng quá 30 ngày (BR-MR-019). Không thể thêm addendum mới.
        </Alert>
      )}
      <form className="space-y-3" onSubmit={onSubmit}>
        <Select
          label="Bổ sung cho"
          {...register('targetSection', { required: true })}
          options={SECTION_OPTIONS}
        />
        <Textarea
          label="Nội dung"
          rows={4}
          {...register('text', { required: true, minLength: 5 })}
          error={formState.errors.text?.message as string | undefined}
          placeholder="Mô tả chi tiết thông tin bổ sung."
        />
        <Textarea label="Lý do bổ sung" rows={2} {...register('reason')} placeholder="VD: BN gọi điện thông báo triệu chứng mới." />
      </form>
    </Modal>
  );
}
