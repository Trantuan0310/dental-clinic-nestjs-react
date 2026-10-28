import { formatDistanceToNowStrict } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import type { InboxNotification } from './notificationsApi';
import { BY_TYPE, type Kind } from './notificationKinds';

export function KindIcon({ icon: Icon, tone, className }: Kind & { className?: string }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone, className)}>
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </span>
  );
}

/** One notification: icon, title, detail, how long ago; unread ones are bold with a dot. */
export function NotificationRow({
  n,
  onOpen,
  dense = false,
}: {
  n: InboxNotification;
  onOpen: (n: InboxNotification) => void;
  dense?: boolean;
}) {
  const { i18n, t } = useTranslation();
  const kind = BY_TYPE[n.type] ?? BY_TYPE.bookingRequest;
  const unread = !n.readAt;
  const ago = formatDistanceToNowStrict(new Date(n.createdAt), {
    addSuffix: true,
    locale: i18n.language === 'en' ? enUS : vi,
  });
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      data-testid="notification-row"
      data-unread={unread || undefined}
      className={cn(
        'group flex w-full items-start gap-3 text-left transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none dark:hover:bg-surface-800/60 dark:focus-visible:bg-surface-800/60',
        dense ? 'px-4 py-3' : 'px-5 py-4',
        unread && 'bg-brand-50/40 dark:bg-brand-900/10',
      )}
    >
      <KindIcon icon={kind.icon} tone={kind.tone} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-sm leading-snug text-gray-900 dark:text-surface-100',
            unread ? 'font-semibold' : 'font-normal text-gray-700 dark:text-surface-300',
          )}
        >
          {n.title}
        </span>
        {n.body && (
          <span className="mt-0.5 line-clamp-2 block text-xs text-gray-500 dark:text-surface-400">{n.body}</span>
        )}
        <span className="mt-1 block text-[11px] text-gray-400 dark:text-surface-500">{ago}</span>
      </span>
      {unread && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label={t('uiNotifications.unread')} />
      )}
    </button>
  );
}
