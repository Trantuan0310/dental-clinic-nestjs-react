import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { clinicToday } from '@/lib/clinicTime';
import { useBookableServices } from '@/features/appointments/appointmentApi';
import { draftTotal, emptyLine, lineTotal, type DraftLine } from './planLines';

interface PlanItemsEditorProps {
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  /** Services and prices offered come from this dentist's catalogue. */
  dentistId: string | undefined;
}

export function PlanItemsEditor({ lines, onChange, dentistId }: PlanItemsEditorProps) {
  const { t } = useTranslation();
  const { data: services = [] } = useBookableServices(dentistId, clinicToday());

  const update = (key: string, patch: Partial<DraftLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3">
      {lines.map((line, index) => (
        <div
          key={line.key}
          data-testid="plan-line"
          className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-surface-700"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-surface-200">#{index + 1}</span>
            <button
              type="button"
              aria-label={t('uiPlans.removeLine')}
              onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              label={t('uiPlans.service')}
              value={line.serviceId}
              onChange={(e) => {
                const sv = services.find((s) => s.serviceId === e.target.value);
                update(line.key, {
                  serviceId: e.target.value,
                  ...(sv && { procedure: sv.name, unitPrice: String(sv.price) }),
                });
              }}
              options={[
                { value: '', label: t('uiPlans.manualEntry') },
                ...services.map((s) => ({ value: s.serviceId, label: `${s.name} (${s.code})` })),
                // A line saved from a service the dentist no longer offers keeps its pick.
                ...(line.serviceId && !services.some((s) => s.serviceId === line.serviceId)
                  ? [{ value: line.serviceId, label: line.procedure }]
                  : []),
              ]}
            />
            <Input
              label={t('uiPlans.procedure')}
              value={line.procedure}
              onChange={(e) => update(line.key, { procedure: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input
              label={t('uiPlans.teeth')}
              value={line.teeth}
              placeholder={t('uiPlans.teethPlaceholder')}
              title={t('uiPlans.teethHint')}
              onChange={(e) => update(line.key, { teeth: e.target.value })}
            />
            <Input
              label={t('uiPlans.quantity')}
              type="number"
              min="1"
              max="100"
              value={line.quantity}
              onChange={(e) => update(line.key, { quantity: e.target.value })}
            />
            <Input
              label={t('uiPlans.unitPrice')}
              type="number"
              min="0"
              step={1000}
              value={line.unitPrice}
              onChange={(e) => update(line.key, { unitPrice: e.target.value })}
            />
            <div className="flex flex-col justify-end pb-2 text-sm">
              <span className="text-gray-500 dark:text-surface-400">{t('uiPlans.lineTotal')}</span>
              <span className="font-medium text-gray-900 dark:text-surface-100">{formatCurrency(lineTotal(line))}</span>
            </div>
          </div>
          <Input
            label={t('uiPlans.lineNotes')}
            value={line.notes}
            onChange={(e) => update(line.key, { notes: e.target.value })}
          />
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, emptyLine()])}>
          <Plus className="h-4 w-4" />
          {t('uiPlans.addLine')}
        </Button>
        <span className="text-sm text-gray-600 dark:text-surface-300">
          {t('uiPlans.totalQuoted')}: <strong>{formatCurrency(draftTotal(lines))}</strong>
        </span>
      </div>
    </div>
  );
}
