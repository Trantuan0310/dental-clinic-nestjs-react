import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Input, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { useCreateShift } from '@/features/payroll/payrollApi';
import { clinicToday } from '@/lib/clinicTime';

interface RegisterShiftModalProps {
  open: boolean;
  onClose: () => void;
}

export function RegisterShiftModal({ open, onClose }: RegisterShiftModalProps) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [maxEncounters, setMaxEncounters] = useState('');
  const [notes, setNotes] = useState('');

  const createShift = useCreateShift();

  const isTimeRangeValid = !startTime || !endTime || startTime < endTime;

  const resetForm = () => {
    setDate('');
    setStartTime('08:00');
    setEndTime('17:00');
    setMaxEncounters('');
    setNotes('');
  };

  const handleSubmit = async () => {
    try {
      await createShift.mutateAsync({
        date,
        startTime,
        endTime,
        maxEncounters: maxEncounters ? parseInt(maxEncounters, 10) : undefined,
        notes: notes || undefined,
      });
      notify.success(t('uiWorkforce.shiftRegisterSuccess'));
      resetForm();
      onClose();
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.shiftRegisterError')));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('uiWorkforce.shiftRegisterTitle')} size="sm">
      <div className="space-y-4">
        <Input
          label={t('uiWorkforce.shiftDate')}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          min={clinicToday()}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t('uiWorkforce.shiftStartTime')}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
          <Input
            label={t('uiWorkforce.shiftEndTime')}
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            error={!isTimeRangeValid ? t('uiWorkforce.shiftTimeRangeInvalid') : undefined}
            required
          />
        </div>

        <Input
          label={t('uiWorkforce.shiftOptionalMaxPatients')}
          type="number"
          min="1"
          value={maxEncounters}
          onChange={(e) => setMaxEncounters(e.target.value)}
          placeholder="10"
        />

        <Textarea
          label={t('uiWorkforce.shiftOptionalNotes')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder={t('uiWorkforce.shiftNotesPlaceholder')}
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>
            {t('uiWorkforce.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createShift.isPending}
            disabled={!date || !startTime || !endTime || !isTimeRangeValid}
          >
            {t('uiWorkforce.registerShift')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
