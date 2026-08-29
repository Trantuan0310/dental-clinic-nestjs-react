import { cn } from '@/lib/cn';
import type { AppointmentStatus } from '@/types/appointment';
import type { InvoiceStatus } from '@/types/billing';

export type StatusType =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

export interface StatusBadgeProps {
  status: string;
  type?: StatusType;
  label?: string;
  className?: string;
}

const statusConfig: Record<string, { type: StatusType; label: string }> = {
  // Appointment statuses
  scheduled: { type: 'neutral', label: 'Đã đặt' },
  confirmed: { type: 'info', label: 'Đã xác nhận' },
  checked_in: { type: 'info', label: 'Đã check-in' },
  in_progress: { type: 'warning', label: 'Đang khám' },
  completed: { type: 'success', label: 'Hoàn thành' },
  cancelled: { type: 'danger', label: 'Đã hủy' },
  no_show: { type: 'danger', label: 'Vắng mặt' },

  // Invoice statuses
  draft: { type: 'neutral', label: 'Bản nháp' },
  issued: { type: 'info', label: 'Đã phát hành' },
  partial: { type: 'warning', label: 'Thanh toán một phần' },
  paid: { type: 'success', label: 'Đã thanh toán' },
  void: { type: 'danger', label: 'Đã hủy' },

  // Payment methods
  cash: { type: 'info', label: 'Tiền mặt' },
  bank_transfer: { type: 'info', label: 'Chuyển khoản' },
  card: { type: 'info', label: 'Thẻ' },
  insurance: { type: 'info', label: 'BHYT' },

  // User statuses
  active: { type: 'success', label: 'Hoạt động' },
  pending_setup: { type: 'warning', label: 'Chờ thiết lập' },
  deactivated: { type: 'danger', label: 'Đã vô hiệu' },

  // Role statuses
  pending: { type: 'warning', label: 'Chờ duyệt' },
  approved: { type: 'success', label: 'Đã duyệt' },
  rejected: { type: 'danger', label: 'Từ chối' },

  // Payroll periods
  DRAFT: { type: 'neutral', label: 'Bản nháp' },
  REVIEWING: { type: 'info', label: 'Đang xem xét' },
  APPROVED: { type: 'success', label: 'Đã duyệt' },
  PAID: { type: 'success', label: 'Đã trả lương' },
  LOCKED: { type: 'neutral', label: 'Đã khóa' },

  // Shift registrations
  PENDING: { type: 'warning', label: 'Chờ duyệt' },

  // Inventory
  in_stock: { type: 'success', label: 'Còn hàng' },
  low_stock: { type: 'warning', label: 'Sắp hết' },
  out_of_stock: { type: 'danger', label: 'Hết hàng' },
};

const typeStyles: Record<StatusType, string> = {
  success:
    'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-400/30',
  warning:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-400/30',
  danger:
    'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-400/30',
  info:
    'bg-blue-50 text-blue-700 ring-blue-700/20 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-400/30',
  neutral:
    'bg-gray-50 text-gray-700 ring-gray-600/20 dark:bg-surface-700 dark:text-surface-200 dark:ring-surface-500/30',
};

export function StatusBadge({
  status,
  type,
  label,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status] || { type: type || 'neutral', label: label || status };
  const finalType = type || config.type;
  const finalLabel = label || config.label;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        typeStyles[finalType],
        className,
      )}
    >
      {finalLabel}
    </span>
  );
}

// Convenience components for specific status types
export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return <StatusBadge status={status} />;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <StatusBadge status={status} />;
}

export function ShiftStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}

export function AdjustmentTypeBadge({ type }: { type: string }) {
  const labelMap: Record<string, string> = {
    BONUS: 'Thưởng',
    PENALTY: 'Phạt',
    DEDUCTION: 'Khấu trừ',
    MANUAL_OVERRIDE: 'Sửa tay',
  };
  const typeMap: Record<string, StatusType> = {
    BONUS: 'success',
    PENALTY: 'danger',
    DEDUCTION: 'warning',
    MANUAL_OVERRIDE: 'info',
  };
  return (
    <StatusBadge
      status={type}
      type={typeMap[type] ?? 'neutral'}
      label={labelMap[type] ?? type}
    />
  );
}
