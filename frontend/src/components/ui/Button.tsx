import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Slot } from './Slot';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  isDisabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  /**
   * When true, the Button renders its single child as the root element via
   * <Slot> (Radix-style). Useful for composing with <Link>.
   * The `asChild` prop is consumed by Button and never forwarded to the DOM.
   */
  asChild?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300 dark:bg-surface-700 dark:text-surface-100 dark:hover:bg-surface-600 dark:active:bg-surface-500',
  danger: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700',
  success: 'bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700',
  ghost: 'bg-transparent hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-surface-800 dark:active:bg-surface-700',
  outline: 'border border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700 dark:active:bg-surface-600',
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      isDisabled = false,
      fullWidth = false,
      leftIcon,
      children,
      disabled,
      type = 'button',
      asChild: _asChild = false,
      ...props
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const baseStyles =
      'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

    const classes = cn(
      baseStyles,
      VARIANT_CLASSES[variant],
      SIZE_CLASSES[size],
      fullWidth && 'w-full',
      className,
    );

    const ariaProps = {
      'aria-busy': isLoading || undefined,
      'aria-disabled': isDisabled || undefined,
    };

    if (_asChild) {
      // Slot needs ONE child element. Compose leftIcon + children into a fragment
      // so Slot picks the first valid element as the wrapper (e.g. <Link>).
      return (
        <Slot
          ref={ref}
          className={classes}
          {...ariaProps}
          {...props}
        >
          <>
            {leftIcon}
            {children}
          </>
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        disabled={isDisabled || disabled || isLoading}
        {...ariaProps}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="sr-only" aria-live="polite">
              {t('common.loading')}
            </span>
          </>
        ) : (
          leftIcon
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
