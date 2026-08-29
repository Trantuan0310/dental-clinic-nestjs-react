# Form Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Form layout with validation and error handling.

## Props

```typescript
interface FormProps {
  schema: ZodSchema;
  defaultValues?: Record<string, unknown>;
  onSubmit: (data: unknown) => Promise<void>;
  children: ReactNode;
}
```

## Features
- Label + input layout (2-column on desktop)
- Inline validation errors
- Helper text support
- Submit button with loading state
- Cancel button
- React Hook Form + Zod integration

## Layout

```
┌─ Form Section ────────────────────────────────────┐
│  Section Title                                     │
│  ─────────────────────────                         │
│  Field 1:        [____________]                   │
│                  Helper text                       │
│                                                    │
│  Field 2:        [____________]                   │
│                  ⚠ Error message                  │
│                                                    │
│  [Cancel]                          [Submit Button]│
└────────────────────────────────────────────────────┘
```

## States
- Initial (empty)
- Dirty (user modified)
- Submitting (button loading)
- Submitted (success)
- Error (validation or server error)

## Related
- Design system: [../design-system.md](../design-system.md)
- Input: [input.md](input.md)
- Select: [select.md](select.md)
