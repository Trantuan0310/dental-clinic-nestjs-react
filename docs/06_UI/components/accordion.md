# Accordion Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Collapsible sections for organizing dense content.

## Props

```typescript
interface AccordionProps {
  type?: 'single' | 'multiple';
  defaultValue?: string | string[];
  children: ReactNode;
}

interface AccordionItemProps {
  value: string;
  disabled?: boolean;
  children: ReactNode;
}

interface AccordionTriggerProps {
  children: ReactNode;
}

interface AccordionContentProps {
  children: ReactNode;
}
```

## Variants
- Single (only one open at a time)
- Multiple (multiple can be open)

## Anatomy

```
┌─────────────────────────────────────────┐
│ ▶ Section Title                         │
├─────────────────────────────────────────┤
│                                         │
│         Collapsed Content               │
│                                         │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ ▼ Section Title                         │
├─────────────────────────────────────────┤
│                                         │
│         Expanded Content                │
│                                         │
└─────────────────────────────────────────┘
```

## States
- Collapsed
- Expanded
- Disabled

## Accessibility
- `aria-expanded` on trigger
- `aria-controls` linking to content
- `aria-disabled` when disabled
- Keyboard: Enter/Space to toggle
- Arrow keys to navigate between triggers

## Related
- Design system: [../design-system.md](../design-system.md)
