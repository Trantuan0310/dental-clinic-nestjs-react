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
import { clinicIso, clinicParts, clinicToday } from '@/lib/clinicTime';
import {
  useTimeOffs,
  useCreateTimeOff,
  useDecideTimeOff,
  useTimeOffImpact,
  useUpdateTimeOff,
} from './scheduleApi';
import { useSchedulableDentists } from './useSchedulableDentists';
import { AffectedAppointmentsModal } from './AffectedAppointmentsModal';
import { formatDateTime } from './format';
import type {
  CreateTimeOffResult,
  TimeOff,
  TimeOffStatus,
  TimeOffType,
} from '@/types/schedule';

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
  const [approving, setApproving] = useState<TimeOff | null>(null);
  const [cancelling, setCancelling] = useState<TimeOff | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [extending, setExtending] = useState<TimeOff | null>(null);
  const [affected, setAffected] = useState<CreateTimeOffResult | null>(null);

  const { data: dentists = [] } = useDentistOptions('schedule');
  const { data: timeOffs, isLoading } = useTimeOffs(dentistFilter || undefined, statusFilter || undefined);
  const decide = useDecideTimeOff();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const userId = useAuthStore((s) => s.user?.id);
  const canApprove = hasPermission('time_off.approve');
  const canWrite = hasPermission('schedule.write');
  // Front desk records a dentist's sudden absence today (A1-09).
  const canRecordUrgent = !canApprove && !canWrite && hasPermission('time_off.record_urgent');
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
                : result.endedEarly
                  ? `Đã kết thúc nghỉ phép lúc ${formatDateTime(result.endAt)} — thời gian đã nghỉ vẫn được ghi nhận`
                  : 'Đã hủy nghỉ phép',
          );
          setRejecting(null);
          setRejectNote('');
          setApproving(null);
          setCancelling(null);
          setCancelNote('');
          if (action === 'approve' && hasFollowUp(result)) setAffected(result);
        },
        onError: (err) => notify.error(getApiErrorMessage(err, 'Không thực hiện được')),
      },
    );

  const canCancel = (t: TimeOff) =>
    (canWrite || (canRecordUrgent && t.createdBy === userId)) &&
    (t.status === 'PENDING' || t.status === 'APPROVED') &&
    new Date(t.endAt).getTime() > Date.now() &&
    (!ownOnly || t.dentistId === userId);
  const running = (t: TimeOff) => t.status === 'APPROVED' && new Date(t.startAt).getTime() < Date.now();
  const canExtend = (t: TimeOff) =>
    new Date(t.endAt).getTime() > Date.now() &&
    ((t.status === 'APPROVED' && canApprove) ||
      (t.status === 'PENDING' && canWrite && (!ownOnly || t.dentistId === userId)));

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
        <PermissionGuard anyOf={['schedule.write', 'time_off.record_urgent']}>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            {canApprove ? 'Thêm nghỉ phép' : canRecordUrgent ? 'Ghi bác sĩ vắng hôm nay' : 'Xin nghỉ phép'}
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
                    <td className="text-gray-500">
                      {t.reasonHidden ? <span className="italic">Chỉ quản trị xem</span> : t.reason || '—'}
                    </td>
                    <td>
                      <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                      {t.decisionNote && <p className="mt-1 text-xs text-gray-500">{t.decisionNote}</p>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {t.status === 'PENDING' && canApprove && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setApproving(t)}>
                            Duyệt
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRejecting(t)}>
                            Từ chối
                          </Button>
                        </>
                      )}
                      {canExtend(t) && (
                        <Button size="sm" variant="ghost" onClick={() => setExtending(t)}>
                          Sửa giờ kết thúc
                        </Button>
                      )}
                      {canCancel(t) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => (t.status === 'PENDING' ? run(t, 'cancel') : setCancelling(t))}
                        >
                          {running(t) ? 'Kết thúc sớm' : 'Hủy'}
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

      <ApproveTimeOffModal
        timeOff={approving}
        dentistName={approving ? dentistNameById.get(approving.dentistId) : undefined}
        isPending={decide.isPending}
        onConfirm={() => approving && run(approving, 'approve')}
        onClose={() => setApproving(null)}
      />

      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={cancelling && running(cancelling) ? 'Kết thúc nghỉ phép sớm' : 'Hủy nghỉ phép đã duyệt'}
        size="sm"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (cancelling) run(cancelling, 'cancel', cancelNote.trim());
          }}
        >
          <p className="text-sm text-gray-600 dark:text-surface-300">
            {cancelling && running(cancelling)
              ? 'Kỳ nghỉ đang diễn ra sẽ kết thúc từ bây giờ (làm tròn 15 phút); thời gian đã nghỉ vẫn được giữ. '
              : 'Lịch của bác sĩ sẽ mở lại cho đặt hẹn. '}
            Các lịch hẹn đã chuyển sang bác sĩ khác vẫn giữ nguyên.
          </p>
          <Textarea
            label="Lý do"
            required
            minLength={5}
            rows={2}
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            placeholder="VD: Bác sĩ khỏe lại, làm buổi chiều"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCancelling(null)}>
              Đóng
            </Button>
            <Button type="submit" variant="danger" isLoading={decide.isPending} disabled={cancelNote.trim().length < 5}>
              Xác nhận
            </Button>
          </div>
        </form>
      </Modal>

      <ExtendTimeOffModal timeOff={extending} onClose={() => setExtending(null)} onImpact={setAffected} />

      <AffectedAppointmentsModal
        open={affected !== null}
        appointments={affected?.affectedAppointments ?? []}
        bookingRequests={affected?.affectedBookingRequests ?? []}
        waitingPatients={affected?.waitingPatients ?? []}
        onClose={() => setAffected(null)}
      />
    </div>
  );
}

/** Something the front desk must still handle after a time-off took effect. */
function hasFollowUp(r: CreateTimeOffResult): boolean {
  return (
    (r.affectedAppointments?.length ?? 0) > 0 ||
    (r.affectedBookingRequests?.length ?? 0) > 0 ||
    (r.waitingPatients?.length ?? 0) > 0
  );
}

/** A1-10: approving shows first how many bookings it touches. */
function ApproveTimeOffModal({
  timeOff,
  dentistName,
  isPending,
  onConfirm,
  onClose,
}: {
  timeOff: TimeOff | null;
  dentistName?: string;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { data: preview, isLoading } = useTimeOffImpact(timeOff?.id ?? null);
  return (
    <Modal open={timeOff !== null} onClose={onClose} title="Duyệt nghỉ phép" size="sm">
      {timeOff && (
        <div className="space-y-4 text-sm">
          <p>
            {dentistName ?? 'Bác sĩ'} nghỉ từ <strong>{formatDateTime(timeOff.startAt)}</strong> đến{' '}
            <strong>{formatDateTime(timeOff.endAt)}</strong>.
          </p>
          {isLoading ? (
            <p className="text-gray-500">Đang kiểm tra lịch hẹn…</p>
          ) : (
            <p className={preview && preview.affectedAppointments.length > 0 ? 'text-amber-700' : 'text-gray-600'}>
              {preview && preview.affectedAppointments.length > 0
                ? `${preview.affectedAppointments.length} lịch hẹn đã đặt rơi vào khoảng nghỉ — sau khi duyệt cần gọi bệnh nhân dời lịch.`
                : 'Không có lịch hẹn nào trong khoảng nghỉ.'}
              {preview && preview.inClinic.length > 0 &&
                ` Đang có ${preview.inClinic.length} bệnh nhân đã check-in/đang khám với bác sĩ này.`}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <Button variant="outline" onClick={onClose}>
              Đóng
            </Button>
            <Button onClick={onConfirm} isLoading={isPending}>
              Duyệt
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Shorten or extend a time-off: a new end, in clinic time (A1-11). */
function ExtendTimeOffModal({
  timeOff,
  onClose,
  onImpact,
}: {
  timeOff: TimeOff | null;
  onClose: () => void;
  onImpact: (r: CreateTimeOffResult) => void;
}) {
  const update = useUpdateTimeOff();
  const end = timeOff ? clinicParts(timeOff.endAt) : null;
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const shownDate = date || end?.date || '';
  const shownTime = time || end?.time || '';
  const close = () => {
    setDate('');
    setTime('');
    setReason('');
    onClose();
  };
  return (
    <Modal open={timeOff !== null} onClose={close} title="Sửa giờ kết thúc nghỉ phép" size="sm">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!timeOff) return;
          update.mutate(
            { id: timeOff.id, endAt: clinicIso(shownDate, shownTime), reason: reason.trim() },
            {
              onSuccess: (r) => {
                notify.success('Đã cập nhật thời gian nghỉ');
                close();
                if (hasFollowUp(r)) onImpact(r);
              },
              onError: (err) => notify.error(getApiErrorMessage(err, 'Không cập nhật được')),
            },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Input label="Đến ngày" type="date" min={clinicToday()} value={shownDate} onChange={(e) => setDate(e.target.value)} required />
          <Input label="Giờ (giờ phòng khám)" type="time" value={shownTime} onChange={(e) => setTime(e.target.value)} required />
        </div>
        <Textarea label="Lý do" required minLength={5} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Đóng
          </Button>
          <Button type="submit" isLoading={update.isPending} disabled={reason.trim().length < 5}>
            Lưu
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateTimeOffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dentists, defaultDentistId } = useSchedulableDentists();
  const createTimeOff = useCreateTimeOff();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canApprove = hasPermission('time_off.approve');
  const urgentOnly = !canApprove && !hasPermission('schedule.write') && hasPermission('time_off.record_urgent');

  const [dentistId, setDentistId] = useState(defaultDentistId);
  // Appointments still booked inside approved time-off just recorded — shown
  // instead of closing, so front desk knows who to call and move.
  const [affected, setAffected] = useState<CreateTimeOffResult | null>(null);
  // Clinic date + clinic "HH:mm" (A1-14): a workstation in another zone
  // records the same instants as one in Vietnam.
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [type, setType] = useState<TimeOffType>(urgentOnly ? 'SICK' : 'VACATION');
  const [reason, setReason] = useState('');

  const startAt = startDate && startTime ? clinicIso(startDate, startTime) : '';
  const endAt = endDate && endTime ? clinicIso(endDate, endTime) : '';
  const isRangeValid = !startAt || !endAt || startAt < endAt;

  const resetForm = () => {
    setDentistId(defaultDentistId);
    setAffected(null);
    setStartDate('');
    setStartTime('');
    setEndDate('');
    setEndTime('');
    setType(urgentOnly ? 'SICK' : 'VACATION');
    setReason('');
  };

  const handleSubmit = async () => {
    try {
      const created = await createTimeOff.mutateAsync({
        dentistId,
        startAt,
        endAt,
        type,
        reason: reason || undefined,
      });
      notify.success(
        created.status === 'PENDING' ? 'Đã gửi đơn nghỉ phép — chờ quản trị duyệt' : 'Đã ghi nhận nghỉ phép',
      );
      if (created.status === 'APPROVED' && hasFollowUp(created)) {
        setAffected(created);
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
      <AffectedAppointmentsModal
        open={open}
        appointments={affected.affectedAppointments}
        bookingRequests={affected.affectedBookingRequests ?? []}
        waitingPatients={affected.waitingPatients ?? []}
        onClose={close}
      />
    );
  }

  const title = canApprove ? 'Thêm nghỉ phép' : urgentOnly ? 'Ghi bác sĩ vắng đột xuất' : 'Xin nghỉ phép';
  return (
    <Modal open={open} onClose={close} title={title} size="sm">
      <div className="space-y-4">
        {urgentOnly ? (
          <p className="text-sm text-gray-600 dark:text-surface-300">
            Có hiệu lực ngay: bắt đầu trong hôm nay, kết thúc chậm nhất cuối ngày mai. Quản trị sẽ được thấy và có thể
            kết thúc sớm hoặc gia hạn.
          </p>
        ) : (
          !canApprove && (
            <p className="text-sm text-gray-600 dark:text-surface-300">
              Đơn sẽ ở trạng thái chờ duyệt và chưa chặn lịch hẹn cho tới khi quản trị duyệt.
            </p>
          )
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

        <div className="grid grid-cols-2 gap-3">
          <Input label="Từ ngày" type="date" min={clinicToday()} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          <Input label="Giờ (giờ phòng khám)" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          <Input label="Đến ngày" type="date" min={startDate || clinicToday()} value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          <Input
            label="Giờ (giờ phòng khám)"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            error={!isRangeValid ? 'Thời gian kết thúc phải sau thời gian bắt đầu' : undefined}
            required
          />
        </div>

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
            {canApprove ? 'Thêm' : urgentOnly ? 'Ghi nhận' : 'Gửi đơn'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
