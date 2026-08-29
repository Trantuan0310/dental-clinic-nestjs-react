import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { cn } from '@/lib/cn';

interface ThemeToggleProps {
  /** Render as icon-only (default) or with a 3-state segmented control. */
  variant?: 'icon' | 'segmented';
  className?: string;
}

const MODE_VALUES: ThemeMode[] = ['light', 'dark', 'system'];
const ICON_FOR: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeToggle({ variant = 'icon', className }: ThemeToggleProps) {
  const { t } = useTranslation();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const toggle = useThemeStore((s) => s.toggle);
  const sync = useThemeStore((s) => s.sync);

  // Re-sync when component mounts (in case OS preference changed since last visit).
  useEffect(() => {
    sync();
  }, [sync]);

  // Listen for "toggle theme" event (e.g. from Command Palette).
  useEffect(() => {
    function onToggle() {
      toggle();
    }
    window.addEventListener('gensmile:toggle-theme', onToggle);
    return () => window.removeEventListener('gensmile:toggle-theme', onToggle);
  }, [toggle]);

  if (variant === 'segmented') {
    return (
      <div
        role="radiogroup"
        aria-label={t('language.title')}
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-white p-0.5 text-xs shadow-sm dark:border-surface-700 dark:bg-surface-800',
          className,
        )}
      >
        {MODE_VALUES.map((value) => {
          const Icon = ICON_FOR[value];
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(value)}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded px-2 font-medium transition-colors',
                active
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-surface-300 dark:hover:bg-surface-700',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t(`theme.${value}`)}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const Icon = ICON_FOR[mode];
  const label =
    mode === 'dark'
      ? t('theme.switchToLight')
      : mode === 'light'
      ? t('theme.switchToDark')
      : t('theme.toggleLabel', { mode: t('theme.light') });
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-surface-400 dark:hover:bg-surface-800',
        className,
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
