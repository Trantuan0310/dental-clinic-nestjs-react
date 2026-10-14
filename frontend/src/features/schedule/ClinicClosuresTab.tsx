import { useState } from 'react';
import { CalendarOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Card, ConfirmDialog, DatePicker, EmptyState, Input, Modal, Textarea } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { clinicToday } from '@/lib/clinicTime';
import { useAuthStore } from '@/stores/authStore';
import { useClinicClosures, useDeleteClinicClosure, useSaveClinicClosure } from './scheduleApi';
import { AffectedAppointmentsModal } from './AffectedAppointmentsModal';
import { hasImpact } from './format';
import type { ClinicClosure, ClinicClosureResult } from '@/types/schedule';
import { useTranslation } from 'react-i18next';

const viDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');

/**
 * Days the whole clinic is closed (Tết, public holidays): no dentist can be
 * booked, whatever their weekly schedule. Bookings already on those days are
 * listed for the front desk — never cancelled automatically.
 */
export function ClinicClosuresTab() {
  const { t } = useTranslation();
  const { data: closures = [], isLoading } = useClinicClosures();
  const canManage = useAuthStore((s) => s.hasPermission('clinic_closure.manage'));
  const remove = useDeleteClinicClosure();
  const [editing, setEditing] = useState<ClinicClosure | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ClinicClosure | null>(null);
  const [impact, setImpact] = useState<ClinicClosureResult | null>(null);
  const today = clinicToday();
  // A1-23: a closure already begun is not erased — it ends yesterday.
  const begun = deleting !== null && deleting.startDate < today;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-surface-300">
          {t('uiScheduling.clinicClosureIntro')}
        </p>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> {t('uiScheduling.addClinicClosure')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : closures.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarOff className="h-10 w-10 text-gray-400 dark:text-surface-500" />}
            title={t('uiScheduling.noUpcomingClosures')}
            description={t('uiScheduling.noUpcomingClosuresHint')}
          />
        </Card>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('uiScheduling.startDate')}</th>
                  <th>{t('uiScheduling.endDate')}</th>
                  <th>{t('uiScheduling.reason')}</th>
                  <th>{t('uiScheduling.createdBy')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {closures.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap font-medium text-gray-900 dark:text-surface-100">
                      {viDate(c.startDate)}
                      {c.startTime && <span className="ml-1 text-xs text-gray-500 dark:text-surface-400">{t('uiScheduling.fromTime', { time: c.startTime })}</span>}
                    </td>
                    <td className="whitespace-nowrap">{viDate(c.endDate)}</td>
                    <td>{c.reason}</td>
                    <td className="text-gray-500 dark:text-surface-400">{c.createdByName ?? '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" aria-label={t('uiScheduling.editClosureOn', { date: viDate(c.startDate) })} onClick={() => setEditing(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label={t('uiScheduling.deleteClosureOn', { date: viDate(c.startDate) })} onClick={() => setDeleting(c)}>
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
            const leftovers = (result.waitingPatients?.length ?? 0) + (result.openEncounters?.length ?? 0);
            if (leftovers > 0 || hasImpact(result)) setImpact(result);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={begun ? t('uiScheduling.reopenClinicToday') : t('uiScheduling.deleteClinicClosure')}
        description={
          deleting
            ? begun
              ? t('uiScheduling.reopenClinicConfirm', { start: viDate(deleting.startDate), end: viDate(deleting.endDate), reason: deleting.reason })
              : t('uiScheduling.deleteClinicClosureConfirm', { start: viDate(deleting.startDate), end: viDate(deleting.endDate), reason: deleting.reason })
            : undefined
        }
        confirmText={begun ? t('uiScheduling.reopenFromToday') : t('uiScheduling.delete')}
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              notify.success(
                begun
                  ? t('uiScheduling.clinicReopenedToast')
                  : t('uiScheduling.closureDeletedToast'),
              );
            },
            onError: (err) => notify.error(getApiErrorMessage(err, t('uiScheduling.deleteClosureError'))),
          });
        }}
      />
      <AffectedAppointmentsModal
        open={impact !== null}
        title={t('uiScheduling.appointmentsOnClosure')}
        appointments={impact?.affectedAppointments ?? []}
        bookingRequests={impact?.affectedBookingRequests ?? []}
        waitingPatients={impact?.waitingPatients ?? []}
        onClose={() => setImpact(null)}
      />
      {impact && (impact.openEncounters?.length ?? 0) > 0 && (
        <Alert variant="warning" onClose={() => setImpact(null)}>
          {t('uiScheduling.openEncountersWarning', { count: impact.openEncounters!.length, encounters: impact.openEncounters!.map((e) => `${e.patientName ?? '—'} – ${e.dentistName ?? '—'}`).join('; ') })}
        </Alert>
      )}
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
  onSaved: (result: ClinicClosureResult) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveClinicClosure();
  // A closure already running keeps its first day.
  const started = closure !== null && closure.startDate <= today;
  const [startDate, setStartDate] = useState(closure?.startDate ?? today);
  const [endDate, setEndDate] = useState(closure?.endDate ?? today);
  const [reason, setReason] = useState(closure?.reason ?? '');
  // A1-15: closed from a time of day on the first day (power cut from 14:00).
  const [startTime, setStartTime] = useState(closure?.startTime ?? '');

  return (
    <Modal open onClose={onClose} title={closure ? t('uiScheduling.editClinicClosure') : t('uiScheduling.addClinicClosureTitle')} size="sm">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            { id: closure?.id, startDate, endDate, reason: reason.trim(), ...(startTime ? { startTime } : {}) },
            {
              onSuccess: (result) => {
                notify.success(t('uiScheduling.closureSavedToast'));
                onSaved(result);
              },
              onError: (err) => notify.error(getApiErrorMessage(err, t('uiScheduling.saveClosureError'))),
            },
          );
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DatePicker
            label={t('uiScheduling.startDate')}
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
            label={t('uiScheduling.endDateInclusive')}
            required
            min={startDate}
            value={endDate}
            onChange={(value) => setEndDate(value)}
            error={endDate < startDate ? t('uiScheduling.endDateAfterStartError') : undefined}
          />
        </div>
        <Input
          label={t('uiScheduling.closureStartTime')}
          type="time"
          disabled={started}
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          hint={t('uiScheduling.closureStartTimeHint')}
        />
        <Textarea
          label={t('uiScheduling.reasonVisibleToPatients')}
          hint={t('uiScheduling.closureReasonHint')}
          required
          minLength={3}
          maxLength={500}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('uiScheduling.closureReasonExample')}
        />
        <Alert variant="info">
          {t('uiScheduling.closureAppointmentsHint')}
        </Alert>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-surface-700">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('uiScheduling.cancel')}
          </Button>
          <Button
            type="submit"
            isLoading={save.isPending}
            disabled={!startDate || !endDate || endDate < startDate || reason.trim().length < 3}
          >
            {t('uiScheduling.saveChanges')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
