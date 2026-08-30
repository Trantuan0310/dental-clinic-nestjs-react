import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useFocusTrap } from '@/lib/useFocusTrap';

export interface ModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showClose?: boolean;
  className?: string;
  footer?: ReactNode;
}

const SIZES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[90vw]',
};

export function Modal({
  isOpen,
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showClose = true,
  className,
  footer,
}: ModalProps) {
  const { t } = useTranslation();
  const resolvedOpen = open ?? isOpen ?? false;
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useFocusTrap({
    active: resolvedOpen,
    containerRef: panelRef,
    onEscape: onClose,
  });

  // Escape handling lives in useFocusTrap above — a second document-level
  // keydown listener here previously fired onClose() a second time on every
  // Escape press (both listeners are on `document`, and stopPropagation()
  // doesn't stop sibling listeners on the same target).
  useEffect(() => {
    if (resolvedOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [resolvedOpen]);

  if (!resolvedOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        ref={panelRef}
        className={cn(
          'relative z-10 w-full rounded-lg bg-white shadow-xl dark:bg-surface-900 dark:shadow-black/40',
          'animate-in fade-in zoom-in-95 duration-200',
          SIZES[size],
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? `${titleId}-desc` : undefined}
      >
        {/* Header */}
        {(title || showClose) && (
          <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4 dark:border-surface-700">
            <div className="flex-1">
              {title && (
                <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-surface-100">
                  {title}
                </h2>
              )}
              {description && (
                <p id={`${titleId}-desc`} className="mt-1 text-sm text-gray-500 dark:text-surface-400">
                  {description}
                </p>
              )}
            </div>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.cancel')}
                className="ml-2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto px-6 py-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-surface-700">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}