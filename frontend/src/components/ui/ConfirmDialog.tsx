import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface ConfirmDialogProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  confirmLabel?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  confirmVariant?: 'danger' | 'primary' | 'success';
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  confirmLabel,
  cancelText = 'Hủy',
  variant = 'primary',
  confirmVariant,
  isLoading = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const resolvedOpen = open ?? isOpen ?? false;
  const finalConfirmLabel = confirmLabel ?? confirmText ?? 'Xác nhận';
  const finalVariant = confirmVariant ?? (variant === 'danger' ? 'danger' : 'primary');

  useEffect(() => {
    if (resolvedOpen) {
      cancelRef.current?.focus();
    }
  }, [resolvedOpen]);

  if (!resolvedOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Đóng"
        >
          <X className="h-5 w-5" />
        </button>

        <h2
          id="confirm-title"
          className="text-lg font-semibold text-gray-900"
        >
          {title}
        </h2>

        {description && (
          <div className="mt-2 text-sm text-gray-600">{description}</div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button ref={cancelRef} variant="outline" onClick={onClose}>
            {cancelText}
          </Button>
          <Button
            variant={finalVariant}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {finalConfirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
