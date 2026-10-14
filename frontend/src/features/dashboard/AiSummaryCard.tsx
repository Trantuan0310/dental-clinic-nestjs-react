// =============================================================================
// AI Patient Summary card — Mount ở Dashboard / Reception.
// Hiển thị 3 bullet ngắn: dị ứng, đang chờ, lần tới. Cache 1h.
// =============================================================================
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          {t('uiEntry.dashboard.aiTitle')}
        </span>
      }
      description={t('uiEntry.dashboard.aiDescription', { confirm: t('uiEntry.dashboard.aiConfirm') })}
      actions={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {showPatientPicker && (
            <div className="inline-flex min-w-0 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 dark:border-surface-700 dark:bg-surface-800 py-1 text-xs shadow-sm">
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              <select
                aria-label={t('uiEntry.dashboard.choosePatient')}
                value={selectedPatientId ?? ''}
                onChange={(e) => setSelectedPatientId(e.target.value || null)}
                className="min-w-0 max-w-[12rem] truncate bg-transparent text-xs font-medium text-gray-700 focus:outline-none sm:max-w-xs"
              >
                {patientOptions!.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Tooltip label={t('uiEntry.dashboard.refreshAi')}>
            <button
              type="button"
              onClick={() => {
                setRefreshTick((t) => t + 1);
                refetch();
              }}
              disabled={!effectivePatientId || isFetching}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 dark:border-surface-700 dark:bg-surface-800 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200 dark:hover:bg-surface-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t('uiEntry.dashboard.refresh')}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              {t('uiEntry.dashboard.refresh')}
            </button>
          </Tooltip>
        </div>
      }
    >
      {!effectivePatientId ? (
        <EmptyState
          icon={<CalendarClock className="h-10 w-10" />}
          title={t('uiEntry.dashboard.noAppointmentsToday')}
          description={
            showPatientPicker
              ? t('uiEntry.dashboard.choosePatientDescription')
              : t('uiEntry.dashboard.noAppointmentsDescription')
          }
        />
      ) : isLoading ? (
        <CardSkeleton />
      ) : error ? (
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10" />}
          title={t('uiEntry.dashboard.aiError')}
          description={t('uiEntry.dashboard.aiErrorDescription')}
        />
      ) : !data || data.bullets.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-10 w-10" />}
          title={t('uiEntry.dashboard.noSummary')}
          description={t('uiEntry.dashboard.noSummaryDescription')}
        />
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2.5">
            {data.bullets.map((b) => {
              const Icon = ICONS[b.icon] ?? Sparkles;
              const color = ICON_BG[b.icon] ?? 'bg-gray-100 text-gray-600';
              return (
                <li key={b.id} className="flex items-start gap-3 rounded-md border border-gray-100 bg-gray-50/60 px-3 dark:border-surface-700 dark:bg-surface-900 py-2.5">
                  <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${color}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-surface-400">{b.label}</p>
                    <p className="mt-0.5 text-sm text-gray-800 dark:text-surface-200">{b.text}</p>
                    {b.basis && (
                      <p className="mt-1 text-[11px] italic text-gray-400 dark:text-surface-500">{b.basis}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="flex items-center justify-between text-[11px] text-gray-500 dark:text-surface-400">
            <span>
              {t('uiEntry.dashboard.source')}{' '}
              {data.source === 'fallback'
                ? t('uiEntry.dashboard.rulesSource')
                : `${data.source === 'gemini' ? 'Gemini' : 'AI'} (${data.model ?? t('uiEntry.dashboard.unknownModel')})`}
              {data.cached ? ' · cache' : ''}
            </span>
            <span>
              {t('uiEntry.dashboard.encounters', { count: data.asOf.encounterCount })}
              {data.asOf.lastVisitAt ? `, ${t('uiEntry.dashboard.latest', { date: data.asOf.lastVisitAt })}` : ''}
            </span>
          </p>
        </div>
      )}
    </Card>
  );
}
