# DatePicker Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Date/time selection with calendar popup.

## Variants
- Single date
- Date range
- Time only
- Date + time

## Props

```typescript
interface DatePickerProps {
  label?: string;
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  mode?: 'single' | 'range' | 'time' | 'datetime';
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  format?: string; // default: 'dd/MM/yyyy'
  isDisabled?: boolean;
  error?: string;
}
```

## Features
- Calendar popup with month/year navigation
- Time picker for datetime mode
- Keyboard navigation
- Clear button
- Today shortcut

## States
- Default
- Open (calendar visible)
- Selected
- Error
- Disabled

## Accessibility
- ARIA date picker pattern
- Keyboard navigation (arrows, enter, escape)
- Screen reader announcements

## Related
- Design system: [../design-system.md](../design-system.md)
- Input component: [input.md](input.md)
