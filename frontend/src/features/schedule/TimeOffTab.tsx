import { useMemo, useState } from 'react';
import { Plus, CalendarOff } from 'lucide-react';
import { Badge, Button, Card, Select, Input, Textarea, Modal, EmptyState } from '@/components/ui';
import type { BadgeProps } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { clinicIso, clinicParts, clinicToday } from '@/lib/clinicTime';
import {
  useTimeOffs,
  useCreateTimeOff,
  useDecideTimeOff,
  useTimeOffImpact,
  useUpdateTimeOff,
} from './scheduleApi';
import { useSchedulableDentists } from './useSchedulableDentists';
import { AffectedAppointmentsModal } from './AffectedAppointmentsModal';
import { formatDateTime } from './format';
import type {
  CreateTimeOffResult,
  TimeOff,
  TimeOffStatus,
  TimeOffType,
} from '@/types/schedule';

const TIME_OFF_TYPE_KEYS: Record<TimeOffType, string> = { VACATION: 'vacation', SICK: 'sickLeave', TRAINING: 'training', OTHER: 'other' };
const STATUS_KEYS: Record<TimeOffStatus, string> = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled' };

const STATUS_VARIANT: Record<TimeOffStatus, BadgeProps['variant']> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'default',
};

export function TimeOffTab() {
  const { t: tr } = useTranslation();
  const [dentistFilter, setDentistFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<TimeOffStatus | ''>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rejecting, setRejecting] = useState<TimeOff | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [approving, setApproving] = useState<TimeOff | null>(null);
  const [cancelling, setCancelling] = useState<TimeOff | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [extending, setExtending] = useState<TimeOff | null>(null);
  const [affected, setAffected] = useState<CreateTimeOffResult | null>(null);

  const { data: dentists = [] } = useDentistOptions('schedule');
  const { data: timeOffs, isLoading } = useTimeOffs(dentistFilter || undefined, statusFilter || undefined);
  const decide = useDecideTimeOff();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const userId = useAuthStore((s) => s.user?.id);
  const canApprove = hasPermission('time_off.approve');
  const canWrite = hasPermission('schedule.write');
  // Front desk records a dentist's sudden absence today (A1-09).
  const canRecordUrgent = !canApprove && !canWrite && hasPermission('time_off.record_urgent');
  const ownOnly = hasPermission('appointment.read.own') && !hasPermission('appointment.read.any');

  const dentistNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of dentists) map.set(d.id, d.fullName);
    return map;
  }, [dentists]);

  const run = (t: TimeOff, action: 'approve' | 'reject' | 'cancel', note?: string) =>
    decide.mutate(
      { id: t.id, action, note },
      {
        onSuccess: (result) => {
          notify.success(
            action === 'approve'
              ? tr('uiScheduling.timeOffApprovedToast')
              : action === 'reject'
                ? tr('uiScheduling.timeOffRejectedToast')
                : result.endedEarly
                  ? tr('uiScheduling.timeOffEndedToast', { time: formatDateTime(result.endAt) })
                  : tr('uiScheduling.timeOffCancelledToast'),
          );
          setRejecting(null);
          setRejectNote('');
          setApproving(null);
          setCancelling(null);
          setCancelNote('');
          if (action === 'approve' && hasFollowUp(result)) setAffected(result);
        },
        onError: (err) => notify.error(getApiErrorMessage(err, tr('uiScheduling.timeOffActionError'))),
      },
    );

  const canCancel = (t: TimeOff) =>
    (canWrite || (canRecordUrgent && t.createdBy === userId)) &&
    (t.status === 'PENDING' || t.status === 'APPROVED') &&
    new Date(t.endAt).getTime() > Date.now() &&
    (!ownOnly || t.dentistId === userId);
  const running = (t: TimeOff) => t.status === 'APPROVED' && new Date(t.startAt).getTime() < Date.now();
  const canExtend = (t: TimeOff) =>
    new Date(t.endAt).getTime() > Date.now() &&
    ((t.status === 'APPROVED' && canApprove) ||
      (t.status === 'PENDING' && canWrite && (!ownOnly || t.dentistId === userId)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label={tr('uiScheduling.filterByDentist')}
            value={dentistFilter}
            onChange={(e) => setDentistFilter(e.target.value)}
            options={[
              { value: '', label: tr('uiScheduling.allDentists') },
              ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
            ]}
          />
          <Select
            aria-label={tr('uiScheduling.filterByStatus')}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TimeOffStatus | '')}
            options={[
              { value: '', label: tr('uiScheduling.allStatuses') },
              ...(Object.keys(STATUS_KEYS) as TimeOffStatus[]).map((v) => ({
                value: v,
                label: tr(`uiScheduling.timeOffStatus_${STATUS_KEYS[v]}`),
              })),
            ]}
          />
        </div>
        <PermissionGuard anyOf={['schedule.write', 'time_off.record_urgent']}>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            {canApprove ? tr('uiScheduling.addTimeOff') : canRecordUrgent ? tr('uiScheduling.recordAbsenceToday') : tr('uiScheduling.requestTimeOff')}
          </Button>
        </PermissionGuard>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : !timeOffs || timeOffs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarOff className="h-10 w-10 text-gray-400 dark:text-surface-500" />}
            title={tr('uiScheduling.noTimeOff')}
            description={tr('uiScheduling.noTimeOffHint')}
          />
        </Card>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{tr('uiScheduling.dentist')}</th>
                  <th>{tr('uiScheduling.type')}</th>
                  <th>{tr('uiScheduling.from')}</th>
                  <th>{tr('uiScheduling.to')}</th>
                  <th>{tr('uiScheduling.reason')}</th>
                  <th>{tr('uiScheduling.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {timeOffs.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium text-gray-900 dark:text-surface-100">{dentistNameById.get(t.dentistId) ?? '—'}</td>
                    <td>{tr(`uiScheduling.timeOffType_${TIME_OFF_TYPE_KEYS[t.type]}`)}</td>
                    <td>{formatDateTime(t.startAt)}</td>
                    <td>{formatDateTime(t.endAt)}</td>
                    <td className="text-gray-500 dark:text-surface-400">
                      {t.reasonHidden ? <span className="italic">{tr('uiScheduling.adminOnly')}</span> : t.reason || '—'}
                    </td>
                    <td>
                      <Badge variant={STATUS_VARIANT[t.status]}>{tr(`uiScheduling.timeOffStatus_${STATUS_KEYS[t.status]}`)}</Badge>
                      {t.decisionNote && <p className="mt-1 text-xs text-gray-500 dark:text-surface-400">{t.decisionNote}</p>}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {t.status === 'PENDING' && canApprove && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setApproving(t)}>
                            {tr('uiScheduling.approve')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRejecting(t)}>
                            {tr('uiScheduling.reject')}
                          </Button>
                        </>
                      )}
                      {canExtend(t) && (
                        <Button size="sm" variant="ghost" onClick={() => setExtending(t)}>
                          {tr('uiScheduling.editTimeOffEnd')}
                        </Button>
                      )}
                      {canCancel(t) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => (t.status === 'PENDING' ? run(t, 'cancel') : setCancelling(t))}
                        >
                          {running(t) ? tr('uiScheduling.endEarly') : tr('uiScheduling.cancel')}
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

      <CreateTimeOffModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />

      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title={tr('uiScheduling.rejectTimeOff')} size="sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rejecting) run(rejecting, 'reject', rejectNote.trim());
          }}
        >
          <Textarea
            label={tr('uiScheduling.rejectionReason')}
            required
            minLength={5}
            rows={3}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRejecting(null)}>
              {tr('uiScheduling.cancel')}
            </Button>
            <Button type="submit" variant="danger" isLoading={decide.isPending}>
              {tr('uiScheduling.reject')}
            </Button>
          </div>
        </form>
      </Modal>

      <ApproveTimeOffModal
        timeOff={approving}
        dentistName={approving ? dentistNameById.get(approving.dentistId) : undefined}
        isPending={decide.isPending}
        onConfirm={() => approving && run(approving, 'approve')}
        onClose={() => setApproving(null)}
      />

      <Modal
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={cancelling && running(cancelling) ? tr('uiScheduling.endTimeOffEarly') : tr('uiScheduling.cancelApprovedTimeOff')}
        size="sm"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (cancelling) run(cancelling, 'cancel', cancelNote.trim());
          }}
        >
          <p className="text-sm text-gray-600 dark:text-surface-300">
            {cancelling && running(cancelling)
              ? tr('uiScheduling.endTimeOffHint')
              : tr('uiScheduling.cancelTimeOffHint')}{' '}
            {tr('uiScheduling.reassignedAppointmentsRemain')}
          </p>
          <Textarea
            label={tr('uiScheduling.reason')}
            required
            minLength={5}
            rows={2}
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            placeholder={tr('uiScheduling.timeOffCancelExample')}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCancelling(null)}>
              {tr('uiScheduling.close')}
            </Button>
            <Button type="submit" variant="danger" isLoading={decide.isPending} disabled={cancelNote.trim().length < 5}>
              {tr('uiScheduling.confirm')}
            </Button>
          </div>
        </form>
      </Modal>

      <ExtendTimeOffModal timeOff={extending} onClose={() => setExtending(null)} onImpact={setAffected} />

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

/** Something the front desk must still handle after a time-off took effect. */
function hasFollowUp(r: CreateTimeOffResult): boolean {
  return (
    (r.affectedAppointments?.length ?? 0) > 0 ||
    (r.affectedBookingRequests?.length ?? 0) > 0 ||
    (r.waitingPatients?.length ?? 0) > 0
  );
}

/** A1-10: approving shows first how many bookings it touches. */
function ApproveTimeOffModal({
  timeOff,
  dentistName,
  isPending,
  onConfirm,
  onClose,
}: {
  timeOff: TimeOff | null;
  dentistName?: string;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: preview, isLoading } = useTimeOffImpact(timeOff?.id ?? null);
  return (
    <Modal open={timeOff !== null} onClose={onClose} title={t('uiScheduling.approveTimeOff')} size="sm">
      {timeOff && (
        <div className="space-y-4 text-sm">
          <p>
            {t('uiScheduling.timeOffPeriod', { dentist: dentistName ?? t('uiScheduling.dentist'), start: formatDateTime(timeOff.startAt), end: formatDateTime(timeOff.endAt) })}
          </p>
          {isLoading ? (
            <p className="text-gray-500 dark:text-surface-400">{t('uiScheduling.checkingAppointments')}</p>
          ) : (
            <p className={preview && preview.affectedAppointments.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-surface-300'}>
              {preview && preview.affectedAppointments.length > 0
                ? t('uiScheduling.timeOffAffectedCount', { count: preview.affectedAppointments.length })
                : t('uiScheduling.noAppointmentsInTimeOff')}
              {preview && preview.inClinic.length > 0 &&
                ` ${t('uiScheduling.patientsInClinicCount', { count: preview.inClinic.length })}`}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-surface-700">
            <Button variant="outline" onClick={onClose}>
              {t('uiScheduling.close')}
            </Button>
            <Button onClick={onConfirm} isLoading={isPending}>
              {t('uiScheduling.approve')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Shorten or extend a time-off: a new end, in clinic time (A1-11). */
function ExtendTimeOffModal({
  timeOff,
  onClose,
  onImpact,
}: {
  timeOff: TimeOff | null;
  onClose: () => void;
  onImpact: (r: CreateTimeOffResult) => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateTimeOff();
  const end = timeOff ? clinicParts(timeOff.endAt) : null;
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const shownDate = date || end?.date || '';
  const shownTime = time || end?.time || '';
  const close = () => {
    setDate('');
    setTime('');
    setReason('');
    onClose();
  };
  return (
    <Modal open={timeOff !== null} onClose={close} title={t('uiScheduling.editTimeOffEnd')} size="sm">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!timeOff) return;
          update.mutate(
            { id: timeOff.id, endAt: clinicIso(shownDate, shownTime), reason: reason.trim() },
            {
              onSuccess: (r) => {
                notify.success(t('uiScheduling.timeOffUpdatedToast'));
                close();
                if (hasFollowUp(r)) onImpact(r);
              },
              onError: (err) => notify.error(getApiErrorMessage(err, t('uiScheduling.updateError'))),
            },
          );
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label={t('uiScheduling.endDate')} type="date" min={clinicToday()} value={shownDate} onChange={(e) => setDate(e.target.value)} required />
          <Input label={t('uiScheduling.clinicTime')} type="time" value={shownTime} onChange={(e) => setTime(e.target.value)} required />
        </div>
        <Textarea label={t('uiScheduling.reason')} required minLength={5} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            {t('uiScheduling.close')}
          </Button>
          <Button type="submit" isLoading={update.isPending} disabled={reason.trim().length < 5}>
            {t('uiScheduling.saveChanges')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateTimeOffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { dentists, defaultDentistId } = useSchedulableDentists();
  const createTimeOff = useCreateTimeOff();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canApprove = hasPermission('time_off.approve');
  const urgentOnly = !canApprove && !hasPermission('schedule.write') && hasPermission('time_off.record_urgent');

  const [dentistId, setDentistId] = useState(defaultDentistId);
  // Appointments still booked inside approved time-off just recorded — shown
  // instead of closing, so front desk knows who to call and move.
  const [affected, setAffected] = useState<CreateTimeOffResult | null>(null);
  // Clinic date + clinic "HH:mm" (A1-14): a workstation in another zone
  // records the same instants as one in Vietnam.
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [type, setType] = useState<TimeOffType>(urgentOnly ? 'SICK' : 'VACATION');
  const [reason, setReason] = useState('');

  const startAt = startDate && startTime ? clinicIso(startDate, startTime) : '';
  const endAt = endDate && endTime ? clinicIso(endDate, endTime) : '';
  const isRangeValid = !startAt || !endAt || startAt < endAt;

  const resetForm = () => {
    setDentistId(defaultDentistId);
    setAffected(null);
    setStartDate('');
    setStartTime('');
    setEndDate('');
    setEndTime('');
    setType(urgentOnly ? 'SICK' : 'VACATION');
    setReason('');
  };

  const handleSubmit = async () => {
    try {
      const created = await createTimeOff.mutateAsync({
        dentistId,
        startAt,
        endAt,
        type,
        reason: reason || undefined,
      });
      notify.success(
        created.status === 'PENDING' ? t('uiScheduling.timeOffSubmittedToast') : t('uiScheduling.timeOffRecordedToast'),
      );
      if (created.status === 'APPROVED' && hasFollowUp(created)) {
        setAffected(created);
        return;
      }
      resetForm();
      onClose();
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiScheduling.recordTimeOffError')));
    }
  };

  const close = () => {
    resetForm();
    onClose();
  };

  if (affected) {
    return (
      <AffectedAppointmentsModal
        open={open}
        appointments={affected.affectedAppointments}
        bookingRequests={affected.affectedBookingRequests ?? []}
        waitingPatients={affected.waitingPatients ?? []}
        onClose={close}
      />
    );
  }

  const title = canApprove ? t('uiScheduling.addTimeOff') : urgentOnly ? t('uiScheduling.recordUnexpectedAbsence') : t('uiScheduling.requestTimeOff');
  return (
    <Modal open={open} onClose={close} title={title} size="sm">
      <div className="space-y-4">
        {urgentOnly ? (
          <p className="text-sm text-gray-600 dark:text-surface-300">
            {t('uiScheduling.urgentAbsenceHint')}
          </p>
        ) : (
          !canApprove && (
            <p className="text-sm text-gray-600 dark:text-surface-300">
              {t('uiScheduling.timeOffPendingHint')}
            </p>
          )
        )}
        <Select
          label={t('uiScheduling.dentist')}
          value={dentistId}
          onChange={(e) => setDentistId(e.target.value)}
          placeholder={t('uiScheduling.selectDentist')}
          options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
          required
        />

        <Select
          label={t('uiScheduling.timeOffType')}
          value={type}
          onChange={(e) => setType(e.target.value as TimeOffType)}
          options={(Object.keys(TIME_OFF_TYPE_KEYS) as TimeOffType[]).map((v) => ({
            value: v,
            label: t(`uiScheduling.timeOffType_${TIME_OFF_TYPE_KEYS[v]}`),
          }))}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label={t('uiScheduling.startDate')} type="date" min={clinicToday()} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          <Input label={t('uiScheduling.clinicTime')} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          <Input label={t('uiScheduling.endDate')} type="date" min={startDate || clinicToday()} value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          <Input
            label={t('uiScheduling.clinicTime')}
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            error={!isRangeValid ? t('uiScheduling.endAfterStartError') : undefined}
            required
          />
        </div>

        <Textarea
          label={t('uiScheduling.optionalReason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder={t('uiScheduling.timeOffReasonExample')}
        />

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-surface-700">
          <Button variant="outline" onClick={close}>
            {t('uiScheduling.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createTimeOff.isPending}
            disabled={!dentistId || !startAt || !endAt || !isRangeValid}
          >
            {canApprove ? t('uiScheduling.add') : urgentOnly ? t('uiScheduling.record') : t('uiScheduling.submitRequest')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
