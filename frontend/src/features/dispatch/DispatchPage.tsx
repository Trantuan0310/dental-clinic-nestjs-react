import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
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
import {
  type QueueEntry,
  type ReassignDayResult,
  useQueue,
  useReassignDay,
  useUndoReassignDay,
} from './dispatchApi';

/**
 * Front-desk dispatch board (ADR-0009 phase 6): today's pre-exam queue of
 * every dentist, in dispatch order — emergency first, then by the time each
 * patient is due (BR-DSP-001).
 */
export default function DispatchPage() {
  const { t } = useTranslation();
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
        title={t('uiCommon.breadcrumbRoutes.dispatch')}
        description={t('uiOperations.dispatchDescription')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              leftIcon={<RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />}
              onClick={() => void refetch()}
            >
              {t('uiEntry.dashboard.refresh')}
            </Button>
            <PermissionGuard permission="queue.manage">
              <Button leftIcon={<Users className="h-4 w-4" />} onClick={() => setReassignOpen(true)}>
                {t('uiOperations.dispatchReassignDay')}
              </Button>
            </PermissionGuard>
          </div>
        }
      />

      {unfinished.length > 0 && (
        <Card>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-rose-700">
            <AlertTriangle className="h-4 w-4" />
            {t('uiOperations.dispatchUnfinishedTitle', { count: unfinished.length })}
          </h2>
          <p className="mb-2 text-xs text-gray-500">
            {t('uiOperations.dispatchUnfinishedHint')}
          </p>
          <ul className="space-y-1 text-sm" aria-label={t('uiOperations.dispatchUnfinishedList')}>
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
        aria-label={t('uiScheduling.filterByDentist')}
        value={dentistFilter}
        onChange={(e) => setDentistFilter(e.target.value)}
        options={[
          { value: '', label: t('uiScheduling.allDentists') },
          ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
        ]}
      />

      {isLoading ? (
        <PageLoader />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListOrdered className="h-10 w-10 text-gray-400" />}
            title={t('uiOperations.dispatchEmptyTitle')}
            description={t('uiOperations.dispatchEmptyDescription')}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(([dentistId, g]) => (
            <Card key={dentistId}>
              <section aria-label={t('uiOperations.dispatchQueueOf', { name: g.name })}>
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: g.color ?? '#9CA3AF' }}
                    aria-hidden
                  />
                  {g.name}
                  <span className="text-sm font-normal text-gray-500">
                    ·{' '}
                    {t('uiOperations.dispatchWaitingCount', {
                      count: g.entries.filter((e) => e.status === 'WAITING').length,
                    })}
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
  const { t } = useTranslation();
  const today = clinicToday();
  // The absent dentist may already be suspended or on leave (A3-22).
  const { data: absentOptions = [] } = useDentistOptions('schedule');
  const { data: dentists = [] } = useDentistOptions();
  const reassign = useReassignDay();
  const undo = useUndoReassignDay();
  const [form, setForm] = useState({ from: '', to: '', date: today, reason: '', closeDay: true });
  const [result, setResult] = useState<ReassignDayResult | null>(null);
  const [undone, setUndone] = useState(false);

  const close = () => {
    setResult(null);
    setUndone(false);
    setForm({ from: '', to: '', date: today, reason: '', closeDay: true });
    onClose();
  };

  const submit = async () => {
    try {
      const r = await reassign.mutateAsync({
        fromDentistId: form.from,
        toDentistId: form.to,
        date: form.date,
        reason: form.reason.trim(),
        closeFromDentist: form.closeDay,
      });
      setResult(r);
      notify.success(t('uiOperations.dispatchMovedCount', { count: r.moved.length + (r.transferred?.length ?? 0) }));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiOperations.dispatchReassignFailed')));
    }
  };

  const revert = async () => {
    try {
      const r = await undo.mutateAsync({
        fromDentistId: form.from,
        toDentistId: form.to,
        date: form.date,
        reason: `Hoàn tác thay bác sĩ: ${form.reason.trim()}`,
      });
      setUndone(true);
      notify.success(
        t(r.reopened ? 'uiOperations.dispatchUndoReturnedReopened' : 'uiOperations.dispatchUndoReturned', {
          count: r.moved.length,
        }) + (r.failed.length ? ` — ${t('uiOperations.dispatchUndoNotReturned', { count: r.failed.length })}` : ''),
      );
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiOperations.dispatchUndoFailed')));
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={t('uiOperations.dispatchReassignDay')}
      description={t('uiOperations.dispatchReassignDescription')}
      footer={
        result ? (
          <>
            {!undone && (
              <Button variant="outline" onClick={() => void revert()} isLoading={undo.isPending}>
                {t('uiOperations.dispatchUndoReassign')}
              </Button>
            )}
            <Button onClick={close}>{t('uiCommon.action.close')}</Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={close} disabled={reassign.isPending}>
              {t('uiCommon.dialog.cancel')}
            </Button>
            <Button
              onClick={() => void submit()}
              isLoading={reassign.isPending}
              disabled={!form.from || !form.to || form.from === form.to || form.reason.trim().length < 5}
            >
              {t('uiOperations.dispatchMoveAppointments')}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 text-sm">
          <p>
            <Trans
              i18nKey="uiOperations.dispatchResultMoved"
              values={{ count: result.moved.length }}
              components={{ b: <strong /> }}
            />
            {(result.transferred?.length ?? 0) > 0 && (
              <>
                {' '}
                <Trans
                  i18nKey="uiOperations.dispatchResultTransferred"
                  values={{ count: result.transferred?.length ?? 0 }}
                  components={{ b: <strong /> }}
                />
              </>
            )}
            .
            {result.failed.length > 0 && (
              <>
                {' '}
                <Trans
                  i18nKey="uiOperations.dispatchResultFailed"
                  values={{ count: result.failed.length }}
                  components={{ b: <strong /> }}
                />
              </>
            )}
          </p>
          {result.failed.length > 0 && (
            <ul className="space-y-1" aria-label={t('uiOperations.dispatchFailedList')}>
              {result.failed.map((f) => (
                <li key={f.appointmentId} className="rounded border border-amber-200 bg-amber-50 px-2 py-1">
                  {clinicParts(f.startAt).time} · {f.patientName}
                  {f.checkedIn && <span className="text-gray-600"> {t('uiOperations.dispatchStillWaiting')}</span>} —{' '}
                  <span className="text-amber-800">{f.reason}</span>
                </li>
              ))}
            </ul>
          )}
          {result.failed.length > 0 && (
            <p className="text-gray-600">{t('uiOperations.dispatchFailedHint')}</p>
          )}
          {result.warning && (
            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">{result.warning}</p>
          )}
          {result.closedOverrideId && (
            <p className="text-gray-600">{t('uiOperations.dispatchDayClosed')}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Select
            label={t('uiOperations.dispatchAbsentDentist')}
            value={form.from}
            onChange={(e) => setForm({ ...form, from: e.target.value })}
            placeholder={t('uiScheduling.chooseDentist')}
            options={absentOptions.map((d) => ({ value: d.id, label: d.fullName }))}
          />
          <Select
            label={t('uiOperations.dispatchSubstituteDentist')}
            value={form.to}
            onChange={(e) => setForm({ ...form, to: e.target.value })}
            placeholder={t('uiScheduling.chooseDentist')}
            options={dentists.filter((d) => d.id !== form.from).map((d) => ({ value: d.id, label: d.fullName }))}
          />
          <DatePicker label={t('uiOperations.date')} min={today} value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          <Textarea
            label={t('uiOperations.dispatchReasonMin', { count: 5 })}
            rows={2}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder={t('uiOperations.dispatchReasonExample')}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.closeDay}
              onChange={(e) => setForm({ ...form, closeDay: e.target.checked })}
            />
            <span>{t('uiOperations.dispatchCloseDay')}</span>
          </label>
        </div>
      )}
    </Modal>
  );
}
