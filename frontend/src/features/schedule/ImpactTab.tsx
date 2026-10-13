import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, PhoneCall } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, Input, Modal, Select, Textarea } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { clinicIso, clinicParts, clinicToday } from '@/lib/clinicTime';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { useAuthStore } from '@/stores/authStore';
import {
  useBookingRequestIssues,
  useBulkReschedule,
  useClinicContact,
  useScheduleImpact,
} from './scheduleApi';
import { formatDateTime } from './format';
import type { BulkRescheduleResult, ImpactedAppointment } from '@/types/schedule';
import { useTranslation } from 'react-i18next';

const REASON_KEY: Record<ImpactedAppointment['reason'], string> = {
  TIME_OFF: 'impactTimeOff', CLOSED: 'impactClosed', OUTSIDE_WORKING_HOURS: 'impactOutsideHours', DENTIST_UNAVAILABLE: 'impactDentistUnavailable',
};

type BulkAction = { kind: 'dentist' } | { kind: 'date' };

/**
 * BR-SCH-005: upcoming bookings (next 60 days) that the current calendar no
 * longer allows — the front desk's list of patients to call. A1-13: rows can
 * be moved (to a substitute dentist, or to another day at the same time) as
 * clinic moves, and marked once the patient has been told.
 */
export function ImpactTab() {
  const { t } = useTranslation();
  const [dentistFilter, setDentistFilter] = useState('');
  // Suspended / on-leave dentists are the ones whose visits need moving (A1-16).
  const { data: dentists = [] } = useDentistOptions('schedule');
  const { data: bookable = [] } = useDentistOptions();
  const { data: rows = [], isLoading } = useScheduleImpact(dentistFilter || undefined);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canReadRequests = hasPermission('booking_request.read');
  const canAct = hasPermission('appointment.update') && hasPermission('appointment.read.any');
  const { data: requests = [] } = useBookingRequestIssues(dentistFilter || undefined, canReadRequests);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const [contacting, setContacting] = useState<ImpactedAppointment | null>(null);
  const [lastResult, setLastResult] = useState<BulkRescheduleResult | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const chosen = rows.filter((r) => selected.has(r.id));
  const patientOf = (id: string) => rows.find((r) => r.id === id)?.patient.fullName ?? id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={t('uiScheduling.filterByDentist')}
          value={dentistFilter}
          onChange={(e) => setDentistFilter(e.target.value)}
          options={[
            { value: '', label: t('uiScheduling.allDentists') },
            ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
          ]}
        />
        {canAct && rows.length > 0 && (
          <>
            <Button size="sm" variant="outline" disabled={chosen.length === 0} onClick={() => setBulk({ kind: 'dentist' })}>
              {t('uiScheduling.moveToSubstituteCount', { count: chosen.length })}
            </Button>
            <Button size="sm" variant="outline" disabled={chosen.length === 0} onClick={() => setBulk({ kind: 'date' })}>
              {t('uiScheduling.moveToAnotherDayCount', { count: chosen.length })}
            </Button>
          </>
        )}
      </div>
      {lastResult && lastResult.failed.length > 0 && (
        <Alert variant="warning" onClose={() => setLastResult(null)}>
          {t('uiScheduling.bulkMoveFailures', { moved: lastResult.moved.length, failed: lastResult.failed.length })}{' '}
          {lastResult.failed.map((f) => `${patientOf(f.appointmentId)} (${f.reason})`).join('; ')}
        </Alert>
      )}
      {isLoading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="h-10 w-10 text-green-500" />}
            title={t('uiScheduling.noAffectedAppointments')}
            description={t('uiScheduling.noAffectedAppointmentsHint')}
          />
        </Card>
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  {canAct && (
                    <th>
                      <input
                        type="checkbox"
                        aria-label={t('uiScheduling.selectAll')}
                        checked={chosen.length === rows.length}
                        onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th>{t('uiScheduling.appointmentTime')}</th>
                  <th>{t('uiScheduling.patient')}</th>
                  <th>{t('uiScheduling.dentist')}</th>
                  <th>{t('uiScheduling.reason')}</th>
                  <th>{t('uiScheduling.patientContacted')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    {canAct && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={t('uiScheduling.selectPatientNamed', { name: r.patient.fullName })}
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap">{formatDateTime(r.startAt)}</td>
                    <td>
                      <Link to={`/appointments/list?open=${r.id}`} className="font-medium hover:underline">
                        {r.patient.fullName}
                      </Link>
                      <p className="text-xs text-gray-500 dark:text-surface-400">
                        {r.patient.code}
                        {r.patient.primaryPhone ? ` · ${r.patient.primaryPhone}` : ''}
                      </p>
                    </td>
                    <td>{r.dentistName}</td>
                    <td>
                      <Badge variant="warning">{t(`uiScheduling.${REASON_KEY[r.reason]}`)}</Badge>
                      <p className="mt-1 text-xs text-gray-500 dark:text-surface-400">{r.message}</p>
                    </td>
                    <td className="whitespace-nowrap">
                      {r.clinicContactedAt ? (
                        <div className="text-xs">
                          <Badge variant="success">{t('uiScheduling.calledAt', { time: formatDateTime(r.clinicContactedAt) })}</Badge>
                          {r.clinicContactNote && <p className="mt-1 text-gray-500 dark:text-surface-400">{r.clinicContactNote}</p>}
                        </div>
                      ) : (
                        r.clinicContactNote && <p className="text-xs text-amber-700 dark:text-amber-300">{r.clinicContactNote}</p>
                      )}
                      {canAct && (
                        <Button size="sm" variant="ghost" onClick={() => setContacting(r)}>
                          <PhoneCall className="h-4 w-4" />
                          {r.clinicContactedAt ? t('uiScheduling.edit') : t('uiScheduling.record')}
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
      <BulkMoveModal
        action={bulk}
        rows={chosen}
        dentists={bookable}
        onClose={() => setBulk(null)}
        onDone={(result) => {
          setBulk(null);
          setSelected(new Set());
          setLastResult(result);
        }}
      />
      <ContactModal row={contacting} onClose={() => setContacting(null)} />
      {requests.length > 0 && (
        <Card title={t('uiScheduling.unconfirmableOnlineRequests')} noPadding>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('uiScheduling.requestedTime')}</th>
                  <th>{t('uiScheduling.booker')}</th>
                  <th>{t('uiScheduling.dentist')}</th>
                  <th>{t('uiScheduling.reason')}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const proposal = ['PROPOSED', 'PATIENT_ACCEPTED'].includes(r.status);
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">
                        {formatDateTime(proposal && r.proposedStartAt ? r.proposedStartAt : r.requestedStartAt)}
                      </td>
                      <td>
                        <Link to="/booking-requests" className="font-medium hover:underline">
                          {r.fullName}
                        </Link>
                        <p className="text-xs text-gray-500 dark:text-surface-400">
                          {r.referenceCode} · {r.phone}
                        </p>
                      </td>
                      <td>{(proposal && r.proposedDentist?.fullName) || r.preferredDentist.fullName}</td>
                      <td className="text-xs text-gray-600 dark:text-surface-300">{r.slotIssue?.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Moves the chosen visits as clinic moves (not counted in the patient's
 * limit): to a substitute dentist at the same time, or to another day at the
 * same clinic time. Each visit is checked on its own; failures are listed.
 */
function BulkMoveModal({
  action,
  rows,
  dentists,
  onClose,
  onDone,
}: {
  action: BulkAction | null;
  rows: ImpactedAppointment[];
  dentists: Array<{ id: string; fullName: string }>;
  onClose: () => void;
  onDone: (r: BulkRescheduleResult) => void;
}) {
  const { t } = useTranslation();
  const move = useBulkReschedule();
  const [dentistId, setDentistId] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const close = () => {
    setDentistId('');
    setDate('');
    setReason('');
    onClose();
  };
  const ready = reason.trim().length >= 5 && (action?.kind === 'dentist' ? Boolean(dentistId) : Boolean(date));
  return (
    <Modal
      open={action !== null}
      onClose={close}
      title={action?.kind === 'dentist' ? t('uiScheduling.moveToSubstitute') : t('uiScheduling.moveToAnotherDay')}
      size="sm"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!action) return;
          move.mutate(
            {
              reason: reason.trim(),
              items: rows.map((r) =>
                action.kind === 'dentist'
                  ? { appointmentId: r.id, newDentistId: dentistId }
                  : { appointmentId: r.id, newStartsAt: clinicIso(date, clinicParts(r.startAt).time) },
              ),
            },
            {
              onSuccess: (result) => {
                notify.success(t('uiScheduling.bulkMoveSuccess', { moved: result.moved.length, total: rows.length }));
                close();
                onDone(result);
              },
              onError: (err) => notify.error(getApiErrorMessage(err, t('uiScheduling.moveAppointmentsError'))),
            },
          );
        }}
      >
        <p className="text-sm text-gray-600 dark:text-surface-300">
          {t('uiScheduling.clinicMoveHint', { count: rows.length })}
        </p>
        {action?.kind === 'dentist' ? (
          <Select
            label={t('uiScheduling.substituteDentist')}
            value={dentistId}
            onChange={(e) => setDentistId(e.target.value)}
            placeholder={t('uiScheduling.selectDentist')}
            options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
            required
          />
        ) : (
          <Input label={t('uiScheduling.newDate')} type="date" min={clinicToday()} value={date} onChange={(e) => setDate(e.target.value)} required />
        )}
        <Textarea label={t('uiScheduling.reason')} required minLength={5} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('uiScheduling.moveReasonExample')} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            {t('uiScheduling.close')}
          </Button>
          <Button type="submit" isLoading={move.isPending} disabled={!ready}>
            {t('uiScheduling.move')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Mark that the patient was told (or note why not yet). */
function ContactModal({ row, onClose }: { row: ImpactedAppointment | null; onClose: () => void }) {
  const { t } = useTranslation();
  const contact = useClinicContact();
  const [note, setNote] = useState('');
  const save = (contacted: boolean) => {
    if (!row) return;
    contact.mutate(
      { id: row.id, contacted, note: note.trim() || undefined },
      {
        onSuccess: () => {
          notify.success(contacted ? t('uiScheduling.patientContactRecorded') : t('uiScheduling.noteSaved'));
          setNote('');
          onClose();
        },
        onError: (err) => notify.error(getApiErrorMessage(err, t('uiScheduling.saveError'))),
      },
    );
  };
  return (
    <Modal open={row !== null} onClose={onClose} title={t('uiScheduling.contactPatient')} size="sm">
      {row && (
        <div className="space-y-4 text-sm">
          <p>
            {row.patient.fullName}
            {row.patient.primaryPhone ? ` · ${row.patient.primaryPhone}` : ''} — {t('uiScheduling.appointmentAt', { time: formatDateTime(row.startAt) })}
          </p>
          <Textarea
            label={t('uiScheduling.note')}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={row.clinicContactNote ?? t('uiScheduling.contactNoteExample')}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => save(false)} isLoading={contact.isPending}>
              {t('uiScheduling.notReached')}
            </Button>
            <Button onClick={() => save(true)} isLoading={contact.isPending}>
              {t('uiScheduling.calledPatient')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
