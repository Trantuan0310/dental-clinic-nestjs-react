// =============================================================================
// Patient funnel on the Dashboard (docs/11_Improvement B3): what became of the
// bookings of the period, step by step, optionally by how they were made.
// Plain markup, one colour: the length of the bar is the count.
// =============================================================================
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, CardSkeleton, EmptyState, Select } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { dashboardApi } from './dashboardApi';
import type { FunnelStage, TimeRange } from './types';
import { stepPercent } from './practiceMath';

export function FunnelCard({ range, rangeKey }: { range: { from: string; to: string }; rangeKey: TimeRange }) {
  const { t } = useTranslation();
  const [source, setSource] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['appointments', 'patient-funnel', range],
    queryFn: () => dashboardApi.patientFunnel(range),
  });
  const title = `${t('uiEntry.dashboard.funnel.title')} — ${t(`uiEntry.dashboard.range.${rangeKey}`)}`;
  const description = t('uiEntry.dashboard.funnel.description');
  const sources = Object.keys(data?.bySource ?? {});
  const stages: FunnelStage[] = (source && data?.bySource[source]) || data?.stages || [];
  const total = stages[0]?.count ?? 0;

  const actions = sources.length > 1 && (
    <div className="w-48">
      <Select
        aria-label={t('uiEntry.dashboard.funnel.sourceFilter')}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        options={[
          { value: '', label: t('uiEntry.dashboard.funnel.allSources') },
          ...sources.map((s) => ({ value: s, label: t(`uiEntry.dashboard.funnel.source.${s}`, { defaultValue: s }) })),
        ]}
      />
    </div>
  );

  return (
    <Card title={title} description={description} actions={actions || undefined}>
      {isLoading ? (
        <CardSkeleton />
      ) : isError || !data ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {t('uiEntry.dashboard.practice.loadError')}{' '}
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            {t('uiClinical.retry')}
          </button>
        </p>
      ) : total === 0 ? (
        <EmptyState title={t('uiEntry.dashboard.funnel.empty')} />
      ) : (
        <>
          <ol className="space-y-3" data-testid="patient-funnel">
            {stages.map((stage, i) => {
              const before = i === 0 ? null : stages[i - 1].count;
              const kept = before == null ? null : stepPercent(stage.count, before);
              return (
                <li key={stage.key}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-gray-800 dark:text-surface-100">
                      {t(`uiEntry.dashboard.funnel.stage.${stage.key}`)}
                    </span>
                    <span className="tabular-nums text-gray-700 dark:text-surface-200">
                      {formatNumber(stage.count)}
                      {kept != null && (
                        <span className="ml-2 text-xs text-gray-500 dark:text-surface-400">
                          {t('uiEntry.dashboard.funnel.kept', { percent: kept })}
                        </span>
                      )}
                    </span>
                  </div>
                  <div
                    className="mt-1 h-3 rounded-sm bg-gray-100 dark:bg-surface-800"
                    role="img"
                    aria-label={t('uiEntry.dashboard.funnel.barLabel', {
                      stage: t(`uiEntry.dashboard.funnel.stage.${stage.key}`),
                      count: stage.count,
                      total,
                    })}
                  >
                    <div
                      className="h-3 rounded-sm"
                      style={{ width: `${Math.max(2, (stage.count / total) * 100)}%`, background: 'rgba(27,122,120,0.9)' }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-surface-700 dark:text-surface-400">
            {t('uiEntry.dashboard.funnel.note')}
          </p>
        </>
      )}
    </Card>
  );
}
