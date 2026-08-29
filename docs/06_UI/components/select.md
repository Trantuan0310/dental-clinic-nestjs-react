# Select Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Dropdown selection for choosing one or multiple options.

## Variants
- Single select (default)
- Multi-select (with tags/chips)
- Searchable select

## Props

```typescript
interface SelectProps<T> {
  label?: string;
  placeholder?: string;
  options: T[];
  value?: T | T[];
  onChange?: (value: T | T[]) => void;
  isMulti?: boolean;
  isSearchable?: boolean;
  isClearable?: boolean;
  error?: string;
  isDisabled?: boolean;
  getOptionLabel?: (option: T) => string;
  getOptionValue?: (option: T) => string;
}
```

## States
- Default (gray-200 border)
- Open (dropdown visible)
- Selected (option highlighted)
- Error (red-500 border)
- Disabled (gray-100 bg)

## Features
- Keyboard navigation (arrow keys, enter, escape)
- Type-ahead search
- Clear selection button
- Max selections for multi-select

## Accessibility
- ARIA combobox pattern
- Listbox with aria-selected
- Focus management

## Related
- Design system: [../design-system.md](../design-system.md)
- Form component: [form.md](form.md)
