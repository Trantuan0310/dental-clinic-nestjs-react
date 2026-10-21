import { useMemo, useState } from 'react';
import { Plus, CalendarClock, Pencil, CalendarX2, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Select,
  Input,
  Checkbox,
  ConfirmDialog,
  Modal,
  EmptyState,
} from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { clinicParts, clinicToday } from '@/lib/clinicTime';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import { useDentistOptions } from '@/features/appointments/appointmentApi';
import { useSchedulableDentists } from './useSchedulableDentists';
import {
  useWorkingSchedules,
  useBulkCreateWorkingSchedules,
  useUpdateWorkingSchedule,
  useDeleteWorkingSchedule,
} from './scheduleApi';
import { AffectedAppointmentsModal } from './AffectedAppointmentsModal';
import { TimeBlocksEditor } from './TimeBlocksEditor';
import { blockError, defaultBlocks, openingBlocks, openingHoursWarnings } from './scheduleBlocks';
import { hasImpact } from './format';
import { useTranslation } from 'react-i18next';
import type { ScheduleChangeImpact, TimeBlock, WorkingSchedule } from '@/types/schedule';

const dayLabelsFor = (language: string) => {
  const locale = language.startsWith('en') ? 'en-US' : 'vi-VN';
  return Array.from({ length: 7 }, (_, index) => {
    const mondayFirstDay = (index + 1) % 7;
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(new Date(2024, 0, 7 + mondayFirstDay));
  });
};

/** Monday first, the way the clinic reads a week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const dateOf = (value: string | null) => (value ? value.slice(0, 10) : null);
const formatDate = (value: string, language: string) =>
  new Intl.DateTimeFormat(language.startsWith('en') ? 'en-US' : 'vi-VN').format(new Date(`${value.slice(0, 10)}T12:00:00`));
const addDays = (date: string, n: number) =>
  new Date(new Date(date).getTime() + n * 86_400_000).toISOString().slice(0, 10);

type Phase = 'upcoming' | 'active' | 'ended';
function phaseOf(s: WorkingSchedule, today: string): Phase {
  const to = dateOf(s.validTo);
  if (to && to < today) return 'ended';
  return dateOf(s.validFrom)! > today ? 'upcoming' : 'active';
}

export function WorkingScheduleTab() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'vi';
  const dayLabels = useMemo(() => dayLabelsFor(language), [language]);
  const localDate = (value: string) => formatDate(value, language);
  const localDay = (day: number) => dayLabels[(day + 6) % 7];
  const [dentistFilter, setDentistFilter] = useState('');
  const [showEnded, setShowEnded] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editing, setEditing] = useState<WorkingSchedule | null>(null);
  const [ending, setEnding] = useState<WorkingSchedule | null>(null);
  const [deleting, setDeleting] = useState<WorkingSchedule | null>(null);
  const [restorePrevious, setRestorePrevious] = useState(true);
  const [impact, setImpact] = useState<ScheduleChangeImpact | null>(null);

  const { data: dentists = [] } = useDentistOptions('schedule');
  const { data: schedules, isLoading } = useWorkingSchedules(dentistFilter || undefined);
  const remove = useDeleteWorkingSchedule();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const userId = useAuthStore((s) => s.user?.id);
  const ownOnly = hasPermission('appointment.read.own') && !hasPermission('appointment.read.any');
  const canEdit = (s: WorkingSchedule) => hasPermission('schedule.write') && (!ownOnly || s.dentistId === userId);
  const today = clinicToday();
  // A1-19: a row not started yet, or created by mistake today for today.
  const deletable = (s: WorkingSchedule) =>
    phaseOf(s, today) === 'upcoming' || (dateOf(s.validFrom) === today && clinicParts(s.createdAt).date === today);
  // A1-20: the row a change "from day X" ended the day before X.
  const predecessorOf = (s: WorkingSchedule) => {
    const from = dateOf(s.validFrom)!;
    const dayBefore = new Date(new Date(from).getTime() - 86_400_000).toISOString().slice(0, 10);
    return (schedules ?? []).find(
      (p) => p.id !== s.id && p.dentistId === s.dentistId && p.dayOfWeek === s.dayOfWeek && dateOf(p.validTo) === dayBefore,
    );
  };
  const previous = deleting ? predecessorOf(deleting) : undefined;

  const dentistNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of dentists) map.set(d.id, d.fullName);
    return map;
  }, [dentists]);

  // Group by dentist first, then order each group Monday → Sunday and by
  // time — how a clinic manager scans "this dentist's whole week".
  const grouped = useMemo(() => {
    const groups = new Map<string, WorkingSchedule[]>();
    for (const s of schedules ?? []) {
      if (!showEnded && phaseOf(s, today) === 'ended') continue;
      const list = groups.get(s.dentistId) ?? [];
      list.push(s);
      groups.set(s.dentistId, list);
    }
    for (const list of groups.values()) {
      list.sort(
        (a, b) =>
          WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) ||
          a.startTime.localeCompare(b.startTime) ||
          a.validFrom.localeCompare(b.validFrom),
      );
    }
    return Array.from(groups.entries()).sort((a, b) =>
      (dentistNameById.get(a[0]) ?? '').localeCompare(dentistNameById.get(b[0]) ?? ''),
    );
  }, [schedules, dentistNameById, showEnded, today]);

  const afterChange = (message: string, result: ScheduleChangeImpact) => {
    notify.success(message);
    if (hasImpact(result)) setImpact(result);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full max-w-xs">
            <Select
              aria-label={t('uiScheduling.filterByDentist')}
              value={dentistFilter}
              onChange={(e) => setDentistFilter(e.target.value)}
              options={[
                { value: '', label: t('uiScheduling.allDentists') },
                ...dentists.map((d) => ({ value: d.id, label: d.fullName })),
              ]}
            />
          </div>
          <Checkbox checked={showEnded} onChange={setShowEnded} label={t('uiScheduling.showEndedSchedules')} />
        </div>
        <PermissionGuard permission="schedule.write">
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            {t('uiScheduling.addWorkingSchedule')}
          </Button>
        </PermissionGuard>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock className="h-10 w-10 text-gray-400" />}
            title={t('uiScheduling.noRegularSchedule')}
            description={t('uiScheduling.noRegularScheduleHint')}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(([dentistId, rows]) => (
            <Card key={dentistId} title={dentistNameById.get(dentistId) ?? '—'} noPadding>
              <div className="max-w-full overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>{t('uiScheduling.weekday')}</th>
                      <th>{t('uiScheduling.workingHours')}</th>
                      <th>{t('uiScheduling.shiftType')}</th>
                      <th>{t('uiScheduling.effectiveFrom')}</th>
                      <th>{t('uiScheduling.to')}</th>
                      <th className="text-center">{t('uiScheduling.paidShift')}</th>
                      <th>{t('uiScheduling.status')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => {
                      const phase = phaseOf(s, today);
                      const label = `${dayLabels[(s.dayOfWeek + 6) % 7]} ${s.startTime}–${s.endTime}`;
                      return (
                        <tr key={s.id}>
                          <td className="font-medium text-gray-900 dark:text-surface-100">{dayLabels[(s.dayOfWeek + 6) % 7]}</td>
                          <td className="font-mono text-xs">{s.startTime} – {s.endTime}</td>
                          <td>{t(`uiScheduling.shift${s.shiftType}`)}</td>
                          <td>{localDate(s.validFrom)}</td>
                          <td>{s.validTo ? localDate(s.validTo) : '—'}</td>
                          <td className="text-center">{s.isPaidShift ? t('uiScheduling.paid') : t('uiScheduling.unpaid')}</td>
                          <td>
                            <Badge variant={phase === 'active' ? 'success' : phase === 'upcoming' ? 'info' : 'default'}>{t(`uiScheduling.schedulePhase_${phase}`)}</Badge>
                          </td>
                          <td className="whitespace-nowrap text-right">
                            {canEdit(s) && phase !== 'ended' && (
                              <>
                                <Button size="sm" variant="ghost" aria-label={t('uiScheduling.editSchedule', { schedule: label })} onClick={() => setEditing(s)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" aria-label={t('uiScheduling.endSchedule', { schedule: label })} onClick={() => setEnding(s)}>
                                  <CalendarX2 className="h-4 w-4" />
                                </Button>
                                {deletable(s) && (
                                  <Button size="sm" variant="ghost" aria-label={t('uiScheduling.deleteSchedule', { schedule: label })} onClick={() => setDeleting(s)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateWorkingScheduleModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
      {editing && (
        <EditWorkingScheduleModal
          schedule={editing}
          onClose={() => setEditing(null)}
          onSaved={(result) => {
            setEditing(null);
            afterChange(t('uiScheduling.scheduleUpdated'), result);
          }}
        />
      )}
      {ending && (
        <EndWorkingScheduleModal
          schedule={ending}
          onClose={() => setEnding(null)}
          onSaved={(result) => {
            setEnding(null);
            afterChange(t('uiScheduling.scheduleEnded'), result);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('uiScheduling.deleteScheduleTitle')}
        description={
          deleting ? (
            <div className="space-y-2">
              <p>
                {t('uiScheduling.deleteSchedulePrompt', { day: localDay(deleting.dayOfWeek), start: deleting.startTime, end: deleting.endTime, date: localDate(deleting.validFrom) })}
              </p>
              {previous && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={restorePrevious}
                    onChange={(e) => setRestorePrevious(e.target.checked)}
                  />
                  <span>
                    {t('uiScheduling.restorePreviousSchedule', { start: previous.startTime, end: previous.endTime, date: localDate(previous.validTo!), day: localDay(deleting.dayOfWeek), from: localDate(deleting.validFrom) })}
                  </span>
                </label>
              )}
            </div>
          ) : undefined
        }
        confirmText={t('uiScheduling.delete')}
        variant="danger"
        isLoading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate({ id: deleting.id, restorePrevious: Boolean(previous) && restorePrevious }, {
            onSuccess: (result) => {
              setDeleting(null);
              setRestorePrevious(true);
              afterChange(result.restoredSchedule ? t('uiScheduling.scheduleDeletedAndRestored') : t('uiScheduling.scheduleDeleted'), result);
            },
            onError: (err) => notify.error(getApiErrorMessage(err, t('uiScheduling.scheduleDeleteError'))),
          });
        }}
      />
      <AffectedAppointmentsModal
        open={impact !== null}
        title={t('uiScheduling.scheduleAffectedAppointmentsTitle')}
        appointments={impact?.affectedAppointments ?? []}
        bookingRequests={impact?.affectedBookingRequests ?? []}
        onClose={() => setImpact(null)}
      />
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;
  return (
    <Alert variant="warning">
      <p className="font-medium">{t('uiScheduling.nonBlockingWarnings')}</p>
      <ul className="list-disc pl-5">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </Alert>
  );
}

/** Several weekdays × several blocks, saved together (all or nothing). */
function CreateWorkingScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { dentists, defaultDentistId } = useSchedulableDentists();
  const createSchedules = useBulkCreateWorkingSchedules();
  const openDays = () => WEEK_ORDER.filter((d) => openingBlocks(d).length > 0);

  const [dentistId, setDentistId] = useState(defaultDentistId);
  const [days, setDays] = useState<number[]>(openDays);
  const [blocks, setBlocks] = useState<TimeBlock[]>(defaultBlocks);
  const [validFrom, setValidFrom] = useState(() => clinicToday());
  const [validTo, setValidTo] = useState('');
  const [isPaidShift, setIsPaidShift] = useState(true);

  const error = blockError(blocks);
  const warnings = error ? [] : openingHoursWarnings(days, blocks);

  const resetForm = () => {
    setDentistId(defaultDentistId);
    setDays(openDays());
    setBlocks(defaultBlocks());
    setValidFrom(clinicToday());
    setValidTo('');
    setIsPaidShift(true);
  };
  const close = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    try {
      const created = await createSchedules.mutateAsync({
        dentistId,
        daysOfWeek: days,
        blocks,
        validFrom,
        validTo: validTo || undefined,
        isPaidShift,
      });
      notify.success(t('uiScheduling.schedulesCreated', { count: created.length }));
      close();
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiScheduling.scheduleCreateError')));
    }
  };

  return (
    <Modal open={open} onClose={close} title={t('uiScheduling.addWorkingSchedule')} size="md">
      <div className="space-y-4">
        <Select
          label={t('uiScheduling.dentist')}
          value={dentistId}
          onChange={(e) => setDentistId(e.target.value)}
          placeholder={t('uiScheduling.chooseDentist')}
          options={dentists.map((d) => ({ value: d.id, label: d.fullName }))}
          required
        />

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-gray-700 dark:text-surface-200">
            {t('uiScheduling.weekdays')} <span className="text-red-500">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {WEEK_ORDER.map((d) => (
              <Checkbox
                key={d}
                checked={days.includes(d)}
                onChange={(on) => setDays(on ? [...days, d] : days.filter((x) => x !== d))}
                label={t(`uiScheduling.weekday${d}`)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-gray-700 dark:text-surface-200">
            {t('uiScheduling.selectedDayWorkingHours')} <span className="text-red-500">*</span>
          </legend>
          <p className="text-xs text-gray-500 dark:text-surface-400">
            {t('uiScheduling.scheduleOpeningHoursHint')}
          </p>
          <TimeBlocksEditor blocks={blocks} onChange={setBlocks} startLabel={t('uiScheduling.workFrom')} />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t('uiScheduling.effectiveFrom')}
            type="date"
            min={clinicToday()}
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            required
          />
          <Input
            label={t('uiScheduling.effectiveToOptional')}
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            min={validFrom}
          />
        </div>

        <Checkbox checked={isPaidShift} onChange={setIsPaidShift} label={t('uiScheduling.paidShift')} />

        <WarningList warnings={warnings} />

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={close}>
            {t('uiScheduling.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={createSchedules.isPending}
            disabled={!dentistId || days.length === 0 || !validFrom || Boolean(error) || (Boolean(validTo) && validTo < validFrom)}
          >
            {days.length * blocks.length > 1 ? t('uiScheduling.saveSchedules', { count: days.length * blocks.length }) : t('uiScheduling.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * New hours of a schedule already in effect apply from a chosen day: the old
 * row keeps the past (payroll), a new row starts that day.
 */
function EditWorkingScheduleModal({
  schedule,
  onClose,
  onSaved,
}: {
  schedule: WorkingSchedule;
  onClose: () => void;
  onSaved: (result: ScheduleChangeImpact) => void;
}) {
  const { t, i18n } = useTranslation();
  const update = useUpdateWorkingSchedule();
  const language = i18n.resolvedLanguage ?? 'vi';
  const localDate = (value: string) => formatDate(value, language);
  const dayNames = dayLabelsFor(language);
  const today = clinicToday();
  const started = dateOf(schedule.validFrom)! <= today;
  const [dayOfWeek, setDayOfWeek] = useState(String(schedule.dayOfWeek));
  const [blocks, setBlocks] = useState<TimeBlock[]>([
    { startTime: schedule.startTime, endTime: schedule.endTime },
  ]);
  const [validTo, setValidTo] = useState(dateOf(schedule.validTo) ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(today);

  const [block] = blocks;
  const hoursChanged =
    Number(dayOfWeek) !== schedule.dayOfWeek ||
    block.startTime !== schedule.startTime ||
    block.endTime !== schedule.endTime;
  const validToChanged = validTo !== (dateOf(schedule.validTo) ?? '');
  const error = blockError(blocks);
  const warnings = error ? [] : openingHoursWarnings([Number(dayOfWeek)], blocks);

  const submit = () =>
    update.mutate(
      {
        id: schedule.id,
        ...(hoursChanged
          ? { dayOfWeek: Number(dayOfWeek), startTime: block.startTime, endTime: block.endTime }
          : {}),
        ...(validToChanged ? { validTo: validTo || null } : {}),
        ...(hoursChanged && started ? { effectiveFrom } : {}),
        expectedUpdatedAt: schedule.updatedAt,
      },
      {
        onSuccess: onSaved,
        onError: (err) => notify.error(getApiErrorMessage(err, t('uiScheduling.scheduleUpdateError'))),
      },
    );

  return (
    <Modal open onClose={onClose} title={t('uiScheduling.editWorkingSchedule')} size="sm">
      <div className="space-y-4">
        <Select
          label={t('uiScheduling.weekday')}
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(e.target.value)}
          options={WEEK_ORDER.map((d) => ({ value: String(d), label: dayNames[(d + 6) % 7] }))}
        />
        <TimeBlocksEditor blocks={blocks} onChange={setBlocks} startLabel={t('uiScheduling.workFrom')} max={1} />
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {started && hoursChanged && (
          <>
            <Input
              label={t('uiScheduling.applyNewHoursFrom')}
              type="date"
              value={effectiveFrom}
              min={today}
              max={validTo || undefined}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              required
            />
            <Alert variant="info">
              {t('uiScheduling.scheduleChangeEffectiveHint', { date: localDate(effectiveFrom || today) })}
            </Alert>
            {effectiveFrom === today && (
              <Alert variant="warning">
                {t('uiScheduling.scheduleChangeTodayWarning')}
              </Alert>
            )}
          </>
        )}
        <Input
          label={t('uiScheduling.effectiveToNoEnd')}
          type="date"
          value={validTo}
          min={started ? addDays(today, -1) : dateOf(schedule.validFrom)!}
          onChange={(e) => setValidTo(e.target.value)}
        />
        <WarningList warnings={warnings} />
        <p className="text-xs text-gray-500 dark:text-surface-400">
          {t('uiScheduling.scheduleChangeAppointmentsHint')}
        </p>
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            {t('uiScheduling.cancel')}
          </Button>
          <Button
            onClick={submit}
            isLoading={update.isPending}
            disabled={Boolean(error) || (!hoursChanged && !validToChanged) || (started && hoursChanged && !effectiveFrom)}
          >
            {t('uiScheduling.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Stop a schedule after a last working day (history stays for payroll). */
function EndWorkingScheduleModal({
  schedule,
  onClose,
  onSaved,
}: {
  schedule: WorkingSchedule;
  onClose: () => void;
  onSaved: (result: ScheduleChangeImpact) => void;
}) {
  const { t, i18n } = useTranslation();
  const update = useUpdateWorkingSchedule();
  const language = i18n.resolvedLanguage ?? 'vi';
  const dayNames = dayLabelsFor(language);
  const today = clinicToday();
  const validFrom = dateOf(schedule.validFrom)!;
  const yesterday = addDays(today, -1);
  const minEnd = validFrom > yesterday ? validFrom : yesterday;
  const [lastDay, setLastDay] = useState(minEnd > today ? minEnd : today);

  return (
    <Modal open onClose={onClose} title={t('uiScheduling.endWorkingSchedule')} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-700 dark:text-surface-200">
          {dayNames[(schedule.dayOfWeek + 6) % 7]} {schedule.startTime}–{schedule.endTime}, {t('uiScheduling.effectiveFrom').toLowerCase()} {formatDate(schedule.validFrom, language)}.
        </p>
        <Input
          label={t('uiScheduling.lastWorkingDay')}
          type="date"
          value={lastDay}
          min={minEnd}
          onChange={(e) => setLastDay(e.target.value)}
          hint={t('uiScheduling.endScheduleDateHint')}
          required
        />
        {lastDay < today && (
          <Alert variant="warning">
            {t('uiScheduling.endScheduleTodayWarning')}
          </Alert>
        )}
        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            {t('uiScheduling.cancel')}
          </Button>
          <Button
            variant="danger"
            isLoading={update.isPending}
            disabled={!lastDay || lastDay < minEnd}
            onClick={() =>
              update.mutate(
                { id: schedule.id, validTo: lastDay, expectedUpdatedAt: schedule.updatedAt },
                {
                  onSuccess: onSaved,
                  onError: (err) => notify.error(getApiErrorMessage(err, t('uiScheduling.scheduleEndError'))),
                },
              )
            }
          >
            {t('uiScheduling.endScheduleAction')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
