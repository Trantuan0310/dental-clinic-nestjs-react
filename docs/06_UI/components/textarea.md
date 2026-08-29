# Textarea Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Multi-line text input for longer content.

## Props

```typescript
interface TextareaProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  maxLength?: number;
  showCount?: boolean;
  autoGrow?: boolean;
  error?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
}
```

## Features
- Auto-grow height based on content
- Character count display
- Max length enforcement

## States
- Default
- Focus
- Error
- Disabled

## Accessibility
- Always visible label
- aria-describedby for character count

## Related
- Design system: [../design-system.md](../design-system.md)
- Input component: [input.md](input.md)
