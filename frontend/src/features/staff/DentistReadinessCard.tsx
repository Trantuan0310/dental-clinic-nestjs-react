import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Card } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import type { DentistReadiness } from './types';

type Level = 'ok' | 'warn' | 'info';

interface Item {
  level: Level;
  /** One text node on purpose: status words stay inside a sentence. */
  text: string;
  action?: ReactNode;
}

const ICON: Record<Level, ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden />,
  warn: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />,
  info: <Info className="h-4 w-4 shrink-0 text-gray-400 dark:text-surface-400" aria-hidden />,
};

const linkClass = 'text-right text-xs text-brand-600 underline hover:no-underline';

/**
 * "Sẵn sàng nhận lịch": everything that decides whether this dentist shows
 * up in the booking form, the online booking page and the home page, each
 * with a link to where it is fixed.
 */
export function DentistReadinessCard({
  readiness: r,
  onEditProfile,
}: {
  readiness: DentistReadiness;
  /** Opens the profile form; undefined when the viewer cannot edit it. */
  onEditProfile?: () => void;
}) {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const edit = (label: string) =>
    onEditProfile ? (
      <button type="button" className={linkClass} onClick={onEditProfile}>
        {label}
      </button>
    ) : undefined;
  const to = (path: string, label: string, permission: string) =>
    hasPermission(permission) ? (
      <Link to={path} className={linkClass}>
        {label}
      </Link>
    ) : undefined;

  const items: Item[] = [];

  if (r.accountStatus === 'PENDING_SETUP') {
    items.push({
      level: 'warn',
      text: t('uiWorkforce.readinessPendingAccount'),
      action: to('/admin/users', t('uiWorkforce.sendSetupOrPasswordLink'), 'user.read'),
    });
  } else if (r.accountStatus === 'DEACTIVATED') {
    items.push({
      level: 'warn',
      text: t('uiWorkforce.readinessAccountDeactivated'),
      action: to('/admin/users', t('uiWorkforce.usersPage'), 'user.read'),
    });
  } else {
    items.push({ level: 'ok', text: t('uiWorkforce.readinessAccountActive') });
  }

  if (r.practiceStatus !== 'ACTIVE') {
    items.push({
      level: 'warn',
      text: t('uiWorkforce.readinessPracticeSuspended'),
    });
  } else if (r.employmentStatus === 'ON_LEAVE') {
    items.push({
      level: 'warn',
      text: t('uiWorkforce.readinessEmployeeOnLeave'),
      action: to('/staff', t('uiWorkforce.staffPage'), 'employee.update'),
    });
  } else {
    items.push({ level: 'ok', text: t('uiWorkforce.readinessAcceptingInPerson') });
  }

  if (!r.acceptsOnlineBooking) {
    items.push({
      level: 'warn',
      text: t('uiWorkforce.readinessOnlineBookingOff'),
      action: edit(t('uiWorkforce.enableInProfile')),
    });
  } else if (!r.acceptsNewPatients) {
    items.push({
      level: 'warn',
      text: t('uiWorkforce.readinessNoNewPatients'),
      action: edit(t('uiWorkforce.editProfile')),
    });
  } else if (r.activeServiceCount > 0 && r.onlineServiceCount === 0) {
    items.push({
      level: 'warn',
      text: t('uiWorkforce.readinessNoOnlineServices'),
      action: to('/services', t('uiWorkforce.servicesPage'), 'service.read'),
    });
  } else {
    items.push({ level: 'ok', text: t('uiWorkforce.readinessOnlineBookingOn') });
  }

  items.push(
    r.hasCurrentSchedule
      ? { level: 'ok', text: t('uiWorkforce.readinessScheduleCurrent') }
      : {
          level: 'warn',
          text: t('uiWorkforce.readinessNoCurrentSchedule'),
          action: to('/schedule', t('uiWorkforce.addWorkSchedule'), 'schedule.read'),
        },
  );

  items.push(
    r.activeServiceCount > 0
      ? { level: 'ok', text: t('uiWorkforce.readinessAssignedServices', { count: r.activeServiceCount }) }
      : {
          level: 'warn',
          text: t('uiWorkforce.readinessNoAssignedServices'),
          action: (
            <a href="#dentist-services" className={linkClass}>
              {t('uiWorkforce.assignServices')}
            </a>
          ),
        },
  );

  items.push(
    r.hasPhoto
      ? { level: 'ok', text: t('uiWorkforce.readinessPhotoPresent') }
      : {
          level: 'info',
          text: t('uiWorkforce.readinessNoPhoto'),
          action: (
            <a href="#dentist-photo" className={linkClass}>
              {t('uiWorkforce.uploadPhoto')}
            </a>
          ),
        },
  );

  if (r.placeholderName) {
    items.push({
      level: 'warn',
      text: t('uiWorkforce.readinessPlaceholderName'),
      action: to('/staff', t('uiWorkforce.changeNameOnStaffPage'), 'employee.update'),
    });
  }

  const pending = items.filter((i) => i.level === 'warn').length;

  return (
    <Card
      title={t('uiWorkforce.readinessTitle')}
      description={pending === 0 ? t('uiWorkforce.readinessComplete') : t('uiWorkforce.readinessPending', { count: pending })}
    >
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.text} className="flex items-start gap-2">
            <span className="mt-0.5">{ICON[item.level]}</span>
            <span className="min-w-0 flex-1 break-words text-gray-700 dark:text-surface-200">{item.text}</span>
            {item.action}
          </li>
        ))}
      </ul>
    </Card>
  );
}
