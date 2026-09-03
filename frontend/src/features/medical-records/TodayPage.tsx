import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Play, ArrowRight } from 'lucide-react';
import { appointmentsApi } from '@/features/appointments/imperativeApi';
import { useStartEncounter } from '@/features/appointments/appointmentApi';
import { Button, Card, StatusBadge } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { useNavigate } from 'react-router-dom';

export default function TodayPage() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const today = format(currentDate, 'yyyy-MM-dd');
  const startEncounter = useStartEncounter();

  const { data } = useQuery({
    queryKey: ['appointments', { from: today, to: today }],
    queryFn: () => appointmentsApi.list({
      from: today,
      to: today,
      pageSize: 100,
    }),
  });

  const handleStart = async (appointmentId: string) => {
    try {
      const updated = await startEncounter.mutateAsync(appointmentId);
      navigate(`/encounters/${updated.encounterId}`);
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể bắt đầu khám'));
    }
  };

  const appointments = data?.data ?? [];
  const checkedIn = appointments.filter(a => a.status === 'checked_in' || a.status === 'in_progress');
  const completed = appointments.filter(a => a.status === 'completed');

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: 'border-gray-300 bg-white',
      confirmed: 'border-blue-300 bg-blue-50',
      checked_in: 'border-cyan-300 bg-cyan-50',
      in_progress: 'border-amber-300 bg-amber-50',
      completed: 'border-green-300 bg-green-50',
      cancelled: 'border-red-300 bg-red-50 opacity-50',
      no_show: 'border-red-300 bg-red-50 opacity-50',
    };
    return colors[status] || 'border-gray-300 bg-white';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Hôm nay — {format(currentDate, 'EEEE, dd/MM/yyyy', { locale: vi })}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Lịch làm việc hôm nay của bạn
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(d => new Date(d.getTime() - 86400000))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Hôm nay
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(d => new Date(d.getTime() + 86400000))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">{appointments.length}</p>
            <p className="text-sm text-gray-500">Tổng lịch hẹn</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-600">{checkedIn.length}</p>
            <p className="text-sm text-gray-500">Đang chờ khám</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">{completed.length}</p>
            <p className="text-sm text-gray-500">Đã hoàn thành</p>
          </div>
        </Card>
      </div>

      {/* Appointments List */}
      <Card title="Lịch hẹn hôm nay">
        {appointments.length === 0 ? (
          <p className="text-center py-8 text-gray-500">Không có lịch hẹn nào hôm nay</p>
        ) : (
          <div className="space-y-3">
            {appointments
              .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
              .map((apt) => {
                const isCurrent = apt.status === 'in_progress';
                return (
                  <div
                    key={apt.id}
                    className={`rounded-lg border-2 p-4 ${getStatusColor(apt.status)} ${isCurrent ? 'ring-2 ring-brand-500' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900">
                            {format(new Date(apt.startsAt), 'HH:mm')}
                          </p>
                          <p className="text-xs text-gray-500">
                            {apt.durationMinutes} phút
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            {isCurrent && <span className="text-brand-600 font-medium">ĐANG KHÁM</span>}
                            <p className="font-medium text-gray-900">{apt.patientName}</p>
                          </div>
                          {apt.patientPhone && (
                            <p className="text-sm text-gray-500">{apt.patientPhone}</p>
                          )}
                          {apt.chiefComplaint && (
                            <p className="mt-1 text-sm text-gray-600">
                              <span className="font-medium">Lý do:</span> {apt.chiefComplaint}
                            </p>
                          )}
                          <p className="mt-1 text-sm text-gray-400">
                            Check-in: {apt.checkInAt ? format(new Date(apt.checkInAt), 'HH:mm') : 'Chưa check-in'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={apt.status} />
                        {apt.status === 'checked_in' && (
                          <Button
                            size="sm"
                            onClick={() => handleStart(apt.id)}
                            isLoading={startEncounter.isPending && startEncounter.variables === apt.id}
                          >
                            <Play className="h-4 w-4" />
                            Bắt đầu khám
                          </Button>
                        )}
                        {apt.status === 'in_progress' && (
                          <Button
                            size="sm"
                            onClick={() => navigate(`/encounters/${apt.encounterId}`)}
                          >
                            Tiếp tục khám
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        )}
                        {apt.status === 'completed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/encounters/${apt.encounterId}`)}
                          >
                            Xem chi tiết
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>
    </div>
  );
}
