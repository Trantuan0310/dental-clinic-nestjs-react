import { useState } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button, Card, EmptyState, Modal, Textarea, StatusBadge } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useShiftRegistrations, useApproveShift, useRejectShift } from '@/features/payroll/payrollApi';
import type { ShiftRegistration } from '@/types/payroll';

interface ShiftApprovalInboxProps {
  variant?: 'admin' | 'receptionist';
}

export default function ShiftApprovalInbox({ variant = 'admin' }: ShiftApprovalInboxProps) {
  const { data, isLoading } = useShiftRegistrations({ status: 'PENDING' });
  const approveShift = useApproveShift();
  const rejectShift = useRejectShift();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [rejectModal, setRejectModal] = useState<ShiftRegistration | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const pendingRequests = data ?? [];

  const handleApprove = async (id: string) => {
    try {
      await approveShift.mutateAsync(id);
      notify.success('Đã duyệt đăng ký ca');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể duyệt đăng ký ca'));
    }
  };

  const handleBulkApprove = async () => {
    setBulkApproving(true);
    try {
      const results = await Promise.allSettled(selectedIds.map((id) => approveShift.mutateAsync(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        notify.error(`Duyệt thành công ${results.length - failed}/${results.length}, ${failed} ca lỗi`);
      } else {
        notify.success(`Đã duyệt ${results.length} ca`);
      }
      setSelectedIds([]);
    } finally {
      setBulkApproving(false);
    }
  };

  const handleReject = async (request: ShiftRegistration) => {
    try {
      await rejectShift.mutateAsync({ id: request.id, payload: { reason: rejectReason } });
      notify.success('Đã từ chối đăng ký ca');
      setRejectModal(null);
      setRejectReason('');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể từ chối đăng ký ca'));
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {variant === 'admin' ? 'Duyệt đăng ký ca (Admin)' : 'Duyệt đăng ký ca'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {pendingRequests.length} đăng ký đang chờ duyệt
          </p>
        </div>
        {selectedIds.length > 0 && (
          <Button onClick={handleBulkApprove} isLoading={bulkApproving}>
            <CheckCircle className="h-4 w-4" />
            Duyệt {selectedIds.length} ca
          </Button>
        )}
      </div>

      <Card noPadding>
        {pendingRequests.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-10 w-10 text-gray-400" />}
            title="Không có đăng ký nào chờ duyệt"
            description="Tất cả đăng ký ca đã được xử lý"
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-start gap-4 p-4 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(request.id)}
                  onChange={() => toggleSelection(request.id)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{request.dentistName}</p>
                    <StatusBadge status="pending" />
                  </div>
                  <div className="mt-1 space-y-1 text-sm text-gray-600">
                    <p>
                      <span className="font-medium">Ngày:</span>{' '}
                      {format(new Date(request.date), 'EEEE, dd/MM/yyyy', { locale: vi })}
                    </p>
                    <p>
                      <span className="font-medium">Giờ:</span>{' '}
                      {request.startTime} - {request.endTime}
                    </p>
                    {request.maxEncounters && (
                      <p>
                        <span className="font-medium">Số bệnh nhân tối đa:</span>{' '}
                        {request.maxEncounters}
                      </p>
                    )}
                    {request.notes && (
                      <p className="text-gray-500 italic">{request.notes}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      Đăng ký: {format(new Date(request.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleApprove(request.id)}
                    isLoading={approveShift.isPending && approveShift.variables === request.id}
                  >
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Duyệt
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRejectModal(request)}
                    aria-label="Từ chối"
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
        {rejectModal && (
          <div className="space-y-4">
            <div className="rounded bg-gray-50 p-3 text-sm">
              <p className="font-medium">{rejectModal.dentistName}</p>
              <p className="text-gray-500">
                {format(new Date(rejectModal.date), 'EEEE, dd/MM/yyyy', { locale: vi })} •{' '}
                {rejectModal.startTime} - {rejectModal.endTime}
              </p>
            </div>
            <Textarea
              label="Lý do từ chối"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Nhập lý do từ chối (tối thiểu 5 ký tự)..."
              required
            />
            <div className="flex justify-end gap-3">
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
                onClick={() => handleReject(rejectModal)}
                disabled={rejectReason.trim().length < 5}
                isLoading={rejectShift.isPending}
              >
                Từ chối
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
