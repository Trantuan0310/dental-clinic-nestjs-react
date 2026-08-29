# Tag / Chip Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Compact label for categorization or metadata.

## Variants
- Default (outlined)
- Filled
- Removable (with X button)

## Props

```typescript
interface TagProps {
  label: string;
  variant?: 'default' | 'filled';
  color?: 'gray' | 'brand' | 'success' | 'warning' | 'danger';
  removable?: boolean;
  onRemove?: () => void;
}
```

## Usage Examples

```tsx
// Role tags
<Tag label="Admin" color="brand" />
<Tag label="Bác sĩ" color="success" />

// Removable filter tags
<Tag label="Đã thanh toán" removable onRemove={handleRemove} />
```

## Colors

| Color | Background | Text |
|-------|------------|------|
| `gray` | gray-100 | gray-700 |
| `brand` | brand-100 | brand-700 |
| `success` | green-100 | green-700 |
| `warning` | amber-100 | amber-700 |
| `danger` | red-100 | red-700 |

## Accessibility
- Semantic span element
- `role="tag"` for removable tags
- `aria-label` for remove button

## Related
- Design system: [../design-system.md](../design-system.md)
- StatusBadge component: [status-badge.md](status-badge.md)
