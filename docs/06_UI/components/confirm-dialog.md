# ConfirmDialog Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Ask user to confirm before destructive or important actions.

## Props

```typescript
interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  isLoading?: boolean;
}
```

## Variants

### Default
Used for general confirmations.
- `confirmLabel`: "Xác nhận" (brand color)

### Danger
Used for destructive actions (delete, cancel).
- `confirmLabel`: "Xóa" (red color)
- Icon warning

## Usage Example

```tsx
<ConfirmDialog
  isOpen={isDeleteOpen}
  onClose={() => setIsDeleteOpen(false)}
  onConfirm={handleDelete}
  title="Xóa bệnh nhân"
  description="Hành động này không thể hoàn tác. Bệnh nhân và tất cả dữ liệu liên quan sẽ bị xóa vĩnh viễn."
  variant="danger"
  confirmLabel="Xóa vĩnh viễn"
/>
```

## Accessibility
- Focus on cancel button (safer default)
- `aria-busy` when loading
- Escape to cancel

## Related
- Design system: [../design-system.md](../design-system.md)
- Modal component: [modal.md](modal.md)
