import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TooltipProps {
  label: ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  /** Show delay in ms (default 200). Set 0 to disable. */
  delay?: number;
  /** Optional id (auto-generated if absent). Useful for `aria-describedby` linkage. */
  id?: string;
}

export function Tooltip({ label, children, side = 'top', className, id, delay = 200 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const autoId = useId();
  const tooltipId = id ?? autoId;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const positionClass = {
    top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
    bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
    left: 'right-full top-1/2 mr-2 -translate-y-1/2',
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
  }[side];

  const arrowClass = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-900',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-900',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-900',
  }[side];

  if (!isValidElement(children)) return children;

  const showNow = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (delay <= 0) {
      setOpen(true);
    } else {
      timerRef.current = setTimeout(() => setOpen(true), delay);
    }
  };
  const hideNow = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
  };

  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    'aria-describedby': open ? tooltipId : undefined,
    onMouseEnter: ((e: React.MouseEvent) => {
      showNow();
      const orig = (children.props as { onMouseEnter?: (e: React.MouseEvent) => void }).onMouseEnter;
      orig?.(e);
    }) as unknown,
    onMouseLeave: ((e: React.MouseEvent) => {
      hideNow();
      const orig = (children.props as { onMouseLeave?: (e: React.MouseEvent) => void }).onMouseLeave;
      orig?.(e);
    }) as unknown,
    onFocus: ((e: React.FocusEvent) => {
      showNow();
      const orig = (children.props as { onFocus?: (e: React.FocusEvent) => void }).onFocus;
      orig?.(e);
    }) as unknown,
    onBlur: ((e: React.FocusEvent) => {
      hideNow();
      const orig = (children.props as { onBlur?: (e: React.FocusEvent) => void }).onBlur;
      orig?.(e);
    }) as unknown,
  });

  return (
    <span className={cn('relative inline-flex', className)}>
      {trigger}
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 max-w-xs whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg',
            positionClass,
          )}
        >
          {label}
          <span
            className={cn(
              'absolute h-0 w-0 border-4 border-transparent',
              arrowClass,
            )}
          />
        </span>
      )}
    </span>
  );
}