import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/cn';

interface FormErrorRegionProps {
  /** Top-level form error (e.g. "Network error, please try again"). */
  error?: string | null;
  /** Optional details or list of errors. */
  details?: ReactNode;
  className?: string;
}

/**
 * FormErrorRegion — a single `aria-live="polite"` region that summarizes
 * form-level errors above the submit button. Screen readers will announce
 * changes (e.g. "Form has 3 errors") whenever content updates.
 */
export function FormErrorRegion({ error, details, className }: FormErrorRegionProps) {
  if (!error && !details) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700',
        'dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1">
        {error && <p className="font-medium">{error}</p>}
        {details && <div className="mt-1 text-xs">{details}</div>}
      </div>
    </div>
  );
}

interface FormNoticeRegionProps {
  message?: string | null;
  className?: string;
}

/** Polite notice region for non-error feedback (e.g. "Saving..."). */
export function FormNoticeRegion({ message, className }: FormNoticeRegionProps) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700',
        'dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300',
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <div className="flex-1">{message}</div>
    </div>
  );
}