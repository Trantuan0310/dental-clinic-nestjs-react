import { format, isSameDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import { AlertTriangle, Clock } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useDentistOptions } from './appointmentApi';
import { isOverdueNotArrived, OVERDUE_LABEL, OVERDUE_BLOCK_CLASS, useNow } from './liveStatus';
import type { Appointment, AppointmentStatus, AppointmentType, ClockInterval } from '@/types/appointment';
import { formatTimeOnly } from '@/lib/format';
import { clinicWallClock } from '@/lib/clinicTime';
import { cn } from '@/lib/cn';
import {
  appointmentSpan,
  HOUR_HEIGHT_PX,
  isHourPast,
  layoutLanes,
  MIN_BLOCK_PX,
  type LaneSlot,
} from './calendarLayout';

// -----------------------------------------------------------------------------
// Shared constants
// -----------------------------------------------------------------------------

const PX_PER_MIN = HOUR_HEIGHT_PX / 60;
const MIN_BLOCK_MIN = Math.ceil(MIN_BLOCK_PX / PX_PER_MIN);

const STATUS_BG: Record<AppointmentStatus, string> = {
  scheduled: 'bg-gray-100 border-gray-300 text-gray-800',
  confirmed: 'bg-blue-50 border-blue-300 text-blue-800',
  checked_in: 'bg-cyan-50 border-cyan-300 text-cyan-800',
  in_progress: 'bg-amber-50 border-amber-400 text-amber-900',
  completed: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  cancelled: 'bg-red-50 border-red-300 text-red-700',
  no_show: 'bg-red-100 border-red-300 text-red-800',
  left: 'bg-orange-50 border-orange-300 text-orange-800',
};

const TYPE_DOT: Record<AppointmentType, string> = {
  consultation: 'bg-blue-500',
  treatment: 'bg-amber-500',
  follow_up: 'bg-emerald-500',
};

const TYPE_LABEL: Record<AppointmentType, string> = {
  consultation: 'Khám',
  treatment: 'Điều trị',
  follow_up: 'Tái khám',
};

const hhmm = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const hhmmToMin = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

/** Props shared by the day and week grids. */
interface TimeGridProps {
  /** Grid hours [hourStart, hourEnd) — see visibleHourRange(). */
  hourStart: number;
  hourEnd: number;
  /** Clinic-wide closed days ("yyyy-MM-dd" → reason): no quick-create there. */
  closedDays?: Record<string, string>;
  /** Working windows of the filtered dentist per clinic date (absent: no dentist filter). */
  workingWindows?: Record<string, ClockInterval[]>;
  /** Omit to hide the per-hour "+" quick-create affordance (e.g. actor lacks appointment.create). */
  onSlotClick?: (date: Date, time: string) => void;
  onAppointmentClick: (apt: Appointment) => void;
}

function HourGutter({ hours, className }: { hours: number[]; className?: string }) {
  return (
    <div className={cn('shrink-0 border-r border-gray-100', className)}>
      {hours.map((hour) => (
        <div
          key={hour}
          className="border-b border-gray-50 pr-2 pt-0.5 text-right text-[11px] text-gray-400"
          style={{ height: HOUR_HEIGHT_PX }}
        >
          {hhmm(hour)}
        </div>
      ))}
    </div>
  );
}

interface DayColumnProps
  extends Omit<TimeGridProps, 'closedDays' | 'workingWindows' | 'hourEnd'> {
  day: Date;
  hours: number[];
  appointments: Appointment[];
  closedReason?: string;
  windows?: ClockInterval[];
  now: number;
  compact?: boolean;
  className?: string;
}

/** One day's column: working hours, hour slots and side-by-side booking blocks. */
function DayColumn({
  day,
  hours,
  hourStart,
  appointments,
  closedReason,
  windows,
  now,
  compact = false,
  className,
  onSlotClick,
  onAppointmentClick,
}: DayColumnProps) {
  const dateKey = format(day, 'yyyy-MM-dd');
  const gridStartMin = hourStart * 60;
  const lanes = layoutLanes(appointments, MIN_BLOCK_MIN);
  const closed = closedReason !== undefined;

  return (
    <div
      className={cn('relative', closed && 'bg-gray-100/80', className)}
      style={{ height: hours.length * HOUR_HEIGHT_PX }}
      title={closed ? `Phòng khám nghỉ: ${closedReason}` : undefined}
    >
      {/* Working hours of the filtered dentist */}
      {!closed &&
        windows?.map((w) => (
          <div
            key={`${w.startTime}-${w.endTime}`}
            className="pointer-events-none absolute inset-x-0 bg-emerald-50/70"
            style={{
              top: (hhmmToMin(w.startTime) - gridStartMin) * PX_PER_MIN,
              height: (hhmmToMin(w.endTime) - hhmmToMin(w.startTime)) * PX_PER_MIN,
            }}
            aria-hidden
          />
        ))}

      {/* Hour lines + quick-create slots (not on closed days or past hours) */}
      {hours.map((hour) => {
        const style = { top: (hour - hourStart) * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX };
        return onSlotClick && !closed && !isHourPast(dateKey, hour, now) ? (
          <button
            key={hour}
            type="button"
            onClick={() => onSlotClick(day, hhmm(hour))}
            className="absolute left-0 right-0 border-b border-gray-50 px-1 text-left text-[10px] text-transparent hover:bg-brand-50/40 hover:text-brand-500"
            style={style}
            title={`Tạo lịch ${format(day, 'dd/MM')} ${hhmm(hour)}`}
          >
            +
          </button>
        ) : (
          <div
            key={hour}
            className="pointer-events-none absolute left-0 right-0 border-b border-gray-50"
            style={style}
          />
        );
      })}

      {/* Appointment blocks */}
      {appointments.map((apt) => {
        const { start, end } = appointmentSpan(apt);
        return (
          <AppointmentBlock
            key={apt.id}
            appointment={apt}
            top={(start - gridStartMin) * PX_PER_MIN}
            height={Math.max((end - start) * PX_PER_MIN, 20)}
            lane={lanes.get(apt.id)}
            onClick={() => onAppointmentClick(apt)}
            overdue={isOverdueNotArrived(apt, now)}
            compact={compact}
          />
        );
      })}
    </div>
  );
}

const byStart = (a: Appointment, b: Appointment) =>
  new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();

// -----------------------------------------------------------------------------
// Day View
// -----------------------------------------------------------------------------

interface DayViewProps extends TimeGridProps {
  date: Date;
  appointments: Appointment[];
}

export function DayView({
  date,
  appointments,
  hourStart,
  hourEnd,
  closedDays,
  workingWindows,
  onSlotClick,
  onAppointmentClick,
}: DayViewProps) {
  const now = useNow();
  const dateKey = format(date, 'yyyy-MM-dd');
  const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i);
  const closedReason = closedDays?.[dateKey];

  return (
    <div>
      {closedReason !== undefined && (
        <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          Phòng khám nghỉ cả ngày: {closedReason}
        </div>
      )}
      <div className="flex">
        <HourGutter hours={hours} className="w-16 sm:w-20" />
        <DayColumn
          day={date}
          hours={hours}
          hourStart={hourStart}
          appointments={appointments.slice().sort(byStart)}
          closedReason={closedReason}
          windows={workingWindows?.[dateKey]}
          now={now}
          className="flex-1"
          onSlotClick={onSlotClick}
          onAppointmentClick={onAppointmentClick}
        />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Week View
// -----------------------------------------------------------------------------

interface WeekViewProps extends TimeGridProps {
  days: Date[];
  appointmentsByDate: Record<string, Appointment[]>;
}

export function WeekView({
  days,
  appointmentsByDate,
  hourStart,
  hourEnd,
  closedDays,
  workingWindows,
  onSlotClick,
  onAppointmentClick,
}: WeekViewProps) {
  const today = clinicWallClock();
  const now = useNow();
  const hours = Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i);
  const gridTemplateColumns = `56px repeat(${days.length}, minmax(96px, 1fr))`;

  // min-width keeps seven columns readable on a phone; the parent scrolls sideways.
  return (
    <div className="min-w-[720px]">
      {/* Day headers */}
      <div className="grid border-b border-gray-200 bg-gray-50" style={{ gridTemplateColumns }}>
        <div className="border-r border-gray-100" />
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          const closedReason = closedDays?.[format(day, 'yyyy-MM-dd')];
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'border-r border-gray-100 px-2 py-2 text-center last:border-r-0',
                isToday && 'bg-brand-50',
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {format(day, 'EEE', { locale: vi })}
              </p>
              <p
                className={cn(
                  'text-base font-semibold',
                  isToday ? 'text-brand-700' : 'text-gray-900',
                )}
              >
                {format(day, 'd')}
              </p>
              {closedReason !== undefined && (
                <p className="truncate text-[10px] font-medium text-gray-500" title={closedReason}>
                  Nghỉ: {closedReason}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="grid" style={{ gridTemplateColumns }}>
        <HourGutter hours={hours} />
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          return (
            <DayColumn
              key={dateKey}
              day={day}
              hours={hours}
              hourStart={hourStart}
              appointments={(appointmentsByDate[dateKey] ?? []).slice().sort(byStart)}
              closedReason={closedDays?.[dateKey]}
              windows={workingWindows?.[dateKey]}
              now={now}
              compact
              className={cn(
                'border-r border-gray-100 last:border-r-0',
                isSameDay(day, today) && 'bg-brand-50/30',
              )}
              onSlotClick={onSlotClick}
              onAppointmentClick={onAppointmentClick}
            />
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Appointment block (used by both Day and Week)
// -----------------------------------------------------------------------------

interface AppointmentBlockProps {
  appointment: Appointment;
  top: number;
  height: number;
  /** Side-by-side position among overlapping blocks (whole width when absent). */
  lane?: LaneSlot;
  onClick: () => void;
  compact?: boolean;
  /** Booked, not arrived, past the start by more than the grace time. */
  overdue?: boolean;
}

function AppointmentBlock({
  appointment,
  top,
  height,
  lane,
  onClick,
  compact = false,
  overdue = false,
}: AppointmentBlockProps) {
  const type = appointment.appointmentType ?? 'consultation';
  // Status keeps the block colour; the dentist's profile colour marks whose it is.
  const { data: dentists } = useDentistOptions();
  const dentistColor = dentists?.find((d) => d.id === appointment.dentistId)?.calendarColor;
  const tooltipContent = (
    <div className="space-y-0.5 text-left">
      <p className="font-semibold">{appointment.patientName}</p>
      {overdue && <p className="text-[11px] font-semibold">{OVERDUE_LABEL}</p>}
      <p className="text-[11px] opacity-90">
        {formatTimeOnly(appointment.startsAt)} – {formatTimeOnly(appointment.endsAt)} • {appointment.durationMinutes}p
      </p>
      <p className="text-[11px] opacity-90">
        {TYPE_LABEL[type]} • {appointment.dentistName}
      </p>
      {appointment.reason && (
        <p className="max-w-[220px] truncate text-[11px] opacity-75">{appointment.reason}</p>
      )}
    </div>
  );

  const showDetails = height >= 50;

  // The absolutely-positioned block must be positioned relative to the day/
  // week column (the nearest `relative` ancestor up the tree), not relative
  // to Tooltip's own `relative` wrapper span — Tooltip needs that span to
  // anchor its popover, but nesting an absolute+top/height element directly
  // inside it hijacks the positioning context and collapses the block to
  // the span's own (zero) size. Keep the positioning on this outer <div>
  // and let Tooltip wrap only the (now relatively-sized) inner button.
  return (
    <div
      className="absolute z-10"
      style={{
        top: `${top}px`,
        height: `${Math.max(height, MIN_BLOCK_PX)}px`,
        left: `calc(${((lane?.lane ?? 0) / (lane?.lanes ?? 1)) * 100}% + 2px)`,
        width: `calc(${100 / (lane?.lanes ?? 1)}% - 4px)`,
      }}
    >
      <Tooltip label={tooltipContent} side="right" className="h-full w-full">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className={cn(
            'h-full w-full overflow-hidden rounded-md border-l-4 px-2 py-1 text-left shadow-sm transition-all hover:shadow-md hover:z-20',
            overdue ? OVERDUE_BLOCK_CLASS : STATUS_BG[appointment.status],
            appointment.status === 'cancelled' && 'opacity-60 line-through',
            (appointment.status === 'no_show' || appointment.status === 'left') && 'opacity-60',
          )}
        >
          <div className="flex items-start gap-1.5">
            <span
              className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', TYPE_DOT[type])}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 truncate text-[11px] font-semibold">
                {overdue ? (
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-label={OVERDUE_LABEL} />
                ) : (
                  showDetails && <Clock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                )}
                <span className="truncate">{formatTimeOnly(appointment.startsAt)}</span>
              </div>
              {overdue && showDetails && !compact && (
                <p className="truncate text-[10px] font-semibold">{OVERDUE_LABEL}</p>
              )}
              <p className={cn('truncate text-xs font-medium', compact ? 'text-[11px]' : 'text-xs')}>
                {appointment.patientName}
              </p>
              {!compact && showDetails && (
                <p className="flex items-center gap-1 truncate text-[10px] opacity-75">
                  {dentistColor && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: dentistColor }}
                      aria-hidden
                    />
                  )}
                  <span className="truncate">{appointment.dentistName}</span>
                </p>
              )}
            </div>
          </div>
        </button>
      </Tooltip>
    </div>
  );
}
