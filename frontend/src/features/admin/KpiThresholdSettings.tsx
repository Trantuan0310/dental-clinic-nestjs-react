import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { dashboardApi } from '../dashboard/dashboardApi';
import type { KpiThreshold } from '../dashboard/financialTypes';

function ThresholdForm({ thresholds }: { thresholds: KpiThreshold[] }) {
  const { t, i18n } = useTranslation();
  const en = i18n.resolvedLanguage?.startsWith('en');
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
    <p className="text-sm">{en ? 'Good target and acceptable boundary. Percent: 0–100; wait: 0–480 minutes. Lower targets must not exceed the boundary; higher targets must not fall below it.' : 'Mục tiêu tốt và ngưỡng chấp nhận. Tỷ lệ: 0–100%; chờ: 0–480 phút. Chỉ số càng thấp càng tốt: mục tiêu ≤ ngưỡng; càng cao càng tốt: mục tiêu ≥ ngưỡng.'}</p>
    {rows.map((row, index) => <fieldset key={row.key} disabled={save.isPending} className="grid gap-2 sm:grid-cols-3">
      <legend className="text-sm font-medium">{t(`uiEntry.dashboard.practice.metric.${row.key}`)} ({row.unit === 'percent' ? '%' : en ? 'minutes' : 'phút'}) {row.direction === 'lower' ? '↓' : '↑'}</legend>
      {(['target', 'okAt'] as const).map(field => <label key={field} className="text-sm">
        {field === 'target' ? en ? 'Target' : 'Mục tiêu' : en ? 'Acceptable boundary' : 'Ngưỡng chấp nhận'}
        <input className="block w-full rounded border p-2 dark:bg-surface-800" type="number" min={0} max={row.unit === 'percent' ? 100 : 480} step="any" required value={Number.isNaN(row[field]) ? '' : row[field]}
          onChange={event => { const value = event.target.valueAsNumber; setRows(current => current.map((r, i) => i === index ? { ...r, [field]: value } : r)); save.reset(); }} />
      </label>)}
    </fieldset>)}
    {!valid && <p role="alert">{en ? 'Check the ranges and target ordering.' : 'Kiểm tra giới hạn và thứ tự các ngưỡng.'}</p>}
    {save.isError && <p role="alert">{en ? 'Save failed. Your changes are retained; retry.' : 'Lưu thất bại. Thay đổi vẫn được giữ; hãy thử lại.'}</p>}
    {save.isSuccess && <p role="status">{en ? 'Saved.' : 'Đã lưu.'}</p>}
    <Button type="submit" disabled={!valid || save.isPending}>{save.isPending ? (en ? 'Saving…' : 'Đang lưu…') : (en ? 'Save KPI thresholds' : 'Lưu ngưỡng KPI')}</Button>
  </form>;
}

export function KpiThresholdSettings() {
  const canEdit = useAuthStore(s => s.hasPermission('role.upsert'));
  const { i18n } = useTranslation();
  const en = i18n.resolvedLanguage?.startsWith('en');
  const query = useQuery({ queryKey: ['kpi-thresholds'], queryFn: dashboardApi.thresholds, enabled: canEdit });
  if (!canEdit) return null;
  return <Card title={en ? 'KPI thresholds' : 'Ngưỡng KPI'}>
    {query.isPending ? <p>{en ? 'Loading…' : 'Đang tải…'}</p> : query.isError ? <p role="alert">
      {en ? 'Failed to load thresholds.' : 'Không tải được ngưỡng KPI.'} <button type="button" onClick={() => void query.refetch()}>{en ? 'Retry' : 'Thử lại'}</button>
    </p> : <ThresholdForm thresholds={query.data} />}
  </Card>;
}
