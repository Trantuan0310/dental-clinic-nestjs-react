import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/** FDI codes as the dentist sees the mouth: patient's right on the left. */
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
// Average crown size in mm, by position (1 = central incisor … 8 = wisdom tooth):
// width along the arch (mesio-distal) and depth across it (bucco-lingual).
const SIZE = {
  upper: { w: [0, 8.5, 6.5, 7.5, 7, 6.5, 10, 9, 8.5], d: [0, 7, 6, 8, 9, 9, 11, 11, 10] },
  lower: { w: [0, 5, 5.5, 7, 7, 7, 11, 10.5, 10], d: [0, 6, 6, 7.5, 7.5, 8, 10.5, 10, 9.5] },
};
const GAP_MM = 0.6;
const VIEW_W = 520;
const VIEW_H = 520;

type Placed = { code: number; x: number; y: number; angle: number; w: number; d: number; buccal: 1 | -1; nx: number; ny: number };

/**
 * One arch as a U (occlusal view). Upper: incisors at the top, molars running
 * down the sides; lower: the mirror image underneath. Teeth sit along the
 * curve by their real widths, scaled so the row fills the curve.
 */
function placeArch(codes: number[], upper: boolean) {
  const size = upper ? SIZE.upper : SIZE.lower;
  const halfW = upper ? 205 : 190;
  const depth = 178;
  const front = upper ? 42 : VIEW_H - 42;
  const dir = upper ? 1 : -1;
  const curve = (x: number) => front + dir * depth * Math.pow(Math.abs(x) / halfW, 1.9);
  // Arc-length table along x ∈ [-halfW, halfW].
  const N = 400;
  const xs: number[] = [];
  const lens: number[] = [0];
  for (let i = 0; i <= N; i++) xs.push(-halfW + (2 * halfW * i) / N);
  for (let i = 1; i <= N; i++) lens.push(lens[i - 1] + Math.hypot(xs[i] - xs[i - 1], curve(xs[i]) - curve(xs[i - 1])));
  const total = lens[N];
  const mm = codes.reduce((s, c) => s + size.w[c % 10] + GAP_MM, 0);
  const scale = total / mm;
  const at = (len: number) => {
    let i = 1;
    while (i < N && lens[i] < len) i++;
    const f = (len - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
    return xs[i - 1] + f * (xs[i] - xs[i - 1]);
  };
  const cx = 0;
  const cy = front + dir * depth * 0.55; // a point inside the arch
  const out: Placed[] = [];
  let acc = 0;
  for (const code of codes) {
    const n = code % 10;
    const w = size.w[n] * scale;
    const d = size.d[n] * scale;
    const mid = acc + w / 2 + (GAP_MM * scale) / 2;
    acc += w + GAP_MM * scale;
    const x = at(mid);
    const y = curve(x);
    const h = 0.5;
    const tx = 1;
    const ty = (curve(x + h) - curve(x - h)) / (2 * h);
    const tl = Math.hypot(tx, ty);
    const angle = (Math.atan2(ty, tx) * 180) / Math.PI;
    // Local +y after rotate(angle) is (-sin, cos); flip it to face the cheek.
    let nx = -ty / tl;
    let ny = tx / tl;
    const outward = (x - cx) * nx + (y - cy) * ny > 0;
    if (!outward) {
      nx = -nx;
      ny = -ny;
    }
    out.push({ code, x: x + VIEW_W / 2, y, angle, w, d, buccal: outward ? 1 : -1, nx, ny });
  }
  return { teeth: out };
}

/** Crown outline seen from the biting surface, in tooth-local coordinates. */
function crown(n: number, w: number, d: number, b: 1 | -1) {
  // Superellipse: higher exponent = squarer. The tongue side is narrower.
  const [exp, taper, point] =
    n <= 2 ? [2.6, 0.62, 0] : n === 3 ? [1.7, 0.7, 0.22] : n <= 5 ? [2.3, 0.85, 0] : [3.2, 0.9, 0];
  const pts: string[] = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let px = (w / 2) * Math.sign(c) * Math.pow(Math.abs(c), 2 / exp);
    let py = (d / 2) * Math.sign(s) * Math.pow(Math.abs(s), 2 / exp);
    const cheek = py * b > 0;
    if (!cheek) px *= 1 - (1 - taper) * Math.abs(py) / (d / 2);
    if (cheek && point) py *= 1 + point * Math.pow(1 - Math.abs(px) / (w / 2), 2);
    pts.push(`${i ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)}`);
  }
  return pts.join(' ') + ' Z';
}

/** Grooves and edges that make each tooth type read as itself. */
function grooves(n: number, w: number, d: number, b: 1 | -1) {
  if (n <= 2) return `M${(-w * 0.34).toFixed(2)} ${(b * d * 0.18).toFixed(2)} Q0 ${(b * d * 0.26).toFixed(2)} ${(w * 0.34).toFixed(2)} ${(b * d * 0.18).toFixed(2)}`;
  if (n === 3) return `M0 ${(b * d * 0.05).toFixed(2)} L0 ${(b * d * 0.42).toFixed(2)}`;
  if (n <= 5) return `M${(-w * 0.26).toFixed(2)} 0 Q0 ${(-b * d * 0.06).toFixed(2)} ${(w * 0.26).toFixed(2)} 0`;
  const g = [
    `M${(-w * 0.32).toFixed(2)} ${(d * 0.02).toFixed(2)} L${(w * 0.3).toFixed(2)} ${(-d * 0.02).toFixed(2)}`,
    `M${(-w * 0.06).toFixed(2)} ${(-d * 0.3).toFixed(2)} L${(w * 0.04).toFixed(2)} ${(d * 0.3).toFixed(2)}`,
  ];
  return g.join(' ');
}

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
      {[...upper.teeth, ...lower.teeth].map((p) => {
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
