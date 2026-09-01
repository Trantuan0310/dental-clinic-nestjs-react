import { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { appointmentsApi } from '@/features/appointments/imperativeApi';
import { Button, Card, Modal } from '@/components/ui';
import type { Appointment, AppointmentFilters, AppointmentStatus } from '@/types/appointment';
import { MonthView } from './MonthView';
import { DayView, WeekView } from './CalendarViews';

// Heavy modals — only loaded when user opens create/edit dialog.
const AppointmentFormModal = lazy(() =>
  import('./AppointmentFormModal').then((m) => ({ default: m.AppointmentFormModal })),
);

const VIEW_MODES = ['day', 'week', 'month'] as const;
const STATUS_DOT: Record<AppointmentStatus, string> = {
  scheduled: 'bg-gray-400',
  confirmed: 'bg-blue-500',
  checked_in: 'bg-cyan-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-red-400',
  no_show: 'bg-red-500',
};

export default function AppointmentCalendarPage() {
  const [searchParams] = useSearchParams();
  // Arriving from a patient's profile with ?patientId= opens the create
  // modal pre-filled with that patient, instead of landing on a plain calendar.
  const prefilledPatientId = searchParams.get('patientId') ?? undefined;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>(searchParams.get('view') as 'day' | 'week' | 'month' || 'day');
  const [selectedDentistId] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(!!prefilledPatientId);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Calculate date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === 'day') {
      return { start: currentDate, end: currentDate };
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return { start, end };
    } else {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      return { start, end };
    }
  }, [currentDate, viewMode]);

  const filters: AppointmentFilters = {
    from: format(dateRange.start, 'yyyy-MM-dd'),
    to: format(dateRange.end, 'yyyy-MM-dd'),
    dentistId: selectedDentistId || undefined,
    pageSize: 100,
  };

  const { data } = useQuery({
    queryKey: ['appointments', filters],
    queryFn: () => appointmentsApi.list(filters),
  });

  const appointments = useMemo(() => data?.data ?? [], [data]);

  const handleDateChange = useCallback((direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
    } else {
      const delta = direction === 'next' ? 1 : -1;
      if (viewMode === 'day') {
        setCurrentDate(d => addDays(d, delta));
      } else if (viewMode === 'week') {
        setCurrentDate(d => addDays(d, delta * 7));
      } else {
        setCurrentDate(d => {
          const newDate = new Date(d);
          newDate.setMonth(newDate.getMonth() + delta);
          return newDate;
        });
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
    setSelectedAppointment(appointment);
  }, []);

  // Group appointments by date for display
  const appointmentsByDate = useMemo(() => {
    const grouped: Record<string, Appointment[]> = {};
    appointments.forEach(apt => {
      const dateKey = format(parseISO(apt.startsAt), 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(apt);
    });
    return grouped;
  }, [appointments]);

  const daysToShow = viewMode === 'day'
    ? [currentDate]
    : viewMode === 'week'
    ? eachDayOfInterval({ start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) })
    : eachDayOfInterval({
        start: new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
        end: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0),
      });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Lịch hẹn — dạng lịch</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Xem lịch hẹn theo ngày/tuần/tháng
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/appointments/list">
            <Button variant="outline">Xem dạng bảng</Button>
          </Link>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            Tạo lịch hẹn
          </Button>
        </div>
      </div>

      <Card noPadding>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => handleDateChange('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDateChange('today')}>
              Hôm nay
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDateChange('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="ml-2 text-lg font-medium text-gray-900">
              {viewMode === 'day' && format(currentDate, 'EEEE, dd/MM/yyyy', { locale: vi })}
              {viewMode === 'week' && `${format(dateRange.start, 'dd/MM')} - ${format(dateRange.end, 'dd/MM/yyyy')}`}
              {viewMode === 'month' && format(currentDate, 'MMMM yyyy', { locale: vi })}
            </span>
          </div>

          <div className="flex items-center gap-2">
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
          {viewMode === 'day' && (
            <DayView
              date={currentDate}
              appointments={appointmentsByDate[format(currentDate, 'yyyy-MM-dd')] || []}
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
            />
          )}
          {viewMode === 'week' && (
            <WeekView
              days={daysToShow}
              appointmentsByDate={appointmentsByDate}
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
            />
          )}
          {viewMode === 'month' && (
            <MonthView
              date={currentDate}
              days={daysToShow}
              appointmentsByDate={appointmentsByDate}
              onDayClick={(d) => {
                setCurrentDate(d);
                setViewMode('day');
              }}
              onAppointmentClick={handleAppointmentClick}
              onCreateAtSlot={(d, time) => handleSlotClick(d, time)}
            />
          )}
        </div>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs">
        <span className="font-semibold text-gray-500">Trạng thái:</span>
        {([
          { status: 'scheduled', label: 'Đã đặt' },
          { status: 'confirmed', label: 'Đã xác nhận' },
          { status: 'checked_in', label: 'Đã check-in' },
          { status: 'in_progress', label: 'Đang khám' },
          { status: 'completed', label: 'Hoàn thành' },
          { status: 'cancelled', label: 'Đã hủy' },
          { status: 'no_show', label: 'Vắng mặt' },
        ] as { status: AppointmentStatus; label: string }[]).map((s) => (
          <div key={s.status} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[s.status]}`} />
            <span className="text-gray-700">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal — lazy-loaded AppointmentFormModal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setSelectedSlot(null);
          setSelectedAppointment(null);
        }}
        title={selectedAppointment ? 'Chi tiết lịch hẹn' : 'Tạo lịch hẹn'}
        size="lg"
      >
        {showCreateModal && (
          <Suspense fallback={<div className="p-6 text-center text-sm text-gray-500">Đang tải…</div>}>
            <AppointmentFormModal
              open={showCreateModal}
              onClose={() => {
                setShowCreateModal(false);
                setSelectedSlot(null);
                setSelectedAppointment(null);
              }}
              appointment={selectedAppointment}
              defaultDate={selectedSlot?.date}
              defaultStartTime={selectedSlot?.time}
              defaultPatientId={prefilledPatientId}
            />
          </Suspense>
        )}
      </Modal>
    </div>
  );
}

// Day View and Week View moved to ./CalendarViews.tsx

// Month View Component - moved to ./MonthView.tsx
