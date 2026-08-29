# Loading Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Loading indicators for various contexts.

## Variants

### Spinner
Small loading indicator for inline/button contexts.
- Size: sm (16px), md (20px), lg (24px)
- Color: inherit from parent

### Skeleton
Placeholder shapes for content loading.
- Text lines
- Avatar circles
- Card shapes

### Full Page
Centered spinner with optional message for page-level loading.

## Props

```typescript
interface LoadingProps {
  variant?: 'spinner' | 'skeleton' | 'fullpage';
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}
```

## Skeleton Example

```tsx
<Card>
  <Skeleton variant="circle" width={40} height={40} />
  <Skeleton variant="text" width="60%" />
  <Skeleton variant="text" width="40%" />
</Card>
```

## Best Practices
- Use skeleton for page-level loading (better UX)
- Use spinner for action-level (button clicks)
- Show meaningful messages when possible

## Accessibility
- `aria-busy="true"` on loading containers
- `aria-live="polite"` for screen readers

## Related
- Design system: [../design-system.md](../design-system.md)
- EmptyState component: [empty-state.md](empty-state.md)
