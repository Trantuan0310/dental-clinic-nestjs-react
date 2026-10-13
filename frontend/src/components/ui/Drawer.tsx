import { type ReactNode, useRef, useId } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useTranslation } from 'react-i18next';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
  /** Optional description used for aria-describedby. */
  description?: ReactNode;
}

const widthClass = {
  md: 'w-full max-w-md',
  lg: 'w-full max-w-2xl',
  xl: 'w-full max-w-4xl',
};

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'lg',
  description,
}: DrawerProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useFocusTrap({ active: open, containerRef: panelRef, onEscape: onClose });

  useBodyScrollLock(open);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? `${titleId}-desc` : undefined}
        className={cn(
          'flex h-full flex-col bg-white shadow-xl dark:bg-surface-900',
          widthClass[width],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-surface-700">
          <h2 id={titleId} className="text-base font-semibold text-gray-900 dark:text-surface-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('uiCommon.action.close')}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-surface-800 dark:hover:text-surface-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {description && <div id={`${titleId}-desc`} className="px-5 pt-3 text-sm text-gray-500 dark:text-surface-400">{description}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 scrollbar-thin">{children}</div>
        {footer && <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-5 py-3 dark:border-surface-700 dark:bg-surface-800">{footer}</div>}
      </div>
    </div>
  );
}
