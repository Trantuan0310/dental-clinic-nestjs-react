# DataTable Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Tabular data display with sorting, filtering, and pagination.

## Props

```typescript
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  isLoading?: boolean;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  };
  sorting?: {
    sort: string;
    order: 'asc' | 'desc';
    onSortChange: (column: string, order: 'asc' | 'desc') => void;
  };
  filtering?: FilterConfig[];
  rowSelection?: {
    selectedIds: string[];
    onSelectionChange: (ids: string[]) => void;
  };
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
}
```

## Features
- Column sorting (click header)
- Per-column filtering
- Server-side pagination
- Row selection with checkboxes
- Row click navigation
- Bulk actions
- Sticky header
- Responsive (hide less important columns)

## Pagination UI
```
Showing 1-20 of 156     « 1 2 3 ... 8 »    Rows: [20 ▼]
```

## Accessibility
- Proper table semantics
- Sort announcements
- Keyboard navigation for pagination

## Related
- Design system: [../design-system.md](../design-system.md)
