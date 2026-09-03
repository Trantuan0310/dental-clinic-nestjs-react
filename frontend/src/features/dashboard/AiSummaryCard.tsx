// =============================================================================
// AI Patient Summary card — Mount ở Dashboard / Reception.
// Hiển thị 3 bullet ngắn: dị ứng, đang chờ, lần tới. Cache 1h.
// =============================================================================
import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronDown, RefreshCw, Sparkles, Stethoscope } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardSkeleton, EmptyState, Tooltip } from '@/components/ui';
import { aiSummaryApi, type AiPatientSummary, type SummaryBullet } from '@/features/dashboard/aiSummaryApi';

interface AiSummaryCardProps {
  patientId?: string | null;
  patientOptions?: Array<{ id: string; label: string }>;
}

const ICONS: Record<SummaryBullet['icon'], typeof AlertTriangle> = {
  alert: AlertTriangle,
  clock: CalendarClock,
  stethoscope: Stethoscope,
};

const ICON_BG: Record<SummaryBullet['icon'], string> = {
  alert: 'bg-rose-100 text-rose-600',
  clock: 'bg-amber-100 text-amber-600',
  stethoscope: 'bg-sky-100 text-sky-600',
};

export function AiSummaryCard({ patientId, patientOptions }: AiSummaryCardProps) {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(patientId ?? patientOptions?.[0]?.id ?? null);
  const [refreshTick, setRefreshTick] = useState(0);

  // `patientOptions` arrives from an async "today's appointments" query on
  // the parent, so on first render (before it resolves) it's empty and the
  // useState initializer above locks in `null` — later renders that pass a
  // non-empty list don't re-run that initializer, so the card got stuck on
  // the "no appointments today" empty state even once real options existed.
  useEffect(() => {
    if (patientId || selectedPatientId) return;
    if (patientOptions && patientOptions.length > 0) {
      setSelectedPatientId(patientOptions[0].id);
    }
  }, [patientId, patientOptions, selectedPatientId]);

  const effectivePatientId = patientId ?? selectedPatientId;

  const { data, isLoading, isFetching, error, refetch } = useQuery<AiPatientSummary>({
    enabled: !!effectivePatientId,
    queryKey: ['ai-summary', effectivePatientId, refreshTick],
    queryFn: () => aiSummaryApi.getPatientSummary(effectivePatientId!, { refresh: refreshTick > 0 }),
    staleTime: 60_000 * 60,
    retry: 1,
  });

  const showPatientPicker = !patientId && patientOptions && patientOptions.length > 0;

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-500" />
          AI tóm tắt hồ sơ
        </span>
      }
      description={
        <span>
          3 điểm quan trọng trước khi khám. AI có thể sai —{' '}
          <Tooltip label="AI chỉ hỗ trợ. Bác sĩ xác nhận lại trước khi dùng thông tin này.">
            <span className="cursor-help underline decoration-dotted">xác nhận lại</span>
          </Tooltip>{' '}
          trước khi dùng.
        </span>
      }
      actions={
        <div className="flex items-center gap-2">
          {showPatientPicker && (
            <div className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm">
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              <select
                aria-label="Chọn bệnh nhân"
                value={selectedPatientId ?? ''}
                onChange={(e) => setSelectedPatientId(e.target.value || null)}
                className="bg-transparent text-xs font-medium text-gray-700 focus:outline-none"
              >
                {patientOptions!.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Tooltip label="Gọi lại AI (bỏ qua cache)">
            <button
              type="button"
              onClick={() => {
                setRefreshTick((t) => t + 1);
                refetch();
              }}
              disabled={!effectivePatientId || isFetching}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Làm mới"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </Tooltip>
        </div>
      }
    >
      {!effectivePatientId ? (
        <EmptyState
          icon={<CalendarClock className="h-10 w-10" />}
          title="Không có cuộc hẹn hôm nay"
          description={
            showPatientPicker
              ? 'Chọn bệnh nhân để AI tóm tắt hồ sơ trước khi khám.'
              : 'Không có cuộc hẹn nào hôm nay để hiển thị tóm tắt AI.'
          }
        />
      ) : isLoading ? (
        <CardSkeleton />
      ) : error ? (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10" />}
          title="Không tải được AI summary"
          description="Thử bấm 'Làm mới' hoặc xem lại quyền 'ai.summary.read'."
        />
      ) : !data || data.bullets.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-10 w-10" />}
          title="Chưa có dữ liệu tóm tắt"
          description="Bệnh nhân chưa có lịch sử điều trị, không có gì để tóm tắt."
        />
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2.5">
            {data.bullets.map((b) => {
              const Icon = ICONS[b.icon] ?? Sparkles;
              const color = ICON_BG[b.icon] ?? 'bg-gray-100 text-gray-600';
              return (
                <li key={b.id} className="flex items-start gap-3 rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                  <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${color}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{b.label}</p>
                    <p className="mt-0.5 text-sm text-gray-800">{b.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="flex items-center justify-between text-[11px] text-gray-500">
            <span>
              Nguồn: {data.source === 'gemini' ? `Gemini (${data.model ?? 'gemini-1.5-pro'})` : 'Rule-based fallback'}
              {data.cached ? ' · cache' : ''}
            </span>
            <span>
              Dựa trên {data.asOf.encounterCount} lần khám
              {data.asOf.lastVisitAt ? `, gần nhất ${data.asOf.lastVisitAt}` : ''}
            </span>
          </p>
        </div>
      )}
    </Card>
  );
}
