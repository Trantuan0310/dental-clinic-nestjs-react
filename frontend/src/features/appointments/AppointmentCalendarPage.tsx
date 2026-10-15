import { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  format,
  addDays,
  addMonths,
  addWeeks,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from 'date-fns';
import { clinicParts, clinicWallClock } from '@/lib/clinicTime';
import { vi } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Plus, ChevronLeft, ChevronRight, UserRoundPlus } from 'lucide-react';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';
import { appointmentsApi } from '@/features/appointments/imperativeApi';
import { LIST_ALL_LIMIT, useDentistOptions } from './appointmentApi';
import { Alert, Button, Card, Checkbox, EmptyState, Select, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useAuthStore } from '@/stores/authStore';
import type {
  Appointment,
  AppointmentFilters,
  AppointmentStatus,
  ClockInterval,
} from '@/types/appointment';
import type { ClinicClosure } from '@/types/schedule';
import { MonthView } from './MonthView';
import { DayView, WeekView } from './CalendarViews';
import { closedDaysInRange, visibleHourRange } from './calendarLayout';
import { liveAppointmentQuery, OVERDUE_DOT_CLASS } from './liveStatus';

// Heavy modals — only loaded when user opens create/edit dialog.
const AppointmentFormModal = lazy(() =>
  import('./AppointmentFormModal').then((m) => ({ default: m.AppointmentFormModal })),
);
const WalkInModal = lazy(() =>
  import('./WalkInModal').then((m) => ({ default: m.WalkInModal })),
);
const AppointmentDetailDrawer = lazy(() =>
  import('./AppointmentDetailDrawer').then((m) => ({ default: m.AppointmentDetailDrawer })),
);

const VIEW_MODES = ['day', 'week', 'month'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

const STATUS_DOT: Record<AppointmentStatus, string> = {
  scheduled: 'bg-gray-400',
  confirmed: 'bg-blue-500',
  checked_in: 'bg-cyan-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-red-400',
  no_show: 'bg-red-500',
  left: 'bg-orange-400',
};

const STATUS_TRANSLATION: Record<AppointmentStatus, string> = {
  scheduled: 'statusScheduled', confirmed: 'statusConfirmed', checked_in: 'statusCheckedIn',
  in_progress: 'statusInProgress', completed: 'statusCompleted', cancelled: 'statusCancelled',
  no_show: 'statusNoShow', left: 'statusLeft',
};

/** Hidden unless "Hiện lịch đã hủy/vắng" is on or the status filter asks for them. */
const HIDDEN_BY_DEFAULT = new Set<AppointmentStatus>(['cancelled', 'no_show']);

interface AppointmentCalendarPageProps {
  /** "Lịch của tôi": locked to the signed-in dentist. */
  mine?: boolean;
}

export default function AppointmentCalendarPage({ mine = false }: AppointmentCalendarPageProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.resolvedLanguage?.startsWith('en') ? enUS : vi;
  const [searchParams] = useSearchParams();
  // Dentists hold appointment.create too (follow-ups on their own calendar,
  // see PHAN_QUYEN.md); a role without it gets no create modal and no
  // per-slot "+" quick-create, instead of a button that 403s on submit.
  const canCreate = useAuthStore((s) => s.hasPermission('appointment.create'));
  const canReadSchedule = useAuthStore((s) => s.hasPermission('schedule.read'));
  const userId = useAuthStore((s) => s.user?.id);
  // Arriving from a patient's profile with ?patientId= opens the create
  // modal pre-filled with that patient, instead of landing on a plain calendar.
  const prefilledPatientId = searchParams.get('patientId') ?? undefined;
  // Dashboard's empty-state "Tạo lịch hẹn" links here with ?action=create —
  // previously ignored, landing on a bare calendar instead of the modal.
  const wantsCreateModal = searchParams.get('action') === 'create';

  // Clinic dates, whatever the browser's time zone (see clinicWallClock).
  const [currentDate, setCurrentDate] = useState(() => clinicWallClock());
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = searchParams.get('view');
    return VIEW_MODES.includes(v as ViewMode) ? (v as ViewMode) : 'day';
  });
  const [selectedDentistId, setSelectedDentistId] = useState<string>(
    () => searchParams.get('dentistId') ?? '',
  );
  const dentistId = mine ? (userId ?? '') : selectedDentistId;
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');
  const [showCancelled, setShowCancelled] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(!!prefilledPatientId || wantsCreateModal);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);
  // Clicking an appointment block opens the same rich detail drawer
  // (check-in / cancel / reschedule / no-show / start-encounter) the
  // List view uses, instead of the plain reason/notes-only form modal —
  // that used to be the only way to reach those actions from Calendar view.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  // Dentists with bookings to show, including suspended / on-leave ones.
  const { data: dentists } = useDentistOptions('schedule');

  // The week grid reads like a personal timetable only for one dentist (with
  // everyone's bookings in the same columns they sit side by side), so moving
  // to it from "all dentists" picks one: the signed-in dentist, else the first.
  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'week' && !mine && !selectedDentistId && dentists?.length) {
      setSelectedDentistId(dentists.find((d) => d.id === userId)?.id ?? dentists[0].id);
    }
  };

  // Calculate date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === 'day') {
      return { start: currentDate, end: currentDate };
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return { start, end };
    } else {
      return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
    }
  }, [currentDate, viewMode]);

  const filters: AppointmentFilters = {
    from: format(dateRange.start, 'yyyy-MM-dd'),
    to: format(dateRange.end, 'yyyy-MM-dd'),
    dentistId: dentistId || undefined,
  };

  // Every booking of the week/month (the old single page of 100 cut a busy
  // month silently); the notice below covers the safety cap.
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['appointments', 'all', filters],
    queryFn: () => appointmentsApi.listAll(filters),
    ...liveAppointmentQuery(filters),
  });

  const appointments = useMemo(() => data?.data ?? [], [data]);

  // Status filter + "hide cancelled/no-show" switch, applied on the client
  // so switching them does not refetch.
  const visibleAppointments = useMemo(
    () =>
      appointments.filter((a) =>
        statusFilter !== 'all'
          ? a.status === statusFilter
          : showCancelled || !HIDDEN_BY_DEFAULT.has(a.status),
      ),
    [appointments, statusFilter, showCancelled],
  );
  const hiddenCancelledCount =
    statusFilter === 'all' && !showCancelled
      ? appointments.filter((a) => HIDDEN_BY_DEFAULT.has(a.status)).length
      : 0;

  const daysToShow = useMemo(
    () =>
      viewMode === 'day'
        ? [currentDate]
        : eachDayOfInterval({ start: dateRange.start, end: dateRange.end }),
    [viewMode, currentDate, dateRange],
  );
  const dayKeys = useMemo(() => daysToShow.map((d) => format(d, 'yyyy-MM-dd')), [daysToShow]);

  // Clinic-wide closed days (Tết, holidays) in view. Keyed under
  // ['schedule', 'clinic-closures'] so editing a closure refreshes it.
  const { data: closures } = useQuery({
    queryKey: ['schedule', 'clinic-closures', { from: filters.from }],
    queryFn: async () => {
      const { data: body } = await api.get<AuthEnvelope<ClinicClosure[]>>(
        '/appointments/clinic-closures',
        { params: { from: filters.from } },
      );
      return unwrap(body);
    },
    enabled: canReadSchedule,
    staleTime: 5 * 60_000,
  });
  const closedDays = useMemo(
    () => closedDaysInRange(closures ?? [], filters.from!, filters.to!),
    [closures, filters.from, filters.to],
  );

  // Working hours of the filtered dentist, one availability read per day of
  // the day/week grid (under ['appointments', 'availability'] so schedule
  // edits refresh it).
  const showWindows = !!dentistId && viewMode !== 'month';
  const windowQueries = useQueries({
    queries: (showWindows ? dayKeys : []).map((date) => ({
      queryKey: ['appointments', 'availability', 'calendar', dentistId, date],
      queryFn: async () => {
        const { data: body } = await api.get<AuthEnvelope<{ windows?: ClockInterval[] }>>(
          '/appointments/availability',
          { params: { dentistId, date } },
        );
        return unwrap(body).windows ?? [];
      },
      staleTime: 5 * 60_000,
    })),
  });
  const workingWindows: Record<string, ClockInterval[]> | undefined = showWindows
    ? Object.fromEntries(
        dayKeys.flatMap((d, i) => {
          const w = windowQueries[i]?.data;
          return w ? [[d, w] as const] : [];
        }),
      )
    : undefined;

  const handleDateChange = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(clinicWallClock());
    } else {
      const delta = direction === 'next' ? 1 : -1;
      if (viewMode === 'day') {
        setCurrentDate(d => addDays(d, delta));
      } else if (viewMode === 'week') {
        setCurrentDate(d => addWeeks(d, delta));
      } else {
        // addMonths clamps 31/01 to 28/02; setMonth rolled it over to 03/03.
        setCurrentDate(d => addMonths(d, delta));
      }
    }
  }, [viewMode]);

  const handleSlotClick = useCallback((date: Date, time: string) => {
    setSelectedSlot({
      date: format(date, 'yyyy-MM-dd'),
      time,
    });
    setShowCreateModal(true);
  }, []);

  const handleAppointmentClick = useCallback((appointment: Appointment) => {
    setDetailId(appointment.id);
  }, []);

  // Group appointments by date for display
  const appointmentsByDate = useMemo(() => {
    const grouped: Record<string, Appointment[]> = {};
    visibleAppointments.forEach(apt => {
      const dateKey = clinicParts(apt.startsAt).date;
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(apt);
    });
    return grouped;
  }, [visibleAppointments]);

  // Day/week grid: 07–19h, widened to fit every booking and working window in view.
  const { hourStart, hourEnd } = visibleHourRange(
    dayKeys.flatMap((d) => appointmentsByDate[d] ?? []),
    workingWindows ? Object.values(workingWindows).flat() : [],
  );

  const dentistName = dentists?.find((d) => d.id === dentistId)?.fullName;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">
            {mine ? t('uiScheduling.myCalendar') : t('uiScheduling.calendarView')}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-surface-400">
            {mine ? t('uiScheduling.myAppointmentsByPeriod') : t('uiScheduling.viewAppointmentsByPeriod')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/appointments/list">
            <Button variant="outline">{t('uiScheduling.tableView')}</Button>
          </Link>
          <PermissionGuard permission="appointment.check_in">
            <Button variant="outline" onClick={() => setShowWalkIn(true)}>
              <UserRoundPlus className="h-4 w-4" />
              {t('uiScheduling.walkIn')}
            </Button>
          </PermissionGuard>
          <PermissionGuard permission="appointment.create">
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" />
              {t('uiScheduling.createAppointment')}
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {data?.pagination?.hasMore && (
        <Alert type="warning">
          {t('uiScheduling.moreAppointments', { count: LIST_ALL_LIMIT })}
        </Alert>
      )}

      {isError && data && (
        <Alert type="warning">
          <span>{t('uiScheduling.staleAppointments')}</span>
          <button
            type="button"
            className="font-medium underline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {t('uiScheduling.retry')}
          </button>
        </Alert>
      )}

      <Card noPadding>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-3 dark:border-surface-700">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" aria-label={t('uiScheduling.previousPeriod')} onClick={() => handleDateChange('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDateChange('today')}>
              {t('uiScheduling.today')}
            </Button>
            <Button variant="ghost" size="sm" aria-label={t('uiScheduling.nextPeriod')} onClick={() => handleDateChange('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
              <span className="ml-2 text-lg font-medium text-gray-900 dark:text-surface-100">
              {viewMode === 'day' && format(currentDate, 'EEEE, dd/MM/yyyy', { locale: dateLocale })}
              {viewMode === 'week' && `${format(dateRange.start, 'dd/MM')} - ${format(dateRange.end, 'dd/MM/yyyy')}`}
              {viewMode === 'month' && format(currentDate, 'MMMM yyyy', { locale: dateLocale })}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={t('uiScheduling.status')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | 'all')}
              options={[
                { value: 'all', label: t('uiScheduling.allStatuses') },
                ...Object.keys(STATUS_TRANSLATION).map((status) => ({ value: status, label: t(`uiScheduling.${STATUS_TRANSLATION[status as AppointmentStatus]}`) })),
              ]}
              className="min-w-[150px] py-1.5"
            />
            {statusFilter === 'all' && (
              <Checkbox
                checked={showCancelled}
                onChange={setShowCancelled}
                label={
                    <span className="whitespace-nowrap text-gray-700 dark:text-surface-200">
                    {t('uiScheduling.showCancelled')}
                    {hiddenCancelledCount > 0 && ` (${hiddenCancelledCount})`}
                  </span>
                }
              />
            )}
            <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-surface-800">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={viewMode === mode}
                  onClick={() => changeViewMode(mode)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    viewMode === mode
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-surface-800 dark:text-surface-100'
                      : 'text-gray-600 hover:text-gray-900 dark:text-surface-300 dark:hover:text-surface-100'
                  }`}
                >
                  {t(`uiScheduling.${mode}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dentist filter: one dentist shows a clean timetable, "all" shows the clinic */}
        {!mine && dentists && dentists.length > 0 && (
          <div
            role="group"
            aria-label={t('uiScheduling.dentist')}
            className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-surface-700"
          >
            {[{ id: '', fullName: t('uiScheduling.allDentists'), calendarColor: null as string | null }, ...dentists].map((d) => {
              const active = selectedDentistId === d.id;
              return (
                <button
                  key={d.id || 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedDentistId(d.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                    active
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200 dark:hover:bg-surface-700',
                  )}
                >
                  {d.calendarColor && (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/70"
                      style={{ backgroundColor: d.calendarColor }}
                      aria-hidden
                    />
                  )}
                  {d.fullName}
                </button>
              );
            })}
          </div>
        )}

        {/* Calendar Grid */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              <span className="sr-only">{t('uiScheduling.loadingAppointments')}</span>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError && !data ? (
            // An error must not look like an empty calendar.
            <EmptyState
              icon={<AlertCircle className="h-10 w-10 text-red-400" />}
              title={t('uiScheduling.cannotLoadAppointments')}
              description={t('uiScheduling.loadError')}
              action={{ label: t('uiScheduling.retry'), onClick: () => refetch() }}
            />
          ) : (
            <>
              {viewMode === 'day' && (
                <DayView
                  date={currentDate}
                  appointments={appointmentsByDate[format(currentDate, 'yyyy-MM-dd')] || []}
                  hourStart={hourStart}
                  hourEnd={hourEnd}
                  closedDays={closedDays}
                  workingWindows={workingWindows}
                  onSlotClick={canCreate ? handleSlotClick : undefined}
                  onAppointmentClick={handleAppointmentClick}
                />
              )}
              {viewMode === 'week' && (
                <WeekView
                  days={daysToShow}
                  appointmentsByDate={appointmentsByDate}
                  hourStart={hourStart}
                  hourEnd={hourEnd}
                  closedDays={closedDays}
                  workingWindows={workingWindows}
                  onSlotClick={canCreate ? handleSlotClick : undefined}
                  onAppointmentClick={handleAppointmentClick}
                />
              )}
              {viewMode === 'month' && (
                <MonthView
                  date={currentDate}
                  days={daysToShow}
                  appointmentsByDate={appointmentsByDate}
                  closedDays={closedDays}
                  onDayClick={(d) => {
                    setCurrentDate(d);
                    setViewMode('day');
                  }}
                  onAppointmentClick={handleAppointmentClick}
                  onCreateAtSlot={canCreate ? (d, time) => handleSlotClick(d, time) : undefined}
                />
              )}
            </>
          )}
        </div>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs dark:border-surface-700 dark:bg-surface-900">
        <span className="font-semibold text-gray-500 dark:text-surface-400">{t('uiScheduling.status')}:</span>
        {Object.keys(STATUS_TRANSLATION).map((status) => {
          const s = status as AppointmentStatus;
          return (
          <div key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[s]}`} />
            <span className="text-gray-700 dark:text-surface-200">{t(`uiScheduling.${STATUS_TRANSLATION[s]}`)}</span>
          </div>
          );
        })}
        <div className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${OVERDUE_DOT_CLASS}`} />
          <span className="text-gray-700 dark:text-surface-200">{t('uiScheduling.overdueNotArrived')} ({t('uiScheduling.over15Minutes')})</span>
        </div>
        {workingWindows && (
          <div className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm border border-emerald-200 bg-emerald-50" />
            <span className="text-gray-700 dark:text-surface-200">{t('uiScheduling.workingHours')}{dentistName ? ` ${t('uiScheduling.dentist').toLowerCase()} ${dentistName}` : ''}</span>
          </div>
        )}
        {Object.keys(closedDays).length > 0 && (
          <div className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-gray-200 dark:bg-surface-600" />
            <span className="text-gray-700 dark:text-surface-200">{t('uiScheduling.clinicClosed')}</span>
          </div>
        )}
      </div>

      {/* Create modal — AppointmentFormModal renders its own <Modal> wrapper
          internally (title/footer/size included), so it's rendered
          directly here, not re-wrapped in another one. */}
      {showCreateModal && (
        <Suspense fallback={<div className="p-6 text-center text-sm text-gray-500 dark:text-surface-400">{t('uiScheduling.loading')}</div>}>
          <AppointmentFormModal
            open={showCreateModal}
            onClose={() => {
              setShowCreateModal(false);
              setSelectedSlot(null);
            }}
            defaultDate={selectedSlot?.date}
            defaultStartTime={selectedSlot?.time}
            defaultDentistId={dentistId || undefined}
            defaultPatientId={prefilledPatientId}
          />
        </Suspense>
      )}

      {showWalkIn && (
        <Suspense fallback={null}>
          <WalkInModal
            open={showWalkIn}
            onClose={() => setShowWalkIn(false)}
            onCreated={(id) => setDetailId(id)}
          />
        </Suspense>
      )}

      {/* Edit modal — opened via the detail drawer's "Sửa" action */}
      {editingAppointment && (
        <Suspense fallback={<div className="p-6 text-center text-sm text-gray-500 dark:text-surface-400">{t('uiScheduling.loading')}</div>}>
          <AppointmentFormModal
            open={!!editingAppointment}
            onClose={() => setEditingAppointment(null)}
            appointment={editingAppointment}
          />
        </Suspense>
      )}

      {/* Detail drawer — check-in / cancel / reschedule / no-show / start-encounter */}
      {detailId && (
        <Suspense fallback={null}>
          <AppointmentDetailDrawer
            appointmentId={detailId}
            onClose={() => setDetailId(null)}
            onEdit={(a) => {
              setDetailId(null);
              setEditingAppointment(a);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

// Day View and Week View moved to ./CalendarViews.tsx

// Month View Component - moved to ./MonthView.tsx
