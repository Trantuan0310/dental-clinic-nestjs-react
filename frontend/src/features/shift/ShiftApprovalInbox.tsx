import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button, Card, EmptyState, Modal, Textarea, StatusBadge } from '@/components/ui';
import { PageLoader } from '@/components/ui/Loading';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { format } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useShiftRegistrations, useApproveShift, useRejectShift } from '@/features/payroll/payrollApi';
import type { ShiftRegistration } from '@/types/payroll';

interface ShiftApprovalInboxProps {
  variant?: 'admin' | 'receptionist';
}

export default function ShiftApprovalInbox({ variant = 'admin' }: ShiftApprovalInboxProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'vi' ? vi : enUS;
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
      notify.success(t('uiWorkforce.shiftApproved'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.shiftApproveError')));
    }
  };

  const handleBulkApprove = async () => {
    setBulkApproving(true);
    try {
      const results = await Promise.allSettled(selectedIds.map((id) => approveShift.mutateAsync(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        notify.error(t('uiWorkforce.shiftBulkApproveResult', { approved: results.length - failed, total: results.length, failed }));
      } else {
        notify.success(t('uiWorkforce.shiftBulkApproved', { count: results.length }));
      }
      setSelectedIds([]);
    } finally {
      setBulkApproving(false);
    }
  };

  const handleReject = async (request: ShiftRegistration) => {
    try {
      await rejectShift.mutateAsync({ id: request.id, payload: { reason: rejectReason } });
      notify.success(t('uiWorkforce.shiftRejected'));
      setRejectModal(null);
      setRejectReason('');
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiWorkforce.shiftRejectError')));
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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-surface-100">
            {variant === 'admin' ? t('uiWorkforce.shiftApprovalAdminTitle') : t('uiWorkforce.shiftApprovalTitle')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('uiWorkforce.shiftRequestsWaiting', { count: pendingRequests.length })}
          </p>
        </div>
        {selectedIds.length > 0 && (
          <Button onClick={handleBulkApprove} isLoading={bulkApproving}>
            <CheckCircle className="h-4 w-4" />
            {t('uiWorkforce.shiftApproveSelected', { count: selectedIds.length })}
          </Button>
        )}
      </div>

      <Card noPadding>
        {pendingRequests.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-10 w-10 text-gray-400" />}
            title={t('uiWorkforce.shiftNoPendingRequests')}
            description={t('uiWorkforce.shiftAllProcessed')}
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-surface-800/60"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(request.id)}
                  onChange={() => toggleSelection(request.id)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-surface-100">{request.dentistName}</p>
                    <StatusBadge status="pending" />
                  </div>
                  <div className="mt-1 space-y-1 text-sm text-gray-600 dark:text-surface-300">
                    <p>
                      <span className="font-medium">{t('uiWorkforce.shiftDate')}:</span>{' '}
                      {format(new Date(request.date), 'EEEE, dd/MM/yyyy', { locale: dateLocale })}
                    </p>
                    <p>
                      <span className="font-medium">{t('uiWorkforce.shiftTime')}:</span>{' '}
                      {request.startTime} - {request.endTime}
                    </p>
                    {request.maxEncounters && (
                      <p>
                        <span className="font-medium">{t('uiWorkforce.shiftMaxPatients')}:</span>{' '}
                        {request.maxEncounters}
                      </p>
                    )}
                    {request.notes && (
                      <p className="text-gray-500 italic dark:text-surface-400">{request.notes}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {t('uiWorkforce.shiftRegisteredAt')}: {format(new Date(request.createdAt), 'dd/MM/yyyy HH:mm', { locale: dateLocale })}
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
                    {t('uiWorkforce.shiftApprove')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRejectModal(request)}
                    aria-label={t('uiWorkforce.shiftReject')}
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
        title={t('uiWorkforce.shiftRejectTitle')}
        size="sm"
      >
        {rejectModal && (
          <div className="space-y-4">
            <div className="rounded bg-gray-50 p-3 text-sm">
              <p className="font-medium">{rejectModal.dentistName}</p>
              <p className="text-gray-500">
                {format(new Date(rejectModal.date), 'EEEE, dd/MM/yyyy', { locale: dateLocale })} •{' '}
                {rejectModal.startTime} - {rejectModal.endTime}
              </p>
            </div>
            <Textarea
              label={t('uiWorkforce.shiftRejectReason')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder={t('uiWorkforce.shiftRejectPlaceholder')}
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
                {t('uiWorkforce.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={() => handleReject(rejectModal)}
                disabled={rejectReason.trim().length < 5}
                isLoading={rejectShift.isPending}
              >
                {t('uiWorkforce.shiftReject')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
