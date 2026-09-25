import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ListOrdered, RefreshCw, Users } from 'lucide-react';
import { Button, Card, DatePicker, EmptyState, Modal, Select, Textarea } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Loading';
import { PermissionGuard } from '@/components/PermissionGuard';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatTimeOnly } from '@/lib/format';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { QueueList } from './QueueList';
import { type QueueEntry, type ReassignDayResult, useQueue, useReassignDay } from './dispatchApi';

/**
 * Front-desk dispatch board (ADR-0009 phase 6): today's pre-exam queue of
 * every dentist, in dispatch order — emergency, on time, late, walk-in,
 * then check-in time (BR-DSP-001).
 */
export default function DispatchPage() {
  const [dentistFilter, setDentistFilter] = useState('');
  const [reassignOpen, setReassignOpen] = useState(false);
  const { data: dentists = [] } = useDentistOptions();
  const { data: entries = [], isLoading, refetch, isFetching } = useQueue({
    dentistId: dentistFilter || undefined,
  });

  const groups = useMemo(() => {
    const byDentist = new Map<string, { name: string; color: string | null; entries: QueueEntry[] }>();
    for (const e of entries) {
      const g = byDentist.get(e.dentistId) ?? { name: e.dentistName, color: e.calendarColor, entries: [] };
      g.entries.push(e);
      byDentist.set(e.dentistId, g);
    }
    return [...byDentist.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'vi'));
  }, [entries]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Điều phối"
        description="Hàng đợi trước khi khám của từng bác sĩ hôm nay: gọi, bỏ qua, ưu tiên cấp cứu, chuyển bác sĩ."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              leftIcon={<RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />}
              onClick={() => void refetch()}
            >
              Làm mới
            </Button>
            <PermissionGuard permission="queue.manage">
              <Button leftIcon={<Users className="h-4 w-4" />} onClick={() => setReassignOpen(true)}>
                Thay bác sĩ cả ngày
              </Button>
            </PermissionGuard>
          </div>
        }
      />

      <Select
        aria-label="Lọc theo bác sĩ"
        value={dentistFilter}
        onChange={(e) => setDentistFilter(e.target.value)}
        options={[
          { value: '', label: 'Tất cả bác sĩ' },
          ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
        ]}
      />

      {isLoading ? (
        <PageLoader />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListOrdered className="h-10 w-10 text-gray-400" />}
            title="Không có bệnh nhân đang chờ"
            description="Bệnh nhân xuất hiện ở đây khi được check-in hoặc tiếp nhận vãng lai."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(([dentistId, g]) => (
            <Card key={dentistId}>
              <section aria-label={`Hàng đợi ${g.name}`}>
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: g.color ?? '#9CA3AF' }}
                    aria-hidden
                  />
                  {g.name}
                  <span className="text-sm font-normal text-gray-500">
                    · {g.entries.filter((e) => e.status === 'WAITING').length} đang chờ
                  </span>
                </h2>
                <QueueList entries={g.entries} mode="desk" />
              </section>
            </Card>
          ))}
        </div>
      )}

      <ReassignDayModal open={reassignOpen} onClose={() => setReassignOpen(false)} />
    </div>
  );
}

/**
 * BR-DSP-006: move a dentist's not-yet-arrived bookings on a date to a
 * substitute. The result lists what moved and what the substitute could
 * not take (and why) — those stay with the original dentist.
 */
function ReassignDayModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: dentists = [] } = useDentistOptions();
  const reassign = useReassignDay();
  const [form, setForm] = useState({ from: '', to: '', date: today, reason: '' });
  const [result, setResult] = useState<ReassignDayResult | null>(null);

  const close = () => {
    setResult(null);
    setForm({ from: '', to: '', date: today, reason: '' });
    onClose();
  };

  const submit = async () => {
    try {
      const r = await reassign.mutateAsync({
        fromDentistId: form.from,
        toDentistId: form.to,
        date: form.date,
        reason: form.reason.trim(),
      });
      setResult(r);
      notify.success(`Đã chuyển ${r.moved.length} lịch hẹn`);
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thay được bác sĩ'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title="Thay bác sĩ cả ngày"
      description="Chuyển các lịch hẹn chưa đến của một bác sĩ trong ngày sang bác sĩ khác, giữ nguyên giờ."
      footer={
        result ? (
          <Button onClick={close}>Đóng</Button>
        ) : (
          <>
            <Button variant="outline" onClick={close} disabled={reassign.isPending}>
              Hủy
            </Button>
            <Button
              onClick={() => void submit()}
              isLoading={reassign.isPending}
              disabled={!form.from || !form.to || form.from === form.to || form.reason.trim().length < 5}
            >
              Chuyển lịch hẹn
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-sm">
          <p>
            Đã chuyển <strong>{result.moved.length}</strong> lịch hẹn.
            {result.failed.length > 0 && (
              <>
                {' '}
                <strong>{result.failed.length}</strong> lịch hẹn không chuyển được, vẫn giữ ở bác sĩ cũ:
              </>
            )}
          </p>
          {result.failed.length > 0 && (
            <ul className="space-y-1" aria-label="Lịch hẹn không chuyển được">
              {result.failed.map((f) => (
                <li key={f.appointmentId} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">
                  {formatTimeOnly(f.startAt)} · {f.patientName} — <span className="text-amber-800">{f.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Select
            label="Bác sĩ vắng"
            value={form.from}
            onChange={(e) => setForm({ ...form, from: e.target.value })}
            placeholder="Chọn bác sĩ"
            options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
          />
          <Select
            label="Bác sĩ thay"
            value={form.to}
            onChange={(e) => setForm({ ...form, to: e.target.value })}
            placeholder="Chọn bác sĩ"
            options={dentists.filter((d) => d.id !== form.from).map((d) => ({ value: d.id, label: d.fullName }))}
          />
          <DatePicker label="Ngày" min={today} value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          <Textarea
            label="Lý do (ít nhất 5 ký tự)"
            rows={2}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="VD: Bác sĩ nghỉ ốm đột xuất"
          />
        </div>
      )}
    </Modal>
  );
}
