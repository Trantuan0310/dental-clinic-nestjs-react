import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BellOff,
  BellRing,
  Clock,
  DoorOpen,
  Play,
  ShieldOff,
  SkipForward,
  Undo2,
} from 'lucide-react';
import { Badge, Button, Checkbox, ConfirmDialog, Modal, Select, Textarea } from '@/components/ui';
import { PermissionGuard } from '@/components/PermissionGuard';
import { notify } from '@/components/ui/Toast';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/errors';
import {
  useDentistOptions,
  useMarkLeft,
  useUndoAppointmentStatus,
} from '@/features/appointments/appointmentApi';
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  type QueueEntry,
  type QueuePriority,
  useCallPatient,
  useClearEmergency,
  useMarkEmergency,
  useSkipPatient,
  useTransferPatient,
  useUncallPatient,
} from './dispatchApi';

const PRIORITY_VARIANT: Record<QueuePriority, 'danger' | 'success' | 'warning' | 'info'> = {
  EMERGENCY: 'danger',
  ON_TIME: 'success',
  LATE: 'warning',
  WALK_IN: 'info',
};

type DialogKind = 'skip' | 'emergency' | 'clear_emergency' | 'left' | 'undo' | 'transfer';
type Dialog = { kind: DialogKind; entry: QueueEntry };

const DIALOG_TEXT: Record<
  DialogKind,
  { title: string; description: string; min: number; confirm: string; placeholder: string }
> = {
  skip: {
    title: 'Bỏ qua bệnh nhân',
    description: 'Bệnh nhân không có mặt khi gọi. Họ xuống cuối hàng và có thể được gọi lại.',
    min: 3,
    confirm: 'Bỏ qua',
    placeholder: 'VD: Gọi 2 lần không thấy',
  },
  emergency: {
    title: 'Ưu tiên cấp cứu',
    description: 'Bệnh nhân được đưa lên trước tất cả người đang chờ của bác sĩ.',
    min: 5,
    confirm: 'Đưa lên đầu',
    placeholder: 'VD: Sưng mặt, sốt cao',
  },
  clear_emergency: {
    title: 'Gỡ ưu tiên cấp cứu',
    description: 'Bệnh nhân trở lại thứ tự theo giờ hẹn/giờ đến như lúc check-in.',
    min: 5,
    confirm: 'Gỡ cấp cứu',
    placeholder: 'VD: Đánh dấu cấp cứu nhầm',
  },
  left: {
    title: 'Bệnh nhân đã về (chưa khám)',
    description:
      'Bệnh nhân rời phòng khám trước khi được khám. Giờ hẹn được giải phóng. Nếu bấm nhầm hoặc bệnh nhân quay lại trong ngày, mở lịch hẹn và chọn "Hoàn tác đã về".',
    min: 5,
    confirm: 'Xác nhận đã về',
    placeholder: 'VD: Chờ lâu, xin về',
  },
  undo: {
    title: 'Hoàn tác check-in',
    description:
      'Check-in nhầm: lịch quay về trạng thái trước khi check-in và rời hàng đợi. Bệnh nhân tạm ra ngoài thì dùng "Bỏ qua" (giữ lượt, gọi lại sau); bỏ về thì dùng "Đã về".',
    min: 5,
    confirm: 'Hoàn tác',
    placeholder: 'VD: Check-in nhầm bệnh nhân',
  },
  transfer: {
    title: 'Chuyển sang bác sĩ khác',
    description:
      'Bệnh nhân vào hàng chờ của bác sĩ mới, giữ thứ tự ưu tiên và giờ check-in; thời lượng theo dịch vụ của bác sĩ mới. Bác sĩ mới phải làm được các dịch vụ đã chọn và đang trong giờ làm (có thể đang bận khám).',
    min: 5,
    confirm: 'Chuyển',
    placeholder: 'VD: BS đang quá tải, BS khác đang trống',
  },
};

/**
 * One dentist's queue in dispatch order (BR-DSP-001). `mode="dentist"` is
 * the dentist's own screen (call, start exam, skip); `mode="desk"` is the
 * front desk (call, skip, emergency, transfer, left).
 */
export function QueueList({
  entries,
  mode,
  onStart,
  startingId,
}: {
  entries: QueueEntry[];
  mode: 'desk' | 'dentist';
  onStart?: (appointmentId: string) => void;
  startingId?: string | null;
}) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [reason, setReason] = useState('');
  const [targetDentist, setTargetDentist] = useState('');
  // A3-02c: the new dentist's hours end before the visit would; asked once.
  const [overtimeAsked, setOvertimeAsked] = useState<string | null>(null);
  const [allowOvertime, setAllowOvertime] = useState(false);
  const [confirmStart, setConfirmStart] = useState<QueueEntry | null>(null);
  const call = useCallPatient();
  const uncall = useUncallPatient();
  const skip = useSkipPatient();
  const emergency = useMarkEmergency();
  const clearEmergency = useClearEmergency();
  const transfer = useTransferPatient();
  const markLeft = useMarkLeft();
  const undoCheckIn = useUndoAppointmentStatus();
  const { data: dentists = [] } = useDentistOptions();

  const open = (d: Dialog) => {
    setReason('');
    setTargetDentist('');
    setOvertimeAsked(null);
    setAllowOvertime(false);
    setDialog(d);
  };

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    try {
      await fn();
      notify.success(ok);
      setDialog(null);
    } catch (err) {
      if (getApiErrorCode(err) === 'OVERTIME_CONFIRM_REQUIRED') {
        setOvertimeAsked(getApiErrorMessage(err, fail));
        return;
      }
      notify.error(getApiErrorMessage(err, fail));
    }
  };

  const submit = () => {
    if (!dialog) return;
    const { entry } = dialog;
    const name = entry.appointment.patient.fullName;
    const r = reason.trim();
    if (dialog.kind === 'skip') {
      void run(() => skip.mutateAsync({ id: entry.id, reason: r }), `Đã bỏ qua ${name}`, 'Không bỏ qua được');
    } else if (dialog.kind === 'emergency') {
      void run(
        () => emergency.mutateAsync({ id: entry.id, reason: r }),
        `${name} được ưu tiên cấp cứu`,
        'Không cập nhật được',
      );
    } else if (dialog.kind === 'clear_emergency') {
      void run(
        () => clearEmergency.mutateAsync({ id: entry.id, reason: r }),
        `Đã gỡ ưu tiên cấp cứu của ${name}`,
        'Không cập nhật được',
      );
    } else if (dialog.kind === 'left') {
      void run(
        () => markLeft.mutateAsync({ id: entry.appointmentId, reason: r }),
        `${name} đã về, chưa khám`,
        'Không ghi nhận được',
      );
    } else if (dialog.kind === 'undo') {
      void run(
        () => undoCheckIn.mutateAsync({ id: entry.appointmentId, what: 'check-in', reason: r }),
        `Đã hoàn tác check-in cho ${name}`,
        'Không hoàn tác được',
      );
    } else {
      void run(
        () => transfer.mutateAsync({ id: entry.id, dentistId: targetDentist, reason: r, allowOvertime }),
        `Đã chuyển ${name}`,
        'Không chuyển được',
      );
    }
  };

  const text = dialog ? DIALOG_TEXT[dialog.kind] : null;
  const pending =
    skip.isPending ||
    emergency.isPending ||
    clearEmergency.isPending ||
    markLeft.isPending ||
    transfer.isPending ||
    undoCheckIn.isPending;

  return (
    <>
      <ul className="space-y-2" aria-label="Hàng đợi">
        {entries.map((e) => {
          const p = e.appointment.patient;
          const called = e.status === 'CALLED';
          return (
            <li
              key={e.id}
              aria-label={`${p.fullName} — ${STATUS_LABEL[e.status]}`}
              className={`rounded-lg border p-3 ${
                called
                  ? 'border-brand-500 bg-brand-50'
                  : e.status === 'SKIPPED'
                    ? 'border-dashed border-gray-300 bg-gray-50'
                    : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      called ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {called ? <BellRing className="h-4 w-4" /> : (e.position ?? '–')}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      <span>{p.fullName}</span>{' '}
                      <span className="text-xs font-normal text-gray-500">{p.code}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                      <Badge variant={PRIORITY_VARIANT[e.priority]}>{PRIORITY_LABEL[e.priority]}</Badge>
                      <Badge variant={called ? 'info' : 'default'}>{STATUS_LABEL[e.status]}</Badge>
                      <span className={`inline-flex items-center gap-1 ${e.waitingMinutes > 30 ? 'font-medium text-red-600' : ''}`}>
                        <Clock className="h-3.5 w-3.5" /> chờ {e.waitingMinutes} phút
                      </span>
                      {e.appointment.services.length > 0 && (
                        <span>· {e.appointment.services.map((s) => s.serviceName).join(', ')}</span>
                      )}
                    </div>
                    {e.emergencyReason && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> {e.emergencyReason}
                      </p>
                    )}
                    {e.status === 'SKIPPED' && e.skipReason && (
                      <p className="mt-1 text-xs text-gray-500">Bỏ qua: {e.skipReason}</p>
                    )}
                    {e.transferReason && (
                      <p className="mt-1 text-xs text-gray-500">Chuyển từ bác sĩ khác: {e.transferReason}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {!called && (
                    <PermissionGuard permission="queue.call">
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<BellRing className="h-3.5 w-3.5" />}
                        isLoading={call.isPending && call.variables === e.id}
                        onClick={() =>
                          void run(() => call.mutateAsync(e.id), `Đang gọi ${p.fullName}`, 'Không gọi được')
                        }
                      >
                        {e.status === 'SKIPPED' ? 'Gọi lại' : 'Gọi'}
                      </Button>
                    </PermissionGuard>
                  )}
                  {/* Called by mistake: back in line, same place, no skip counted (A3-15). */}
                  {called && (
                    <PermissionGuard permission="queue.call">
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<BellOff className="h-3.5 w-3.5" />}
                        isLoading={uncall.isPending && uncall.variables === e.id}
                        onClick={() =>
                          void run(
                            () => uncall.mutateAsync(e.id),
                            `${p.fullName} trở lại hàng chờ`,
                            'Không hủy gọi được',
                          )
                        }
                      >
                        Hủy gọi
                      </Button>
                    </PermissionGuard>
                  )}
                  {/* Calling is optional: the dentist may start the exam straight away. */}
                  {mode === 'dentist' && e.status !== 'SKIPPED' && onStart && (
                    <PermissionGuard permission="encounter.start" mode="hide">
                      <Button
                        size="sm"
                        leftIcon={<Play className="h-3.5 w-3.5" />}
                        isLoading={startingId === e.appointmentId}
                        onClick={() => setConfirmStart(e)}
                      >
                        Bắt đầu khám
                      </Button>
                    </PermissionGuard>
                  )}
                  {e.status !== 'SKIPPED' && (
                    <PermissionGuard permission="queue.call">
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<SkipForward className="h-3.5 w-3.5" />}
                        onClick={() => open({ kind: 'skip', entry: e })}
                      >
                        Bỏ qua
                      </Button>
                    </PermissionGuard>
                  )}
                  {mode === 'desk' && (
                    <>
                      {e.priority !== 'EMERGENCY' ? (
                        <PermissionGuard permission="queue.manage">
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<AlertTriangle className="h-3.5 w-3.5" />}
                            onClick={() => open({ kind: 'emergency', entry: e })}
                          >
                            Cấp cứu
                          </Button>
                        </PermissionGuard>
                      ) : (
                        <PermissionGuard permission="queue.manage">
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<ShieldOff className="h-3.5 w-3.5" />}
                            onClick={() => open({ kind: 'clear_emergency', entry: e })}
                          >
                            Gỡ cấp cứu
                          </Button>
                        </PermissionGuard>
                      )}
                      <PermissionGuard permission="queue.manage">
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                          onClick={() => open({ kind: 'transfer', entry: e })}
                        >
                          Chuyển BS
                        </Button>
                      </PermissionGuard>
                      <PermissionGuard permission="appointment.mark_left">
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<DoorOpen className="h-3.5 w-3.5" />}
                          onClick={() => open({ kind: 'left', entry: e })}
                        >
                          Đã về
                        </Button>
                      </PermissionGuard>
                      {/* A walk-in has no booking to go back to, nor has a transferred visit. */}
                      {e.appointment.visitKind !== 'WALK_IN' && !e.transferredFromId && (
                        <PermissionGuard permission="appointment.check_in">
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<Undo2 className="h-3.5 w-3.5" />}
                            onClick={() => open({ kind: 'undo', entry: e })}
                          >
                            Hoàn tác check-in
                          </Button>
                        </PermissionGuard>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={text?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              Hủy
            </Button>
            <Button
              onClick={submit}
              isLoading={pending}
              disabled={
                reason.trim().length < (text?.min ?? 0) ||
                (dialog?.kind === 'transfer' && (!targetDentist || (overtimeAsked !== null && !allowOvertime)))
              }
            >
              {text?.confirm}
            </Button>
          </>
        }
      >
        {dialog && text && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              <strong>{dialog.entry.appointment.patient.fullName}</strong> — {text.description}
            </p>
            {dialog.kind === 'transfer' && (
              <Select
                label="Bác sĩ nhận"
                value={targetDentist}
                onChange={(ev) => {
                  setTargetDentist(ev.target.value);
                  setOvertimeAsked(null);
                  setAllowOvertime(false);
                }}
                placeholder="Chọn bác sĩ"
                options={dentists
                  .filter((d) => d.id !== dialog.entry.dentistId)
                  .map((d) => ({ value: d.id, label: d.fullName }))}
              />
            )}
            {dialog.kind === 'transfer' && overtimeAsked && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                <p>{overtimeAsked}</p>
                <Checkbox
                  className="mt-1"
                  checked={allowOvertime}
                  onChange={setAllowOvertime}
                  label="Bác sĩ đồng ý khám ngoài giờ (lý do bên dưới được ghi lại)"
                />
              </div>
            )}
            <Textarea
              label={`Lý do (ít nhất ${text.min} ký tự)`}
              rows={2}
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              placeholder={text.placeholder}
            />
          </div>
        )}
      </Modal>

      {/* A3-03: starting the wrong patient has no easy way back. */}
      <ConfirmDialog
        open={confirmStart !== null}
        onClose={() => setConfirmStart(null)}
        onConfirm={() => {
          if (confirmStart) onStart?.(confirmStart.appointmentId);
          setConfirmStart(null);
        }}
        title="Bắt đầu khám?"
        description={
          confirmStart && (
            <>
              Mở phiên khám cho <strong>{confirmStart.appointment.patient.fullName}</strong> (
              {confirmStart.appointment.patient.code}). Kiểm tra đúng người trước khi bắt đầu.
            </>
          )
        }
        confirmLabel="Bắt đầu khám"
      />
    </>
  );
}
