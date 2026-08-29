# Tabs Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Organize content into selectable panels.

## Props

```typescript
interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
  children: ReactNode;
}

interface TabListProps {
  children: ReactNode;
  'aria-label'?: string;
}

interface TabProps {
  value: string;
  disabled?: boolean;
  children: ReactNode;
}

interface TabPanelProps {
  value: string;
  children: ReactNode;
}
```

## Variants
- Horizontal (default)
- Vertical (sidebar navigation style)

## Horizontal Tabs

```
┌──────────┬──────────┬──────────┐
│ Tab 1    │ Tab 2    │ Tab 3    │
├──────────┴──────────┴──────────┤
│                                  │
│         Panel Content            │
│                                  │
└──────────────────────────────────┘
```

## States
- Default
- Selected (underline + text color)
- Hover
- Disabled

## Features
- Lazy loading of panel content
- Keyboard navigation (arrow keys)
- Scrollable tabs when overflow

## Accessibility
- Tablist + tab + tabpanel ARIA pattern
- Arrow key navigation
- `aria-selected` on active tab
- Focus visible

## Related
- Design system: [../design-system.md](../design-system.md)
