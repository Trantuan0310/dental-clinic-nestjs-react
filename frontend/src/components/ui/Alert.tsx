import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';

export type AlertType = 'success' | 'warning' | 'danger' | 'info';
export type AlertVariant = AlertType | 'error';

const VARIANT_TO_TYPE: Record<AlertVariant, AlertType> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  error: 'danger',
};

export interface AlertProps {
  type?: AlertType;
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
  onClose?: () => void;
  /** Override the default `role="alert"`. Set to `false` for non-time-critical
   * info messages that shouldn't be announced. */
  announce?: boolean;
}

const ICONS: Record<AlertType, typeof AlertTriangle> = {
  success: CheckCircle,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
};

const STYLES: Record<AlertType, string> = {
  success: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-200',
  warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200',
  danger: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-200',
  info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-200',
};

const ICON_STYLES: Record<AlertType, string> = {
  success: 'text-green-500 dark:text-green-400',
  warning: 'text-amber-500 dark:text-amber-400',
  danger: 'text-red-500 dark:text-red-400',
  info: 'text-blue-500 dark:text-blue-400',
};

export function Alert({
  type,
  variant,
  title,
  children,
  className,
  onClose,
  announce,
}: AlertProps) {
  const { t } = useTranslation();
  const resolved: AlertType = type ?? (variant ? VARIANT_TO_TYPE[variant] : 'info');

  // Errors are actionable and time-critical, so they announce assertively by
  // default. success/info/warning are most often static page content (e.g. a
  // banner shown on mount) — announcing those with role="alert" interrupts
  // screen readers even though nothing new just happened. Callers can still
  // opt in/out explicitly via the `announce` prop.
  const shouldAnnounce = announce ?? resolved === 'danger';

  const Icon = ICONS[resolved];

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4',
        STYLES[resolved],
        className,
      )}
      role={shouldAnnounce ? 'alert' : 'status'}
    >
      <Icon className={cn('h-5 w-5 shrink-0', ICON_STYLES[resolved])} aria-hidden="true" />
      <div className="flex-1">
        {title && <h4 className="font-medium">{title}</h4>}
        <div className="text-sm">{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.cancel')}
          className="shrink-0 rounded p-1 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-current"
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
