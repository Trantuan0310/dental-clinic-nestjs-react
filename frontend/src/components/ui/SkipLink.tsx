import { cn } from '@/lib/cn';
import { srOnlyFocusable } from '@/lib/a11y';

/**
 * A "skip to main content" link, hidden by default and revealed when focused.
 * Best practice for keyboard users — lets them bypass nav/header chrome.
 *
 * Place at the very top of your root layout. Pair with `id="main-content"`
 * on the main element.
 */
export function SkipLink({
  href = '#main-content',
  children = 'Skip to main content',
  className,
}: {
  href?: string;
  children?: string;
  className?: string;
}) {
  return (
    <a href={href} className={cn(srOnlyFocusable, className)}>
      {children}
    </a>
  );
}