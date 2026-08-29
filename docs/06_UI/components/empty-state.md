# EmptyState Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Placeholder for empty lists/tables with helpful message and action.

## Props

```typescript
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

## Usage Example

```tsx
<EmptyState
  icon={<ClipboardList />}
  title="Chưa có bệnh nhân"
  description="Bắt đầu bằng cách thêm bệnh nhân mới"
  action={{ label: 'Thêm bệnh nhân', onClick: handleAddPatient }}
/>
```

## Variants
- No data (generic empty)
- No results (search/filter returned nothing)
- Error (fetch failed with retry)

## Accessibility
- Role="status" for status announcements
- Action button properly labeled

## Related
- Design system: [../design-system.md](../design-system.md)
- Loading component: [loading.md](loading.md)
