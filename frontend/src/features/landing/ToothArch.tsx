import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ARCH_LOWER as LOWER,
  ARCH_UPPER as UPPER,
  ARCH_VIEW_H as VIEW_H,
  ARCH_VIEW_W as VIEW_W,
  crownPath as crown,
  groovePath as grooves,
  placeArch,
} from '@/lib/toothArch';

/**
 * The 32 permanent teeth on two U-shaped arches as seen from the biting
 * surface, numbered the FDI way and sized from average crown widths, drawn
 * as a plain line chart. Each tooth is a button; `selected` is filled.
 */
export function ToothArch({ selected, onSelect }: { selected: number; onSelect: (code: number) => void }) {
  const { t } = useTranslation();
  const upper = useMemo(() => placeArch(UPPER, true), []);
  const lower = useMemo(() => placeArch(LOWER, false), []);
  const kinds = t('uiEntry.landing.toothKinds', { returnObjects: true }) as string[];
  const sides = t('uiEntry.landing.toothSides', { returnObjects: true }) as string[];

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block h-auto w-full" role="group" aria-label={t('uiEntry.landing.toothChart')}>
      {/* Midline and occlusal plane split the mouth into the four FDI quadrants. */}
      <g className="stroke-gray-300 dark:stroke-surface-600" strokeWidth={1} strokeDasharray="3 4" aria-hidden>
        <line x1={VIEW_W / 2} y1={12} x2={VIEW_W / 2} y2={VIEW_H - 12} />
        <line x1={40} y1={VIEW_H / 2} x2={VIEW_W - 40} y2={VIEW_H / 2} />
      </g>
      <g className="fill-gray-400 font-mono text-[10px] dark:fill-surface-500" aria-hidden>
        <text x={VIEW_W / 2 - 8} y={VIEW_H / 2 - 6} textAnchor="end">1</text>
        <text x={VIEW_W / 2 + 8} y={VIEW_H / 2 - 6}>2</text>
        <text x={VIEW_W / 2 + 8} y={VIEW_H / 2 + 14}>3</text>
        <text x={VIEW_W / 2 - 8} y={VIEW_H / 2 + 14} textAnchor="end">4</text>
      </g>
      <text x={VIEW_W / 2} y={170} textAnchor="middle" className="fill-gray-500 text-[11px] tracking-wider dark:fill-surface-400">{t('uiEntry.landing.upperJaw')}</text>
      <text x={VIEW_W / 2} y={VIEW_H - 162} textAnchor="middle" className="fill-gray-500 text-[11px] tracking-wider dark:fill-surface-400">{t('uiEntry.landing.lowerJaw')}</text>
      <text x={14} y={VIEW_H / 2 + 4} className="fill-gray-500 text-[10px] dark:fill-surface-400">{t('uiEntry.landing.patientRight')}</text>
      <text x={VIEW_W - 14} y={VIEW_H / 2 + 4} textAnchor="end" className="fill-gray-500 text-[10px] dark:fill-surface-400">{t('uiEntry.landing.patientLeft')}</text>
      {[...upper, ...lower].map((p) => {
        const n = p.code % 10;
        const on = p.code === selected;
        const lx = p.x + p.nx * (p.d / 2 + 11);
        const ly = p.y + p.ny * (p.d / 2 + 11) + 3.5;
        return (
          <g key={p.code}>
            <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.angle.toFixed(1)})`}>
              <path
                d={crown(n, p.w, p.d, p.buccal)}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${t('uiEntry.landing.toothLabel', { code: p.code })}: ${kinds[n - 1]}, ${sides[Math.floor(p.code / 10) - 1]}`}
                onClick={() => onSelect(p.code)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(p.code);
                  }
                }}
                className={
                  'cursor-pointer outline-none transition-colors focus-visible:stroke-gray-900 focus-visible:stroke-[2] dark:focus-visible:stroke-white ' +
                  (on
                    ? 'fill-brand-600 stroke-brand-700 stroke-[1.25]'
                    : 'fill-white stroke-gray-400 stroke-1 hover:fill-brand-50 dark:fill-surface-900 dark:stroke-surface-500 dark:hover:fill-surface-800')
                }
              />
              <path
                d={grooves(n, p.w, p.d, p.buccal)}
                fill="none"
                strokeLinecap="round"
                className={'pointer-events-none stroke-[0.8] ' + (on ? 'stroke-white/70' : 'stroke-gray-300 dark:stroke-surface-600')}
                aria-hidden
              />
            </g>
            <text
              x={lx.toFixed(1)}
              y={ly.toFixed(1)}
              textAnchor="middle"
              aria-hidden
              className={'pointer-events-none font-mono text-[10px] ' + (on ? 'fill-brand-700 font-semibold dark:fill-brand-300' : 'fill-gray-500 dark:fill-surface-400')}
            >
              {p.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
