import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Inbox,
  PackageMinus,
  PhoneCall,
  type LucideIcon,
} from 'lucide-react';
import { api, type AuthEnvelope, unwrap } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';

type NotificationKey =
  | 'bookingRequests'
  | 'shiftApprovals'
  | 'recallsDue'
  | 'draftInvoices'
  | 'staleEncounters'
  | 'lowStock';

interface NotificationSummary {
  items: Array<{ key: NotificationKey; count: number }>;
  total: number;
}

/** Icon, colours and page per kind of work (the server only counts what the caller may open). */
const KINDS: Record<
  NotificationKey,
  { icon: LucideIcon; tone: string; to: (perms: { admin: boolean; anyEncounter: boolean }) => string }
> = {
  bookingRequests: {
    icon: Inbox,
    tone: 'bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300',
    to: () => '/booking-requests',
  },
  shiftApprovals: {
    icon: CalendarClock,
    tone: 'bg-violet-50 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300',
    to: ({ admin }) => (admin ? '/admin/shifts/pending' : '/shifts/pending'),
  },
  recallsDue: {
    icon: PhoneCall,
    tone: 'bg-teal-50 text-teal-600 dark:bg-teal-400/10 dark:text-teal-300',
    to: () => '/recalls',
  },
  draftInvoices: {
    icon: FileText,
    tone: 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300',
    to: () => '/billing',
  },
  staleEncounters: {
    icon: ClipboardList,
    tone: 'bg-rose-50 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300',
    to: ({ anyEncounter }) => (anyEncounter ? '/dispatch' : '/my-queue'),
  },
  lowStock: {
    icon: PackageMinus,
    tone: 'bg-orange-50 text-orange-600 dark:bg-orange-400/10 dark:text-orange-300',
    to: () => '/inventory',
  },
};

export const NOTIFICATION_SUMMARY_KEY = ['notifications', 'summary'] as const;

/**
 * Header bell: a dropdown of what is waiting on the user, one row per kind of
 * work with its count, each linking to the page where it is done. Polled every
 * minute; empty kinds are hidden.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { data, isError } = useQuery({
    queryKey: NOTIFICATION_SUMMARY_KEY,
    queryFn: async () =>
      unwrap((await api.get<AuthEnvelope<NotificationSummary>>('/notifications/summary')).data),
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

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
  const total = data?.total ?? 0;
  const items = (data?.items ?? []).filter((i) => i.count > 0);
  const perms = {
    admin: user.roles.includes('clinic_admin'),
    anyEncounter: user.permissions.includes('encounter.read.any'),
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
        aria-label={total > 0 ? t('uiNotifications.openWithCount', { count: total }) : t('uiNotifications.open')}
        className={cn(
          'relative rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200',
          open && 'bg-gray-100 text-gray-700 dark:bg-surface-800 dark:text-surface-200',
        )}
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold tabular-nums text-white ring-2 ring-white dark:ring-surface-900"
          >
            {total > 99 ? '99+' : total}
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
          className="fixed inset-x-3 top-16 z-50 origin-top-right sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150 dark:border-surface-700 dark:bg-surface-900 dark:ring-white/5"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-surface-800">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-surface-100">
                {t('uiNotifications.title')}
              </p>
              <p className="text-xs text-gray-500 dark:text-surface-400">{t('uiNotifications.subtitle')}</p>
            </div>
            {total > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-red-600 dark:bg-red-500/10 dark:text-red-300">
                {total > 99 ? '99+' : total}
              </span>
            )}
          </div>

          {isError ? (
            <p className="px-4 py-6 text-center text-sm text-red-600 dark:text-red-400">{t('uiNotifications.loadError')}</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-8 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium text-gray-900 dark:text-surface-100">{t('uiNotifications.emptyTitle')}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-surface-400">{t('uiNotifications.emptyHint')}</p>
            </div>
          ) : (
            <ul className="max-h-[min(24rem,70vh)] divide-y divide-gray-100 overflow-y-auto dark:divide-surface-800">
              {items.map(({ key, count }) => {
                const kind = KINDS[key];
                if (!kind) return null;
                const Icon = kind.icon;
                return (
                  <li key={key}>
                    <Link
                      to={kind.to(perms)}
                      onClick={() => setOpen(false)}
                      data-testid={`notification-${key}`}
                      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none dark:hover:bg-surface-800/60 dark:focus-visible:bg-surface-800/60"
                    >
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', kind.tone)}>
                        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900 dark:text-surface-100">
                          {t(`uiNotifications.items.${key}.title`)}
                        </span>
                        <span className="line-clamp-2 text-xs text-gray-500 dark:text-surface-400">
                          {t(`uiNotifications.items.${key}.hint`)}
                        </span>
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700 dark:bg-surface-800 dark:text-surface-200">
                        {count > 99 ? '99+' : count}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-400 dark:text-surface-600"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
