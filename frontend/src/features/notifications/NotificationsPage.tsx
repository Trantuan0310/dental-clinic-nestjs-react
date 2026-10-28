import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCheck, CheckCircle2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import {
  useMarkAllRead,
  useMarkRead,
  useNotificationList,
  useUnreadCount,
  type InboxNotification,
} from './notificationsApi';
import { NotificationRow } from './NotificationRow';
import { notificationLink } from './notificationKinds';

/** Notification history: everything the bell showed, newest first, unread or all. */
export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useNotificationList(unreadOnly);
  const { data: unread = 0 } = useUnreadCount();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const open = (n: InboxNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    navigate(
      notificationLink(n, {
        admin: !!user?.roles.includes('clinic_admin'),
        anyEncounter: !!user?.permissions.includes('encounter.read.any'),
      }),
    );
  };

  return (
    <div>
      <PageHeader
        title={t('uiNotifications.historyTitle')}
        description={t('uiNotifications.historyDescription')}
        actions={
          <Button variant="outline" onClick={() => markAll.mutate()} disabled={unread === 0} isLoading={markAll.isPending}>
            <CheckCheck className="h-4 w-4" />
            {t('uiNotifications.markAllRead')}
          </Button>
        }
      />
      <Card noPadding>
        <div role="tablist" className="flex gap-1 border-b border-gray-100 px-4 dark:border-surface-800">
          {(
            [
              [false, t('uiNotifications.filterAll')],
              [true, t('uiNotifications.filterUnread', { count: unread })],
            ] as const
          ).map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              role="tab"
              aria-selected={unreadOnly === value}
              onClick={() => setUnreadOnly(value)}
              className={cn(
                '-mb-px border-b-2 px-2 py-3 text-sm font-medium transition-colors',
                unreadOnly === value
                  ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-surface-400 dark:hover:text-surface-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {list.isError ? (
          <p className="px-5 py-10 text-center text-sm text-red-600 dark:text-red-400">{t('uiNotifications.loadError')}</p>
        ) : list.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-surface-800" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-gray-900 dark:text-surface-100">
              {unreadOnly ? t('uiNotifications.noUnread') : t('uiNotifications.inboxEmptyTitle')}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-surface-400">{t('uiNotifications.inboxEmptyHint')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-surface-800">
            {rows.map((n) => (
              <li key={n.id}>
                <NotificationRow n={n} onOpen={open} />
              </li>
            ))}
          </ul>
        )}

        {list.hasNextPage && (
          <div className="flex justify-center border-t border-gray-100 p-3 dark:border-surface-800">
            <Button variant="outline" size="sm" onClick={() => list.fetchNextPage()} isLoading={list.isFetchingNextPage}>
              {t('uiNotifications.loadMore')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
