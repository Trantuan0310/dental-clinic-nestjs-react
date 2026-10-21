import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
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

const SECTION_LABEL_KEY: Record<AddendumFormValues['targetSection'], string> = {
  plan: 'uiClinical.plan',
  assessment: 'uiClinical.diagnosis',
  subjective: 'uiClinical.reasonForVisit',
  objective: 'uiClinical.physicalExam',
};
const SECTIONS = Object.keys(SECTION_LABEL_KEY) as AddendumFormValues['targetSection'][];

export function AddendumModal({ encounter, open, onClose }: AddendumModalProps) {
  const { t, i18n } = useTranslation();
  const sectionOptions = SECTIONS.map((value) => ({ value, label: t(SECTION_LABEL_KEY[value]) }));
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
        // Stored in the medical record: the section name stays Vietnamese
        // whatever the UI language.
        text: `${values.targetSection.toUpperCase()} (${t(SECTION_LABEL_KEY[values.targetSection], { lng: 'vi' })}): ${values.text}`,
        reason: values.reason || undefined,
        idempotencyKey,
      });
      notify.success(t('uiClinical.addendumAdded'));
      reset({ targetSection: 'plan', text: '', reason: '' });
      onClose();
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiClinical.addendumError')));
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('uiClinical.addendumTitle')}
      description={
        encounter.closedAt
          ? t('uiClinical.addendumWindow', {
              closedAt: new Date(encounter.closedAt).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US'),
              count: daysRemaining,
            })
          : ''
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            {t('uiClinical.cancel')}
          </Button>
          <Button onClick={onSubmit} disabled={!allowed} isLoading={create.isPending} leftIcon={<Plus className="h-4 w-4" />}>
            {t('uiClinical.addendumSave')}
          </Button>
        </>
      }
    >
      {!allowed && (
        <Alert variant="error" title={t('uiClinical.addendumExpired')}>
          {t('uiClinical.addendumExpiredHelp')}
        </Alert>
      )}
      <form className="space-y-3" onSubmit={onSubmit}>
        <Select
          label={t('uiClinical.addendumSection')}
          {...register('targetSection', { required: true })}
          options={sectionOptions}
        />
        <Textarea
          label={t('uiClinical.content')}
          rows={4}
          {...register('text', { required: true, minLength: 5 })}
          error={formState.errors.text?.message as string | undefined}
          placeholder={t('uiClinical.addendumPlaceholder')}
        />
        <Textarea
          label={t('uiClinical.addendumReason')}
          rows={2}
          {...register('reason')}
          placeholder={t('uiClinical.addendumReasonExample')}
        />
      </form>
    </Modal>
  );
}
