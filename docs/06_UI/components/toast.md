# Toast Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Non-intrusive notification messages.

## Types

| Type | Icon | Color | Auto-dismiss |
|------|------|-------|--------------|
| `success` | ✓ | Green | 5s |
| `error` | ✕ | Red | Manual |
| `warning` | ⚠ | Amber | 8s |
| `info` | ℹ | Blue | 5s |

## API

```typescript
// Basic usage
toast.success("Đã lưu thành công")
toast.error("Không thể xóa — có ràng buộc")
toast.warning("Email đã tồn tại")
toast.info("Có 3 thông báo mới")

// With action
toast.success("Đã xóa", {
  action: { label: "Hoàn tác", onClick: handleUndo }
})
```

## Props (ToastItem)

```typescript
interface ToastProps {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration?: number | null; // null = manual dismiss
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

## Position
- Bottom-right (fixed)
- Max 3 toasts visible
- Queue additional toasts

## Accessibility
- `role="alert"` for errors
- `role="status"` for others
- Keyboard dismiss (Esc)

## Related
- Design system: [../design-system.md](../design-system.md)
