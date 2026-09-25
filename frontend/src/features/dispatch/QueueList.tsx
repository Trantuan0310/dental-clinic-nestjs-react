import { useState } from 'react';
import { AlertTriangle, ArrowRightLeft, BellRing, Clock, DoorOpen, Play, SkipForward } from 'lucide-react';
import { Badge, Button, Modal, Select, Textarea } from '@/components/ui';
import { PermissionGuard } from '@/components/PermissionGuard';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { useDentistOptions, useMarkLeft } from '@/features/appointments/appointmentApi';
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  type QueueEntry,
  type QueuePriority,
  useCallPatient,
  useMarkEmergency,
  useSkipPatient,
  useTransferPatient,
} from './dispatchApi';

const PRIORITY_VARIANT: Record<QueuePriority, 'danger' | 'success' | 'warning' | 'info'> = {
  EMERGENCY: 'danger',
  ON_TIME: 'success',
  LATE: 'warning',
  WALK_IN: 'info',
};

type Dialog =
  | { kind: 'skip' | 'emergency' | 'left'; entry: QueueEntry }
  | { kind: 'transfer'; entry: QueueEntry };

const DIALOG_TEXT = {
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
  left: {
    title: 'Bệnh nhân đã về (chưa khám)',
    description: 'Bệnh nhân rời phòng khám trước khi được khám. Giờ hẹn được giải phóng.',
    min: 5,
    confirm: 'Xác nhận đã về',
    placeholder: 'VD: Chờ lâu, xin về',
  },
  transfer: {
    title: 'Chuyển sang bác sĩ khác',
    description:
      'Lượt khám giữ nguyên thời lượng và thứ tự ưu tiên, bắt đầu từ bây giờ. Bác sĩ mới phải làm được các dịch vụ đã chọn và đang rảnh.',
    min: 5,
    confirm: 'Chuyển',
    placeholder: 'VD: BS đang quá tải, BS khác đang trống',
  },
} as const;

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
  const call = useCallPatient();
  const skip = useSkipPatient();
  const emergency = useMarkEmergency();
  const transfer = useTransferPatient();
  const markLeft = useMarkLeft();
  const { data: dentists = [] } = useDentistOptions();

  const open = (d: Dialog) => {
    setReason('');
    setTargetDentist('');
    setDialog(d);
  };

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    try {
      await fn();
      notify.success(ok);
      setDialog(null);
    } catch (err) {
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
    } else if (dialog.kind === 'left') {
      void run(
        () => markLeft.mutateAsync({ id: entry.appointmentId, reason: r }),
        `${name} đã về, chưa khám`,
        'Không ghi nhận được',
      );
    } else {
      void run(
        () => transfer.mutateAsync({ id: entry.id, dentistId: targetDentist, reason: r }),
        `Đã chuyển ${name}`,
        'Không chuyển được',
      );
    }
  };

  const text = dialog ? DIALOG_TEXT[dialog.kind] : null;
  const pending = skip.isPending || emergency.isPending || markLeft.isPending || transfer.isPending;

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
                  {/* Calling is optional: the dentist may start the exam straight away. */}
                  {mode === 'dentist' && e.status !== 'SKIPPED' && onStart && (
                    <Button
                      size="sm"
                      leftIcon={<Play className="h-3.5 w-3.5" />}
                      isLoading={startingId === e.appointmentId}
                      onClick={() => onStart(e.appointmentId)}
                    >
                      Bắt đầu khám
                    </Button>
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
                      {e.priority !== 'EMERGENCY' && (
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
                      )}
                      {!called && (
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
                      )}
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
                reason.trim().length < (text?.min ?? 0) || (dialog?.kind === 'transfer' && !targetDentist)
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
                onChange={(ev) => setTargetDentist(ev.target.value)}
                placeholder="Chọn bác sĩ"
                options={dentists
                  .filter((d) => d.id !== dialog.entry.dentistId)
                  .map((d) => ({ value: d.id, label: d.fullName }))}
              />
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
    </>
  );
}
