import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { cn } from '@/lib/cn';
import {
  ADULT_TEETH,
  TOOTH_STATUS_LABEL,
  TOOTH_STATUSES,
  toothStatusColor,
  type ToothDescriptor,
  type ToothEntry,
  type ToothStatus,
} from '@/types/medical-records';

export interface DentalChartHandle {
  focusTooth: (fdi: string) => void;
}

interface DentalChartProps {
  teeth: Record<string, ToothEntry>;
  onToothClick?: (tooth: ToothDescriptor) => void;
  readOnly?: boolean;
  highlightToothNumbers?: number[];
  size?: 'sm' | 'md' | 'lg';
  /**
   * When provided, only the FDIs in this set will render at full opacity; the rest will be dimmed.
   * Used together with the search box to spotlight a single tooth.
   */
  dimFdis?: Set<string>;
  /**
   * Teeth whose current status is not in this set will render dimmed.
   * Used by the status filter toolbar.
   */
  filterEnabled?: Set<ToothStatus>;
  registerToothRef?: (fdi: string, el: HTMLButtonElement | null) => void;
  onSearchSubmit?: (fdi: string) => void;
}

const SIZE: Record<NonNullable<DentalChartProps['size']>, { cell: string; label: string }> = {
  sm: { cell: 'h-9 w-9 text-xs', label: 'text-[10px]' },
  md: { cell: 'h-11 w-11 text-sm', label: 'text-[11px]' },
  lg: { cell: 'h-14 w-14 text-base', label: 'text-xs' },
};

export const DentalChart = forwardRef<DentalChartHandle, DentalChartProps>(function DentalChart(
  {
    teeth,
    onToothClick,
    readOnly,
    highlightToothNumbers,
    size = 'md',
    dimFdis,
    filterEnabled,
    registerToothRef,
  },
  ref,
) {
  const upper = useMemo(() => ADULT_TEETH.filter((t) => t.arch === 'upper'), []);
  const lower = useMemo(() => ADULT_TEETH.filter((t) => t.arch === 'lower'), []);
  const highlightSet = useMemo(() => new Set(highlightToothNumbers ?? []), [highlightToothNumbers]);
  const dim = SIZE[size];
  const internalRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useImperativeHandle(ref, () => ({
    focusTooth: (fdi: string) => {
      const el = internalRefs.current[fdi];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        el.focus();
      }
    },
  }));

  const handleRef = (fdi: string) => (el: HTMLButtonElement | null) => {
    internalRefs.current[fdi] = el;
    registerToothRef?.(fdi, el);
  };

  const renderCell = (t: ToothDescriptor) => {
    const entry = teeth[String(t.number)];
    const status: ToothStatus = entry?.status ?? 'healthy';
    const palette = toothStatusColor(status);
    const selected = highlightSet.has(t.number);
    const fdi = String(t.number);
    const isFilteredOut = filterEnabled && !filterEnabled.has(status);
    const isDimmed = (dimFdis && !dimFdis.has(fdi)) || isFilteredOut;
    return (
      <button
        ref={handleRef(fdi)}
        type="button"
        key={t.number}
        disabled={readOnly || !onToothClick}
        onClick={() => onToothClick?.(t)}
        data-fdi={fdi}
        data-status={status}
        data-highlighted={selected || undefined}
        className={cn(
          'flex flex-col items-center justify-center rounded-md border transition-all',
          dim.cell,
          palette.bg,
          palette.text,
          palette.border,
          selected && 'ring-2 ring-primary-500 ring-offset-1 z-10',
          isDimmed && 'opacity-30 saturate-50',
          !readOnly && onToothClick && 'cursor-pointer hover:scale-105 hover:shadow',
          readOnly && 'cursor-default',
        )}
        title={`${t.name} — ${TOOTH_STATUS_LABEL[status]}${entry?.notes ? ` (${entry.notes})` : ''}`}
        aria-label={`${t.name}, ${TOOTH_STATUS_LABEL[status]}`}
      >
        <span className="font-mono font-semibold leading-none">{t.fdi}</span>
      </button>
    );
  };

  const renderArch = (arch: ToothDescriptor[]) => (
    <div className="flex w-max min-w-full justify-center gap-1.5 md:w-auto md:min-w-0">
      {arch.map((t) => renderCell(t))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
        <span className="font-semibold text-gray-700">Chú thích:</span>
        {TOOTH_STATUSES.map((s) => {
          const palette = toothStatusColor(s);
          return (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={cn('inline-block h-4 w-4 rounded border', palette.bg, palette.border)} />
              <span>{TOOTH_STATUS_LABEL[s]}</span>
            </span>
          );
        })}
      </div>

      <div className="overflow-x-auto md:overflow-visible">
        <div className="min-w-max md:min-w-0">
          <div>
            <div className={cn('mb-1 text-center text-xs font-semibold uppercase tracking-wider text-gray-500', dim.label)}>
              Hàm trên
            </div>
            {renderArch(upper)}
          </div>

          <div className="mx-auto h-px w-3/4 bg-gray-300" aria-hidden="true" />

          <div>
            {renderArch(lower)}
            <div className={cn('mt-1 text-center text-xs font-semibold uppercase tracking-wider text-gray-500', dim.label)}>
              Hàm dưới
            </div>
          </div>
        </div>
      </div>

      {!readOnly && (
        <p className="mt-1 text-center text-[11px] text-gray-400">
          Chạm vào răng để cập nhật tình trạng • {TOOTH_STATUSES.length} trạng thái
        </p>
      )}
    </div>
  );
});