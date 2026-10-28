import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, CheckCircle2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import {
  useMarkAllRead,
  useMarkRead,
  useNotificationList,
  usePendingSummary,
  useUnreadCount,
  type InboxNotification,
} from '@/features/notifications/notificationsApi';
import { KindIcon, NotificationRow } from '@/features/notifications/NotificationRow';
import {
  PENDING_KINDS,
  notificationLink,
  type LinkContext,
} from '@/features/notifications/notificationKinds';

type Tab = 'inbox' | 'pending';

const cap = (n: number) => (n > 99 ? '99+' : String(n));

/**
 * Header bell. Badge: unread notifications. Panel: the latest notifications
 * (open one = read it and go to its page; "mark all read"; link to the full
 * history), and a second tab with the counts of work waiting on the user.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('inbox');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { data: unread = 0 } = useUnreadCount(!!user);
  const list = useNotificationList(false, !!user && open);
  const { data: pending } = usePendingSummary(!!user);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (!user) return null;
  const ctx: LinkContext = {
    admin: user.roles.includes('clinic_admin'),
    anyEncounter: user.permissions.includes('encounter.read.any'),
  };
  const recent = (list.data?.pages[0]?.data ?? []).slice(0, 8);
  const pendingItems = (pending?.items ?? []).filter((i) => i.count > 0);

  const openNotification = (n: InboxNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    navigate(notificationLink(n, ctx));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? 'notification-panel' : undefined}
        aria-label={unread > 0 ? t('uiNotifications.openWithCount', { count: unread }) : t('uiNotifications.open')}
        className={cn(
          'relative rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200',
          open && 'bg-gray-100 text-gray-700 dark:bg-surface-800 dark:text-surface-200',
        )}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold tabular-nums text-white ring-2 ring-white dark:ring-surface-900"
          >
            {cap(unread)}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          role="dialog"
          aria-label={t('uiNotifications.title')}
          // Phone: a sheet across the screen under the header (anchored to the
          // bell it would run off the left edge); from sm up, under the bell.
          className="fixed inset-x-3 top-16 z-50 flex max-h-[min(36rem,calc(100dvh-5rem))] origin-top-right flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[24rem] dark:border-surface-700 dark:bg-surface-900 dark:ring-white/5"
        >
          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-surface-100">{t('uiNotifications.title')}</p>
            {tab === 'inbox' && unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="no-touch-target inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60 dark:text-brand-300 dark:hover:bg-brand-900/30"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t('uiNotifications.markAllRead')}
              </button>
            )}
          </div>

          <div role="tablist" className="flex gap-1 border-b border-gray-100 px-3 dark:border-surface-800">
            {(
              [
                ['inbox', t('uiNotifications.tabInbox'), unread],
                ['pending', t('uiNotifications.tabPending'), pending?.total ?? 0],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'no-touch-target -mb-px inline-flex items-center gap-1.5 border-b-2 px-2 py-2 text-sm font-medium transition-colors',
                  tab === key
                    ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-surface-400 dark:hover:text-surface-200',
                )}
              >
                {label}
                {count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                      key === 'inbox'
                        ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-surface-800 dark:text-surface-300',
                    )}
                  >
                    {cap(count)}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'inbox' ? (
              list.isError ? (
                <p className="px-4 py-6 text-center text-sm text-red-600 dark:text-red-400">{t('uiNotifications.loadError')}</p>
              ) : list.isLoading ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-surface-800" />
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <Empty title={t('uiNotifications.inboxEmptyTitle')} hint={t('uiNotifications.inboxEmptyHint')} />
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-surface-800">
                  {recent.map((n) => (
                    <li key={n.id}>
                      <NotificationRow n={n} onOpen={openNotification} dense />
                    </li>
                  ))}
                </ul>
              )
            ) : pendingItems.length === 0 ? (
              <Empty title={t('uiNotifications.emptyTitle')} hint={t('uiNotifications.emptyHint')} />
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-surface-800">
                {pendingItems.map(({ key, count }) => {
                  const kind = PENDING_KINDS[key];
                  if (!kind) return null;
                  return (
                    <li key={key}>
                      <Link
                        to={kind.to(ctx)}
                        onClick={() => setOpen(false)}
                        data-testid={`notification-${key}`}
                        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none dark:hover:bg-surface-800/60"
                      >
                        <KindIcon icon={kind.icon} tone={kind.tone} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-gray-900 dark:text-surface-100">
                            {t(`uiNotifications.items.${key}.title`)}
                          </span>
                          <span className="line-clamp-2 text-xs text-gray-500 dark:text-surface-400">
                            {t(`uiNotifications.items.${key}.hint`)}
                          </span>
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700 dark:bg-surface-800 dark:text-surface-200">
                          {cap(count)}
                        </span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-surface-600"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {tab === 'inbox' && (
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-gray-100 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-gray-50 dark:border-surface-800 dark:text-brand-300 dark:hover:bg-surface-800/60"
            >
              {t('uiNotifications.viewAll')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
        <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-gray-900 dark:text-surface-100">{title}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-surface-400">{hint}</p>
    </div>
  );
}
