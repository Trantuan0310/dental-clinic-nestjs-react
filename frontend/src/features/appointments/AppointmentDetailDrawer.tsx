import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  FileEdit,
  Phone,
  Stethoscope,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { AppointmentStatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Loading';
import { PermissionGuard } from '@/components/PermissionGuard';
import {
  useAppointment,
  useAvailability,
  useCancelAppointment,
  useCheckInAppointment,
  useDentistOptions,
  useMarkNoShow,
  useRescheduleAppointment,
  useStartEncounter,
} from './appointmentApi';
import { getApiErrorMessage } from '@/lib/errors';
import { notify } from '@/components/ui/Toast';
import { formatDate, formatDateTime, formatPhone, formatTimeOnly, getWeekdayLabel } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Appointment, AppointmentStatus } from '@/types/appointment';

interface AppointmentDetailDrawerProps {
  appointmentId: string | null;
  onClose: () => void;
  onEdit?: (appointment: Appointment) => void;
}

type ActionKey = 'cancel' | 'no_show' | 'reschedule';

const CANCEL_REASONS = [
  'Bệnh nhân yêu cầu',
  'Bác sĩ bận đột xuất',
  'Trùng lịch khác',
  'Bệnh nhân không xác nhận được',
];

const NO_SHOW_REASONS = ['Không liên lạc được', 'Bệnh nhân báo đến muộn quá giờ', 'Không rõ lý do'];

const STATUS_ORDER: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
];

function localDateTimeParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function AppointmentDetailDrawer({ appointmentId, onClose, onEdit }: AppointmentDetailDrawerProps) {
  const navigate = useNavigate();
  const { data: appointment, isLoading } = useAppointment(appointmentId ?? undefined);
  const [actionModal, setActionModal] = useState<ActionKey | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const checkIn = useCheckInAppointment();
  const cancel = useCancelAppointment();
  const noShow = useMarkNoShow();
  const reschedule = useRescheduleAppointment();
  const start = useStartEncounter();
  const { data: dentists } = useDentistOptions();

  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleDentist, setRescheduleDentist] = useState('');

  // Suggest free slots when the reschedule modal is open. We only fetch when
  // the user has typed a date + dentist so the list isn't empty at first.
  const rescheduleTargetDentist =
    actionModal === 'reschedule' ? rescheduleDentist || appointment?.dentistId : undefined;
  const { data: availability, isLoading: isAvailabilityLoading } = useAvailability(
    rescheduleTargetDentist,
    actionModal === 'reschedule' ? rescheduleDate : undefined,
  );

  // Quick-action handlers
  const handleCopyPhone = async () => {
    const phone = appointment?.patientPhone;
    if (!phone) {
      notify.warning('Bệnh nhân không có số điện thoại.');
      return;
    }
    try {
      await navigator.clipboard.writeText(phone);
      notify.success(`Đã sao chép SĐT: ${phone}`);
    } catch {
      notify.error('Trình duyệt không hỗ trợ sao chép tự động.');
    }
  };

  const handleCall = () => {
    if (!appointment?.patientPhone) {
      notify.warning('Bệnh nhân không có số điện thoại.');
      return;
    }
    window.location.href = `tel:${appointment.patientPhone}`;
  };

  const handleOpenProfile = () => {
    if (!appointment?.patientId) return;
    onClose();
    navigate(`/patients/${appointment.patientId}`);
  };

  useEffect(() => {
    if (actionModal !== 'reschedule' || !appointment) return;
    const parts = localDateTimeParts(appointment.startsAt);
    setRescheduleDate(parts.date);
    setRescheduleTime(parts.time);
    setRescheduleDentist(appointment.dentistId);
    setReason('');
    setError(null);
  }, [actionModal, appointment]);

  useEffect(() => {
    setReason('');
    setError(null);
  }, [actionModal, appointmentId]);

  const closeAction = () => {
    setActionModal(null);
    setReason('');
    setError(null);
  };

  const handleCheckIn = async () => {
    if (!appointment) return;
    try {
      await checkIn.mutateAsync({ id: appointment.id });
      notify.success(`Đã check-in cho ${appointment.patientName}`);
      onClose();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể check-in'));
    }
  };

  const handleCancel = async () => {
    if (!appointment) return;
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do hủy.');
      return;
    }
    setError(null);
    try {
      await cancel.mutateAsync({ id: appointment.id, payload: { reason } });
      notify.success('Đã hủy lịch hẹn');
      closeAction();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không thể hủy lịch'));
    }
  };

  const handleNoShow = async () => {
    if (!appointment) return;
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do no-show.');
      return;
    }
    setError(null);
    try {
      await noShow.mutateAsync({ id: appointment.id, reason });
      notify.success('Đã đánh dấu no-show');
      closeAction();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không thể đánh dấu no-show'));
    }
  };

  const handleReschedule = async () => {
    if (!appointment) return;
    if (!rescheduleDate || !rescheduleTime) {
      setError('Vui lòng chọn ngày/giờ mới.');
      return;
    }
    setError(null);
    try {
      const [y, mo, d] = rescheduleDate.split('-').map(Number);
      const [h, mi] = rescheduleTime.split(':').map(Number);
      const start = new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
      const end = new Date(start.getTime() + appointment.durationMinutes * 60_000);
      await reschedule.mutateAsync({
        id: appointment.id,
        payload: {
          newDentistId: rescheduleDentist || undefined,
          newStartsAt: start.toISOString(),
          newEndsAt: end.toISOString(),
          reason: reason || 'Đổi lịch',
        },
      });
      notify.success('Đã đổi lịch hẹn');
      closeAction();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Không thể đổi lịch'));
    }
  };

  const handleStart = async () => {
    if (!appointment) return;
    try {
      await start.mutateAsync(appointment.id);
      notify.success(`Đã mở encounter cho ${appointment.patientName}`);
      onClose();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể mở encounter'));
    }
  };

  if (!appointmentId) return null;

  return (
    <>
      <Drawer
        open={!!appointmentId}
        onClose={onClose}
        width="lg"
        title={isLoading ? 'Đang tải...' : appointment ? `Lịch hẹn #${appointment.id.slice(-6).toUpperCase()}` : 'Không tìm thấy'}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : !appointment ? (
          <p className="text-sm text-gray-500">Không tìm thấy lịch hẹn.</p>
        ) : (
          <div className="space-y-5">
            {/* Header summary */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Bệnh nhân</p>
                  <p className="mt-0.5 text-base font-semibold text-gray-900">{appointment.patientName}</p>
                  <p className="text-xs text-gray-500">
                    {appointment.patientCode} •{' '}
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {formatPhone(appointment.patientPhone ?? null)}
                    </span>
                  </p>
                </div>
                <AppointmentStatusBadge status={appointment.status} />
              </div>
              {/* Quick actions */}
              {appointment.patientPhone && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-200 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Phone className="h-3.5 w-3.5" />}
                    onClick={handleCall}
                    aria-label="Gọi điện cho bệnh nhân"
                  >
                    Gọi điện
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Copy className="h-3.5 w-3.5" />}
                    onClick={handleCopyPhone}
                    aria-label="Sao chép số điện thoại"
                  >
                    Sao chép SĐT
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
                    onClick={handleOpenProfile}
                    aria-label="Mở hồ sơ bệnh nhân"
                  >
                    Xem hồ sơ
                  </Button>
                </div>
              )}
            </div>

            {/* Schedule info */}
            <div className="grid grid-cols-2 gap-3">
              <DetailRow
                icon={<Calendar className="h-4 w-4" />}
                label="Ngày khám"
                value={`${getWeekdayLabel(appointment.startsAt)}, ${formatDate(appointment.startsAt, 'dd/MM/yyyy')}`}
              />
              <DetailRow
                icon={<Clock className="h-4 w-4" />}
                label="Thời gian"
                value={`${formatTimeOnly(appointment.startsAt)} – ${formatTimeOnly(appointment.endsAt)} (${appointment.durationMinutes} phút)`}
              />
              <DetailRow
                icon={<User className="h-4 w-4" />}
                label="Bác sĩ"
                value={appointment.dentistName}
              />
              <DetailRow
                icon={<Stethoscope className="h-4 w-4" />}
                label="Loại"
                value={
                  appointment.appointmentType === 'consultation'
                    ? 'Khám / Tư vấn'
                    : appointment.appointmentType === 'treatment'
                      ? 'Điều trị'
                      : appointment.appointmentType === 'follow_up'
                        ? 'Tái khám'
                        : '—'
                }
              />
            </div>

            {/* Reason / notes */}
            {(appointment.reason || appointment.chiefComplaint || appointment.notes) && (
              <div className="space-y-2 rounded-md border border-gray-200 bg-white p-4">
                {appointment.reason && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Lý do khám</p>
                    <p className="mt-0.5 text-sm text-gray-900">{appointment.reason}</p>
                  </div>
                )}
                {appointment.chiefComplaint && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Triệu chứng</p>
                    <p className="mt-0.5 text-sm text-gray-900">{appointment.chiefComplaint}</p>
                  </div>
                )}
                {appointment.notes && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Ghi chú nội bộ</p>
                    <p className="mt-0.5 text-sm text-gray-700">{appointment.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Status timeline */}
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Lịch sử trạng thái</p>
              <ul className="space-y-2 text-xs">
                <TimelineRow
                  label="Đặt lịch"
                  time={formatDateTime(appointment.createdAt)}
                  active
                />
                {appointment.checkInAt && (
                  <TimelineRow
                    label="Check-in"
                    time={formatDateTime(appointment.checkInAt)}
                    active
                  />
                )}
                {appointment.status === 'in_progress' && (
                  <TimelineRow label="Đang khám" time="—" active />
                )}
                {appointment.status === 'completed' && (
                  <TimelineRow label="Hoàn thành" time={formatDateTime(appointment.updatedAt)} active />
                )}
                {appointment.status === 'cancelled' && appointment.cancelledAt && (
                  <TimelineRow
                    label={`Hủy: ${appointment.cancellationReason ?? ''}`}
                    time={formatDateTime(appointment.cancelledAt)}
                    danger
                  />
                )}
                {appointment.status === 'no_show' && appointment.noShowAt && (
                  <TimelineRow
                    label={`No-show: ${appointment.cancellationReason ?? ''}`}
                    time={formatDateTime(appointment.noShowAt)}
                    danger
                  />
                )}
              </ul>
            </div>

            {/* Actions */}
            <div className="border-t border-gray-200 pt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Thao tác</p>
              <div className="flex flex-wrap gap-2">
                {appointment.status === 'scheduled' || appointment.status === 'confirmed' ? (
                  <PermissionGuard permission="appointment.check_in">
                    <Button
                      size="sm"
                      leftIcon={<CheckCircle2 className="h-4 w-4" />}
                      onClick={handleCheckIn}
                      isLoading={checkIn.isPending}
                    >
                      Check-in
                    </Button>
                  </PermissionGuard>
                ) : null}

                {appointment.status === 'checked_in' ? (
                  <PermissionGuard permission="encounter.create">
                    <Button
                      size="sm"
                      variant="primary"
                      leftIcon={<Stethoscope className="h-4 w-4" />}
                      onClick={handleStart}
                      isLoading={start.isPending}
                    >
                      Mời vào khám
                    </Button>
                  </PermissionGuard>
                ) : null}

                {canCancel(appointment.status) && (
                  <PermissionGuard permission="appointment.cancel">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<X className="h-4 w-4" />}
                      onClick={() => setActionModal('cancel')}
                    >
                      Hủy lịch
                    </Button>
                  </PermissionGuard>
                )}

                {canReschedule(appointment.status) && (
                  <PermissionGuard permission="appointment.update">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<FileEdit className="h-4 w-4" />}
                      onClick={() => setActionModal('reschedule')}
                    >
                      Đổi lịch
                    </Button>
                  </PermissionGuard>
                )}

                {canNoShow(appointment.status) && (
                  <PermissionGuard permission="appointment.mark_no_show">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Trash2 className="h-4 w-4" />}
                      onClick={() => setActionModal('no_show')}
                    >
                      Đánh no-show
                    </Button>
                  </PermissionGuard>
                )}

                <PermissionGuard permission="appointment.update">
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Edit3 className="h-4 w-4" />}
                    onClick={() => {
                      onEdit?.(appointment);
                      onClose();
                    }}
                  >
                    Sửa
                  </Button>
                </PermissionGuard>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Action modals */}
      <ActionDialog
        open={actionModal === 'cancel'}
        onClose={closeAction}
        title="Hủy lịch hẹn"
        description="Vui lòng nhập lý do hủy. Lý do sẽ được ghi vào lịch sử."
        reason={reason}
        setReason={setReason}
        quickReasons={CANCEL_REASONS}
        error={error}
        onConfirm={handleCancel}
        isLoading={cancel.isPending}
        confirmLabel="Xác nhận hủy"
        confirmVariant="danger"
      />

      <ActionDialog
        open={actionModal === 'no_show'}
        onClose={closeAction}
        title="Đánh dấu No-show"
        description="Bệnh nhân không đến sau khi quá thời gian check-in?"
        reason={reason}
        setReason={setReason}
        quickReasons={NO_SHOW_REASONS}
        error={error}
        onConfirm={handleNoShow}
        isLoading={noShow.isPending}
        confirmLabel="Xác nhận no-show"
        confirmVariant="danger"
      />

      <Modal
        open={actionModal === 'reschedule'}
        onClose={closeAction}
        title="Đổi lịch hẹn"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeAction} disabled={reschedule.isPending}>
              Hủy
            </Button>
            <Button onClick={handleReschedule} isLoading={reschedule.isPending}>
              Xác nhận đổi lịch
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <AlertInline message={error} />}
          <Select
            label="Bác sĩ mới"
            value={rescheduleDentist}
            onChange={(e) => setRescheduleDentist(e.target.value)}
            options={(dentists ?? []).map((d) => ({ value: d.id, label: d.fullName }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="date"
              label="Ngày mới"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
            <Input
              type="time"
              label="Giờ mới"
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
            />
          </div>

          {/* Available slot suggestions */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-600">
              Khung giờ trống gợi ý
              <span className="ml-1 font-normal text-gray-400">
                ({(appointment?.durationMinutes ?? 30)} phút)
              </span>
            </p>
            {!rescheduleDate ? (
              <p className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                Chọn ngày để xem gợi ý.
              </p>
            ) : isAvailabilityLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-gray-100 px-3 py-3 text-xs text-gray-500">
                <Spinner size="sm" /> Đang tải khung giờ trống…
              </div>
            ) : !availability?.availableSlots?.length ? (
              <p className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                Không có khung giờ trống trong ngày này.
              </p>
            ) : (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-gray-100 p-2">
                {availability.availableSlots
                  .filter((s) => s.available)
                  .slice(0, 24)
                  .map((s) => {
                    const t = formatTimeOnly(s.startTime);
                    const active = rescheduleTime === t;
                    return (
                      <button
                        key={s.startTime}
                        type="button"
                        onClick={() => setRescheduleTime(t)}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50',
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          <Textarea
            label="Lý do đổi lịch"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VD: BS bận đột xuất, BN yêu cầu đổi..."
            rows={3}
          />
        </div>
      </Modal>
    </>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

function TimelineRow({
  label,
  time,
  active,
  danger,
}: {
  label: string;
  time: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`h-2 w-2 rounded-full ${
          danger ? 'bg-red-500' : active ? 'bg-emerald-500' : 'bg-gray-300'
        }`}
      />
      <span className={`flex-1 ${danger ? 'text-red-700' : 'text-gray-700'}`}>{label}</span>
      <span className="text-gray-500">{time}</span>
    </li>
  );
}

function AlertInline({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {message}
    </div>
  );
}

interface ActionDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  reason: string;
  setReason: (v: string) => void;
  quickReasons?: string[];
  error: string | null;
  onConfirm: () => void;
  isLoading: boolean;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
}

function ActionDialog({
  open,
  onClose,
  title,
  description,
  reason,
  setReason,
  quickReasons,
  error,
  onConfirm,
  isLoading,
  confirmLabel,
  confirmVariant = 'danger',
}: ActionDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      description={
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{description}</p>
          {error && <AlertInline message={error} />}
          {quickReasons && quickReasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {quickReasons.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    reason === preset
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:bg-brand-50',
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}
          <Textarea
            label="Lý do *"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nhập lý do..."
            rows={3}
          />
        </div>
      }
      confirmLabel={confirmLabel}
      confirmVariant={confirmVariant}
      isLoading={isLoading}
    />
  );
}

function canCancel(status: AppointmentStatus): boolean {
  return status === 'scheduled' || status === 'confirmed' || status === 'checked_in';
}

function canReschedule(status: AppointmentStatus): boolean {
  return status === 'scheduled' || status === 'confirmed';
}

function canNoShow(status: AppointmentStatus): boolean {
  return status === 'scheduled' || status === 'confirmed';
}

// Hint to silence unused import warning for STATUS_ORDER (kept for future timeline enhancements)
void STATUS_ORDER;