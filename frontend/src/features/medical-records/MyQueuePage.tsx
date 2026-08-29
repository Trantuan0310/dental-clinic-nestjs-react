import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Play, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { appointmentsApi } from '@/features/appointments/imperativeApi';
import { Button, Card, EmptyState } from '@/components/ui';
import { useNavigate } from 'react-router-dom';

export default function MyQueuePage() {
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ['my-queue'],
    queryFn: () => appointmentsApi.list({
      status: 'checked_in',
      pageSize: 50,
    }),
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const appointments = data?.data ?? [];

  // Filter to only today's appointments and sort by check-in time
  const today = new Date().toISOString().split('T')[0];
  const queue = appointments
    .filter(apt => apt.startsAt?.startsWith(today))
    .sort((a, b) => {
      const aTime = a.checkInAt ? new Date(a.checkInAt).getTime() : Infinity;
      const bTime = b.checkInAt ? new Date(b.checkInAt).getTime() : Infinity;
      return aTime - bTime;
    });

  const getWaitingTime = (checkInAt?: string | null) => {
    if (!checkInAt) return null;
    const minutes = Math.floor((Date.now() - new Date(checkInAt).getTime()) / 60000);
    return minutes;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Hàng đợi của tôi</h1>
          <p className="mt-1 text-sm text-gray-500">
            Bệnh nhân đã check-in và đang chờ được khám
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setIsRefreshing(true);
            refetch().finally(() => setIsRefreshing(false));
          }}
          isLoading={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Làm mới
        </Button>
      </div>

      <Card>
        {queue.length === 0 ? (
          <EmptyState
            icon={<div className="text-4xl">📋</div>}
            title="Không có bệnh nhân nào đang chờ"
            description="Hàng đợi trống. Các bệnh nhân đã check-in sẽ xuất hiện ở đây."
          />
        ) : (
          <div className="space-y-3">
            {queue.map((apt, index) => {
              const waitingMinutes = getWaitingTime(apt.checkInAt);
              const isFirst = index === 0;

              return (
                <div
                  key={apt.id}
                  className={`rounded-lg border-2 p-4 ${
                    isFirst
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      {/* Position */}
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${
                        isFirst ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isFirst ? '★' : `#${index + 1}`}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-bold text-gray-900">{apt.patientName}</p>
                          {isFirst && <span className="rounded bg-brand-500 px-2 py-0.5 text-xs font-medium text-white">Tiếp theo</span>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-sm">
                          <span className="text-gray-600">
                            <span className="font-medium">Mã lịch hẹn:</span> {apt.id.slice(0, 8)}
                          </span>
                          <span className="text-gray-600">
                            <span className="font-medium">Giờ hẹn:</span> {format(new Date(apt.startsAt), 'HH:mm')}
                          </span>
                          {waitingMinutes !== null && (
                            <span className={`flex items-center gap-1 ${
                              waitingMinutes > 30 ? 'text-red-600 font-medium' : 'text-gray-600'
                            }`}>
                              <Clock className="h-4 w-4" />
                              Chờ: {waitingMinutes} phút
                            </span>
                          )}
                        </div>
                        {apt.chiefComplaint && (
                          <p className="mt-2 text-sm text-gray-600">
                            <span className="font-medium">Lý do khám:</span> {apt.chiefComplaint}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {apt.status === 'in_progress' ? (
                        <Button
                          onClick={() => navigate(`/encounters/${apt.encounterId}`)}
                        >
                          Tiếp tục khám
                        </Button>
                      ) : (
                        <Button
                          onClick={() => navigate(`/encounters/${apt.id}`)}
                        >
                          <Play className="h-4 w-4" />
                          Bắt đầu khám
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

      {queue.length > 0 && (
        <p className="text-center text-sm text-gray-500">
          Hàng đợi tự động làm mới mỗi 30 giây
        </p>
      )}
    </div>
  );
}
