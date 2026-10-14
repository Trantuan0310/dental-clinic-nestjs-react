import { useMemo, useState } from 'react';
import { CalendarX2, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DatePicker,
  EmptyState,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { clinicToday } from '@/lib/clinicTime';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import { useAvailability, useDentistOptions } from '@/features/appointments/appointmentApi';
import { useCreateScheduleOverride, useDeleteScheduleOverride, useScheduleOverrides } from './scheduleApi';
import { AffectedAppointmentsModal } from './AffectedAppointmentsModal';
import { TimeBlocksEditor } from './TimeBlocksEditor';
import { blockError, defaultBlocks } from './scheduleBlocks';
import { hasImpact } from './format';
import type {
  ScheduleChangeImpact,
  ScheduleOverride,
  ScheduleOverrideKind,
  TimeBlock,
} from '@/types/schedule';
import { useTranslation } from 'react-i18next';

/**
 * Per-day exceptions to the weekly schedule (BR-SCH-003/004): close a whole
 * day or a range, or change one day's hours (one or more blocks, so a lunch
 * break can be kept). Extra hours are registered as shifts instead
 * (ADR-0009 D3). Clinic management only.
 */
export function OverridesTab() {
  const { t } = useTranslation();
  const [dentistFilter, setDentistFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [affected, setAffected] = useState<ScheduleChangeImpact | null>(null);
  const [deleting, setDeleting] = useState<(ScheduleOverride & { times: string[] }) | null>(null);
  const { data: dentists = [] } = useDentistOptions();
  const { data: overrides = [], isLoading } = useScheduleOverrides(dentistFilter || undefined);
  const remove = useDeleteScheduleOverride();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isStaff = hasPermission('schedule.write') && hasPermission('appointment.read.any');

  const nameById = useMemo(() => new Map(dentists.map((d) => [d.id, d.fullName])), [dentists]);
  // The blocks of one changed-hours day replace the weekly hours together:
  // one row, and deleting it removes every block (the API deletes the group).
  const rows = useMemo(() => {
    const out: Array<ScheduleOverride & { times: string[] }> = [];
    const changedDay = new Map<string, ScheduleOverride & { times: string[] }>();
    for (const o of overrides) {
      const time = o.startTime ? `${o.startTime}–${o.endTime}` : t('uiScheduling.allDay');
      const key = `${o.dentistId}|${o.date}`;
      const group = o.kind === 'CHANGED_HOURS' ? changedDay.get(key) : undefined;
      if (group) {
        group.times.push(time);
        continue;
      }
      const row = { ...o, times: [time] };
      if (o.kind === 'CHANGED_HOURS') changedDay.set(key, row);
      out.push(row);
    }
    return out;
  }, [overrides, t]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          aria-label={t('uiScheduling.filterByDentist')}
          value={dentistFilter}
          onChange={(e) => setDentistFilter(e.target.value)}
          options={[
            { value: '', label: t('uiScheduling.allDentists') },
            ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
          ]}
        />
        {isStaff && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> {t('uiScheduling.addOverride')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : overrides.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarX2 className="h-10 w-10 text-gray-400 dark:text-surface-500" />}
            title={t('uiScheduling.noUpcomingOverrides')}
            description={t('uiScheduling.noUpcomingOverridesHint')}
          />
        </Card>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('uiScheduling.date')}</th>
                  <th>{t('uiScheduling.dentist')}</th>
                  <th>{t('uiScheduling.type')}</th>
                  <th>{t('uiScheduling.hours')}</th>
                  <th>{t('uiScheduling.reason')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap">{formatDate(o.date)}</td>
                    <td className="font-medium text-gray-900 dark:text-surface-100">{nameById.get(o.dentistId) ?? '—'}</td>
                    <td>
                      <Badge variant={o.kind === 'CLOSED' ? 'danger' : 'info'}>
                        {o.kind === 'CLOSED' ? t('uiScheduling.closed') : t('uiScheduling.changedHours')}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap">{o.times.join(', ')}</td>
                    <td className="text-gray-500 dark:text-surface-400">{o.reason}</td>
                    <td className="text-right">
                      {isStaff && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t('uiScheduling.deleteOverrideOn', { date: formatDate(o.date) })}
                          onClick={() => setDeleting(o)}
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

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('uiScheduling.deleteOverrideTitle')}
        description={
          deleting
            ? t('uiScheduling.deleteOverrideConfirm', { kind: deleting.kind === 'CLOSED' ? t('uiScheduling.closed').toLowerCase() : t('uiScheduling.changedHours').toLowerCase(), date: formatDate(deleting.date), times: deleting.times.join(', '), dentist: nameById.get(deleting.dentistId) ?? t('uiScheduling.dentist') })
            : undefined
        }
        confirmText={t('uiScheduling.delete')}
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: (result) => {
              setDeleting(null);
              notify.success(t('uiScheduling.overrideDeletedToast'));
              if (hasImpact(result)) setAffected(result);
            },
            onError: (e) => notify.error(getApiErrorMessage(e, t('uiScheduling.deleteError'))),
          });
        }}
      />
      <CreateOverrideModal
        open={creating}
        onClose={() => setCreating(false)}
        onAffected={(impact) => setAffected(impact)}
      />
      <AffectedAppointmentsModal
        open={affected !== null}
        appointments={affected?.affectedAppointments ?? []}
        bookingRequests={affected?.affectedBookingRequests ?? []}
        waitingPatients={affected?.waitingPatients ?? []}
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
  onAffected: (impact: ScheduleChangeImpact) => void;
}) {
  const { t } = useTranslation();
  const { data: dentists = [] } = useDentistOptions();
  const create = useCreateScheduleOverride();
  // The clinic's date, whatever zone the workstation is set to (A1-14).
  const today = clinicToday();
  const [form, setForm] = useState({
    dentistId: '',
    date: today,
    kind: 'CLOSED' as ScheduleOverrideKind,
    wholeDay: true,
    startTime: '08:00',
    endTime: '12:00',
    reason: '',
  });
  const [ranges, setRanges] = useState<TimeBlock[]>(defaultBlocks);
  const changed = form.kind === 'CHANGED_HOURS';
  // A1-29: start from the dentist's own hours that day, not the clinic's.
  const { data: dayAvailability } = useAvailability(
    changed && form.dentistId ? form.dentistId : undefined,
    changed ? form.date : undefined,
  );
  const currentWindows = dayAvailability?.windows ?? [];
  const withTimes = !changed && !form.wholeDay;
  const rangeError = changed ? blockError(ranges) : null;

  return (
    <Modal open={open} onClose={onClose} title={t('uiScheduling.addOverrideTitle')} size="sm">
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
              ...(changed ? { ranges } : {}),
              reason: form.reason.trim(),
            },
            {
              onSuccess: (result) => {
                notify.success(t('uiScheduling.overrideSavedToast'));
                onClose();
                if (hasImpact(result)) onAffected(result);
              },
              onError: (err) => notify.error(getApiErrorMessage(err, t('uiScheduling.saveOverrideError'))),
            },
          );
        }}
      >
        <Select
          label={t('uiScheduling.dentist')}
          required
          value={form.dentistId}
          onChange={(e) => setForm({ ...form, dentistId: e.target.value })}
          placeholder={t('uiScheduling.selectDentist')}
          options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
        />
        <DatePicker
          label={t('uiScheduling.date')}
          required
          min={today}
          value={form.date}
          onChange={(value) => setForm({ ...form, date: value })}
        />
        <Select
          label={t('uiScheduling.type')}
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value as ScheduleOverrideKind })}
          options={[
            { value: 'CLOSED', label: t('uiScheduling.closeScheduleNoAppointments') },
            { value: 'CHANGED_HOURS', label: t('uiScheduling.changeHoursForDay') },
          ]}
        />
        {form.kind === 'CLOSED' && (
          <Select
            label={t('uiScheduling.scope')}
            value={form.wholeDay ? 'day' : 'range'}
            onChange={(e) => setForm({ ...form, wholeDay: e.target.value === 'day' })}
            options={[
              { value: 'day', label: t('uiScheduling.allDay') },
              { value: 'range', label: t('uiScheduling.timeRange') },
            ]}
          />
        )}
        {changed && (
          <div className="space-y-2">
            <Alert variant="info">
              {t('uiScheduling.changedHoursHint')}
            </Alert>
            {currentWindows.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setRanges(currentWindows.map((w) => ({ startTime: w.startTime, endTime: w.endTime })))}
              >
                {t('uiScheduling.useCurrentHours', { hours: currentWindows.map((w) => `${w.startTime}–${w.endTime}`).join(', ') })}
              </Button>
            )}
            <TimeBlocksEditor blocks={ranges} onChange={setRanges} startLabel={t('uiScheduling.workFrom')} />
            {rangeError && <p className="text-xs text-red-600 dark:text-red-400">{rangeError}</p>}
          </div>
        )}
        {withTimes && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label={t('uiScheduling.closedFrom')}
              type="time"
              required
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
            <Input
              label={t('uiScheduling.to')}
              type="time"
              required
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              error={form.endTime <= form.startTime ? t('uiScheduling.endAfterStartError') : undefined}
            />
          </div>
        )}
        <Textarea
          label={t('uiScheduling.reason')}
          required
          minLength={3}
          rows={2}
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          placeholder={t('uiScheduling.overrideReasonExample')}
        />
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-surface-700">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('uiScheduling.cancel')}
          </Button>
          <Button
            type="submit"
            isLoading={create.isPending}
            disabled={!form.dentistId || (withTimes && form.endTime <= form.startTime) || Boolean(rangeError)}
          >
            {t('uiScheduling.saveChanges')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
