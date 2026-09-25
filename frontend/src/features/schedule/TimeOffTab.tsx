import { useMemo, useState } from 'react';
import { Plus, CalendarOff } from 'lucide-react';
import { Badge, Button, Card, Select, Input, Textarea, Modal, EmptyState } from '@/components/ui';
import type { BadgeProps } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { useTimeOffs, useCreateTimeOff, useDecideTimeOff } from './scheduleApi';
import { useSchedulableDentists } from './useSchedulableDentists';
import { AffectedAppointmentsModal } from './AffectedAppointmentsModal';
import { formatDateTime } from './format';
import type { TimeOff, TimeOffAffectedAppointment, TimeOffStatus, TimeOffType } from '@/types/schedule';

const TIME_OFF_TYPE_LABELS: Record<TimeOffType, string> = {
  VACATION: 'Nghỉ phép',
  SICK: 'Nghỉ ốm',
  TRAINING: 'Đào tạo',
  OTHER: 'Khác',
};

const STATUS_LABEL: Record<TimeOffStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};

const STATUS_VARIANT: Record<TimeOffStatus, BadgeProps['variant']> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'default',
};

export function TimeOffTab() {
  const [dentistFilter, setDentistFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<TimeOffStatus | ''>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rejecting, setRejecting] = useState<TimeOff | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [affected, setAffected] = useState<TimeOffAffectedAppointment[] | null>(null);

  const { data: dentists = [] } = useDentistOptions();
  const { data: timeOffs, isLoading } = useTimeOffs(dentistFilter || undefined, statusFilter || undefined);
  const decide = useDecideTimeOff();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const userId = useAuthStore((s) => s.user?.id);
  const canApprove = hasPermission('time_off.approve');
  const canWrite = hasPermission('schedule.write');
  const ownOnly = hasPermission('appointment.read.own') && !hasPermission('appointment.read.any');

  const dentistNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of dentists) map.set(d.id, d.fullName);
    return map;
  }, [dentists]);

  const run = (t: TimeOff, action: 'approve' | 'reject' | 'cancel', note?: string) =>
    decide.mutate(
      { id: t.id, action, note },
      {
        onSuccess: (result) => {
          notify.success(
            action === 'approve'
              ? 'Đã duyệt nghỉ phép'
              : action === 'reject'
                ? 'Đã từ chối đơn nghỉ phép'
                : 'Đã hủy nghỉ phép',
          );
          setRejecting(null);
          setRejectNote('');
          if (action === 'approve' && result.affectedAppointments?.length) {
            setAffected(result.affectedAppointments);
          }
        },
        onError: (err) => notify.error(getApiErrorMessage(err, 'Không thực hiện được')),
      },
    );

  const canCancel = (t: TimeOff) =>
    canWrite &&
    (t.status === 'PENDING' || t.status === 'APPROVED') &&
    new Date(t.endAt).getTime() > Date.now() &&
    (!ownOnly || t.dentistId === userId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Lọc theo bác sĩ"
            value={dentistFilter}
            onChange={(e) => setDentistFilter(e.target.value)}
            options={[
              { value: '', label: 'Tất cả bác sĩ' },
              ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
            ]}
          />
          <Select
            aria-label="Lọc theo trạng thái"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TimeOffStatus | '')}
            options={[
              { value: '', label: 'Mọi trạng thái' },
              ...(Object.keys(STATUS_LABEL) as TimeOffStatus[]).map((v) => ({
                value: v,
                label: STATUS_LABEL[v],
              })),
            ]}
          />
        </div>
        <PermissionGuard permission="schedule.write">
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            {canApprove ? 'Thêm nghỉ phép' : 'Xin nghỉ phép'}
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
            description="Nghỉ phép đã duyệt sẽ chặn đặt lịch hẹn trong khoảng thời gian đó; đơn chờ duyệt thì chưa chặn."
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
                  <th>Trạng thái</th>
                  <th />
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
                    <td>
                      <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                      {t.decisionNote && <p className="mt-1 text-xs text-gray-500">{t.decisionNote}</p>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {t.status === 'PENDING' && canApprove && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => run(t, 'approve')}>
                            Duyệt
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRejecting(t)}>
                            Từ chối
                          </Button>
                        </>
                      )}
                      {canCancel(t) && (
                        <Button size="sm" variant="ghost" onClick={() => run(t, 'cancel')}>
                          Hủy
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CreateTimeOffModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />

      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title="Từ chối nghỉ phép" size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rejecting) run(rejecting, 'reject', rejectNote.trim());
          }}
        >
          <Textarea
            label="Lý do từ chối"
            required
            minLength={5}
            rows={3}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRejecting(null)}>
              Hủy
            </Button>
            <Button type="submit" variant="danger" isLoading={decide.isPending}>
              Từ chối
            </Button>
          </div>
        </form>
      </Modal>

      <AffectedAppointmentsModal
        open={affected !== null}
        appointments={affected ?? []}
        onClose={() => setAffected(null)}
      />
    </div>
  );
}

function CreateTimeOffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dentists, defaultDentistId } = useSchedulableDentists();
  const createTimeOff = useCreateTimeOff();
  const canApprove = useAuthStore((s) => s.hasPermission('time_off.approve'));

  const [dentistId, setDentistId] = useState(defaultDentistId);
  // Appointments still booked inside approved time-off just recorded — shown
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
      notify.success(
        created.status === 'PENDING' ? 'Đã gửi đơn nghỉ phép — chờ quản trị duyệt' : 'Đã ghi nhận nghỉ phép',
      );
      if (created.status === 'APPROVED' && created.affectedAppointments.length > 0) {
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
    return <AffectedAppointmentsModal open={open} appointments={affected} onClose={close} />;
  }

  return (
    <Modal open={open} onClose={close} title={canApprove ? 'Thêm nghỉ phép' : 'Xin nghỉ phép'} size="sm">
      <div className="space-y-4">
        {!canApprove && (
          <p className="text-sm text-gray-600 dark:text-surface-300">
            Đơn sẽ ở trạng thái chờ duyệt và chưa chặn lịch hẹn cho tới khi quản trị duyệt.
          </p>
        )}
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

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createTimeOff.isPending}
            disabled={!dentistId || !startAt || !endAt || !isRangeValid}
          >
            {canApprove ? 'Thêm' : 'Gửi đơn'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
