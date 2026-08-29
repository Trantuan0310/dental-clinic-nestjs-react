/**
 * Tiny Tailwind-friendly helpers for screen-reader-only content.
 * Matches the recipe used by Tailwind's official `sr-only` plugin.
 */
export const srOnly =
  'absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)] [clip-path:inset(50%)]';

/** Visually-hidden but announced by assistive tech. */
export const srOnlyFocusable =
  'sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg';
