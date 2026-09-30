import { useState } from 'react';
import { CalendarOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Card, ConfirmDialog, DatePicker, EmptyState, Modal, Textarea } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { clinicToday } from '@/lib/clinicTime';
import { useAuthStore } from '@/stores/authStore';
import { useClinicClosures, useDeleteClinicClosure, useSaveClinicClosure } from './scheduleApi';
import { AffectedAppointmentsModal } from './AffectedAppointmentsModal';
import { hasImpact } from './format';
import type { ClinicClosure, ScheduleChangeImpact } from '@/types/schedule';

const viDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');

/**
 * Days the whole clinic is closed (Tết, public holidays): no dentist can be
 * booked, whatever their weekly schedule. Bookings already on those days are
 * listed for the front desk — never cancelled automatically.
 */
export function ClinicClosuresTab() {
  const { data: closures = [], isLoading } = useClinicClosures();
  const canManage = useAuthStore((s) => s.hasPermission('clinic_closure.manage'));
  const remove = useDeleteClinicClosure();
  const [editing, setEditing] = useState<ClinicClosure | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ClinicClosure | null>(null);
  const [impact, setImpact] = useState<ScheduleChangeImpact | null>(null);
  const today = clinicToday();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Trong những ngày này phòng khám đóng cửa với mọi bác sĩ; không nhận đặt lịch (kể cả đặt online).
        </p>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Thêm ngày nghỉ
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : closures.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarOff className="h-10 w-10 text-gray-400" />}
            title="Chưa có ngày nghỉ sắp tới"
            description="Thêm các ngày phòng khám nghỉ (Tết, lễ) để hệ thống không nhận lịch hẹn vào những ngày đó."
          />
        </Card>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Từ ngày</th>
                  <th>Đến ngày</th>
                  <th>Lý do</th>
                  <th>Người tạo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {closures.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap font-medium text-gray-900">{viDate(c.startDate)}</td>
                    <td className="whitespace-nowrap">{viDate(c.endDate)}</td>
                    <td>{c.reason}</td>
                    <td className="text-gray-500">{c.createdByName ?? '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" aria-label={`Sửa ngày nghỉ ${viDate(c.startDate)}`} onClick={() => setEditing(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label={`Xóa ngày nghỉ ${viDate(c.startDate)}`} onClick={() => setDeleting(c)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <ClosureModal
          closure={editing === 'new' ? null : editing}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={(result) => {
            setEditing(null);
            if (hasImpact(result)) setImpact(result);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Xóa ngày nghỉ phòng khám"
        description={
          deleting
            ? `Mở lại lịch ${viDate(deleting.startDate)}–${viDate(deleting.endDate)} (${deleting.reason})? Các bác sĩ sẽ nhận lịch hẹn theo lịch làm việc như bình thường.`
            : undefined
        }
        confirmText="Xóa"
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              notify.success('Đã xóa ngày nghỉ; lịch làm việc trở lại bình thường');
            },
            onError: (err) => notify.error(getApiErrorMessage(err, 'Không xóa được ngày nghỉ')),
          });
        }}
      />
      <AffectedAppointmentsModal
        open={impact !== null}
        title="Lịch hẹn rơi vào ngày nghỉ"
        appointments={impact?.affectedAppointments ?? []}
        bookingRequests={impact?.affectedBookingRequests ?? []}
        onClose={() => setImpact(null)}
      />
    </div>
  );
}

function ClosureModal({
  closure,
  today,
  onClose,
  onSaved,
}: {
  closure: ClinicClosure | null;
  today: string;
  onClose: () => void;
  onSaved: (result: ScheduleChangeImpact) => void;
}) {
  const save = useSaveClinicClosure();
  // A closure already running keeps its first day.
  const started = closure !== null && closure.startDate <= today;
  const [startDate, setStartDate] = useState(closure?.startDate ?? today);
  const [endDate, setEndDate] = useState(closure?.endDate ?? today);
  const [reason, setReason] = useState(closure?.reason ?? '');

  return (
    <Modal open onClose={onClose} title={closure ? 'Sửa ngày nghỉ phòng khám' : 'Thêm ngày nghỉ phòng khám'} size="sm">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            { id: closure?.id, startDate, endDate, reason: reason.trim() },
            {
              onSuccess: (result) => {
                notify.success('Đã lưu ngày nghỉ phòng khám');
                onSaved(result);
              },
              onError: (err) => notify.error(getApiErrorMessage(err, 'Không lưu được ngày nghỉ')),
            },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <DatePicker
            label="Từ ngày"
            required
            min={started ? undefined : today}
            disabled={started}
            value={startDate}
            onChange={(value) => {
              setStartDate(value);
              if (endDate < value) setEndDate(value);
            }}
          />
          <DatePicker
            label="Đến ngày (tính cả ngày này)"
            required
            min={startDate}
            value={endDate}
            onChange={(value) => setEndDate(value)}
            error={endDate < startDate ? 'Phải từ ngày bắt đầu trở đi' : undefined}
          />
        </div>
        <Textarea
          label="Lý do"
          required
          minLength={3}
          maxLength={500}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="VD: Nghỉ Tết Nguyên đán, Giỗ Tổ Hùng Vương"
        />
        <Alert variant="info">
          Lịch hẹn đã có trong những ngày này không bị hủy tự động — hệ thống sẽ liệt kê để lễ tân liên hệ bệnh nhân
          đổi lịch.
        </Alert>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="submit"
            isLoading={save.isPending}
            disabled={!startDate || !endDate || endDate < startDate || reason.trim().length < 3}
          >
            Lưu
          </Button>
        </div>
      </form>
    </Modal>
  );
}
