// =============================================================================
// Dashboard header — range selector, Zalo toggle (placeholder), quick actions
// =============================================================================
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Calendar, Megaphone } from 'lucide-react';
import { Tooltip, QuickActions } from '@/components/ui';
import { RANGE_DESCRIPTIONS, RANGE_OPTIONS, type TimeRange } from './types';

interface DashboardHeaderProps {
  range: TimeRange;
  setRange: (r: TimeRange) => void;
}

export function DashboardHeader({ range, setRange }: DashboardHeaderProps) {
  const rangeDescription = RANGE_DESCRIPTIONS[range];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold leading-tight text-brand-700 md:text-3xl dark:text-brand-300">
              Dashboard
            </h1>
            <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              Tổng quan
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">
            <span className="font-medium text-gray-700 dark:text-surface-200">{rangeDescription}</span>
            {' · '}
            {format(new Date(), "EEEE, dd 'tháng' MM, yyyy", { locale: vi })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/*
            Zalo OA notification integration has no backend yet (no settings
            API, no toggle to persist). Static disabled placeholder only —
            no state to wire up until the BE exposes it.
          */}
          <Tooltip
            label={
              <span>
                Tích hợp Zalo OA đang được phát triển. Khi có, bạn có thể bật/tắt thông báo tổng kết hằng ngày tại đây.
              </span>
            }
          >
            <span
              aria-disabled
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-dashed border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-400 opacity-60 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-500"
            >
              <Megaphone className="h-4 w-4" />
              <span className="font-medium">Zalo</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Sắp ra mắt
              </span>
              <span
                aria-hidden
                role="presentation"
                className="relative h-5 w-9 rounded-full bg-gray-300 dark:bg-surface-700"
              >
                <span className="absolute top-0.5 h-4 w-4 translate-x-0.5 rounded-full bg-white shadow" />
              </span>
            </span>
          </Tooltip>

          <Tooltip label="Khoảng thời gian áp dụng cho hầu hết chỉ số trên Dashboard (riêng biểu đồ xu hướng theo tháng luôn hiển thị các tháng gần nhất, không đổi theo lựa chọn này).">
            <div className="inline-flex cursor-help items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm dark:border-surface-700 dark:bg-surface-800">
              <Calendar className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <select
                value={range}
                onChange={(e) => setRange(e.target.value as TimeRange)}
                className="bg-transparent text-sm font-medium text-gray-800 focus:outline-none dark:text-surface-100"
                aria-label="Khoảng thời gian"
              >
                {RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </Tooltip>
        </div>
      </div>

      <QuickActions />
    </div>
  );
}
