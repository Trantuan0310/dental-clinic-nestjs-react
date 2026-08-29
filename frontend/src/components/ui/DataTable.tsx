import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  isLoading?: boolean;
  emptyState?: ReactNode;
  pageSize?: number;
  onRowClick?: (row: TData) => void;
  rowKey?: (row: TData) => string;
  className?: string;
  /**
   * Enable row virtualization. Useful for very large lists (>1000 rows)
   * where DOM weight becomes a bottleneck. Disable for tables that need
   * full keyboard accessibility on all rows at once.
   */
  virtual?: boolean;
  /** Estimated row height in px (required when virtual=true). */
  estimatedRowHeight?: number;
}

export function DataTable<TData>({
  data,
  columns,
  isLoading,
  emptyState,
  pageSize = 20,
  onRowClick,
  rowKey,
  className,
  virtual = false,
  estimatedRowHeight = 44,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: virtual ? getCoreRowModel() : getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 8,
  });

  return (
    <div className={cn('overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900', className)}>
      <div
        ref={virtual ? scrollRef : undefined}
        className={cn('overflow-x-auto', virtual && 'overflow-y-auto')}
        style={virtual ? { maxHeight: 480 } : undefined}
      >
        <table className="table-base">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th key={header.id} className={cn('whitespace-nowrap', canSort && 'cursor-pointer select-none')}>
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-surface-100"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : sorted === 'desc' ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          {virtual ? (
            <tbody style={{ display: 'block', height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-surface-400">
                    Đang tải...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-0">
                    {emptyState ?? <div className="px-4 py-12 text-center text-sm text-gray-500 dark:text-surface-400">Không có dữ liệu</div>}
                  </td>
                </tr>
              ) : (
                rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <tr
                      key={rowKey ? rowKey(row.original) : row.id}
                      onClick={() => onRowClick?.(row.original)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                        display: 'table',
                        tableLayout: 'auto',
                      }}
                      className={cn(onRowClick && 'cursor-pointer')}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          ) : (
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-surface-400">
                    Đang tải...
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="p-0">
                    {emptyState ?? <div className="px-4 py-12 text-center text-sm text-gray-500 dark:text-surface-400">Không có dữ liệu</div>}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={rowKey ? rowKey(row.original) : row.id}
                    onClick={() => onRowClick?.(row.original)}
                    className={cn(onRowClick && 'cursor-pointer')}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>
      </div>
      {!virtual && table.getPageCount() > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-600 dark:border-surface-700 dark:text-surface-300">
          <div>
            Trang {table.getState().pagination.pageIndex + 1} / {table.getPageCount()} — {data.length} dòng
          </div>
          <div className="flex items-center gap-1">
            <button
              className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-50 dark:border-surface-700"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Trước
            </button>
            <button
              className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-50 dark:border-surface-700"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}