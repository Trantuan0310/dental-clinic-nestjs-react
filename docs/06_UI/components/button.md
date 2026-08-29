# Button Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Primary interactive element for triggering actions.

## Variants
- `primary` — Primary action (brand-500 background)
- `secondary` — Secondary action (outlined or ghost)
- `danger` — Destructive action (red-500 background)
- `ghost` — Minimal action (transparent background)

## Sizes
- `sm` — Small (h-8, px-3, text-sm)
- `md` — Medium (h-10, px-4, text-base) — **default**
- `lg` — Large (h-12, px-6, text-lg)

## Props

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  isDisabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}
```

## States
- Default
- Hover (opacity-90 or darker shade)
- Active/Pressed (opacity-80)
- Disabled (opacity-50, cursor-not-allowed)
- Loading (spinner replaces content, disabled)

## Accessibility
- Use `<button>` element (not `<div>`)
- `aria-label` for icon-only buttons
- `aria-disabled="true"` when disabled
- Focus ring on keyboard navigation

## Related
- Design system: [../design-system.md](../design-system.md)
