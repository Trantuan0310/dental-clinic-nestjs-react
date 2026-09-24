import { useMemo, useState } from 'react';
import { Plus, CalendarClock } from 'lucide-react';
import { Button, Card, Select, Input, Checkbox, Modal, EmptyState } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { useSchedulableDentists } from './useSchedulableDentists';
import { useWorkingSchedules, useCreateWorkingSchedule } from './scheduleApi';
import type { ShiftType, WorkingSchedule } from '@/types/schedule';

const DAY_LABELS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  MORNING: 'Buổi sáng',
  AFTERNOON: 'Buổi chiều',
  FULL_DAY: 'Cả ngày',
  NIGHT: 'Buổi tối',
};

export function WorkingScheduleTab() {
  const [dentistFilter, setDentistFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: dentists = [] } = useDentistOptions();
  const { data: schedules, isLoading } = useWorkingSchedules(dentistFilter || undefined);

  const dentistNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of dentists) map.set(d.id, d.fullName);
    return map;
  }, [dentists]);

  // Group by dentist first, then order each group by the day/time ordering
  // the API already returns (dayOfWeek asc, startTime asc) — matches how a
  // clinic manager naturally scans "this dentist's whole week" rather than
  // a flat list interleaving every dentist.
  const grouped = useMemo(() => {
    const groups = new Map<string, WorkingSchedule[]>();
    for (const s of schedules ?? []) {
      const list = groups.get(s.dentistId) ?? [];
      list.push(s);
      groups.set(s.dentistId, list);
    }
    return Array.from(groups.entries()).sort((a, b) =>
      (dentistNameById.get(a[0]) ?? '').localeCompare(dentistNameById.get(b[0]) ?? ''),
    );
  }, [schedules, dentistNameById]);

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
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id}>
                        <td className="font-medium text-gray-900">{DAY_LABELS[s.dayOfWeek]}</td>
                        <td className="font-mono text-xs">{s.startTime} – {s.endTime}</td>
                        <td>{SHIFT_TYPE_LABELS[s.shiftType]}</td>
                        <td>{new Date(s.validFrom).toLocaleDateString('vi-VN')}</td>
                        <td>{s.validTo ? new Date(s.validTo).toLocaleDateString('vi-VN') : '—'}</td>
                        <td className="text-center">{s.isPaidShift ? 'Có' : 'Không'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateWorkingScheduleModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  );
}

function CreateWorkingScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dentists, defaultDentistId } = useSchedulableDentists();
  const createSchedule = useCreateWorkingSchedule();

  const [dentistId, setDentistId] = useState(defaultDentistId);
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState('');
  const [shiftType, setShiftType] = useState<ShiftType>('FULL_DAY');
  const [isPaidShift, setIsPaidShift] = useState(true);

  const isTimeRangeValid = !startTime || !endTime || startTime < endTime;

  const resetForm = () => {
    setDentistId(defaultDentistId);
    setDayOfWeek('1');
    setStartTime('08:00');
    setEndTime('17:00');
    setValidFrom(new Date().toISOString().slice(0, 10));
    setValidTo('');
    setShiftType('FULL_DAY');
    setIsPaidShift(true);
  };

  const handleSubmit = async () => {
    try {
      await createSchedule.mutateAsync({
        dentistId,
        dayOfWeek: Number(dayOfWeek),
        startTime,
        endTime,
        validFrom,
        validTo: validTo || undefined,
        shiftType,
        isPaidShift,
      });
      notify.success('Đã thêm lịch làm việc');
      resetForm();
      onClose();
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể thêm lịch làm việc'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title="Thêm lịch làm việc cố định"
      size="sm"
    >
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
          label="Thứ trong tuần"
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(e.target.value)}
          options={DAY_LABELS.map((label, i) => ({ value: String(i), label }))}
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

        <Select
          label="Loại ca"
          value={shiftType}
          onChange={(e) => setShiftType(e.target.value as ShiftType)}
          options={(Object.keys(SHIFT_TYPE_LABELS) as ShiftType[]).map((v) => ({
            value: v,
            label: SHIFT_TYPE_LABELS[v],
          }))}
        />

        <Checkbox checked={isPaidShift} onChange={setIsPaidShift} label="Ca có lương" />

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createSchedule.isPending}
            disabled={!dentistId || !startTime || !endTime || !validFrom || !isTimeRangeValid}
          >
            Thêm
          </Button>
        </div>
      </div>
    </Modal>
  );
}
