import { useMemo, useState } from 'react';
import { Plus, CalendarPlus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageLoader } from '@/components/ui/Loading';
import { ShiftStatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PermissionGuard } from '@/components/PermissionGuard';
import { useCancelShift, useShiftRegistrations } from '@/features/payroll/payrollApi';
import { RegisterShiftModal } from './RegisterShiftModal';
import { formatDate } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { notify } from '@/components/ui/Toast';
import { useAuthStore } from '@/stores/authStore';
import type { ColumnDef } from '@tanstack/react-table';
import type { ShiftRegistration } from '@/types/payroll';

const HOURS_24 = 24;

function canCancel(s: ShiftRegistration): { allowed: boolean; reason?: string } {
  if (s.status === 'PENDING') return { allowed: true };
  if (s.status === 'APPROVED') {
    const shiftStart = new Date(`${s.date}T${s.startTime}:00`);
    const hoursUntil = (shiftStart.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < HOURS_24) {
      return { allowed: false, reason: 'Phải hủy ca trước 24h' };
    }
    return { allowed: true };
  }
  return { allowed: false };
}

export default function MyShiftsPage() {
  const [tab, setTab] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
  const currentUserId = useAuthStore((s) => s.user?.id);
  // Backend treats any actor holding shift.read.any (e.g. receptionist, for
  // the approval inbox elsewhere) as "admin mode" and returns EVERY
  // dentist's shifts when no dentistId filter is given. This page is "my
  // shifts" regardless of what other read permissions the viewer holds, so
  // always scope explicitly to self.
  const { data: shiftsEnvelope, isLoading } = useShiftRegistrations({ dentistId: currentUserId });
  const shifts = useMemo(() => shiftsEnvelope ?? [], [shiftsEnvelope]);
  const cancel = useCancelShift();
  const [confirmCancel, setConfirmCancel] = useState<ShiftRegistration | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const filtered = useMemo(() => {
    if (!shifts) return [];
    const now = new Date();
    return shifts.filter((s) => {
      const shiftStart = new Date(`${s.date}T${s.startTime}:00`);
      if (tab === 'upcoming') {
        return (s.status === 'PENDING' || s.status === 'APPROVED') && shiftStart >= now;
      }
      if (tab === 'past') {
        return (s.status === 'APPROVED' || s.status === 'REJECTED') && shiftStart < now;
      }
      return s.status === 'CANCELLED';
    });
  }, [shifts, tab]);

  const handleCancel = async () => {
    if (!confirmCancel) return;
    setActionError(null);
    try {
      await cancel.mutateAsync(confirmCancel.id);
      notify.success('Đã hủy ca');
      setConfirmCancel(null);
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Không thể hủy ca'));
    }
  };

  const columns: ColumnDef<ShiftRegistration>[] = [
    {
      accessorKey: 'date',
      header: 'Ngày',
      cell: ({ row }) => <span className="font-medium">{formatDate(row.original.date)}</span>,
    },
    {
      id: 'time',
      header: 'Khung giờ',
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.startTime} – {row.original.endTime}
        </span>
      ),
    },
    {
      accessorKey: 'maxEncounters',
      header: 'Số ca tối đa',
      cell: ({ row }) =>
        row.original.maxEncounters ? (
          <span className="font-mono">{row.original.maxEncounters}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      accessorKey: 'status',
      header: 'Trạng thái',
      cell: ({ row }) => <ShiftStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'notes',
      header: 'Ghi chú',
      cell: ({ row }) =>
        row.original.notes ? <span className="line-clamp-2 max-w-xs text-xs text-gray-600">{row.original.notes}</span> : <span className="text-gray-400">—</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const check = canCancel(row.original);
        return (
          <PermissionGuard permission="shift.cancel">
            <Button
              size="sm"
              variant="outline"
              disabled={!check.allowed}
              onClick={() => setConfirmCancel(row.original)}
              title={check.reason}
            >
              Hủy
            </Button>
          </PermissionGuard>
        );
      },
    },
  ];

  const tabs: TabItem[] = [
    { id: 'upcoming', label: 'Sắp tới' },
    { id: 'past', label: 'Đã qua' },
    { id: 'cancelled', label: 'Đã hủy' },
  ];

  return (
    <div>
      <PageHeader
        title="Ca đăng ký của tôi"
        description="Lịch sử các ca tự đăng ký (ngoài lịch cố định)"
        actions={
          <PermissionGuard permission="shift.register">
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowRegisterModal(true)}>
              Đăng ký ca mới
            </Button>
          </PermissionGuard>
        }
      />

      {actionError && (
        <div className="mb-4">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</div>
        </div>
      )}

      <Card bodyClassName="space-y-4">
        <Tabs tabs={tabs} value={tab} onChange={(v) => setTab(v as typeof tab)} />

        {isLoading ? (
          <PageLoader />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<CalendarPlus className="h-6 w-6" />}
            title="Chưa có ca nào"
            description={
              tab === 'upcoming'
                ? 'Bạn chưa đăng ký ca nào sắp tới.'
                : tab === 'past'
                  ? 'Chưa có ca nào trong quá khứ.'
                  : 'Chưa hủy ca nào.'
            }
            action={
              tab === 'upcoming' && (
                <PermissionGuard permission="shift.register">
                  <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowRegisterModal(true)}>
                    Đăng ký ca mới
                  </Button>
                </PermissionGuard>
              )
            }
          />
        ) : (
          <DataTable data={filtered} columns={columns} pageSize={50} />
        )}
      </Card>

      <ConfirmDialog
        open={!!confirmCancel}
        onClose={() => setConfirmCancel(null)}
        onConfirm={handleCancel}
        title="Hủy ca đăng ký?"
        description={
          confirmCancel ? (
            <span>
              Ca ngày <strong>{formatDate(confirmCancel.date)}</strong> ({confirmCancel.startTime}–
              {confirmCancel.endTime}) sẽ bị hủy. Hành động này không thể hoàn tác.
            </span>
          ) : (
            ''
          )
        }
        confirmLabel="Xác nhận hủy"
        confirmVariant="danger"
        isLoading={cancel.isPending}
      />

      <RegisterShiftModal open={showRegisterModal} onClose={() => setShowRegisterModal(false)} />
    </div>
  );
}