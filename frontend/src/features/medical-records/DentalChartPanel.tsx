import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Eraser,
  Filter,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { notify } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { DentalChart } from './DentalChart';
import { ToothPanel } from './ToothPanel';
import {
  useDentalChart,
  useSaveDentalChart,
} from './medicalRecordsApi';
import {
  TOOTH_STATUSES,
  TOOTH_STATUS_FILL,
  baseTeethFor,
  chartTeethFor,
  dentalChartPatientTypeForDob,
  snapshotToWire,
  wireToSnapshotMap,
  type DentalChartPatientType,
  type DentalChartSnapshot,
  type Encounter,
  type ToothDescriptor,
  type ToothEntry,
  type ToothQuadrant,
  type ToothStatus,
  type TreatmentLine,
} from '@/types/medical-records';
import {
  hashTeethMap,
  useDebouncedEffect,
  useHistory,
  useIsMounted,
} from './hooks/useHistory';

interface DentalChartPanelProps {
  encounter: Encounter;
  isLocked: boolean;
  /** The tooth shown in the side panel; owned by the page so other parts can pick one. */
  selectedTooth: number | null;
  onSelectTooth: (toothNumber: number | null) => void;
  /** Present when the user may add a treatment to the open encounter. */
  onAddTreatment?: (toothNumber: number) => void;
  /** Opens the full tooth record (status changes, plan). */
  onViewToothDetail?: (toothNumber: number) => void;
}

const toothStatusTranslationKey: Record<ToothStatus, string> = { healthy: 'toothHealthy', cavity: 'toothCavity', filled: 'toothFilled', crowned: 'toothCrowned', missing: 'toothMissing', implant: 'toothImplant', extraction_needed: 'toothExtractionNeeded' };
const toothOptions = (t: (key: string) => string) => TOOTH_STATUSES.map((status) => ({ value: status, label: t(`uiClinical.${toothStatusTranslationKey[status]}`) }));

function emptyTeethFor(patientType: DentalChartPatientType): Record<string, ToothEntry> {
  return baseTeethFor(patientType).reduce<Record<string, ToothEntry>>((acc, t) => {
    acc[String(t.number)] = { status: 'healthy', notes: '' };
    return acc;
  }, {});
}

// Bulk-action quadrant options; labels are uiClinical.adultQ1…childQ4.
const QUADRANTS: ToothQuadrant[] = ['Q1', 'Q2', 'Q3', 'Q4'];

type BulkScope = 'quadrant' | 'arch' | 'remaining';

export function DentalChartPanel({
  encounter,
  isLocked,
  selectedTooth,
  onSelectTooth,
  onAddTreatment,
  onViewToothDetail,
}: DentalChartPanelProps) {
  const { t } = useTranslation();
  const options = toothOptions(t);
  const isMounted = useIsMounted();
  // Backend exposes the latest snapshot per-patient, not per-encounter.
  const patientId = encounter.patientId;
  const { data: snapshot, isLoading } = useDentalChart(patientId);
  const save = useSaveDentalChart(encounter.id);
  // BR-MR-012: backend rejects a snapshot whose patientType does not match
  // the patient's age band, so prefer the server-computed value.
  const patientType: DentalChartPatientType =
    encounter.dentalChartPatientType ?? dentalChartPatientTypeForDob(encounter.patient?.dob);
  const emptyTeeth = useMemo(() => emptyTeethFor(patientType), [patientType]);

  const history = useHistory<Record<string, ToothEntry>>(emptyTeeth);
  const lastSavedHash = useRef<string>(hashTeethMap(emptyTeeth));

  const [enabledStatuses, setEnabledStatuses] = useState<Set<ToothStatus>>(
    () => new Set(TOOTH_STATUSES),
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkScope, setBulkScope] = useState<BulkScope>('quadrant');
  const [bulkQuadrant, setBulkQuadrant] = useState<ToothQuadrant>('Q1');
  const [bulkStatus, setBulkStatus] = useState<ToothStatus>('healthy');

  // ----- Bootstrap from server snapshot -----
  useEffect(() => {
    const records = wireRecordsFromSnapshot(snapshot);
    const merged = wireToSnapshotMap(records, patientType);
    history.reset(merged);
    lastSavedHash.current = hashTeethMap(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.id, snapshot?.snapshotAt, patientType]);

  const teeth = history.state;
  const currentHash = useMemo(() => hashTeethMap(teeth), [teeth]);
  const dirty = currentHash !== lastSavedHash.current;

  const treatmentsByTooth = useMemo(() => {
    const map = new Map<number, TreatmentLine[]>();
    for (const line of encounter.treatments ?? []) {
      const n = typeof line.toothNumber === 'number' ? line.toothNumber : Number(line.toothNumber);
      if (Number.isNaN(n)) continue;
      const arr = map.get(n) ?? [];
      arr.push(line);
      map.set(n, arr);
    }
    return map;
  }, [encounter.treatments]);

  const treatmentHighlight = useMemo(() => new Set(treatmentsByTooth.keys()), [treatmentsByTooth]);

  // ----- Auto save (debounced) -----
  useDebouncedEffect(
    () => {
      if (isLocked) return;
      const currentHash = hashTeethMap(teeth);
      if (currentHash === lastSavedHash.current) return;
      if (!isMounted) return;
      const payload = snapshotToWire(teeth, patientType);
      save.mutate(
        { payload },
        {
          onSuccess: () => {
            lastSavedHash.current = currentHash;
          },
          onError: (err) => {
            notify.error(getApiErrorMessage(err, t('uiClinical.chartSaveError')));
          },
        },
      );
    },
    [teeth, isLocked, patientType],
    1500,
  );

  // ----- Handlers -----
  const setEntry = useCallback(
    (number: number, next: ToothEntry) => {
      const current = history.state[String(number)] ?? { status: 'healthy' as ToothStatus, notes: '' };
      if (current.status === next.status && (current.notes ?? '') === (next.notes ?? '')) return;
      const merged = { ...history.state, [String(number)]: next };
      history.push(merged);
    },
    [history],
  );

  const applyBulk = useCallback(() => {
    if (isLocked) return;
    const targetFdis = pickTeethForBulk(
      baseTeethFor(patientType),
      bulkScope,
      bulkQuadrant,
      history.state,
      enabledStatuses,
    );
    if (targetFdis.length === 0) {
      notify.info(t('uiClinical.noTeethInScope'));
      return;
    }
    const next = { ...history.state };
    for (const fdi of targetFdis) {
      const existing = next[fdi] ?? { status: 'healthy' as ToothStatus, notes: '' };
      next[fdi] = { status: bulkStatus, notes: existing.notes ?? '' };
    }
    history.push(next);
    setBulkOpen(false);
  }, [bulkScope, bulkQuadrant, bulkStatus, history, enabledStatuses, isLocked, patientType, t]);

  const handleManualSave = useCallback(async () => {
    const currentHash = hashTeethMap(teeth);
    if (currentHash === lastSavedHash.current) return;
    try {
      await save.mutateAsync({ payload: snapshotToWire(teeth, patientType) });
      lastSavedHash.current = currentHash;
      notify.success(t('uiClinical.chartSaveSuccess'));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiClinical.chartSaveError')));
    }
  }, [save, teeth, patientType, t]);

  const handleReset = useCallback(() => {
    history.push({ ...emptyTeeth });
  }, [history, emptyTeeth]);

  const summary = useMemo(() => {
    const counts: Record<ToothStatus, number> = {
      healthy: 0,
      cavity: 0,
      filled: 0,
      crowned: 0,
      missing: 0,
      implant: 0,
      extraction_needed: 0,
    };
    for (const entry of Object.values(teeth)) {
      counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    }
    return counts;
  }, [teeth]);

  const selected = selectedTooth ? chartTeethFor(patientType).find((tooth) => tooth.number === selectedTooth) ?? null : null;

  return (
    <div className="space-y-4" data-testid="dental-chart-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-gray-900 dark:text-surface-100">
            {t('uiClinical.toothChart')}
            {patientType === 'CHILD' && (
              <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-normal text-sky-700">
                {t('uiClinical.childDentition')}
              </span>
            )}
          </h3>
          <p className="mt-0.5 max-w-prose text-xs text-gray-500 dark:text-surface-400">
            {t(isLocked ? 'uiClinical.chartInstructionsReadOnly' : 'uiClinical.chartInstructionsArch')}
          </p>
        </div>
        {!isLocked && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-surface-400" aria-live="polite">
              {save.isPending ? t('uiClinical.saving') : dirty ? t('uiClinical.saveIn') : t('uiClinical.synced')}
            </span>
            <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-white p-0.5 dark:border-surface-700 dark:bg-surface-900">
              <Tooltip label={t('uiClinical.undoShortcut')}>
                <button
                  type="button"
                  disabled={!history.canUndo}
                  onClick={history.undo}
                  className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-surface-300 dark:hover:bg-surface-800"
                  aria-label={t('uiClinical.undo')}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip label={t('uiClinical.redoShortcut')}>
                <button
                  type="button"
                  disabled={!history.canRedo}
                  onClick={history.redo}
                  className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-surface-300 dark:hover:bg-surface-800"
                  aria-label={t('uiClinical.redo')}
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <Tooltip label={t('uiClinical.bulkToothStatus')}>
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} leftIcon={<Wand2 className="h-4 w-4" />}>
                {t('uiClinical.bulkShort')}
              </Button>
            </Tooltip>
            <Tooltip label={t('uiClinical.resetTeeth')}>
              <Button variant="outline" size="sm" onClick={handleReset} leftIcon={<Eraser className="h-4 w-4" />}>
                {t('uiClinical.resetShort')}
              </Button>
            </Tooltip>
            <Button size="sm" onClick={handleManualSave} disabled={!dirty} isLoading={save.isPending} leftIcon={<Save className="h-4 w-4" />}>
              {t('uiClinical.saveNow')}
            </Button>
          </div>
        )}
      </div>

      {/* Legend, counts and filter in one row: press a status to fade the others. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Filter className="h-4 w-4 text-gray-400 dark:text-surface-400" aria-hidden />
        {TOOTH_STATUSES.map((s) => {
          const enabled = enabledStatuses.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                setEnabledStatuses((prev) => {
                  const next = new Set(prev);
                  if (next.has(s)) next.delete(s);
                  else next.add(s);
                  return next;
                });
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700 transition dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200',
                !enabled && 'opacity-40',
              )}
              aria-pressed={enabled}
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                <rect x="1" y="1" width="10" height="10" rx="3" className={cn('stroke-1', TOOTH_STATUS_FILL[s])} />
              </svg>
              {t(`uiClinical.${toothStatusTranslationKey[s]}`)}
              <span className="font-semibold tabular-nums">{summary[s] ?? 0}</span>
            </button>
          );
        })}
        {snapshot?.snapshotAt && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 dark:text-surface-400">
            <Camera className="h-3.5 w-3.5" aria-hidden />
            {formatDateTime(snapshot.snapshotAt)}
          </span>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <div className="rounded-lg border border-gray-200 bg-white p-2 dark:border-surface-700 dark:bg-surface-900">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-gray-500">{t('uiClinical.chartLoading')}</p>
          ) : (
            <DentalChart
              teeth={teeth}
              selected={selectedTooth}
              onSelect={(tooth) => onSelectTooth(tooth.number === selectedTooth ? null : tooth.number)}
              marked={treatmentHighlight}
              filterEnabled={enabledStatuses}
              patientType={patientType}
            />
          )}
        </div>
        <ToothPanel
          tooth={selected}
          entry={(selected && teeth[String(selected.number)]) || { status: 'healthy', notes: '' }}
          statusOptions={options}
          locked={isLocked}
          onChangeEntry={(next) => selected && setEntry(selected.number, next)}
          currentLines={selected ? treatmentsByTooth.get(selected.number) ?? [] : []}
          patientId={patientId}
          encounterId={encounter.id}
          onAddTreatment={selected && onAddTreatment ? () => onAddTreatment(selected.number) : undefined}
          onOpenFullRecord={selected && onViewToothDetail ? () => onViewToothDetail(selected.number) : undefined}
        />
      </div>

      <BulkActionModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        scope={bulkScope}
        setScope={setBulkScope}
        quadrant={bulkQuadrant}
        setQuadrant={setBulkQuadrant}
        status={bulkStatus}
        setStatus={setBulkStatus}
        onApply={applyBulk}
        enabledStatuses={enabledStatuses}
        patientType={patientType}
      />
    </div>
  );
}

// ---------- helpers ----------

function wireRecordsFromSnapshot(snapshot: DentalChartSnapshot | undefined): Array<{
  number: number;
  surface: string;
  notes: string | null;
}> {
  if (!snapshot?.teeth) return [];
  const out: Array<{ number: number; surface: string; notes: string | null }> = [];
  for (const [key, value] of Object.entries(snapshot.teeth)) {
    if (!value) continue;
    const n = Number(key);
    if (Number.isNaN(n)) continue;
    out.push({
      number: n,
      surface: (value as { status?: ToothStatus }).status ?? 'healthy',
      notes: (value as { notes?: string | null }).notes ?? null,
    });
  }
  return out;
}

function pickTeethForBulk(
  baseTeeth: ToothDescriptor[],
  scope: BulkScope,
  quadrant: ToothQuadrant,
  teeth: Record<string, ToothEntry>,
  enabled: Set<ToothStatus>,
): string[] {
  const result: string[] = [];
  if (scope === 'quadrant') {
    for (const t of baseTeeth) {
      if (t.quadrant === quadrant) result.push(String(t.number));
    }
  } else if (scope === 'arch') {
    const arch = quadrant === 'Q1' || quadrant === 'Q2' ? 'upper' : 'lower';
    for (const t of baseTeeth) {
      if (t.arch === arch) result.push(String(t.number));
    }
  } else {
    for (const t of baseTeeth) {
      const status = teeth[String(t.number)]?.status ?? 'healthy';
      if (!enabled.has(status)) result.push(String(t.number));
    }
  }
  return result;
}

// ---------- Bulk modal ----------

interface BulkActionModalProps {
  open: boolean;
  onClose: () => void;
  scope: BulkScope;
  setScope: (s: BulkScope) => void;
  quadrant: ToothQuadrant;
  setQuadrant: (q: ToothQuadrant) => void;
  status: ToothStatus;
  setStatus: (s: ToothStatus) => void;
  onApply: () => void;
  enabledStatuses: Set<ToothStatus>;
  patientType: DentalChartPatientType;
}

function BulkActionModal({
  open,
  onClose,
  scope,
  setScope,
  quadrant,
  setQuadrant,
  status,
  setStatus,
  onApply,
  enabledStatuses,
  patientType,
}: BulkActionModalProps) {
  const { t } = useTranslation();
  const options = toothOptions(t);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary-600" /> {t('uiClinical.bulkActions')}
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('uiClinical.cancel')}
          </Button>
          <Button onClick={onApply} leftIcon={<RotateCcw className="h-4 w-4" />}>
            {t('uiClinical.apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label={t('uiClinical.toothScope')}
          value={scope}
          onChange={(e) => setScope(e.target.value as BulkScope)}
          options={[
            { value: 'quadrant', label: t('uiClinical.oneQuadrant') },
            { value: 'arch', label: t('uiClinical.wholeArch') },
            { value: 'remaining', label: t('uiClinical.remainingTeeth') },
          ]}
        />
        {scope !== 'remaining' && (
          <Select
            label={scope === 'quadrant' ? t('uiClinical.quadrant') : t('uiClinical.arch')}
            value={quadrant}
            onChange={(e) => setQuadrant(toothQuadrantOfFromScope(scope, e.target.value))}
            options={
              scope === 'quadrant'
                ? QUADRANTS.map((q) => ({
                    value: q,
                    label: t(`uiClinical.${patientType === 'CHILD' ? 'child' : 'adult'}${q}`),
                  }))
                : [
                    { value: 'Q1', label: t('uiClinical.upperJawShort') },
                    { value: 'Q3', label: t('uiClinical.lowerJawShort') },
                  ]
            }
          />
        )}
        <Select
          label={t('uiClinical.setToothStatus')}
          value={status}
          onChange={(e) => setStatus(e.target.value as ToothStatus)}
          options={options}
        />
        {scope === 'remaining' && (
          <p className="text-xs text-gray-500">
            {t('uiClinical.applyTo')} <strong>{[...enabledStatuses].length === TOOTH_STATUSES.length ? t('uiClinical.allTeeth', { count: baseTeethFor(patientType).length }) : t('uiClinical.filteredTeeth')}</strong>.
            {t('uiClinical.disableStatusesToKeep')}
          </p>
        )}
        <p className="text-xs text-gray-500">
          {t('uiClinical.bulkUndoInstructions')}
        </p>
      </div>
    </Modal>
  );
}

function toothQuadrantOfFromScope(scope: BulkScope, value: string): ToothQuadrant {
  if (scope === 'arch') {
    return value === 'Q1' ? 'Q1' : 'Q3';
  }
  // Select values are the quadrant keys themselves ('Q1'…'Q4').
  return (['Q1', 'Q2', 'Q3', 'Q4'] as const).find((q) => q === value) ?? 'Q1';
}