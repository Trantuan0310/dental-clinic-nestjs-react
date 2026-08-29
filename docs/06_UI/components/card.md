# Card Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Container with header, body, and optional footer sections.

## Props

```typescript
interface CardProps {
  title?: string;
  description?: string;
  headerAction?: ReactNode;
  footer?: ReactNode;
  isHoverable?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}
```

## Anatomy

```
┌─────────────────────────────────────────┐
│ Header                                   │
│ ─────────────────────────────────────── │
│ Title          [Header Action Button]    │
│ Description                               │
├─────────────────────────────────────────┤
│                                          │
│            Card Content                  │
│                                          │
├─────────────────────────────────────────┤
│ Footer                                   │
└─────────────────────────────────────────┘
```

## Variants
- Default (white bg, subtle shadow)
- Bordered (border instead of shadow)
- Interactive (hover effect)

## Usage

```tsx
<Card
  title="Bệnh nhân"
  description="Thông tin cơ bản"
  headerAction={<Button size="sm">Sửa</Button>}
  footer={<Link>Xem chi tiết</Link>}
>
  <PatientInfo />
</Card>
```

## Accessibility
- Semantic article or section
- Title in proper heading hierarchy

## Related
- Design system: [../design-system.md](../design-system.md)
