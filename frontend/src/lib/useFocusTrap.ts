import { useEffect, type RefObject } from 'react';

/**
 * Minimal focus-trap implementation.
 *
 * - When `active` is true, Tab/Shift+Tab cycles focus among focusable descendants
 *   of `containerRef`.
 * - Restores focus to the previously-focused element on deactivation.
 * - Calls `onEscape` when Escape is pressed (Modal/Drawer convention).
 *
 * Not as feature-rich as `focus-trap-react` (~3kB gzipped) but adequate for our
 * dialog primitives and adds zero dependencies.
 *
 * Note: this does NOT handle shadow DOM or iframes — none of our dialogs use those.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  'iframe',
  'object',
  'embed',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

export interface UseFocusTrapOptions {
  /** When false, the trap is inert — listeners are removed. */
  active: boolean;
  containerRef: RefObject<HTMLElement>;
  /** Called when Escape is pressed while the trap is active. */
  onEscape?: () => void;
  /** If true, focus the first focusable element on activation. Default true. */
  autoFocus?: boolean;
}

export function useFocusTrap({
  active,
  containerRef,
  onEscape,
  autoFocus = true,
}: UseFocusTrapOptions) {
  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Capture the live element in a const so closures don't lose type narrowing.
    const containerEl: HTMLElement = container;

    const focusables = (): HTMLElement[] =>
      Array.from(containerEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && isVisible(el),
      );

    if (autoFocus) {
      // Prefer the first focusable; fall back to the container itself.
      const first = focusables()[0];
      if (first) {
        first.focus();
      } else {
        container.tabIndex = -1;
        container.focus();
      }
    }

    function isVisible(el: HTMLElement): boolean {
      return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (onEscape) {
          e.stopPropagation();
          onEscape();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (current === first || !containerEl.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !containerEl.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      // Restore focus to whatever was focused before we opened.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef, onEscape, autoFocus]);
}
