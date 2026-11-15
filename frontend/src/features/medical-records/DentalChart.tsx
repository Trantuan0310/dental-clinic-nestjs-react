import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import {
  ARCH_LOWER,
  ARCH_PRIMARY_LOWER,
  ARCH_PRIMARY_UPPER,
  ARCH_UPPER,
  ARCH_VIEW_H as VIEW_H,
  ARCH_VIEW_W as VIEW_W,
  crownPath,
  groovePath,
  placeArch,
  type PlacedTooth,
} from '@/lib/toothArch';
import {
  ADULT_TEETH,
  PRIMARY_TEETH,
  TOOTH_STATUS_FILL,
  TOOTH_STATUS_LABEL,
  type DentalChartPatientType,
  type ToothDescriptor,
  type ToothEntry,
  type ToothStatus,
} from '@/types/medical-records';

interface DentalChartProps {
  teeth: Record<string, ToothEntry>;
  /** The tooth whose details are shown next to the chart. */
  selected?: number | null;
  onSelect?: (tooth: ToothDescriptor) => void;
  /** Teeth with a treatment in the open encounter: marked with a dot. */
  marked?: Set<number>;
  /** Teeth whose status is not in this set are drawn faded. */
  filterEnabled?: Set<ToothStatus>;
  /** CHILD draws the primary teeth (51–85) as a second arch inside. */
  patientType?: DentalChartPatientType;
}

const DESCRIPTORS = new Map<number, ToothDescriptor>(
  [...ADULT_TEETH, ...PRIMARY_TEETH].map((tooth) => [tooth.number, tooth]),
);

/**
 * The dental chart as two arches seen from the biting surface (same drawing
 * as the landing page), each crown filled by its status. Every tooth is a
 * button; pressing one selects it.
 */
export function DentalChart({ teeth, selected, onSelect, marked, filterEnabled, patientType = 'ADULT' }: DentalChartProps) {
  const { t } = useTranslation();
  const isChild = patientType === 'CHILD';
  const permanent = useMemo(() => [...placeArch(ARCH_UPPER, true), ...placeArch(ARCH_LOWER, false)], []);
  // Mixed dentition lasts past the CHILD band (~13 y): an ADULT chart still
  // shows the primary teeth already recorded, so they are not lost.
  const primary = useMemo(
    () =>
      [...placeArch(ARCH_PRIMARY_UPPER, true, true), ...placeArch(ARCH_PRIMARY_LOWER, false, true)].filter(
        (p) => isChild || !!teeth[String(p.code)],
      ),
    [isChild, teeth],
  );
  const hasPrimary = primary.length > 0;

  const renderTooth = (p: PlacedTooth, inner: boolean) => {
    const tooth = DESCRIPTORS.get(p.code);
    if (!tooth) return null;
    const entry = teeth[String(p.code)];
    const status: ToothStatus = entry?.status ?? 'healthy';
    const on = p.code === selected;
    const faded = filterEnabled && !filterEnabled.has(status);
    // Permanent teeth are numbered on the cheek side, primary ones on the tongue side.
    const side = inner ? -1 : 1;
    const lx = p.x + side * p.nx * (p.d / 2 + 11);
    const ly = p.y + side * p.ny * (p.d / 2 + 11) + 3.5;
    return (
      <g key={p.code} className={cn(faded && 'opacity-25')}>
        <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.angle.toFixed(1)})`}>
          <path
            d={crownPath(p.kind, p.w, p.d, p.buccal)}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={`${tooth.name}, ${TOOTH_STATUS_LABEL[status]}`}
            data-fdi={p.code}
            data-status={status}
            onClick={() => onSelect?.(tooth)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(tooth);
              }
            }}
            className={cn(
              'cursor-pointer outline-none transition-[stroke-width,filter] hover:brightness-95 focus-visible:stroke-[2.5]',
              TOOTH_STATUS_FILL[status],
              on ? '!stroke-brand-600 stroke-[3] [stroke-dasharray:none]' : 'stroke-1',
            )}
          >
            <title>{`${tooth.name} — ${TOOTH_STATUS_LABEL[status]}${entry?.notes ? ` (${entry.notes})` : ''}`}</title>
          </path>
          {status !== 'missing' && (
            <path
              d={groovePath(p.kind, p.w, p.d, p.buccal)}
              fill="none"
              strokeLinecap="round"
              className="pointer-events-none stroke-gray-400/60 stroke-[0.8]"
              aria-hidden
            />
          )}
          {marked?.has(p.code) && <circle r={3} className="pointer-events-none fill-brand-600" aria-hidden />}
        </g>
        <text
          x={lx.toFixed(1)}
          y={ly.toFixed(1)}
          textAnchor="middle"
          aria-hidden
          className={cn(
            'pointer-events-none font-mono',
            inner ? 'text-[9px]' : 'text-[10px]',
            on ? 'fill-brand-700 font-bold dark:fill-brand-300' : 'fill-gray-500 dark:fill-surface-400',
          )}
        >
          {p.code}
        </text>
      </g>
    );
  };

  const jawLabelY = hasPrimary ? 238 : 170;
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="mx-auto block h-auto w-full max-w-[520px]"
      role="group"
      aria-label={t('uiClinical.toothChart')}
    >
      {/* Midline and occlusal plane split the mouth into the four FDI quadrants. */}
      <g className="stroke-gray-300 dark:stroke-surface-600" strokeWidth={1} strokeDasharray="3 4" aria-hidden>
        <line x1={VIEW_W / 2} y1={12} x2={VIEW_W / 2} y2={VIEW_H - 12} />
        <line x1={40} y1={VIEW_H / 2} x2={VIEW_W - 40} y2={VIEW_H / 2} />
      </g>
      <g className="fill-gray-500 dark:fill-surface-400" aria-hidden>
        <text x={VIEW_W / 2} y={jawLabelY} textAnchor="middle" className="text-[11px] uppercase tracking-wider">
          {t('uiClinical.upperJaw')}
        </text>
        <text x={VIEW_W / 2} y={VIEW_H - jawLabelY + 8} textAnchor="middle" className="text-[11px] uppercase tracking-wider">
          {t('uiClinical.lowerJaw')}
        </text>
        <text x={14} y={VIEW_H / 2 - 6} className="text-[10px]">{t('uiEntry.landing.patientRight')}</text>
        <text x={VIEW_W - 14} y={VIEW_H / 2 - 6} textAnchor="end" className="text-[10px]">{t('uiEntry.landing.patientLeft')}</text>
      </g>
      {permanent.map((p) => renderTooth(p, false))}
      {primary.map((p) => renderTooth(p, true))}
    </svg>
  );
}
