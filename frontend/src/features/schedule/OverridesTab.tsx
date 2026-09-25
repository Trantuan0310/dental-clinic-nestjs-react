import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarX2, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, DatePicker, EmptyState, Input, Modal, Select, Textarea } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { useCreateScheduleOverride, useDeleteScheduleOverride, useScheduleOverrides } from './scheduleApi';
import { AffectedAppointmentsModal } from './AffectedAppointmentsModal';
import type { ScheduleOverrideKind, TimeOffAffectedAppointment } from '@/types/schedule';

/**
 * Per-day exceptions to the weekly schedule (BR-SCH-003/004): close a whole
 * day or a range, or change one day's hours. Extra hours are registered as
 * shifts instead (ADR-0009 D3). Front desk/admin only.
 */
export function OverridesTab() {
  const [dentistFilter, setDentistFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [affected, setAffected] = useState<TimeOffAffectedAppointment[] | null>(null);
  const { data: dentists = [] } = useDentistOptions();
  const { data: overrides = [], isLoading } = useScheduleOverrides(dentistFilter || undefined);
  const remove = useDeleteScheduleOverride();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isStaff = hasPermission('schedule.write') && hasPermission('appointment.read.any');

  const nameById = useMemo(() => new Map(dentists.map((d) => [d.id, d.fullName])), [dentists]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          aria-label="Lọc theo bác sĩ"
          value={dentistFilter}
          onChange={(e) => setDentistFilter(e.target.value)}
          options={[
            { value: '', label: 'Tất cả bác sĩ' },
            ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
          ]}
        />
        {isStaff && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Thêm ngoại lệ
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : overrides.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarX2 className="h-10 w-10 text-gray-400" />}
            title="Không có ngoại lệ sắp tới"
            description="Đóng lịch một ngày (hoặc một khoảng giờ) hay đổi giờ làm của riêng một ngày."
          />
        </Card>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Bác sĩ</th>
                  <th>Loại</th>
                  <th>Giờ</th>
                  <th>Lý do</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap">{formatDate(o.date)}</td>
                    <td className="font-medium text-gray-900">{nameById.get(o.dentistId) ?? '—'}</td>
                    <td>
                      <Badge variant={o.kind === 'CLOSED' ? 'danger' : 'info'}>
                        {o.kind === 'CLOSED' ? 'Đóng lịch' : 'Đổi giờ làm'}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap">
                      {o.startTime ? `${o.startTime}–${o.endTime}` : 'Cả ngày'}
                    </td>
                    <td className="text-gray-500">{o.reason}</td>
                    <td className="text-right">
                      {isStaff && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Xóa ngoại lệ ngày ${formatDate(o.date)}`}
                          onClick={() =>
                            remove.mutate(o.id, {
                              onSuccess: () => notify.success('Đã xóa ngoại lệ; lịch trở lại như tuần'),
                              onError: (e) => notify.error(getApiErrorMessage(e, 'Không xóa được')),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
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

      <CreateOverrideModal
        open={creating}
        onClose={() => setCreating(false)}
        onAffected={(list) => setAffected(list)}
      />
      <AffectedAppointmentsModal
        open={affected !== null}
        appointments={affected ?? []}
        onClose={() => setAffected(null)}
      />
    </div>
  );
}

function CreateOverrideModal({
  open,
  onClose,
  onAffected,
}: {
  open: boolean;
  onClose: () => void;
  onAffected: (list: TimeOffAffectedAppointment[]) => void;
}) {
  const { data: dentists = [] } = useDentistOptions();
  const create = useCreateScheduleOverride();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [form, setForm] = useState({
    dentistId: '',
    date: today,
    kind: 'CLOSED' as ScheduleOverrideKind,
    wholeDay: true,
    startTime: '08:00',
    endTime: '12:00',
    reason: '',
  });
  const withTimes = form.kind === 'CHANGED_HOURS' || !form.wholeDay;

  return (
    <Modal open={open} onClose={onClose} title="Thêm ngoại lệ lịch làm việc" size="sm">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(
            {
              dentistId: form.dentistId,
              date: form.date,
              kind: form.kind,
              ...(withTimes ? { startTime: form.startTime, endTime: form.endTime } : {}),
              reason: form.reason.trim(),
            },
            {
              onSuccess: (result) => {
                notify.success('Đã lưu ngoại lệ lịch làm việc');
                onClose();
                if (result.affectedAppointments.length > 0) onAffected(result.affectedAppointments);
              },
              onError: (err) => notify.error(getApiErrorMessage(err, 'Không lưu được ngoại lệ')),
            },
          );
        }}
      >
        <Select
          label="Bác sĩ"
          required
          value={form.dentistId}
          onChange={(e) => setForm({ ...form, dentistId: e.target.value })}
          placeholder="-- Chọn bác sĩ --"
          options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
        />
        <DatePicker
          label="Ngày"
          required
          min={today}
          value={form.date}
          onChange={(value) => setForm({ ...form, date: value })}
        />
        <Select
          label="Loại"
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value as ScheduleOverrideKind })}
          options={[
            { value: 'CLOSED', label: 'Đóng lịch (không nhận hẹn)' },
            { value: 'CHANGED_HOURS', label: 'Đổi giờ làm trong ngày' },
          ]}
        />
        {form.kind === 'CLOSED' && (
          <Select
            label="Phạm vi"
            value={form.wholeDay ? 'day' : 'range'}
            onChange={(e) => setForm({ ...form, wholeDay: e.target.value === 'day' })}
            options={[
              { value: 'day', label: 'Cả ngày' },
              { value: 'range', label: 'Một khoảng giờ' },
            ]}
          />
        )}
        {withTimes && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={form.kind === 'CHANGED_HOURS' ? 'Làm từ' : 'Đóng từ'}
              type="time"
              required
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
            <Input
              label="Đến"
              type="time"
              required
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              error={form.endTime <= form.startTime ? 'Phải sau giờ bắt đầu' : undefined}
            />
          </div>
        )}
        <Textarea
          label="Lý do"
          required
          minLength={3}
          rows={2}
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          placeholder="VD: Bảo trì ghế nha, họp chuyên môn"
        />
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="submit"
            isLoading={create.isPending}
            disabled={!form.dentistId || (withTimes && form.endTime <= form.startTime)}
          >
            Lưu
          </Button>
        </div>
      </form>
    </Modal>
  );
}
