import { useMemo, useState } from 'react';
import { Plus, CalendarClock, Pencil, CalendarX2, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Select,
  Input,
  Checkbox,
  ConfirmDialog,
  Modal,
  EmptyState,
} from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { clinicToday } from '@/lib/clinicTime';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { useSchedulableDentists } from './useSchedulableDentists';
import {
  useWorkingSchedules,
  useBulkCreateWorkingSchedules,
  useUpdateWorkingSchedule,
  useDeleteWorkingSchedule,
} from './scheduleApi';
import { AffectedAppointmentsModal } from './AffectedAppointmentsModal';
import { TimeBlocksEditor } from './TimeBlocksEditor';
import { DAY_LABELS, blockError, defaultBlocks, openingBlocks, openingHoursWarnings } from './scheduleBlocks';
import { hasImpact } from './format';
import type { ScheduleChangeImpact, ShiftType, TimeBlock, WorkingSchedule } from '@/types/schedule';

const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  MORNING: 'Buổi sáng',
  AFTERNOON: 'Buổi chiều',
  FULL_DAY: 'Cả ngày',
  NIGHT: 'Buổi tối',
};

/** Monday first, the way the clinic reads a week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const dateOf = (value: string | null) => (value ? value.slice(0, 10) : null);
const viDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
const addDays = (date: string, n: number) =>
  new Date(new Date(date).getTime() + n * 86_400_000).toISOString().slice(0, 10);

type Phase = 'upcoming' | 'active' | 'ended';
function phaseOf(s: WorkingSchedule, today: string): Phase {
  const to = dateOf(s.validTo);
  if (to && to < today) return 'ended';
  return dateOf(s.validFrom)! > today ? 'upcoming' : 'active';
}

const PHASE_BADGE: Record<Phase, { label: string; variant: 'success' | 'info' | 'default' }> = {
  active: { label: 'Đang áp dụng', variant: 'success' },
  upcoming: { label: 'Chưa bắt đầu', variant: 'info' },
  ended: { label: 'Đã kết thúc', variant: 'default' },
};

export function WorkingScheduleTab() {
  const [dentistFilter, setDentistFilter] = useState('');
  const [showEnded, setShowEnded] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editing, setEditing] = useState<WorkingSchedule | null>(null);
  const [ending, setEnding] = useState<WorkingSchedule | null>(null);
  const [deleting, setDeleting] = useState<WorkingSchedule | null>(null);
  const [impact, setImpact] = useState<ScheduleChangeImpact | null>(null);

  const { data: dentists = [] } = useDentistOptions();
  const { data: schedules, isLoading } = useWorkingSchedules(dentistFilter || undefined);
  const remove = useDeleteWorkingSchedule();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const userId = useAuthStore((s) => s.user?.id);
  const ownOnly = hasPermission('appointment.read.own') && !hasPermission('appointment.read.any');
  const canEdit = (s: WorkingSchedule) => hasPermission('schedule.write') && (!ownOnly || s.dentistId === userId);
  const today = clinicToday();

  const dentistNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of dentists) map.set(d.id, d.fullName);
    return map;
  }, [dentists]);

  // Group by dentist first, then order each group Monday → Sunday and by
  // time — how a clinic manager scans "this dentist's whole week".
  const grouped = useMemo(() => {
    const groups = new Map<string, WorkingSchedule[]>();
    for (const s of schedules ?? []) {
      if (!showEnded && phaseOf(s, today) === 'ended') continue;
      const list = groups.get(s.dentistId) ?? [];
      list.push(s);
      groups.set(s.dentistId, list);
    }
    for (const list of groups.values()) {
      list.sort(
        (a, b) =>
          WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) ||
          a.startTime.localeCompare(b.startTime) ||
          a.validFrom.localeCompare(b.validFrom),
      );
    }
    return Array.from(groups.entries()).sort((a, b) =>
      (dentistNameById.get(a[0]) ?? '').localeCompare(dentistNameById.get(b[0]) ?? ''),
    );
  }, [schedules, dentistNameById, showEnded, today]);

  const afterChange = (message: string, result: ScheduleChangeImpact) => {
    notify.success(message);
    if (hasImpact(result)) setImpact(result);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full max-w-xs">
            <Select
              aria-label="Lọc theo bác sĩ"
              value={dentistFilter}
              onChange={(e) => setDentistFilter(e.target.value)}
              options={[
                { value: '', label: 'Tất cả bác sĩ' },
                ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
              ]}
            />
          </div>
          <Checkbox checked={showEnded} onChange={setShowEnded} label="Hiện lịch đã kết thúc" />
        </div>
        <PermissionGuard permission="schedule.write">
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            Thêm lịch làm việc
          </Button>
        </PermissionGuard>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock className="h-10 w-10 text-gray-400" />}
            title="Chưa có lịch làm việc cố định"
            description="Thêm lịch làm việc hàng tuần cho bác sĩ để hệ thống biết khi nào có thể đặt lịch hẹn."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(([dentistId, rows]) => (
            <Card key={dentistId} title={dentistNameById.get(dentistId) ?? '—'} noPadding>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Thứ</th>
                      <th>Giờ làm</th>
                      <th>Loại ca</th>
                      <th>Hiệu lực từ</th>
                      <th>Đến</th>
                      <th className="text-center">Có lương</th>
                      <th>Trạng thái</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => {
                      const phase = phaseOf(s, today);
                      const label = `${DAY_LABELS[s.dayOfWeek]} ${s.startTime}–${s.endTime}`;
                      return (
                        <tr key={s.id}>
                          <td className="font-medium text-gray-900">{DAY_LABELS[s.dayOfWeek]}</td>
                          <td className="font-mono text-xs">{s.startTime} – {s.endTime}</td>
                          <td>{SHIFT_TYPE_LABELS[s.shiftType]}</td>
                          <td>{viDate(s.validFrom)}</td>
                          <td>{s.validTo ? viDate(s.validTo) : '—'}</td>
                          <td className="text-center">{s.isPaidShift ? 'Có' : 'Không'}</td>
                          <td>
                            <Badge variant={PHASE_BADGE[phase].variant}>{PHASE_BADGE[phase].label}</Badge>
                          </td>
                          <td className="whitespace-nowrap text-right">
                            {canEdit(s) && phase !== 'ended' && (
                              <>
                                <Button size="sm" variant="ghost" aria-label={`Sửa ${label}`} onClick={() => setEditing(s)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" aria-label={`Kết thúc ${label}`} onClick={() => setEnding(s)}>
                                  <CalendarX2 className="h-4 w-4" />
                                </Button>
                                {phase === 'upcoming' && (
                                  <Button size="sm" variant="ghost" aria-label={`Xóa ${label}`} onClick={() => setDeleting(s)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateWorkingScheduleModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
      {editing && (
        <EditWorkingScheduleModal
          schedule={editing}
          onClose={() => setEditing(null)}
          onSaved={(result) => {
            setEditing(null);
            afterChange('Đã cập nhật lịch làm việc', result);
          }}
        />
      )}
      {ending && (
        <EndWorkingScheduleModal
          schedule={ending}
          onClose={() => setEnding(null)}
          onSaved={(result) => {
            setEnding(null);
            afterChange('Đã kết thúc lịch làm việc', result);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Xóa lịch làm việc"
        description={
          deleting
            ? `Xóa lịch ${DAY_LABELS[deleting.dayOfWeek]} ${deleting.startTime}–${deleting.endTime} (chưa bắt đầu, hiệu lực từ ${viDate(deleting.validFrom)})?`
            : undefined
        }
        confirmText="Xóa"
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: (result) => {
              setDeleting(null);
              afterChange('Đã xóa lịch làm việc', result);
            },
            onError: (err) => notify.error(getApiErrorMessage(err, 'Không xóa được lịch làm việc')),
          });
        }}
      />
      <AffectedAppointmentsModal
        open={impact !== null}
        title="Lịch hẹn nằm ngoài giờ làm mới"
        appointments={impact?.affectedAppointments ?? []}
        bookingRequests={impact?.affectedBookingRequests ?? []}
        onClose={() => setImpact(null)}
      />
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <Alert variant="warning">
      <p className="font-medium">Lưu ý (vẫn lưu được):</p>
      <ul className="list-disc pl-5">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </Alert>
  );
}

/** Several weekdays × several blocks, saved together (all or nothing). */
function CreateWorkingScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dentists, defaultDentistId } = useSchedulableDentists();
  const createSchedules = useBulkCreateWorkingSchedules();
  const openDays = () => WEEK_ORDER.filter((d) => openingBlocks(d).length > 0);

  const [dentistId, setDentistId] = useState(defaultDentistId);
  const [days, setDays] = useState<number[]>(openDays);
  const [blocks, setBlocks] = useState<TimeBlock[]>(defaultBlocks);
  const [validFrom, setValidFrom] = useState(() => clinicToday());
  const [validTo, setValidTo] = useState('');
  const [isPaidShift, setIsPaidShift] = useState(true);

  const error = blockError(blocks);
  const warnings = error ? [] : openingHoursWarnings(days, blocks);

  const resetForm = () => {
    setDentistId(defaultDentistId);
    setDays(openDays());
    setBlocks(defaultBlocks());
    setValidFrom(clinicToday());
    setValidTo('');
    setIsPaidShift(true);
  };
  const close = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    try {
      const created = await createSchedules.mutateAsync({
        dentistId,
        daysOfWeek: days,
        blocks,
        validFrom,
        validTo: validTo || undefined,
        isPaidShift,
      });
      notify.success(`Đã thêm ${created.length} lịch làm việc`);
      close();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể thêm lịch làm việc'));
    }
  };

  return (
    <Modal open={open} onClose={close} title="Thêm lịch làm việc cố định" size="md">
      <div className="space-y-4">
        <Select
          label="Bác sĩ"
          value={dentistId}
          onChange={(e) => setDentistId(e.target.value)}
          placeholder="-- Chọn bác sĩ --"
          options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
          required
        />

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-gray-700">
            Thứ trong tuần <span className="text-red-500">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {WEEK_ORDER.map((d) => (
              <Checkbox
                key={d}
                checked={days.includes(d)}
                onChange={(on) => setDays(on ? [...days, d] : days.filter((x) => x !== d))}
                label={DAY_LABELS[d]}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-gray-700">
            Khung giờ làm mỗi ngày đã chọn <span className="text-red-500">*</span>
          </legend>
          <p className="text-xs text-gray-500">
            Mặc định theo giờ mở cửa của phòng khám; khoảng trống giữa hai khung (nghỉ trưa) không nhận lịch hẹn.
          </p>
          <TimeBlocksEditor blocks={blocks} onChange={setBlocks} startLabel="Làm từ" />
          {error && <p className="text-xs text-red-600">{error}</p>}
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Hiệu lực từ"
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            required
          />
          <Input
            label="Hiệu lực đến (không bắt buộc)"
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            min={validFrom}
          />
        </div>

        <Checkbox checked={isPaidShift} onChange={setIsPaidShift} label="Ca có lương" />

        <WarningList warnings={warnings} />

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createSchedules.isPending}
            disabled={!dentistId || days.length === 0 || !validFrom || Boolean(error) || (Boolean(validTo) && validTo < validFrom)}
          >
            Lưu {days.length * blocks.length > 1 ? `${days.length * blocks.length} lịch` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * New hours of a schedule already in effect apply from a chosen day: the old
 * row keeps the past (payroll), a new row starts that day.
 */
function EditWorkingScheduleModal({
  schedule,
  onClose,
  onSaved,
}: {
  schedule: WorkingSchedule;
  onClose: () => void;
  onSaved: (result: ScheduleChangeImpact) => void;
}) {
  const update = useUpdateWorkingSchedule();
  const today = clinicToday();
  const started = dateOf(schedule.validFrom)! <= today;
  const [dayOfWeek, setDayOfWeek] = useState(String(schedule.dayOfWeek));
  const [blocks, setBlocks] = useState<TimeBlock[]>([
    { startTime: schedule.startTime, endTime: schedule.endTime },
  ]);
  const [validTo, setValidTo] = useState(dateOf(schedule.validTo) ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(today);

  const [block] = blocks;
  const hoursChanged =
    Number(dayOfWeek) !== schedule.dayOfWeek ||
    block.startTime !== schedule.startTime ||
    block.endTime !== schedule.endTime;
  const validToChanged = validTo !== (dateOf(schedule.validTo) ?? '');
  const error = blockError(blocks);
  const warnings = error ? [] : openingHoursWarnings([Number(dayOfWeek)], blocks);

  const submit = () =>
    update.mutate(
      {
        id: schedule.id,
        ...(hoursChanged
          ? { dayOfWeek: Number(dayOfWeek), startTime: block.startTime, endTime: block.endTime }
          : {}),
        ...(validToChanged ? { validTo: validTo || null } : {}),
        ...(hoursChanged && started ? { effectiveFrom } : {}),
      },
      {
        onSuccess: onSaved,
        onError: (err) => notify.error(getApiErrorMessage(err, 'Không cập nhật được lịch làm việc')),
      },
    );

  return (
    <Modal open onClose={onClose} title="Sửa lịch làm việc" size="sm">
      <div className="space-y-4">
        <Select
          label="Thứ trong tuần"
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(e.target.value)}
          options={WEEK_ORDER.map((d) => ({ value: String(d), label: DAY_LABELS[d] }))}
        />
        <TimeBlocksEditor blocks={blocks} onChange={setBlocks} startLabel="Làm từ" max={1} />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {started && hoursChanged && (
          <>
            <Input
              label="Áp dụng giờ mới từ ngày"
              type="date"
              value={effectiveFrom}
              min={today}
              max={validTo || undefined}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              required
            />
            <Alert variant="info">
              Lịch đang áp dụng: các ngày trước {viDate(effectiveFrom || today)} giữ giờ cũ (dùng để tính lương);
              từ ngày này hệ thống tạo lịch mới với giờ mới.
            </Alert>
          </>
        )}
        <Input
          label="Hiệu lực đến (để trống = không thời hạn)"
          type="date"
          value={validTo}
          min={started ? addDays(today, -1) : dateOf(schedule.validFrom)!}
          onChange={(e) => setValidTo(e.target.value)}
        />
        <WarningList warnings={warnings} />
        <p className="text-xs text-gray-500">
          Hệ thống không tự hủy lịch hẹn: nếu có lịch hẹn nằm ngoài giờ mới, danh sách sẽ hiện ra để lễ tân liên hệ bệnh nhân.
        </p>
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={submit}
            isLoading={update.isPending}
            disabled={Boolean(error) || (!hoursChanged && !validToChanged) || (started && hoursChanged && !effectiveFrom)}
          >
            Lưu
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Stop a schedule after a last working day (history stays for payroll). */
function EndWorkingScheduleModal({
  schedule,
  onClose,
  onSaved,
}: {
  schedule: WorkingSchedule;
  onClose: () => void;
  onSaved: (result: ScheduleChangeImpact) => void;
}) {
  const update = useUpdateWorkingSchedule();
  const today = clinicToday();
  const validFrom = dateOf(schedule.validFrom)!;
  const yesterday = addDays(today, -1);
  const minEnd = validFrom > yesterday ? validFrom : yesterday;
  const [lastDay, setLastDay] = useState(minEnd > today ? minEnd : today);

  return (
    <Modal open onClose={onClose} title="Kết thúc lịch làm việc" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          {DAY_LABELS[schedule.dayOfWeek]} {schedule.startTime}–{schedule.endTime}, hiệu lực từ {viDate(schedule.validFrom)}.
        </p>
        <Input
          label="Ngày làm việc cuối cùng theo lịch này"
          type="date"
          value={lastDay}
          min={minEnd}
          onChange={(e) => setLastDay(e.target.value)}
          hint="Chọn hôm qua để dừng ngay từ hôm nay. Các ngày đã qua được giữ nguyên để tính lương."
          required
        />
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="danger"
            isLoading={update.isPending}
            disabled={!lastDay || lastDay < minEnd}
            onClick={() =>
              update.mutate(
                { id: schedule.id, validTo: lastDay },
                {
                  onSuccess: onSaved,
                  onError: (err) => notify.error(getApiErrorMessage(err, 'Không kết thúc được lịch làm việc')),
                },
              )
            }
          >
            Kết thúc lịch
          </Button>
        </div>
      </div>
    </Modal>
  );
}
