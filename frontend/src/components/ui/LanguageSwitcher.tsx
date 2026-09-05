import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Check } from 'lucide-react';
import { useLocaleStore } from '@/stores/localeStore';
import { LOCALES } from '@/locales';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/Tooltip';

interface LanguageSwitcherProps {
  variant?: 'icon' | 'segmented';
  className?: string;
}

/**
 * Locale switcher.
 *
 * `icon` — single button that opens a popover with the available locales (default).
 * `segmented` — horizontal pill bar showing both locales inline.
 */
export function LanguageSwitcher({ variant = 'icon', className }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Native <details> has no built-in outside-click/Escape close behavior —
  // only picking a locale (below) or clicking the summary again closed it,
  // so clicking anywhere else on the page left the menu open, overlapping
  // subsequent content. Runs regardless of `variant` (hooks can't be
  // called conditionally); it's a no-op for 'segmented', which never
  // attaches `detailsRef`.
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (detailsRef.current && !detailsRef.current.contains(e.target as Node)) {
        detailsRef.current.removeAttribute('open');
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        detailsRef.current?.removeAttribute('open');
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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
        {LOCALES.map((l) => {
          const active = locale === l.code;
          return (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLocale(l.code)}
              className={cn(
                'inline-flex h-7 items-center rounded px-2 font-medium transition-colors',
                active
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-surface-300 dark:hover:bg-surface-700',
              )}
            >
              <span>{l.short}</span>
            </button>
          );
        })}
      </div>
    );
  }

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  return (
    <Tooltip label={t('language.switchLabel', { native: current.native })} side="bottom">
      <div className={cn('relative', className)}>
        <details ref={detailsRef} className="group">
          <summary
            role="button"
            aria-label={t('language.title')}
            className={cn(
              'flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-surface-300 dark:hover:bg-surface-800',
              '[&::-webkit-details-marker]:hidden',
            )}
          >
            <Languages className="h-4 w-4" />
            <span className="hidden sm:inline">{current.short}</span>
          </summary>
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1 min-w-[10rem] overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800"
          >
            {LOCALES.map((l) => {
              const active = locale === l.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={(e) => {
                    setLocale(l.code);
                    // Close the popover on selection.
                    const el = (e.currentTarget.closest('details') as HTMLDetailsElement | null);
                    el?.removeAttribute('open');
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm',
                    active
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-surface-200 dark:hover:bg-surface-700',
                  )}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{l.native}</span>
                    <span className="text-[10px] text-gray-400 dark:text-surface-500">{l.label}</span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </details>
      </div>
    </Tooltip>
  );
}
