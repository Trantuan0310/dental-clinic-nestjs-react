import { Link } from 'react-router-dom';
import { CalendarPlus, UserPlus, Receipt, UserCheck, Download } from 'lucide-react';
import { Button } from './Button';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';

export interface QuickAction {
  labelKey: string;
  to: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  permissions?: string[];
}

const ACTIONS: QuickAction[] = [
  {
    labelKey: 'bookAppointment',
    to: '/appointments?action=create',
    icon: <CalendarPlus className="h-4 w-4" />,
    variant: 'primary',
    permissions: ['appointment.create'],
  },
  {
    labelKey: 'addPatient',
    to: '/patients/new',
    icon: <UserPlus className="h-4 w-4" />,
    variant: 'secondary',
    permissions: ['patient.create'],
  },
  {
    labelKey: 'invoices',
    to: '/billing/list',
    icon: <Receipt className="h-4 w-4" />,
    variant: 'secondary',
    permissions: ['invoice.read.any', 'invoice.read.own'],
  },
  {
    labelKey: 'collectPayment',
    to: '/billing/list?status=ISSUED,PARTIAL',
    icon: <Receipt className="h-4 w-4" />,
    variant: 'secondary',
    permissions: ['invoice.payment.create'],
  },
  {
    labelKey: 'checkIn',
    to: '/appointments/list?status=SCHEDULED',
    icon: <UserCheck className="h-4 w-4" />,
    variant: 'secondary',
    permissions: ['appointment.check_in'],
  },
];

export function QuickActions() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const visible = ACTIONS.filter(
    (a) => !a.permissions || a.permissions.some((p) => hasPermission(p)),
  );

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hidden text-xs font-medium uppercase tracking-wider text-gray-500 md:inline">
        {t('uiCommon.action.quickActions')}
      </span>
      {visible.map((action) => (
        <Button
          key={action.to}
          variant={action.variant ?? 'secondary'}
          size="sm"
          leftIcon={action.icon}
          asChild
        >
          <Link to={action.to}>{t(`uiCommon.action.${action.labelKey}`)}</Link>
        </Button>
      ))}
      <Button
        variant="outline"
        size="sm"
        leftIcon={<Download className="h-4 w-4" />}
        onClick={() => window.print()}
        title={t('uiCommon.action.printReport')}
      >
        {t('uiCommon.action.exportReport')}
      </Button>
    </div>
  );
}
