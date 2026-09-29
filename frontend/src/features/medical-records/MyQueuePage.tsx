import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Stethoscope } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { clinicParts, clinicToday } from '@/lib/clinicTime';
import { useNavigate } from 'react-router-dom';
import { appointmentsApi } from '@/features/appointments/imperativeApi';
import { useStartEncounter } from '@/features/appointments/appointmentApi';
import { Button, Card, EmptyState, FormSkeleton } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { QueueList } from '@/features/dispatch/QueueList';
import { useQueue } from '@/features/dispatch/dispatchApi';

/**
 * The dentist's queue (ADR-0009 phase 6): patients waiting in dispatch
 * order — emergency, on time, late, walk-in, then check-in time. Call the
 * next one, start the exam, or skip someone who does not answer. Exams
 * already running are listed below to resume.
 */
export default function MyQueuePage() {
  const navigate = useNavigate();
  const startEncounter = useStartEncounter();
  const today = clinicToday();
  // The API scopes a dentist to their own queue; front desk sees every dentist.
  const { data: queue = [], isLoading, isError, refetch, isFetching } = useQueue();

  // No lower bound: an exam left open on an earlier day must surface here —
  // it is never closed automatically (it owns a medical record).
  const { data: running } = useQuery({
    queryKey: ['appointments', 'my-queue', 'in-progress', today],
    queryFn: () => appointmentsApi.list({ status: ['in_progress'], to: today, pageSize: 50 }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  // Clinic day, not the API's UTC range edge.
  const inProgress = (running?.data ?? []).filter(
    (apt) => clinicParts(apt.startsAt).date === today,
  );
  const unfinished = (running?.data ?? []).filter(
    (apt) => clinicParts(apt.startsAt).date < today,
  );

  const handleStart = async (appointmentId: string) => {
    try {
      const updated = await startEncounter.mutateAsync(appointmentId);
      navigate(`/encounters/${updated.encounterId}`);
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể bắt đầu khám'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Hàng đợi của tôi</h1>
          <p className="mt-1 text-sm text-gray-500">
            Thứ tự: cấp cứu → đúng giờ → đến trễ → vãng lai, rồi theo giờ check-in
          </p>
        </div>
        <Button variant="outline" onClick={() => void refetch()} isLoading={isFetching}>
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </Button>
      </div>

      {unfinished.length > 0 && (
        <Card>
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-rose-700">
            <AlertTriangle className="h-4 w-4" />
            Ca khám chưa kết thúc từ ngày trước
          </h2>
          <p className="mb-2 text-xs text-gray-500">
            Hãy mở lại để hoàn tất hoặc hủy lượt khám — hệ thống không tự đóng bệnh án.
          </p>
          <ul className="space-y-2">
            {unfinished.map((apt) => (
              <li key={apt.id} className="flex items-center justify-between rounded-md border border-rose-200 bg-rose-50 p-3">
                <span className="font-medium text-gray-900">
                  {apt.patientName}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {formatDate(apt.startsAt, 'dd/MM/yyyy')} · {apt.dentistName}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => navigate(`/encounters/${apt.encounterId}`)}>
                  <Stethoscope className="h-4 w-4" />
                  Mở ca khám
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {inProgress.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Đang khám</h2>
          <ul className="space-y-2">
            {inProgress.map((apt) => (
              <li key={apt.id} className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3">
                <span className="font-medium text-gray-900">{apt.patientName}</span>
                <Button size="sm" onClick={() => navigate(`/encounters/${apt.encounterId}`)}>
                  <Stethoscope className="h-4 w-4" />
                  Tiếp tục khám
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <FormSkeleton rows={3} />
        ) : isError ? (
          <EmptyState
            title="Không thể tải hàng đợi"
            description="Vui lòng kiểm tra kết nối hoặc quyền truy cập rồi thử lại."
            action={{ label: 'Thử lại', onClick: () => void refetch() }}
          />
        ) : queue.length === 0 ? (
          <EmptyState
            icon={<div className="text-4xl">📋</div>}
            title="Không có bệnh nhân nào đang chờ"
            description="Hàng đợi trống. Các bệnh nhân đã check-in sẽ xuất hiện ở đây."
          />
        ) : (
          <QueueList
            entries={queue}
            mode="dentist"
            onStart={(id) => void handleStart(id)}
            startingId={startEncounter.isPending ? (startEncounter.variables ?? null) : null}
          />
        )}
      </Card>

      {queue.length > 0 && (
        <p className="text-center text-sm text-gray-500">Hàng đợi tự động làm mới mỗi 20 giây</p>
      )}
    </div>
  );
}
