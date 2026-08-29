import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Plus, Clock } from 'lucide-react';
import { shiftApi } from '@/types/shift';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui';
import { RegisterShiftModal } from './RegisterShiftModal';
import type { ShiftRegistration, ShiftRegistrationStatus } from '@/types/shift';

export function MyShiftsPage() {
  const queryClient = useQueryClient();
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('upcoming');

  const { data, isLoading } = useQuery({
    queryKey: ['my-shifts', statusFilter],
    queryFn: () => {
      const params: { status?: ShiftRegistrationStatus; from?: string } = {};
      if (statusFilter === 'upcoming') {
        params.from = new Date().toISOString().split('T')[0];
      } else if (statusFilter === 'past') {
        params.status = statusFilter.toUpperCase() as ShiftRegistrationStatus;
      } else {
        params.status = statusFilter.toUpperCase() as ShiftRegistrationStatus;
      }
      return shiftApi.listMyShifts(params);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => shiftApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-shifts'] });
    },
  });

  const shifts = data?.data ?? [];

  const canCancel = (shift: ShiftRegistration) => {
    if (shift.status !== 'PENDING' && shift.status !== 'APPROVED') return false;
    if (shift.status === 'APPROVED') {
      const shiftDate = new Date(shift.date);
      const hoursUntilShift = (shiftDate.getTime() - Date.now()) / (1000 * 60 * 60);
      return hoursUntilShift >= 24;
    }
    return true;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('upcoming')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              statusFilter === 'upcoming'
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Sắp tới
          </button>
          <button
            onClick={() => setStatusFilter('past')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              statusFilter === 'past'
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Đã qua
          </button>
          <button
            onClick={() => setStatusFilter('cancelled')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              statusFilter === 'cancelled'
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Đã hủy
          </button>
        </div>
        <Button onClick={() => setShowRegisterModal(true)}>
          <Plus className="h-4 w-4" />
          Đăng ký ca
        </Button>
      </div>

      <Card noPadding>
        {isLoading ? (
          <div className="p-6">
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          </div>
        ) : shifts.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-10 w-10 text-gray-400" />}
            title={
              statusFilter === 'upcoming'
                ? 'Chưa có ca nào sắp tới'
                : statusFilter === 'past'
                ? 'Chưa có ca nào đã qua'
                : 'Chưa có ca nào bị hủy'
            }
            description={
              statusFilter === 'upcoming' && 'Đăng ký ca làm việc mới'
            }
            action={
              statusFilter === 'upcoming'
                ? {
                    label: 'Đăng ký ca',
                    onClick: () => setShowRegisterModal(true),
                  }
                : undefined
            }
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {shifts.map((shift) => (
              <div key={shift.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">
                      {format(new Date(shift.date), 'EEEE, dd/MM/yyyy', { locale: vi })}
                    </p>
                    <StatusBadge
                      status={shift.status.toLowerCase()}
                      type={
                        shift.status === 'PENDING'
                          ? 'warning'
                          : shift.status === 'APPROVED'
                          ? 'success'
                          : 'danger'
                      }
                    />
                  </div>
                  <p className="text-sm text-gray-500">
                    {shift.startTime} - {shift.endTime}
                    {shift.maxEncounters && ` • Tối đa ${shift.maxEncounters} bệnh nhân`}
                  </p>
                  {shift.notes && (
                    <p className="mt-1 text-sm text-gray-400">{shift.notes}</p>
                  )}
                </div>
                {canCancel(shift) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cancelMutation.mutate(shift.id)}
                    isLoading={cancelMutation.isPending}
                  >
                    Hủy ca
                  </Button>
                )}
                {shift.status === 'APPROVED' && !canCancel(shift) && (
                  <span className="text-xs text-gray-400">
                    Phải hủy trước 24h
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <RegisterShiftModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
      />
    </div>
  );
}
