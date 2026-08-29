import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { shiftApi } from '@/types/shift';
import { Button, Card, EmptyState, Modal, Textarea } from '@/components/ui';
import type { ShiftRegistration } from '@/types/shift';

export function ShiftApprovalPage() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rejectModal, setRejectModal] = useState<ShiftRegistration | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['shift-approvals'],
    queryFn: () => shiftApi.listPendingApprovals(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => shiftApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-approvals'] });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: string[]) => shiftApi.bulkApprove(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-approvals'] });
      setSelectedIds([]);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      shiftApi.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-approvals'] });
      setRejectModal(null);
      setRejectReason('');
    },
  });

  const shifts = data?.data ?? [];
  const pendingShifts = shifts.filter((s) => s.status === 'PENDING');

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Duyệt đăng ký ca</h2>
          <p className="text-sm text-gray-500">
            {pendingShifts.length} đăng ký đang chờ duyệt
          </p>
        </div>
        {selectedIds.length > 0 && (
          <Button
            onClick={() => bulkApproveMutation.mutate(selectedIds)}
            isLoading={bulkApproveMutation.isPending}
          >
            <CheckCircle className="h-4 w-4" />
            Duyệt {selectedIds.length} ca
          </Button>
        )}
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
        ) : pendingShifts.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-10 w-10 text-gray-400" />}
            title="Không có đăng ký nào chờ duyệt"
            description="Tất cả đăng ký ca đã được xử lý"
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingShifts.map((shift) => (
              <div
                key={shift.id}
                className="flex items-center gap-4 p-4 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(shift.id)}
                  onChange={() => toggleSelection(shift.id)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{shift.dentistName}</p>
                  </div>
                  <p className="text-sm text-gray-500">
                    {format(new Date(shift.date), 'EEEE, dd/MM/yyyy', { locale: vi })} •{' '}
                    {shift.startTime} - {shift.endTime}
                    {shift.maxEncounters && ` • Tối đa ${shift.maxEncounters} bệnh nhân`}
                  </p>
                  {shift.notes && (
                    <p className="mt-1 text-sm text-gray-400">{shift.notes}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    Đăng ký: {format(new Date(shift.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => approveMutation.mutate(shift.id)}
                    isLoading={approveMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Duyệt
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRejectModal(shift)}
                  >
                    <XCircle className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Reject Modal */}
      <Modal
        isOpen={!!rejectModal}
        onClose={() => {
          setRejectModal(null);
          setRejectReason('');
        }}
        title="Từ chối đăng ký ca"
        size="sm"
      >
        <div className="space-y-4">
          {rejectModal && (
            <div className="rounded bg-gray-50 p-3 text-sm">
              <p className="font-medium">{rejectModal.dentistName}</p>
              <p className="text-gray-500">
                {format(new Date(rejectModal.date), 'EEEE, dd/MM/yyyy', { locale: vi })} •{' '}
                {rejectModal.startTime} - {rejectModal.endTime}
              </p>
            </div>
          )}
          <Textarea
            label="Lý do từ chối"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Nhập lý do từ chối..."
            required
          />
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button
              variant="outline"
              onClick={() => {
                setRejectModal(null);
                setRejectReason('');
              }}
            >
              Hủy
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                rejectModal && rejectMutation.mutate({ id: rejectModal.id, reason: rejectReason })
              }
              isLoading={rejectMutation.isPending}
              disabled={!rejectReason.trim()}
            >
              Từ chối
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
