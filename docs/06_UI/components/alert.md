# Alert Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Inline contextual messages within content.

## Variants

| Variant | Use case |
|---------|----------|
| `info` | Informational messages |
| `success` | Success feedback |
| `warning` | Warnings, cautions |
| `error` | Errors, validation messages |

## Props

```typescript
interface AlertProps {
  variant: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  description?: string;
  isClosable?: boolean;
  onClose?: () => void;
  icon?: ReactNode;
}
```

## Anatomy

```
┌─────────────────────────────────────────┐
│ [Icon] Title                       [×]  │
│        Description text here            │
└─────────────────────────────────────────┘
```

## Colors

| Variant | Icon | Background | Border |
|---------|------|------------|--------|
| `info` | Info | blue-50 | blue-200 |
| `success` | Check | green-50 | green-200 |
| `warning` | Warning | amber-50 | amber-200 |
| `error` | X | red-50 | red-200 |

## Usage Examples

```tsx
// Form validation
<Alert variant="error" title="Vui lòng kiểm tra lại">
  Email không hợp lệ
</Alert>

// Info notice
<Alert variant="info" title="Lưu ý">
  Đặt cọc không bắt buộc với MVP
</Alert>
```

## Accessibility
- `role="alert"` for errors
- `role="status"` for others
- Proper heading hierarchy if title used

## Related
- Design system: [../design-system.md](../design-system.md)
- Toast component: [toast.md](toast.md)
