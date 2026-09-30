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
import { AlertCircle, Plus, ChevronLeft, ChevronRight, UserRoundPlus } from 'lucide-react';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';
import { appointmentsApi } from '@/features/appointments/imperativeApi';
import { LIST_ALL_LIMIT, useDentistOptions } from './appointmentApi';
import { Alert, Button, Card, Checkbox, EmptyState, Select, Skeleton } from '@/components/ui';
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
import { liveAppointmentQuery, OVERDUE_DOT_CLASS, OVERDUE_LABEL } from './liveStatus';

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

const STATUS_LEGEND: { status: AppointmentStatus; label: string }[] = [
  { status: 'scheduled', label: 'Đã đặt' },
  { status: 'confirmed', label: 'Đã xác nhận' },
  { status: 'checked_in', label: 'Đã check-in' },
  { status: 'in_progress', label: 'Đang khám' },
  { status: 'completed', label: 'Hoàn thành' },
  { status: 'cancelled', label: 'Đã hủy' },
  { status: 'no_show', label: 'Vắng mặt' },
  { status: 'left', label: 'Đã về' },
];

/** Hidden unless "Hiện lịch đã hủy/vắng" is on or the status filter asks for them. */
const HIDDEN_BY_DEFAULT = new Set<AppointmentStatus>(['cancelled', 'no_show']);

interface AppointmentCalendarPageProps {
  /** "Lịch của tôi": locked to the signed-in dentist. */
  mine?: boolean;
}

export default function AppointmentCalendarPage({ mine = false }: AppointmentCalendarPageProps) {
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
          <h1 className="text-2xl font-semibold text-gray-900">
            {mine ? 'Lịch của tôi' : 'Lịch hẹn — dạng lịch'}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {mine ? 'Lịch hẹn của bạn theo ngày/tuần/tháng' : 'Xem lịch hẹn theo ngày/tuần/tháng'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/appointments/list">
            <Button variant="outline">Xem dạng bảng</Button>
          </Link>
          <PermissionGuard permission="appointment.check_in">
            <Button variant="outline" onClick={() => setShowWalkIn(true)}>
              <UserRoundPlus className="h-4 w-4" />
              Khách vãng lai
            </Button>
          </PermissionGuard>
          <PermissionGuard permission="appointment.create">
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" />
              Tạo lịch hẹn
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {data?.pagination?.hasMore && (
        <Alert type="warning">
          Còn lịch chưa hiển thị (chỉ tải {LIST_ALL_LIMIT} lịch đầu), hãy thu hẹp bộ lọc.
        </Alert>
      )}

      {isError && data && (
        <Alert type="warning">
          <span>Không cập nhật được lịch hẹn, đang hiện dữ liệu cũ. </span>
          <button
            type="button"
            className="font-medium underline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Thử lại
          </button>
        </Alert>
      )}

      <Card noPadding>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" aria-label="Kỳ trước" onClick={() => handleDateChange('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDateChange('today')}>
              Hôm nay
            </Button>
            <Button variant="ghost" size="sm" aria-label="Kỳ sau" onClick={() => handleDateChange('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-2 text-lg font-medium text-gray-900">
              {viewMode === 'day' && format(currentDate, 'EEEE, dd/MM/yyyy', { locale: vi })}
              {viewMode === 'week' && `${format(dateRange.start, 'dd/MM')} - ${format(dateRange.end, 'dd/MM/yyyy')}`}
              {viewMode === 'month' && format(currentDate, 'MMMM yyyy', { locale: vi })}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!mine && (
              <Select
                aria-label="Lọc theo bác sĩ"
                value={selectedDentistId}
                onChange={(e) => setSelectedDentistId(e.target.value)}
                options={[
                  { value: '', label: 'Tất cả bác sĩ' },
                  ...(dentists ?? []).map((d) => ({ value: d.id, label: d.fullName })),
                ]}
                className="min-w-[160px] py-1.5"
              />
            )}
            <Select
              aria-label="Lọc theo trạng thái"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | 'all')}
              options={[
                { value: 'all', label: 'Tất cả trạng thái' },
                ...STATUS_LEGEND.map((s) => ({ value: s.status, label: s.label })),
              ]}
              className="min-w-[150px] py-1.5"
            />
            {statusFilter === 'all' && (
              <Checkbox
                checked={showCancelled}
                onChange={setShowCancelled}
                label={
                  <span className="whitespace-nowrap text-gray-700">
                    Hiện lịch đã hủy/vắng
                    {hiddenCancelledCount > 0 && ` (${hiddenCancelledCount})`}
                  </span>
                }
              />
            )}
            <div className="flex rounded-lg bg-gray-100 p-1">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    viewMode === mode
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {mode === 'day' ? 'Ngày' : mode === 'week' ? 'Tuần' : 'Tháng'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2 p-4" aria-busy="true">
              <span className="sr-only">Đang tải lịch hẹn…</span>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError && !data ? (
            // An error must not look like an empty calendar.
            <EmptyState
              icon={<AlertCircle className="h-10 w-10 text-red-400" />}
              title="Không thể tải lịch hẹn"
              description="Đã có lỗi khi tải dữ liệu. Vui lòng thử lại."
              action={{ label: 'Thử lại', onClick: () => refetch() }}
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
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs">
        <span className="font-semibold text-gray-500">Trạng thái:</span>
        {STATUS_LEGEND.map((s) => (
          <div key={s.status} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[s.status]}`} />
            <span className="text-gray-700">{s.label}</span>
          </div>
        ))}
        <div className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${OVERDUE_DOT_CLASS}`} />
          <span className="text-gray-700">{OVERDUE_LABEL} (quá 15 phút)</span>
        </div>
        {workingWindows && (
          <div className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm border border-emerald-200 bg-emerald-50" />
            <span className="text-gray-700">Giờ làm{dentistName ? ` của ${dentistName}` : ''}</span>
          </div>
        )}
        {Object.keys(closedDays).length > 0 && (
          <div className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-gray-200" />
            <span className="text-gray-700">Phòng khám nghỉ</span>
          </div>
        )}
      </div>

      {/* Create modal — AppointmentFormModal renders its own <Modal> wrapper
          internally (title/footer/size included), so it's rendered
          directly here, not re-wrapped in another one. */}
      {showCreateModal && (
        <Suspense fallback={<div className="p-6 text-center text-sm text-gray-500">Đang tải…</div>}>
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
        <Suspense fallback={<div className="p-6 text-center text-sm text-gray-500">Đang tải…</div>}>
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
