# Drawer Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Side panel that slides in from the edge.

## Props

```typescript
interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  side?: 'left' | 'right';
  size?: 'sm' | 'md' | 'lg' | 'full';
  children: ReactNode;
  footer?: ReactNode;
}
```

## Sizes

| Size | Width |
|------|-------|
| `sm` | 320px |
| `md` | 480px |
| `lg` | 640px |
| `full` | 100vw (full height) |

## Anatomy

```
┌─────────────────────────────────────────┐
│ Header                              [×] │
│ ─────────────────────────────────────── │
│ Title                                   │
│ Description                             │
├─────────────────────────────────────────┤
│                                          │
│         Drawer Content                  │
│                                          │
├─────────────────────────────────────────┤
│ Footer                                   │
└─────┬───────────────────────────────────┘
      │ Overlay
```

## Use Cases
- Patient quick view
- Form side panel
- Detail slide-over

## Accessibility
- Focus trap inside drawer
- `aria-modal="true"`
- Escape to close
- Return focus to trigger on close
- Scrollable content area

## Related
- Design system: [../design-system.md](../design-system.md)
- Modal component: [modal.md](modal.md)
