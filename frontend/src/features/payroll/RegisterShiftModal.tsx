import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftApi } from '@/types/shift';
import { Modal, Button, Input, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';

interface RegisterShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RegisterShiftModal({ isOpen, onClose }: RegisterShiftModalProps) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [maxEncounters, setMaxEncounters] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      shiftApi.register({
        date,
        startTime,
        endTime,
        maxEncounters: maxEncounters ? parseInt(maxEncounters) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-shifts'] });
      onClose();
      resetForm();
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, 'Không thể đăng ký ca làm việc'));
    },
  });

  const isTimeRangeValid = !startTime || !endTime || startTime < endTime;

  const resetForm = () => {
    setDate('');
    setStartTime('08:00');
    setEndTime('17:00');
    setMaxEncounters('');
    setNotes('');
  };

  const handleSubmit = () => {
    mutation.mutate();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Đăng ký ca làm việc" size="sm">
      <div className="space-y-4">
        <Input
          label="Ngày"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Giờ bắt đầu"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
          <Input
            label="Giờ kết thúc"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            error={!isTimeRangeValid ? 'Giờ kết thúc phải sau giờ bắt đầu' : undefined}
            required
          />
        </div>

        <Input
          label="Số bệnh nhân tối đa (không bắt buộc)"
          type="number"
          min="1"
          value={maxEncounters}
          onChange={(e) => setMaxEncounters(e.target.value)}
          placeholder="VD: 10"
        />

        <Textarea
          label="Ghi chú (không bắt buộc)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="VD: Ca đặc biệt cho ngày nghỉ lễ"
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={mutation.isPending}
            disabled={!date || !startTime || !endTime || !isTimeRangeValid}
          >
            Đăng ký
          </Button>
        </div>
      </div>
    </Modal>
  );
}
