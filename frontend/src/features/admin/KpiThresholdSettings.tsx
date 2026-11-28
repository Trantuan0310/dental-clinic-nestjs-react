import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { dashboardApi } from '../dashboard/dashboardApi';
import type { KpiThreshold } from '../dashboard/financialTypes';

function ThresholdForm({ thresholds }: { thresholds: KpiThreshold[] }) {
  const { t } = useTranslation();
  const k = (key: string) => t(`uiEntry.kpiSettings.${key}`);
  const [rows, setRows] = useState(thresholds);
  const client = useQueryClient();
  const save = useMutation({ mutationFn: () => dashboardApi.updateThresholds(rows),
    onSuccess: async (saved) => {
      setRows(saved);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['kpi-thresholds'] }),
        client.invalidateQueries({ queryKey: ['appointments', 'scorecard'] }),
      ]);
    } });
  const valid = rows.length === 6 && rows.every(row => {
    const max = row.unit === 'percent' ? 100 : 480;
    return [row.target, row.okAt].every(n => Number.isFinite(n) && n >= 0 && n <= max) &&
      (row.direction === 'lower' ? row.target <= row.okAt : row.target >= row.okAt);
  });
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (valid) save.mutate(); }}>
    <p className="text-sm">{k('goodTargetAndAcceptableBoundary')}</p>
    {rows.map((row, index) => <fieldset key={row.key} disabled={save.isPending} className="grid gap-2 sm:grid-cols-3">
      <legend className="text-sm font-medium">{t(`uiEntry.dashboard.practice.metric.${row.key}`)} ({row.unit === 'percent' ? '%' : k('minutes')}) {row.direction === 'lower' ? '↓' : '↑'}</legend>
      {(['target', 'okAt'] as const).map(field => <label key={field} className="text-sm">
        {field === 'target' ? k('target') : k('acceptableBoundary')}
        <input className="block w-full rounded border p-2 dark:bg-surface-800" type="number" min={0} max={row.unit === 'percent' ? 100 : 480} step="any" required value={Number.isNaN(row[field]) ? '' : row[field]}
          onChange={event => { const value = event.target.valueAsNumber; setRows(current => current.map((r, i) => i === index ? { ...r, [field]: value } : r)); save.reset(); }} />
      </label>)}
    </fieldset>)}
    {!valid && <p role="alert">{k('checkTheRangesAndTarget')}</p>}
    {save.isError && <p role="alert">{k('saveFailedYourChangesAre')}</p>}
    {save.isSuccess && <p role="status">{k('saved')}</p>}
    <Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? k('saving') : k('saveKpiThresholds')}</Button>
  </form>;
}

export function KpiThresholdSettings() {
  const canEdit = useAuthStore(s => s.hasPermission('role.upsert'));
  const { t } = useTranslation();
  const k = (key: string) => t(`uiEntry.kpiSettings.${key}`);
  const query = useQuery({ queryKey: ['kpi-thresholds'], queryFn: dashboardApi.thresholds, enabled: canEdit });
  if (!canEdit) return null;
  return <Card title={k('kpiThresholds')}>
    {query.isPending ? <p>{k('loading')}</p> : query.isError ? <p role="alert">
      {k('failedToLoadThresholds')} <button type="button" onClick={() => void query.refetch()}>{k('retry')}</button>
    </p> : <ThresholdForm thresholds={query.data} />}
  </Card>;
}
