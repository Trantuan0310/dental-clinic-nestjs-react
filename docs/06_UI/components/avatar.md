# Avatar Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
User representation with image or initials fallback.

## Props

```typescript
interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string; // For initials fallback
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'square';
}
```

## Sizes

| Size | Dimension | Use case |
|------|-----------|----------|
| `xs` | 24px | Inline text |
| `sm` | 32px | Table rows |
| `md` | 40px | Cards, lists |
| `lg` | 48px | Headers |
| `xl` | 64px | Profile pages |

## Fallback Logic
1. If `src` provided and image loads → show image
2. If image fails → show initials from `name`
3. If no `name` → show generic user icon

## Initials
- Extract first letter of first and last name
- Uppercase
- Max 2 characters

## Group Avatars
- Stack up to 5 avatars
- Show "+N" for overflow
- Hover to see names

## Accessibility
- `alt` attribute for image
- `aria-label` for initials fallback
- Decorative when in button context

## Related
- Design system: [../design-system.md](../design-system.md)
