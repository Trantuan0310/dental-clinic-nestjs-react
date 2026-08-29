import { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Clock } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Appointment, AppointmentStatus, AppointmentType } from '@/types/appointment';
import { formatTimeOnly } from '@/lib/format';
import { cn } from '@/lib/cn';

// -----------------------------------------------------------------------------
// Shared constants
// -----------------------------------------------------------------------------

const HOUR_START = 7;
const HOUR_END = 19;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const HOUR_HEIGHT_PX = 56; // visual height of a 1-hour row
const DAY_START_MIN = HOUR_START * 60;
const DAY_END_MIN = HOUR_END * 60;

const STATUS_BG: Record<AppointmentStatus, string> = {
  scheduled: 'bg-gray-100 border-gray-300 text-gray-800',
  confirmed: 'bg-blue-50 border-blue-300 text-blue-800',
  checked_in: 'bg-cyan-50 border-cyan-300 text-cyan-800',
  in_progress: 'bg-amber-50 border-amber-400 text-amber-900',
  completed: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  cancelled: 'bg-red-50 border-red-300 text-red-700',
  no_show: 'bg-red-100 border-red-300 text-red-800',
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

function minutesFromMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function appointmentTopPx(iso: string): number {
  const min = minutesFromMidnight(iso);
  if (min <= DAY_START_MIN) return 0;
  if (min >= DAY_END_MIN) return (DAY_END_MIN - DAY_START_MIN) * (HOUR_HEIGHT_PX / 60);
  return (min - DAY_START_MIN) * (HOUR_HEIGHT_PX / 60);
}

function appointmentHeightPx(startIso: string, endIso: string): number {
  const startMin = minutesFromMidnight(startIso);
  const endMin = minutesFromMidnight(endIso);
  const clampedStart = Math.max(startMin, DAY_START_MIN);
  const clampedEnd = Math.min(endMin, DAY_END_MIN);
  const dur = Math.max(clampedEnd - clampedStart, 20); // min 20px so very short appts stay clickable
  return dur * (HOUR_HEIGHT_PX / 60);
}

// -----------------------------------------------------------------------------
// Day View
// -----------------------------------------------------------------------------

interface DayViewProps {
  date: Date;
  appointments: Appointment[];
  onSlotClick: (date: Date, time: string) => void;
  onAppointmentClick: (apt: Appointment) => void;
}

export function DayView({ date, appointments, onSlotClick, onAppointmentClick }: DayViewProps) {
  const dayAppointments = useMemo(
    () =>
      appointments
        .filter((a) => isSameDay(new Date(a.startsAt), date))
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [appointments, date],
  );

  return (
    <div className="min-h-[600px]">
      <div className="flex">
        {/* Hour gutter */}
        <div className="w-20 shrink-0 border-r border-gray-100">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="border-b border-gray-50 pr-2 pt-1 text-right text-xs text-gray-400"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Single day column with absolute-positioned appt blocks */}
        <div className="relative flex-1">
          {/* Hour lines */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="border-b border-gray-50"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              <button
                type="button"
                onClick={() =>
                  onSlotClick(
                    date,
                    `${String(hour).padStart(2, '0')}:00`,
                  )
                }
                className="ml-1 mt-1 inline-flex h-4 items-center rounded px-1 text-[10px] text-transparent hover:bg-brand-50 hover:text-brand-600"
                title={`Tạo lịch ${String(hour).padStart(2, '0')}:00`}
              >
                +
              </button>
            </div>
          ))}

          {/* Appointment blocks */}
          {dayAppointments.map((apt) => (
            <AppointmentBlock
              key={apt.id}
              appointment={apt}
              top={appointmentTopPx(apt.startsAt)}
              height={appointmentHeightPx(apt.startsAt, apt.endsAt)}
              onClick={() => onAppointmentClick(apt)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Week View
// -----------------------------------------------------------------------------

interface WeekViewProps {
  days: Date[];
  appointmentsByDate: Record<string, Appointment[]>;
  onSlotClick: (date: Date, time: string) => void;
  onAppointmentClick: (apt: Appointment) => void;
}

export function WeekView({
  days,
  appointmentsByDate,
  onSlotClick,
  onAppointmentClick,
}: WeekViewProps) {
  const today = new Date();

  return (
    <div className="min-h-[600px]">
      {/* Day headers */}
      <div
        className="grid border-b border-gray-200 bg-gray-50"
        style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}
      >
        <div className="border-r border-gray-100" />
        {days.map((day) => {
          const isToday = isSameDay(day, today);
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
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}
      >
        {/* Hour gutter */}
        <div className="border-r border-gray-100">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="border-b border-gray-50 pr-2 pt-0.5 text-right text-[11px] text-gray-400"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayAppointments = (appointmentsByDate[dateKey] ?? []).slice().sort(
            (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
          );
          const isToday = isSameDay(day, today);

          return (
            <div
              key={dateKey}
              className={cn(
                'relative border-r border-gray-100 last:border-r-0',
                isToday && 'bg-brand-50/30',
              )}
              style={{ height: HOURS.length * HOUR_HEIGHT_PX }}
            >
              {/* Hour slot buttons */}
              {HOURS.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  onClick={() =>
                    onSlotClick(
                      day,
                      `${String(hour).padStart(2, '0')}:00`,
                    )
                  }
                  className="absolute left-0 right-0 border-b border-gray-50 px-1 text-left text-[10px] text-transparent hover:bg-brand-50/40 hover:text-brand-500"
                  style={{ top: (hour - HOUR_START) * HOUR_HEIGHT_PX, height: HOUR_HEIGHT_PX }}
                  title={`Tạo lịch ${format(day, 'dd/MM')} ${String(hour).padStart(2, '0')}:00`}
                >
                  +
                </button>
              ))}

              {/* Appointment blocks */}
              {dayAppointments.map((apt) => (
                <AppointmentBlock
                  key={apt.id}
                  appointment={apt}
                  top={appointmentTopPx(apt.startsAt)}
                  height={appointmentHeightPx(apt.startsAt, apt.endsAt)}
                  onClick={() => onAppointmentClick(apt)}
                  compact
                />
              ))}
            </div>
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
  onClick: () => void;
  compact?: boolean;
}

function AppointmentBlock({ appointment, top, height, onClick, compact = false }: AppointmentBlockProps) {
  const type = appointment.appointmentType ?? 'consultation';
  const tooltipContent = (
    <div className="space-y-0.5 text-left">
      <p className="font-semibold">{appointment.patientName}</p>
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

  return (
    <Tooltip label={tooltipContent} side="right">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={cn(
          'absolute inset-x-1 z-10 overflow-hidden rounded-md border-l-4 px-2 py-1 text-left shadow-sm transition-all hover:shadow-md hover:z-20',
          STATUS_BG[appointment.status],
          appointment.status === 'cancelled' && 'opacity-60 line-through',
          appointment.status === 'no_show' && 'opacity-60',
        )}
        style={{ top: `${top}px`, height: `${Math.max(height, 24)}px` }}
      >
        <div className="flex items-start gap-1.5">
          <span
            className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', TYPE_DOT[type])}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 truncate text-[11px] font-semibold">
              {showDetails && (
                <Clock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              )}
              <span className="truncate">{formatTimeOnly(appointment.startsAt)}</span>
            </div>
            <p className={cn('truncate text-xs font-medium', compact ? 'text-[11px]' : 'text-xs')}>
              {appointment.patientName}
            </p>
            {!compact && showDetails && (
              <p className="truncate text-[10px] opacity-75">{appointment.dentistName}</p>
            )}
          </div>
        </div>
      </button>
    </Tooltip>
  );
}
