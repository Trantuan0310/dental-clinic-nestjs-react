# Radio Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Single selection from multiple options (mutually exclusive).

## Props

```typescript
interface RadioProps {
  label?: string;
  value?: string;
  isChecked?: boolean;
  onChange?: (value: string) => void;
  isDisabled?: boolean;
  name?: string;
}
```

## Radio Group

```typescript
interface RadioGroupProps {
  label?: string;
  options: { label: string; value: string }[];
  value?: string;
  onChange?: (value: string) => void;
  isDisabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
}
```

## States
- Unselected
- Selected
- Disabled
- Error

## Accessibility
- Fieldset + legend for group
- Keyboard navigation within group
- aria-checked for selected state

## Related
- Design system: [../design-system.md](../design-system.md)
- Checkbox component: [checkbox.md](checkbox.md)
