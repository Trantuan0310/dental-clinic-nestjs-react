import { useMemo, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { Calendar as CalendarIcon, Clock, ChevronRight, MoreHorizontal, Plus, Stethoscope } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AppointmentStatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Appointment, AppointmentStatus, AppointmentType } from '@/types/appointment';
import { formatTimeOnly, getWeekdayLabel } from '@/lib/format';
import { clinicToday, clinicWallClock } from '@/lib/clinicTime';
import { cn } from '@/lib/cn';
import { useTranslation } from 'react-i18next';
import { isOverdueNotArrived, OVERDUE_DOT_CLASS, OVERDUE_LABEL, useNow } from './liveStatus';

interface MonthViewProps {
  date: Date;
  days: Date[];
  appointmentsByDate: Record<string, Appointment[]>;
  onDayClick: (date: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onCreateAtSlot?: (date: Date, time: string) => void;
  /** Clinic-wide closed days ("yyyy-MM-dd" → reason): marked, no quick-create. */
  closedDays?: Record<string, string>;
}

const STATUS_DOT_COLORS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-gray-400',
  confirmed: 'bg-blue-500',
  checked_in: 'bg-cyan-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-red-400',
  no_show: 'bg-red-500',
  left: 'bg-orange-400',
};

const TYPE_DOT: Record<AppointmentType, string> = {
  consultation: 'ring-blue-300',
  treatment: 'ring-amber-300',
  follow_up: 'ring-emerald-300',
};

const MAX_VISIBLE_PER_DAY = 3;

export function MonthView({
  date,
  days,
  appointmentsByDate,
  onDayClick,
  onAppointmentClick,
  onCreateAtSlot,
  closedDays,
}: MonthViewProps) {
  const { t, i18n } = useTranslation();
  const weekdayLabels = i18n.resolvedLanguage?.startsWith('en')
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const now = useNow();

  // Build a 42-cell grid (6 rows x 7 columns) including leading padding days
  // so layout is always a full month-grid regardless of where the 1st falls.
  const gridCells = useMemo(() => {
    const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const startPadding = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
    const cells: Array<{ date: Date; inMonth: boolean }> = [];
    for (let i = 0; i < startPadding; i++) {
      const d = new Date(firstOfMonth);
      d.setDate(d.getDate() - (startPadding - i));
      cells.push({ date: d, inMonth: false });
    }
    days.forEach((d) => cells.push({ date: d, inMonth: true }));
    // Pad to full weeks (multiples of 7) so grid always renders 4-6 rows.
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1]!.date;
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, inMonth: false });
    }
    return cells;
  }, [date, days]);

  const today = clinicWallClock();
  const todayKey = clinicToday();
  // No quick-create on past days or days the whole clinic is closed.
  const canCreateOn = (dateKey: string) => dateKey >= todayKey && closedDays?.[dateKey] === undefined;
  const selectedDayKey = selectedDay ? format(selectedDay, 'yyyy-MM-dd') : null;
  const selectedDayAppointments = useMemo(() => {
    if (!selectedDayKey) return [];
    const list = appointmentsByDate[selectedDayKey] ?? [];
    return [...list].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  }, [selectedDayKey, appointmentsByDate]);

  return (
    <div className="flex flex-col">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 dark:border-surface-700 dark:bg-surface-800">
        {weekdayLabels.map((d) => (
          <div
            key={d}
            className="border-r border-gray-100 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 last:border-r-0 dark:border-surface-700 dark:text-surface-400"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {gridCells.map((cell) => {
          const dateKey = format(cell.date, 'yyyy-MM-dd');
          const dayAppointments = appointmentsByDate[dateKey] ?? [];
          const isToday = isSameDay(cell.date, today);
          const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
          const visible = dayAppointments.slice(0, MAX_VISIBLE_PER_DAY);
          const overflow = dayAppointments.length - visible.length;
          const closedReason = closedDays?.[dateKey];

          return (
            <div
              key={dateKey}
              className={cn(
                'group relative min-h-[112px] border-b border-r border-gray-100 p-1.5 transition-colors last:border-r-0 dark:border-surface-700',
                !cell.inMonth && 'bg-gray-50/60 dark:bg-surface-900/60',
                cell.inMonth && isWeekend && 'bg-gray-50/40 dark:bg-surface-800/40',
                cell.inMonth && closedReason !== undefined && 'bg-gray-100 dark:bg-surface-800',
                cell.inMonth && 'hover:bg-brand-50/30 dark:hover:bg-brand-500/10',
                isToday && 'ring-1 ring-inset ring-brand-400',
              )}
            >
              {/* Day header: number + create button */}
              <div className="mb-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onDayClick(cell.date)}
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    isToday
                      ? 'bg-brand-500 text-white hover:bg-brand-600'
                      : cell.inMonth
                        ? 'text-gray-700 hover:bg-gray-200 dark:text-surface-200 dark:hover:bg-surface-700'
                        : 'text-gray-400 hover:bg-gray-200 dark:text-surface-500 dark:hover:bg-surface-700',
                  )}
                  title={t('uiScheduling.viewDate', { date: format(cell.date, 'dd/MM/yyyy') })}
                >
                  {format(cell.date, 'd')}
                </button>

                {cell.inMonth && closedReason !== undefined && (
                  <span
                    className="truncate rounded bg-gray-200 px-1 text-[10px] font-medium text-gray-600 dark:bg-surface-700 dark:text-surface-200"
                    title={t('uiScheduling.clinicClosedReason', { reason: closedReason })}
                  >
                    {t('uiScheduling.closed')}
                  </span>
                )}

                {cell.inMonth && onCreateAtSlot && dayAppointments.length === 0 && canCreateOn(dateKey) && (
                  <button
                    type="button"
                    onClick={() => onCreateAtSlot(cell.date, '09:00')}
                    className="rounded p-0.5 text-gray-400 opacity-0 transition-all hover:bg-brand-100 hover:text-brand-600 group-hover:opacity-100 dark:text-surface-500 dark:hover:bg-brand-500/20 dark:hover:text-brand-300"
                    aria-label={t('uiScheduling.createAppointmentDate', { date: format(cell.date, 'dd/MM') })}
                    title={t('uiScheduling.createAppointment')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Appointment blocks */}
              <div className="space-y-1">
                {visible.map((apt) => (
                  <AppointmentBlock
                    key={apt.id}
                    appointment={apt}
                    onClick={() => onAppointmentClick(apt)}
                    overdue={isOverdueNotArrived(apt, now)}
                  />
                ))}

                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDay(cell.date)}
                    className="inline-flex w-full items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-surface-100"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                    <span>{t('uiScheduling.moreCount', { count: overflow })}</span>
                  </button>
                )}

                {cell.inMonth && dayAppointments.length === 0 && (
                  <div className="flex h-6 items-center justify-center text-[10px] text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-surface-500">
                    {t('uiScheduling.empty')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Day-detail modal: shown when user clicks '+N khác' */}
      <Modal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        size="md"
        title={
          selectedDay
            ? `${t('uiScheduling.appointments')} — ${getWeekdayLabel(selectedDay)}, ${format(selectedDay, 'dd/MM/yyyy')}`
            : t('uiScheduling.appointments')
        }
        description={
          selectedDayAppointments.length > 0
            ? t('uiScheduling.appointmentsThatDay', { count: selectedDayAppointments.length })
            : undefined
        }
      >
        {selectedDay && (
          <DayAppointmentsList
            appointments={selectedDayAppointments}
            now={now}
            onAppointmentClick={(apt) => {
              onAppointmentClick(apt);
              setSelectedDay(null);
            }}
            onCreateAtSlot={
              onCreateAtSlot && canCreateOn(format(selectedDay, 'yyyy-MM-dd'))
                ? () => {
                    onCreateAtSlot(selectedDay, '09:00');
                    setSelectedDay(null);
                  }
                : undefined
            }
          />
        )}
      </Modal>
    </div>
  );
}

// =============================================================================
// Single appointment block (rendered inside a day cell)
// =============================================================================

interface AppointmentBlockProps {
  appointment: Appointment;
  onClick: () => void;
  overdue?: boolean;
}

function AppointmentBlock({ appointment, onClick, overdue = false }: AppointmentBlockProps) {
  const { t } = useTranslation();
  const type = appointment.appointmentType ?? 'consultation';
  const tooltipContent = (
    <div className="space-y-0.5 text-left">
      <p className="font-semibold">{appointment.patientName}</p>
      {overdue && <p className="text-[11px] font-semibold">{t(`uiScheduling.${OVERDUE_LABEL}`)}</p>}
      <p className="text-[11px] opacity-90">
        {formatTimeOnly(appointment.startsAt)} – {formatTimeOnly(appointment.endsAt)} •{' '}
        {t('uiScheduling.minutesValue', { count: appointment.durationMinutes })}
      </p>
      <p className="text-[11px] opacity-90">{t(`uiScheduling.type${type === 'follow_up' ? 'FollowUp' : type === 'consultation' ? 'Consultation' : 'Treatment'}`)}</p>
      {appointment.reason && (
        <p className="max-w-[200px] truncate text-[11px] opacity-75">{appointment.reason}</p>
      )}
    </div>
  );

  return (
    <Tooltip label={tooltipContent} side="top">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={cn(
          'group/apt flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] font-medium transition-all',
          'bg-white/70 ring-1 ring-inset hover:bg-white dark:bg-surface-800/80 dark:hover:bg-surface-700',
          'text-gray-700 hover:text-gray-900 dark:text-surface-100 dark:hover:text-white',
          TYPE_DOT[type],
          appointment.status === 'cancelled' && 'opacity-60 line-through',
          appointment.status === 'no_show' && 'opacity-60',
          overdue && 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
        )}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            overdue ? OVERDUE_DOT_CLASS : STATUS_DOT_COLORS[appointment.status],
          )}
          aria-hidden
        />
        {overdue && <span className="sr-only">{OVERDUE_LABEL}</span>}
          <span className="shrink-0 tabular-nums text-[10px] text-gray-500 dark:text-surface-300">
          {formatTimeOnly(appointment.startsAt)}
        </span>
        <span className="truncate">{appointment.patientName}</span>
      </button>
    </Tooltip>
  );
}

// =============================================================================
// Day-appointments list (rendered inside the modal)
// =============================================================================

interface DayAppointmentsListProps {
  appointments: Appointment[];
  now: number;
  onAppointmentClick: (apt: Appointment) => void;
  onCreateAtSlot?: () => void;
}

function DayAppointmentsList({
  appointments,
  now,
  onAppointmentClick,
  onCreateAtSlot,
}: DayAppointmentsListProps) {
  const { t } = useTranslation();
  if (appointments.length === 0) {
    return (
      <EmptyState
        title={t('uiScheduling.calendarNoAppointments')}
        description={t('uiScheduling.noAppointmentsThatDay')}
        action={
          onCreateAtSlot ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={onCreateAtSlot}>
              {t('uiScheduling.createAppointment')}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <ul className="-mx-2 divide-y divide-gray-100 dark:divide-surface-700">
      {appointments.map((apt) => {
        const type = apt.appointmentType ?? 'consultation';
        return (
          <li key={apt.id}>
            <button
              type="button"
              onClick={() => onAppointmentClick(apt)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left text-gray-900 transition-colors hover:bg-gray-50 dark:text-surface-100 dark:hover:bg-surface-800"
            >
              <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-md bg-gray-50 px-2 py-1 dark:bg-surface-800">
                <Clock className="h-3.5 w-3.5 text-gray-400 dark:text-surface-400" />
                <span className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-surface-100">
                  {formatTimeOnly(apt.startsAt)}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      'truncate text-sm font-medium text-gray-900 dark:text-surface-100',
                      (apt.status === 'cancelled' || apt.status === 'no_show') && 'line-through',
                    )}
                  >
                    {apt.patientName}
                  </p>
                  <AppointmentStatusBadge
                    status={apt.status}
                    overdue={isOverdueNotArrived(apt, now)}
                  />
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500 dark:text-surface-400">
                  <span className="inline-flex items-center gap-1">
                    <Stethoscope className="h-3 w-3" />
                    {t(`uiScheduling.type${type === 'follow_up' ? 'FollowUp' : type === 'consultation' ? 'Consultation' : 'Treatment'}`)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    {t('uiScheduling.minutesValue', { count: apt.durationMinutes })}
                  </span>
                  <span>{apt.dentistName}</span>
                </div>
                {apt.reason && (
                  <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-surface-400">{apt.reason}</p>
                )}
              </div>

              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-surface-500" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
