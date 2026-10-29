import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/** FDI codes as the dentist sees the mouth: patient's right on the left. */
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
// Crown width along the arch and height across it, by position (1 = central incisor … 8 = wisdom tooth).
const WIDTH = [0, 20, 17, 19, 21, 21, 29, 27, 25];
const HEIGHT = (n: number) => (n >= 6 ? 30 : n >= 4 ? 28 : 34);

type Placed = { code: number; x: number; y: number; angle: number; w: number; h: number; upper: boolean };

function place(): Placed[] {
  const out: Placed[] = [];
  for (const [codes, upper] of [[UPPER, true], [LOWER, false]] as const) {
    const cy = upper ? 172 : 208;
    const sign = upper ? -1 : 1;
    const total = codes.reduce((s, c) => s + WIDTH[c % 10] + 4, 0);
    let acc = 0;
    for (const code of codes) {
      const w = WIDTH[code % 10];
      const mid = acc + w / 2;
      acc += w + 4;
      const t = Math.PI * (1 - mid / total);
      const rx = 205;
      const ry = 150;
      out.push({
        code,
        x: 260 + rx * Math.cos(t),
        y: cy + sign * ry * Math.sin(t),
        angle: (Math.atan2(sign * ry * Math.cos(t), -rx * Math.sin(t)) * 180) / Math.PI,
        w,
        h: HEIGHT(code % 10),
        upper,
      });
    }
  }
  return out;
}

/**
 * The 32 permanent teeth laid out on two arches, numbered the FDI way.
 * Each tooth is a button; `selected` is filled with the brand colour.
 */
export function ToothArch({ selected, onSelect }: { selected: number; onSelect: (code: number) => void }) {
  const { t } = useTranslation();
  const teeth = useMemo(place, []);
  const kinds = t('uiEntry.landing.toothKinds', { returnObjects: true }) as string[];
  const sides = t('uiEntry.landing.toothSides', { returnObjects: true }) as string[];
  return (
    <svg viewBox="0 0 520 380" className="block h-auto w-full" role="group" aria-label={t('uiEntry.landing.toothChart')}>
      <text x="260" y="150" textAnchor="middle" className="fill-gray-500 text-[11px] dark:fill-surface-400">{t('uiEntry.landing.upperJaw')}</text>
      <text x="260" y="240" textAnchor="middle" className="fill-gray-500 text-[11px] dark:fill-surface-400">{t('uiEntry.landing.lowerJaw')}</text>
      <text x="28" y="194" textAnchor="middle" className="fill-gray-500 text-[10px] dark:fill-surface-400">{t('uiEntry.landing.patientRight')}</text>
      <text x="492" y="194" textAnchor="middle" className="fill-gray-500 text-[10px] dark:fill-surface-400">{t('uiEntry.landing.patientLeft')}</text>
      {teeth.map((p) => {
        const on = p.code === selected;
        const labelY = p.upper ? -p.h / 2 - 6 : p.h / 2 + 14;
        return (
          <g key={p.code} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.angle.toFixed(1)})`}>
            <rect
              x={-p.w / 2}
              y={-p.h / 2}
              width={p.w}
              height={p.h}
              rx={p.code % 10 <= 3 ? 7 : 6}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${t('uiEntry.landing.toothLabel', { code: p.code })}: ${kinds[(p.code % 10) - 1]}, ${sides[Math.floor(p.code / 10) - 1]}`}
              onClick={() => onSelect(p.code)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(p.code);
                }
              }}
              className={
                'cursor-pointer stroke-[1.5] outline-none transition-colors focus-visible:stroke-gray-900 focus-visible:stroke-[2.5] dark:focus-visible:stroke-white ' +
                (on
                  ? 'fill-brand-600 stroke-brand-600'
                  : 'fill-white stroke-gray-300 hover:fill-brand-50 hover:stroke-brand-400 dark:fill-surface-900 dark:stroke-surface-600 dark:hover:fill-surface-800')
              }
            />
            <text
              x={0}
              y={labelY}
              textAnchor="middle"
              aria-hidden
              transform={`rotate(${(-p.angle).toFixed(1)} 0 ${p.upper ? -p.h / 2 - 9 : p.h / 2 + 11})`}
              className={'font-mono text-[10px] ' + (on ? 'fill-brand-700 font-semibold dark:fill-brand-300' : 'fill-gray-500 dark:fill-surface-400')}
            >
              {p.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
