import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ListOrdered, RefreshCw, Users } from 'lucide-react';
import { Button, Card, DatePicker, EmptyState, Modal, Select, Textarea } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Loading';
import { PermissionGuard } from '@/components/PermissionGuard';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { clinicParts, clinicToday } from '@/lib/clinicTime';
import { formatDate } from '@/lib/format';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { appointmentsApi } from '@/features/appointments/imperativeApi';
import { QueueList } from './QueueList';
import { type QueueEntry, type ReassignDayResult, useQueue, useReassignDay } from './dispatchApi';

/**
 * Front-desk dispatch board (ADR-0009 phase 6): today's pre-exam queue of
 * every dentist, in dispatch order — emergency first, then by the time each
 * patient is due (BR-DSP-001).
 */
export default function DispatchPage() {
  const [dentistFilter, setDentistFilter] = useState('');
  const [reassignOpen, setReassignOpen] = useState(false);
  // 'schedule': a dentist suspended or on leave still has a queue to hand over (A3-22).
  const { data: dentists = [] } = useDentistOptions('schedule');
  const today = clinicToday();
  // A3-16: exams left open on an earlier day — the visit has no invoice yet.
  const { data: running } = useQuery({
    queryKey: ['appointments', 'dispatch', 'in-progress', today],
    queryFn: () => appointmentsApi.list({ status: ['in_progress'], to: today, pageSize: 50 }),
    refetchInterval: 60_000,
  });
  const unfinished = (running?.data ?? []).filter((apt) => clinicParts(apt.startsAt).date < today);
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

      {unfinished.length > 0 && (
        <Card>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-rose-700">
            <AlertTriangle className="h-4 w-4" />
            Ca khám chưa kết thúc từ ngày trước ({unfinished.length})
          </h2>
          <p className="mb-2 text-xs text-gray-500">
            Bác sĩ chưa bấm kết thúc nên chưa có hóa đơn cho bệnh nhân. Hãy nhắc bác sĩ kết thúc (hoặc hủy) phiên khám.
          </p>
          <ul className="space-y-1 text-sm" aria-label="Ca khám chưa kết thúc">
            {unfinished.map((apt) => (
              <li key={apt.id} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1">
                <span className="font-medium text-gray-900">{apt.patientName}</span>
                <span className="ml-2 text-xs text-gray-600">
                  {formatDate(apt.startsAt, 'dd/MM/yyyy')} · {apt.dentistName}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
 * BR-DSP-006: move a dentist's day on a date to a substitute: bookings not
 * checked in yet (same time) and patients already waiting (to the
 * substitute's queue). The result lists what moved and what the substitute
 * could not take (and why) — those stay with the original dentist.
 */
function ReassignDayModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = clinicToday();
  // The absent dentist may already be suspended or on leave (A3-22).
  const { data: absentOptions = [] } = useDentistOptions('schedule');
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
      notify.success(`Đã chuyển ${r.moved.length + (r.transferred?.length ?? 0)} lượt`);
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
      description="Chuyển các lịch hẹn chưa đến (giữ nguyên giờ, thời lượng theo bác sĩ thay) và bệnh nhân đang chờ của một bác sĩ trong ngày sang bác sĩ khác. Muốn khóa lịch của bác sĩ vắng, hãy tạo ngày nghỉ/đóng lịch riêng."
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
            Đã chuyển <strong>{result.moved.length}</strong> lịch hẹn
            {(result.transferred?.length ?? 0) > 0 && (
              <>
                {' '}và <strong>{result.transferred?.length}</strong> bệnh nhân đang chờ sang hàng chờ bác sĩ thay
              </>
            )}
            .
            {result.failed.length > 0 && (
              <>
                {' '}
                <strong>{result.failed.length}</strong> lượt không chuyển được, vẫn giữ ở bác sĩ cũ — hãy liên hệ
                bệnh nhân hoặc chuyển từng người:
              </>
            )}
          </p>
          {result.failed.length > 0 && (
            <ul className="space-y-1" aria-label="Lịch hẹn không chuyển được">
              {result.failed.map((f) => (
                <li key={f.appointmentId} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">
                  {clinicParts(f.startAt).time} · {f.patientName}
                  {f.checkedIn && <span className="text-gray-600"> (đang chờ)</span>} —{' '}
                  <span className="text-amber-800">{f.reason}</span>
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
            options={absentOptions.map((d) => ({ value: d.id, label: d.fullName }))}
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
