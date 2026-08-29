import { Link } from 'react-router-dom';
import { CalendarPlus, UserPlus, Receipt, UserCheck, FilePlus, Download } from 'lucide-react';
import { Button } from './Button';
import { useAuthStore } from '@/stores/authStore';

export interface QuickAction {
  label: string;
  to: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  permissions?: string[];
}

const ACTIONS: QuickAction[] = [
  {
    label: 'Đặt lịch',
    to: '/appointments?action=create',
    icon: <CalendarPlus className="h-4 w-4" />,
    variant: 'primary',
    permissions: ['appointment.create'],
  },
  {
    label: 'Thêm bệnh nhân',
    to: '/patients/new',
    icon: <UserPlus className="h-4 w-4" />,
    variant: 'secondary',
    permissions: ['patient.create'],
  },
  {
    label: 'Tạo hóa đơn',
    to: '/billing/invoices/new',
    icon: <FilePlus className="h-4 w-4" />,
    variant: 'secondary',
    permissions: ['invoice.issue'],
  },
  {
    label: 'Thu tiền',
    to: '/billing/list?status=ISSUED,PARTIAL',
    icon: <Receipt className="h-4 w-4" />,
    variant: 'secondary',
    permissions: ['invoice.payment.create'],
  },
  {
    label: 'Check-in',
    to: '/appointments/list?status=SCHEDULED',
    icon: <UserCheck className="h-4 w-4" />,
    variant: 'secondary',
    permissions: ['appointment.check_in'],
  },
];

export function QuickActions() {
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const visible = ACTIONS.filter(
    (a) => !a.permissions || a.permissions.some((p) => hasPermission(p)),
  );

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hidden text-xs font-medium uppercase tracking-wider text-gray-500 md:inline">
        Hành động nhanh
      </span>
      {visible.map((action) => (
        <Button
          key={action.to}
          variant={action.variant ?? 'secondary'}
          size="sm"
          leftIcon={action.icon}
          asChild
        >
          <Link to={action.to}>{action.label}</Link>
        </Button>
      ))}
      <Button
        variant="outline"
        size="sm"
        leftIcon={<Download className="h-4 w-4" />}
        onClick={() => window.print()}
        title="Xuất báo cáo PDF (in trang)"
      >
        Xuất báo cáo
      </Button>
    </div>
  );
}