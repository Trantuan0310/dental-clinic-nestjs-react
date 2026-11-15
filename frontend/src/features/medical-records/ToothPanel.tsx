import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History, MousePointerClick, Plus, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  TOOTH_STATUS_LABEL,
  toothStatusColor,
  type ToothDescriptor,
  type ToothEntry,
  type ToothStatus,
  type TreatmentLine,
} from '@/types/medical-records';
import { useToothHistory } from './hooks/useToothHistory';

interface ToothPanelProps {
  tooth: ToothDescriptor | null;
  entry: ToothEntry;
  statusOptions: Array<{ value: ToothStatus; label: string }>;
  /** The chart cannot be changed (closed encounter, no permission). */
  locked: boolean;
  onChangeEntry: (next: ToothEntry) => void;
  /** Treatments of the open encounter on this tooth. */
  currentLines: TreatmentLine[];
  patientId: string;
  encounterId: string;
  onAddTreatment?: () => void;
  onOpenFullRecord?: () => void;
}

/**
 * What is known about the tooth picked on the chart: its status (editable),
 * what is being done to it in this encounter, and every earlier treatment.
 */
export function ToothPanel({
  tooth,
  entry,
  statusOptions,
  locked,
  onChangeEntry,
  currentLines,
  patientId,
  encounterId,
  onAddTreatment,
  onOpenFullRecord,
}: ToothPanelProps) {
  const { t } = useTranslation();
  const { history, isLoading, isFetchingDetails } = useToothHistory({ patientId, fdi: tooth?.number ?? 0 });
  const [notes, setNotes] = useState(entry.notes ?? '');
  useEffect(() => {
    setNotes(entry.notes ?? '');
  }, [tooth?.number, entry.notes]);

  const past = useMemo(() => {
    const groups = new Map<string, typeof history.treatments>();
    for (const line of history.treatments) {
      if (line.encounterId === encounterId) continue;
      groups.set(line.encounterId, [...(groups.get(line.encounterId) ?? []), line]);
    }
    return [...groups.entries()];
  }, [history, encounterId]);

  if (!tooth) {
    return (
      <div
        className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-surface-700 dark:text-surface-400"
        data-testid="tooth-panel-empty"
      >
        <MousePointerClick className="h-5 w-5 text-gray-400" aria-hidden />
        {t('uiClinical.toothPanelEmpty')}
      </div>
    );
  }

  const palette = toothStatusColor(entry.status);
  const loading = isLoading || (isFetchingDetails && history.treatments.length === 0);

  return (
    <section
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900"
      aria-label={tooth.name}
      data-testid="tooth-panel"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-surface-100">
            {t('uiClinical.toothName', { number: tooth.number })}
          </h3>
          <p className="text-xs text-gray-500 dark:text-surface-400">
            {t(tooth.arch === 'upper' ? 'uiClinical.upperJaw' : 'uiClinical.lowerJaw')}, {t(tooth.side === 'right' ? 'uiClinical.rightSide' : 'uiClinical.leftSide')}
          </p>
        </div>
        <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', palette.bg, palette.text, palette.border)}>
          {TOOTH_STATUS_LABEL[entry.status]}
        </span>
      </header>

      {!locked ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={t('uiClinical.toothStatus')}
            value={entry.status}
            onChange={(e) => onChangeEntry({ status: e.target.value as ToothStatus, notes })}
            options={statusOptions}
          />
          <Input
            label={t('uiClinical.toothNotes')}
            placeholder={t('uiClinical.toothNoteExample')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => onChangeEntry({ status: entry.status, notes })}
            maxLength={200}
          />
        </div>
      ) : (
        entry.notes && <p className="text-sm text-gray-600 dark:text-surface-300">{entry.notes}</p>
      )}

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-surface-200">
          <Stethoscope className="h-4 w-4" aria-hidden /> {t('uiClinical.toothThisVisit')}
        </h4>
        {currentLines.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.toothNoneThisVisit')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 dark:divide-surface-700 dark:border-surface-700">
            {currentLines.map((line) => (
              <li key={line.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 font-medium text-gray-900 dark:text-surface-100">
                  {line.treatmentName ?? line.procedureName ?? line.treatmentCode}
                </span>
                <span className="shrink-0 font-mono text-xs text-gray-600 dark:text-surface-300">
                  {line.quantity > 1 ? `${line.quantity} × ` : ''}
                  {formatCurrency(line.priceCents ?? line.unitPrice ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {onAddTreatment && entry.status !== 'missing' && (
          <Button size="sm" variant="outline" className="mt-2" onClick={onAddTreatment} leftIcon={<Plus className="h-4 w-4" />}>
            {t('uiClinical.addTreatmentToTooth')}
          </Button>
        )}
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-surface-200">
          <History className="h-4 w-4" aria-hidden /> {t('uiClinical.toothPastTreatments')}
        </h4>
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.toothLoadingHistory')}</p>
        ) : past.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiClinical.toothNoPast')}</p>
        ) : (
          <div className="max-h-72 overflow-y-auto pl-1.5">
          <ol className="relative space-y-3 border-l border-gray-200 pl-4 dark:border-surface-700" data-testid="tooth-past">
            {past.map(([id, lines]) => (
              <li key={id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 dark:border-surface-900" aria-hidden />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-gray-500 dark:text-surface-400">
                  <span>
                    <strong className="font-semibold text-gray-700 dark:text-surface-200">
                      {formatDate(lines[0].closedAt ?? lines[0].createdAt)}
                    </strong>
                    {lines[0].dentistName ? ` · ${lines[0].dentistName}` : ''}
                  </span>
                  <Link to={`/encounters/${id}`} className="text-brand-700 hover:underline dark:text-brand-300">
                    {lines[0].encounterCode ?? t('uiClinical.toothOpenVisit')}
                  </Link>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {lines.map((line) => (
                    <li key={line.id} className="text-sm text-gray-900 dark:text-surface-100">
                      {line.treatmentName}
                      {line.description && <span className="text-xs text-gray-500 dark:text-surface-400"> — {line.description}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          </div>
        )}
        {onOpenFullRecord && (
          <button type="button" onClick={onOpenFullRecord} className="mt-2 text-xs text-brand-700 hover:underline dark:text-brand-300">
            {t('uiClinical.toothFullRecord')} →
          </button>
        )}
      </div>
    </section>
  );
}
