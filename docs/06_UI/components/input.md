# Input Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Text input field for forms.

## Variants
- Text
- Email
- Password (with show/hide toggle)
- Number
- Tel (phone number)
- Search (with search icon)

## Props

```typescript
interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  helperText?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'search';
}
```

## States
- Default (gray-200 border)
- Focus (brand-500 ring)
- Error (red-500 border + error message)
- Disabled (gray-100 bg, gray-400 text)

## Validation
- Use Zod schema from backend
- Inline error display below field
- Prevent form submission when invalid

## Accessibility
- Always visible label (not placeholder-only)
- `aria-describedby` for error messages
- `aria-invalid="true"` when error

## Related
- Design system: [../design-system.md](../design-system.md)
- Form component: [form.md](form.md)
