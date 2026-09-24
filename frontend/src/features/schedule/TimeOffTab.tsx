import { useMemo, useState } from 'react';
import { Plus, CalendarOff } from 'lucide-react';
import { Alert, Button, Card, Select, Input, Textarea, Modal, EmptyState } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { useTimeOffs, useCreateTimeOff } from './scheduleApi';
import { useSchedulableDentists } from './useSchedulableDentists';
import type { TimeOffAffectedAppointment, TimeOffType } from '@/types/schedule';

const TIME_OFF_TYPE_LABELS: Record<TimeOffType, string> = {
  VACATION: 'Nghỉ phép',
  SICK: 'Nghỉ ốm',
  TRAINING: 'Đào tạo',
  OTHER: 'Khác',
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TimeOffTab() {
  const [dentistFilter, setDentistFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: dentists = [] } = useDentistOptions();
  const { data: timeOffs, isLoading } = useTimeOffs(dentistFilter || undefined);

  const dentistNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of dentists) map.set(d.id, d.fullName);
    return map;
  }, [dentists]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Select
            value={dentistFilter}
            onChange={(e) => setDentistFilter(e.target.value)}
            options={[
              { value: '', label: 'Tất cả bác sĩ' },
              ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
            ]}
          />
        </div>
        <PermissionGuard permission="schedule.write">
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            Thêm nghỉ phép
          </Button>
        </PermissionGuard>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !timeOffs || timeOffs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarOff className="h-10 w-10 text-gray-400" />}
            title="Chưa có lịch nghỉ nào"
            description="Ghi nhận nghỉ phép/nghỉ ốm để hệ thống tự động chặn đặt lịch hẹn trong khoảng thời gian đó."
          />
        </Card>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Bác sĩ</th>
                  <th>Loại</th>
                  <th>Từ</th>
                  <th>Đến</th>
                  <th>Lý do</th>
                </tr>
              </thead>
              <tbody>
                {timeOffs.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium text-gray-900">{dentistNameById.get(t.dentistId) ?? '—'}</td>
                    <td>{TIME_OFF_TYPE_LABELS[t.type]}</td>
                    <td>{formatDateTime(t.startAt)}</td>
                    <td>{formatDateTime(t.endAt)}</td>
                    <td className="text-gray-500">{t.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CreateTimeOffModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  );
}

function CreateTimeOffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dentists, defaultDentistId } = useSchedulableDentists();
  const createTimeOff = useCreateTimeOff();

  const [dentistId, setDentistId] = useState(defaultDentistId);
  // Appointments still booked inside the time-off just recorded — shown
  // instead of closing, so front desk knows who to call and move.
  const [affected, setAffected] = useState<TimeOffAffectedAppointment[] | null>(null);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [type, setType] = useState<TimeOffType>('VACATION');
  const [reason, setReason] = useState('');

  const isRangeValid = !startAt || !endAt || startAt < endAt;

  const resetForm = () => {
    setDentistId(defaultDentistId);
    setAffected(null);
    setStartAt('');
    setEndAt('');
    setType('VACATION');
    setReason('');
  };

  const handleSubmit = async () => {
    try {
      // datetime-local values carry no timezone; send real instants so the
      // server doesn't interpret them in its own zone.
      const created = await createTimeOff.mutateAsync({
        dentistId,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        type,
        reason: reason || undefined,
      });
      notify.success('Đã ghi nhận nghỉ phép');
      if (created.affectedAppointments.length > 0) {
        setAffected(created.affectedAppointments);
        return;
      }
      resetForm();
      onClose();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể ghi nhận nghỉ phép'));
    }
  };

  const close = () => {
    resetForm();
    onClose();
  };

  if (affected) {
    return (
      <Modal open={open} onClose={close} title="Lịch hẹn cần xử lý" size="sm">
        <div className="space-y-4">
          <Alert variant="warning">
            Còn {affected.length} lịch hẹn trong thời gian nghỉ. Vui lòng liên hệ bệnh nhân để đổi
            lịch hoặc hủy — hệ thống không tự dời các lịch này.
          </Alert>
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {affected.map((a) => (
              <li key={a.id} className="px-3 py-2 text-sm">
                <p className="font-medium text-gray-900">
                  {a.patient.fullName} <span className="text-gray-500">— {a.patient.code}</span>
                </p>
                <p className="text-gray-600">
                  {formatDateTime(a.startAt)}
                  {a.patient.primaryPhone ? ` • ${a.patient.primaryPhone}` : ''}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex justify-end border-t border-gray-100 pt-4">
            <Button onClick={close}>Đã hiểu</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} title="Thêm nghỉ phép" size="sm">
      <div className="space-y-4">
        <Select
          label="Bác sĩ"
          value={dentistId}
          onChange={(e) => setDentistId(e.target.value)}
          placeholder="-- Chọn bác sĩ --"
          options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
          required
        />

        <Select
          label="Loại nghỉ"
          value={type}
          onChange={(e) => setType(e.target.value as TimeOffType)}
          options={(Object.keys(TIME_OFF_TYPE_LABELS) as TimeOffType[]).map((v) => ({
            value: v,
            label: TIME_OFF_TYPE_LABELS[v],
          }))}
        />

        <Input
          label="Từ"
          type="datetime-local"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          required
        />
        <Input
          label="Đến"
          type="datetime-local"
          value={endAt}
          onChange={(e) => setEndAt(e.target.value)}
          error={!isRangeValid ? 'Thời gian kết thúc phải sau thời gian bắt đầu' : undefined}
          required
        />

        <Textarea
          label="Lý do (không bắt buộc)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="VD: Nghỉ phép năm"
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createTimeOff.isPending}
            disabled={!dentistId || !startAt || !endAt || !isRangeValid}
          >
            Thêm
          </Button>
        </div>
      </div>
    </Modal>
  );
}
