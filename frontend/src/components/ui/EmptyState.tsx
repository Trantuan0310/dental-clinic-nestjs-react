import type { ReactNode } from 'react';
import { FileQuestion } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?:
    | {
        label: string;
        onClick: () => void;
      }
    | ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const isActionObject =
    action !== null &&
    action !== undefined &&
    typeof action === 'object' &&
    'onClick' in (action as object) &&
    'label' in (action as object);
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 text-center ${className || ''}`}
    >
      <div className="rounded-full bg-gray-50 p-4 dark:bg-surface-800">
        {icon || <FileQuestion className="h-10 w-10 text-gray-400 dark:text-surface-500" />}
      </div>
      <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-surface-100">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {isActionObject ? (
            <Button onClick={(action as { label: string; onClick: () => void }).onClick}>
              {(action as { label: string; onClick: () => void }).label}
            </Button>
          ) : (
            (action as ReactNode)
          )}
        </div>
      )}
    </div>
  );
}
