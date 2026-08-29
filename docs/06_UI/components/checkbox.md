# Checkbox Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Boolean selection for forms.

## Variants
- Single checkbox
- Indeterminate (for parent checkbox with partial children selection)
- Checkbox group

## Props

```typescript
interface CheckboxProps {
  label?: string;
  isChecked?: boolean;
  onChange?: (checked: boolean) => void;
  isIndeterminate?: boolean;
  isDisabled?: boolean;
  value?: string;
}
```

## States
- Unchecked
- Checked
- Indeterminate
- Disabled (unchecked/checked)
- Error

## Accessibility
- Use `<input type="checkbox">`
- aria-checked: "true" | "false" | "mixed"
- Label clickable

## Related
- Design system: [../design-system.md](../design-system.md)
- Radio component: [radio.md](radio.md)
