# StatusBadge Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Visual indicator for status values (appointment status, invoice status, etc.).

## Props

```typescript
interface StatusBadgeProps {
  status: string;
  type?: 'appointment' | 'invoice' | 'payment' | 'inventory';
}
```

## Appointment Status Colors

| Status | Color | Background |
|--------|-------|------------|
| `scheduled` | gray-500 | gray-100 |
| `confirmed` | brand-600 | brand-50 |
| `checked_in` | info | blue-100 |
| `in_progress` | warning | amber-100 |
| `completed` | success | green-100 |
| `cancelled` | danger | red-100 |
| `no_show` | danger | red-100 |

## Invoice Status Colors

| Status | Color | Notes |
|--------|-------|-------|
| `draft` | gray-500 | — |
| `issued` | brand-600 | — |
| `partial` | warning | amber-500 |
| `paid` | success | green-500 |
| `void` | danger | red-500 |

## Features
- Colored dot + label
- Consistent colors across app
- Extensible for custom status types

## Accessibility
- Semantic span (not div)
- Optional tooltip for more context

## Related
- Design system: [../design-system.md](../design-system.md)
