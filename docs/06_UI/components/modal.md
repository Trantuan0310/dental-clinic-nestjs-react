# Modal Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Overlay dialog for focused interactions.

## Variants
- Center (default)
- Slide-over (from right)
- Fullscreen
- Alert dialog

## Props

```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  variant?: 'center' | 'slide-over' | 'fullscreen';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}
```

## Sizes

| Size | Width |
|------|-------|
| `sm` | 400px |
| `md` | 500px |
| `lg` | 600px |
| `xl` | 800px |
| `full` | 100vw × 100vh |

## Anatomy

```
┌──────────────────────────────────────┐
│ Header                           [×] │
│ ──────────────────────────────────── │
│                                      │
│           Content area               │
│                                      │
│                                      │
│ ──────────────────────────────────── │
│ Footer: [Cancel]            [Confirm] │
└──────────────────────────────────────┘
```

## States
- Opening (fade + scale)
- Open
- Closing (fade + scale)

## Accessibility
- Focus trap inside modal
- `aria-modal="true"`
- `aria-labelledby` for title
- `aria-describedby` for description
- Escape to close
- Focus returns to trigger on close

## Related
- Design system: [../design-system.md](../design-system.md)
- ConfirmDialog: [confirm-dialog.md](confirm-dialog.md)
