import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { SparklinePoint } from '@/types/dashboard';

interface SparklineProps {
  points: SparklinePoint[];
  width?: number;
  height?: number;
  strokeColor?: string;
  fillColor?: string;
  className?: string;
}

export function Sparkline({
  points,
  width = 120,
  height = 36,
  strokeColor = '#0d9488', // tailwind teal-600
  fillColor = 'rgba(13, 148, 136, 0.12)',
  className,
}: SparklineProps) {
  const { linePath, areaPath, trendUp } = useMemo(() => {
    if (points.length < 2) {
      return { linePath: '', areaPath: '', trendUp: true };
    }
    const values = points.map(p => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = width / (points.length - 1);

    const coords = points.map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.value - min) / range) * (height - 4) - 2;
      return { x, y };
    });

    let line = `M ${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const cur = coords[i];
      const cx = (prev.x + cur.x) / 2;
      line += ` Q ${cx.toFixed(2)},${prev.y.toFixed(2)} ${cur.x.toFixed(2)},${cur.y.toFixed(2)}`;
    }
    const area = `${line} L ${width},${height} L 0,${height} Z`;
    const trendUp = points[points.length - 1].value >= points[0].value;

    return { linePath: line, areaPath: area, trendUp };
  }, [points, width, height]);

  if (points.length < 2) {
    return (
      <div
        style={{ width, height }}
        className={cn('flex items-center justify-center text-[10px] text-gray-400 dark:text-surface-500', className)}
      >
        —
      </div>
    );
  }

  const stroke = trendUp ? strokeColor : '#dc2626'; // red-600 when down
  const fill = trendUp ? fillColor : 'rgba(220, 38, 38, 0.12)';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}
