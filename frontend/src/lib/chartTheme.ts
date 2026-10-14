/**
 * Colours for recharts charts, following the active theme.
 *
 * Recharts draws its grid, axes and tooltip with inline SVG/DOM styles, so
 * Tailwind's `dark:` variants never reach them — a chart styled with light
 * hex values keeps a pale grid and a white tooltip in dark mode. Every chart
 * takes its colours from here instead, and `tooltip` is spread onto
 * `<Tooltip>` so the popover follows the theme too.
 */
import type { CSSProperties } from 'react';
import { useThemeStore } from '@/stores/themeStore';

/** Series colours in pick order; the dark set is lightened to stay readable. */
const SERIES_LIGHT = ['#0D9488', '#4F46E5', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2'];
const SERIES_DARK = ['#2DD4BF', '#818CF8', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#22D3EE'];

export interface ChartTheme {
  dark: boolean;
  /** Cartesian grid lines. */
  grid: string;
  /** Axis lines and tick labels. */
  axis: string;
  /** Series palette, long enough to index by series number. */
  series: string[];
  /** Spread onto a recharts `<Tooltip>`. */
  tooltip: {
    contentStyle: CSSProperties;
    labelStyle: CSSProperties;
    itemStyle: CSSProperties;
  };
}

const THEMES: Record<'light' | 'dark', ChartTheme> = {
  light: {
    dark: false,
    grid: '#E5E7EB',
    axis: '#6B7280',
    series: SERIES_LIGHT,
    tooltip: {
      contentStyle: {
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 8,
        color: '#111827',
      },
      labelStyle: { color: '#111827', fontWeight: 600 },
      itemStyle: { color: '#374151' },
    },
  },
  dark: {
    dark: true,
    grid: '#374151',
    axis: '#9CA3AF',
    series: SERIES_DARK,
    tooltip: {
      contentStyle: {
        background: '#1F2937',
        border: '1px solid #4B5563',
        borderRadius: 8,
        color: '#F9FAFB',
      },
      labelStyle: { color: '#F9FAFB', fontWeight: 600 },
      itemStyle: { color: '#E5E7EB' },
    },
  },
};

export function useChartTheme(): ChartTheme {
  return THEMES[useThemeStore((s) => s.resolved)];
}
