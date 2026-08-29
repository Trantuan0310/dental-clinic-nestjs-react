import { type ReactNode, type ReactElement, isValidElement, cloneElement } from 'react';
import { Lock } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';

interface PermissionGuardProps {
  permission?: string;
  anyOf?: string[];
  children: ReactNode;
  /** Render mode when the user lacks the required permission. */
  fallback?: ReactNode;
  /**
   * - 'disable' (default): clone the single child element and disable it + add a tooltip explaining why.
   *                       Requires `children` to be a single React element (e.g. a Button).
   * - 'hide': render nothing (or the explicit `fallback` element).
   * - 'tooltip': render the child but wrap it in a Tooltip saying "Bạn không có quyền".
   * - 'lock': render a small "no permission" badge instead of the child (useful in tables where disabled
   *           buttons would otherwise stretch the layout).
   */
  mode?: 'hide' | 'disable' | 'tooltip' | 'lock';
  /** Tooltip label used in 'disable' / 'tooltip' modes. */
  denyMessage?: string;
  /** Optional override for the displayed permission code in the lock badge. */
  showPermissionCode?: boolean;
}

const DEFAULT_DENY_MESSAGE = 'Bạn không có quyền thực hiện thao tác này';

export function PermissionGuard({
  permission,
  anyOf,
  children,
  fallback = null,
  mode = 'disable',
  denyMessage = DEFAULT_DENY_MESSAGE,
  showPermissionCode = false,
}: PermissionGuardProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);

  const allowed = permission
    ? hasPermission(permission)
    : anyOf
      ? hasAnyPermission(anyOf)
      : false;

  if (allowed) return <>{children}</>;

  if (mode === 'hide') {
    return <>{fallback}</>;
  }

  if (mode === 'lock') {
    return (
      <Tooltip label={denyMessage}>
        <span
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400"
          role="img"
          aria-label={denyMessage}
        >
          <Lock className="h-3 w-3" aria-hidden="true" />
          {showPermissionCode && <span className="font-mono text-[10px]">{permission ?? anyOf?.join('|')}</span>}
        </span>
      </Tooltip>
    );
  }

  if (mode === 'tooltip') {
    return (
      <Tooltip label={denyMessage}>
        <span className="inline-block cursor-not-allowed opacity-60">{children}</span>
      </Tooltip>
    );
  }

  // mode === 'disable': clone the child and add disabled + tooltip + lock icon
  if (mode === 'disable' && isValidElement(children)) {
    const child = children as ReactElement<{
      disabled?: boolean;
      title?: string;
      'aria-disabled'?: boolean;
      'aria-label'?: string;
      className?: string;
    }>;
    const cloned = cloneElement(child, {
      disabled: true,
      'aria-disabled': true,
      title: denyMessage,
      'aria-label': denyMessage,
      className: cn(child.props.className, 'pointer-events-none cursor-not-allowed opacity-50'),
    });
    return (
      <Tooltip label={denyMessage}>
        <span className="inline-flex items-center gap-1.5">
          {cloned}
          <Lock className="h-3 w-3 shrink-0 text-gray-400 dark:text-surface-500" aria-hidden="true" />
        </span>
      </Tooltip>
    );
  }

  return <>{fallback}</>;
}
