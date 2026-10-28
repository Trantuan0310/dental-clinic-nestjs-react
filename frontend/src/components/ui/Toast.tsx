import { useEffect } from 'react';
import { Toaster, toast, useToasterStore, type Toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Kind = 'success' | 'error' | 'warning' | 'info';

// react-hot-toast only knows success / error / blank, so warning and info
// travel in the toast's className.
const KIND_CLASS = { warning: 'toast-kind-warning', info: 'toast-kind-info' } as const;

function kindOf(t: Toast): Kind {
  if (t.type === 'success') return 'success';
  if (t.type === 'error') return 'error';
  return t.className === KIND_CLASS.warning ? 'warning' : 'info';
}

const STYLE: Record<Kind, { icon: typeof Info; badge: string; accent: string }> = {
  success: {
    icon: CheckCircle2,
    badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300',
    accent: 'bg-emerald-500',
  },
  error: {
    icon: XCircle,
    badge: 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300',
    accent: 'bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    badge: 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300',
    accent: 'bg-amber-500',
  },
  info: {
    icon: Info,
    badge: 'bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300',
    accent: 'bg-sky-500',
  },
};

/** One notification card: its own background, icon badge, message and a close button. */
function ToastCard({ t }: { t: Toast }) {
  const { t: tr } = useTranslation();
  const kind = kindOf(t);
  const { icon: Icon, badge, accent } = STYLE[kind];
  return (
    <div
      {...t.ariaProps}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto relative flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white py-3 pl-4 pr-3 shadow-lg ring-1 ring-black/5 transition-all duration-200 dark:border-surface-700 dark:bg-surface-900 dark:ring-white/5',
        t.visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', accent)} aria-hidden="true" />
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', badge)}>
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 self-center whitespace-pre-line break-words text-sm leading-snug text-gray-800 dark:text-surface-100">
        {String(t.message)}
      </p>
      <button
        type="button"
        onClick={() => toast.dismiss(t.id)}
        aria-label={tr('uiCommon.action.close')}
        className="no-touch-target -mr-1 shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-surface-500 dark:hover:bg-surface-800 dark:hover:text-surface-200"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** At most this many on screen; the oldest closes when another arrives. */
const MAX_VISIBLE = 3;

export function AppToaster() {
  const { toasts } = useToasterStore();
  useEffect(() => {
    toasts
      .filter((t) => t.visible)
      .slice(MAX_VISIBLE)
      .forEach((t) => toast.dismiss(t.id));
  }, [toasts]);
  return (
    <Toaster position="bottom-right" gutter={10} toastOptions={{ duration: 5000, error: { duration: 8000 } }}>
      {(t) => <ToastCard t={t} />}
    </Toaster>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const notify = {
  success: (msg: string) => toast.success(msg),
  error: (msg: string) => toast.error(msg),
  warning: (msg: string) => toast(msg, { className: KIND_CLASS.warning, duration: 7000 }),
  info: (msg: string) => toast(msg, { className: KIND_CLASS.info }),
};
