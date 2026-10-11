import { cn } from '@/lib/cn';
import { type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useState, useRef, useEffect, useId } from 'react';

export interface DropdownMenuProps {
  trigger?: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function DropdownMenu({
  trigger,
  children,
  align = 'right',
  className,
}: DropdownMenuProps) {
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
      onKeyDown={(event) => {
        if (!isOpen) {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
          }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
          triggerRef.current?.focus();
          return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}
    >
      <button
        ref={triggerRef}
        aria-label="Tùy chọn"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-surface-300 dark:hover:bg-surface-800"
      >
        {trigger || <MoreHorizontal className="h-5 w-5" />}
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="Tùy chọn"
          // Close on any click inside (item onClick fires first, then this
          // bubbles) — without this, the menu stays visually open after
          // picking an action, e.g. behind a modal it just triggered.
          onClick={() => setIsOpen(false)}
          className={cn(
            'absolute z-50 mt-1 min-w-[160px] rounded-md border border-gray-200 bg-white py-1 shadow-lg',
            'animate-in fade-in zoom-in-95 duration-100',
            'dark:border-surface-700 dark:bg-surface-800 dark:shadow-black/40',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface DropdownMenuItemProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
  icon?: ReactNode;
  className?: string;
}

export function DropdownMenuItem({
  children,
  onClick,
  disabled,
  variant = 'default',
  icon,
  className,
}: DropdownMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors',
        'text-left focus-visible:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-surface-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50',
        'dark:hover:bg-surface-700',
        variant === 'danger'
          ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 dark:text-red-400'
          : 'text-gray-700 dark:text-surface-200',
        className,
      )}
    >
      {icon && <span className="h-4 w-4">{icon}</span>}
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="my-1 border-t border-gray-100 dark:border-surface-700" />;
}
