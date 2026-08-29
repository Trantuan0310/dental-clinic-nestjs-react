import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

export type LogoVariant = 'full' | 'icon' | 'icon-mono';
export type LogoTheme = 'light' | 'dark';
export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface LogoProps {
  variant?: LogoVariant;
  theme?: LogoTheme;
  size?: LogoSize;
  /** Render the asset inline as an SVG (currentColor friendly) — only for icon-mono. */
  inline?: boolean;
  className?: string;
  /** Decorative only — sets aria-hidden when true. */
  decorative?: boolean;
  /** Force a specific pixel width; overrides size. */
  width?: number;
  style?: CSSProperties;
}

// Dimensions in CSS pixels. Aspect ratios:
//  full (PNG): 200 x 200  (1:1, matches the source logo image)
//  icon:        200 x 200  (1:1)
const SIZE_MAP: Record<LogoSize, { w: number; h: number }> = {
  xs: { w: 32, h: 32 },     // compact icon-only badge
  sm: { w: 64, h: 64 },     // sidebar / login
  md: { w: 96, h: 96 },     // medium display
  lg: { w: 144, h: 144 },   // login card
  xl: { w: 200, h: 200 },   // hero / preview
};

// Icon dimension map (square pixels)
const ICON_SIZE_MAP: Record<LogoSize, number> = {
  xs: 16,
  sm: 28,
  md: 40,
  lg: 56,
  xl: 80,
};

function pickFile(variant: LogoVariant, _theme: LogoTheme): string {
  switch (variant) {
    case 'full':
      return '/logo-full.png';
    case 'icon':
      return '/logo-icon.svg';
    case 'icon-mono':
      return '/logo-icon-mono.svg';
  }
}

/**
 * <Logo /> — single entry point for the GENSMILE brand mark.
 *
 * - `variant`: 'full' (icon + wordmark + tagline), 'icon' (color square), 'icon-mono' (currentColor).
 * - `theme`: 'light' (default, dark text on light bg) | 'dark' (white text on dark bg).
 * - `size`: xs/sm/md/lg/xl — pixel sizes tuned for header / sidebar / login.
 * - `inline`: render as <svg> with currentColor (icon-mono only) so you can color with text classes.
 */
export function Logo({
  variant = 'full',
  theme = 'light',
  size = 'md',
  inline = false,
  className,
  decorative = false,
  width,
  style,
}: LogoProps) {
  const isIcon = variant !== 'full';
  const dims = isIcon
    ? { w: ICON_SIZE_MAP[size], h: ICON_SIZE_MAP[size] }
    : SIZE_MAP[size];

  const finalWidth = width ?? dims.w;
  const finalHeight = width != null ? dims.h * (width / dims.w) : dims.h;

  const ariaProps = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': 'GENSMILE — Nha khoa thẩm mỹ' };

  // Inline mono SVG (color follows `currentColor` from CSS)
  if (inline && variant === 'icon-mono') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 200"
        width={finalWidth}
        height={finalHeight}
        className={cn('inline-block align-middle', className)}
        style={style}
        {...ariaProps}
      >
        <path
          fill="currentColor"
          d="M 100 15 C 145 15, 170 30, 175 55 C 180 80, 172 110, 158 135 C 148 155, 132 172, 114 180 C 100 187, 86 187, 72 180 C 54 172, 38 155, 28 135 C 14 110, 6 80, 11 55 C 16 30, 41 15, 86 15 C 93 10, 100 10, 100 15 Z"
        />
        <path
          d="M 68 48 C 82 52, 100 60, 108 80 C 115 98, 112 118, 100 135"
          fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="10" strokeLinecap="round"
        />
        <g transform="translate(30,28)" fill="currentColor" opacity="0.85">
          <path d="M 0 -13 L 3.2 -3.2 L 13 0 L 3.2 3.2 L 0 13 L -3.2 3.2 L -13 0 L -3.2 -3.2 Z" />
        </g>
      </svg>
    );
  }

  // Default: <img> referencing the SVG file in /public/
  return (
    <img
      src={pickFile(variant, theme)}
      alt={decorative ? '' : 'GENSMILE — Nha khoa thẩm mỹ'}
      width={finalWidth}
      height={Math.round(finalHeight)}
      loading="lazy"
      decoding="async"
      className={cn('inline-block align-middle', className)}
      style={style}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img' })}
    />
  );
}

/**
 * Wordmark badge — a small static pill with icon + name.
 * Convenience export for repeated header / sidebar usage.
 */
export function BrandBadge({ collapsed }: { collapsed?: boolean }) {
  if (collapsed) {
    return <Logo variant="icon" size="sm" />;
  }
  return (
    <span className="flex items-center gap-2">
      <Logo variant="icon" size="sm" />
      <span className="text-lg font-bold tracking-wide text-brand-700">GENSMILE</span>
    </span>
  );
}
