import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Eraser,
  Filter,
  Info,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Stethoscope,
  Undo2,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { notify } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { DentalChart } from './DentalChart';
import {
  useDentalChart,
  useSaveDentalChart,
} from './medicalRecordsApi';
import {
  TOOTH_STATUSES,
  baseTeethFor,
  chartTeethFor,
  dentalChartPatientTypeForDob,
  snapshotToWire,
  toothStatusColor,
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
  highlightToothNumbers?: number[];
  focusToothNumber?: number | null;
  onSwitchToTreatmentTab?: (toothNumber: number) => void;
  /**
   * Optional override of patient id (default: encounter.patientId).
   * Used to fetch the full tooth history across encounters.
   */
  patientId?: string;
  /** Callback when user wants to open the full tooth history drawer. */
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

const QUADRANT_LABEL: Record<DentalChartPatientType, Record<ToothQuadrant, string>> = {
  ADULT: {
    Q1: 'Q1 · Hàm trên, phải (18→11)',
    Q2: 'Q2 · Hàm trên, trái (21→28)',
    Q3: 'Q3 · Hàm dưới, trái (38→31)',
    Q4: 'Q4 · Hàm dưới, phải (41→48)',
  },
  CHILD: {
    Q1: 'Q1 · Hàm trên, phải — răng sữa (55→51)',
    Q2: 'Q2 · Hàm trên, trái — răng sữa (61→65)',
    Q3: 'Q3 · Hàm dưới, trái — răng sữa (75→71)',
    Q4: 'Q4 · Hàm dưới, phải — răng sữa (81→85)',
  },
};

type BulkScope = 'quadrant' | 'arch' | 'remaining';

export function DentalChartPanel({
  encounter,
  isLocked,
  highlightToothNumbers,
  focusToothNumber,
  onSwitchToTreatmentTab,
  patientId: _patientId,
  onViewToothDetail,
}: DentalChartPanelProps) {
  const { t } = useTranslation();
  const options = toothOptions(t);
  const isMounted = useIsMounted();
  // Backend exposes the latest snapshot per-patient, not per-encounter.
  const patientId = _patientId ?? encounter.patientId;
  const { data: snapshot, isLoading } = useDentalChart(patientId);
  const save = useSaveDentalChart(encounter.id);
  // BR-MR-012: backend rejects a snapshot whose patientType does not match
  // the patient's age band, so prefer the server-computed value.
  const patientType: DentalChartPatientType =
    encounter.dentalChartPatientType ?? dentalChartPatientTypeForDob(encounter.patient?.dob);
  const emptyTeeth = useMemo(() => emptyTeethFor(patientType), [patientType]);

  const history = useHistory<Record<string, ToothEntry>>(emptyTeeth);
  const lastSavedHash = useRef<string>(hashTeethMap(emptyTeeth));

  const [editingTooth, setEditingTooth] = useState<ToothDescriptor | null>(null);
  const [popoverTooth, setPopoverTooth] = useState<ToothDescriptor | null>(null);
  const [enabledStatuses, setEnabledStatuses] = useState<Set<ToothStatus>>(
    () => new Set(TOOTH_STATUSES),
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkScope, setBulkScope] = useState<BulkScope>('quadrant');
  const [bulkQuadrant, setBulkQuadrant] = useState<ToothQuadrant>('Q1');
  const [bulkStatus, setBulkStatus] = useState<ToothStatus>('healthy');
  const [search, setSearch] = useState('');
  const toothRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
  const mergedHighlight = useMemo(() => {
    const merged = new Set(treatmentHighlight);
    (highlightToothNumbers ?? []).forEach((n) => merged.add(n));
    return merged;
  }, [treatmentHighlight, highlightToothNumbers]);

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

  // ----- Focus a specific tooth when caller requests -----
  useEffect(() => {
    if (!focusToothNumber) return;
    const target = toothRefs.current[String(focusToothNumber)];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      target.focus();
    }
  }, [focusToothNumber]);

  // ----- Handlers -----
  const handleToothClick = useCallback(
    (t: ToothDescriptor) => {
      if (isLocked) return;
      const treatmentsForTooth = treatmentsByTooth.get(t.number) ?? [];
      const currentStatus = history.state[String(t.number)]?.status ?? 'healthy';

      // Priority 1: răng có treatment trong encounter hiện tại → popover (giữ UX đã có)
      if (treatmentsForTooth.length > 0) {
        setPopoverTooth(t);
        return;
      }
      // Priority 2: răng đã ghi nhận vấn đề (status ≠ healthy) → mở drawer lịch sử ở page-level
      if (currentStatus !== 'healthy') {
        onViewToothDetail?.(t.number);
        return;
      }
      // Priority 3: răng khỏe → modal chỉnh status như cũ
      setEditingTooth(t);
    },
    [isLocked, treatmentsByTooth, history.state, onViewToothDetail],
  );

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

  const filteredFdis = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return chartTeethFor(patientType)
      .filter((t) => String(t.number).includes(q) || t.name.toLowerCase().includes(q))
      .map((t) => String(t.number));
  }, [search, patientType]);

  return (
    <div className="space-y-5" data-testid="dental-chart-panel">
      <Card
        title={
          <span className="flex items-center gap-2">
            {t('uiClinical.toothChart')}
            {patientType === 'CHILD' && (
              <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-normal text-sky-700">
                {t('uiClinical.childDentition')}
              </span>
            )}
          </span>
        }
        description={
          <>{t('uiClinical.chartInstructions')}</>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {snapshot?.snapshotAt && (
              <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
                <Camera className="h-3.5 w-3.5" />
                Snapshot: {formatDateTime(snapshot.snapshotAt)}
              </span>
            )}
            <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-white p-0.5">
              <Tooltip label={t('uiClinical.undoShortcut')}>
                <button
                  type="button"
                  disabled={!history.canUndo || isLocked}
                  onClick={history.undo}
                  className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('uiClinical.undo')}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip label={t('uiClinical.redoShortcut')}>
                <button
                  type="button"
                  disabled={!history.canRedo || isLocked}
                  onClick={history.redo}
                  className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('uiClinical.redo')}
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <Tooltip label={t('uiClinical.bulkToothStatus')}>
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} disabled={isLocked} leftIcon={<Wand2 className="h-4 w-4" />}>
                Bulk
              </Button>
            </Tooltip>
            <Tooltip label={t('uiClinical.resetTeeth')}>
              <Button variant="outline" size="sm" onClick={handleReset} disabled={isLocked} leftIcon={<Eraser className="h-4 w-4" />}>
                Reset
              </Button>
            </Tooltip>
            <Button
              size="sm"
              onClick={handleManualSave}
              disabled={!dirty || isLocked}
              isLoading={save.isPending}
              leftIcon={<Save className="h-4 w-4" />}
            >
              {t('uiClinical.saveNow')}
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-0 w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-surface-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t('uiClinical.toothFind')}
                placeholder={t('uiClinical.toothFindExample')}
                className="pl-8"
              />
            </div>
            <span className="text-xs text-gray-500">{t('uiClinical.toothSearchHelp')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-4 w-4 text-gray-400 dark:text-surface-400" />
            <span className="text-xs text-gray-500">{t('uiClinical.filterByStatus')}</span>
            {TOOTH_STATUSES.map((s) => {
              const enabled = enabledStatuses.has(s);
              const palette = toothStatusColor(s);
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
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition',
                    enabled ? `${palette.bg} ${palette.text} ${palette.border}` : 'bg-gray-50 text-gray-400 border-gray-200',
                  )}
                  aria-pressed={enabled}
                >
                  <span className={cn('h-2 w-2 rounded-full', enabled ? palette.bg : 'bg-gray-300')} />
                  {t(`uiClinical.${toothStatusTranslationKey[s]}`)}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-gray-500">{t('uiClinical.chartLoading')}</p>
        ) : (
          <DentalChart
            teeth={teeth}
            onToothClick={handleToothClick}
            readOnly={isLocked}
            patientType={patientType}
            highlightToothNumbers={Array.from(mergedHighlight)}
            dimFdis={filteredFdis ? new Set(filteredFdis) : undefined}
            filterEnabled={enabledStatuses}
            registerToothRef={(fdi, el) => {
              toothRefs.current[fdi] = el;
            }}
            onSearchSubmit={(fdi) => {
              const el = toothRefs.current[fdi];
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                el.focus();
              }
            }}
            size="md"
          />
        )}

        {search && filteredFdis && filteredFdis.length === 0 && (
          <p className="mt-2 text-xs text-amber-600">{t('uiClinical.noMatchingTooth', { query: `“${search}”` })}</p>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-7">
        {options.map((opt) => (
          <div
            key={opt.value}
            className={cn(
              'rounded-md border bg-white px-3 py-2 text-center transition',
              enabledStatuses.has(opt.value) ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-50',
            )}
          >
            <div className="text-xs text-gray-500">{opt.label}</div>
            <div className="text-lg font-semibold text-gray-900">{summary[opt.value] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-3 rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2 text-xs text-gray-600">
        <Info className="mt-0.5 h-4 w-4 text-gray-500 dark:text-surface-400" />
        <div className="flex-1 space-y-1">
          <p>
            {t('uiClinical.toothTreatmentHighlight', { count: treatmentHighlight.size })}
          </p>
          <p>
            {t('uiClinical.autoSave')}: <strong>{save.isPending ? t('uiClinical.saving') : dirty ? t('uiClinical.saveIn') : t('uiClinical.synced')}</strong>.
          </p>
        </div>
      </div>

      {editingTooth && (
        <ToothStatusModal
          tooth={editingTooth}
          entry={teeth[String(editingTooth.number)] ?? { status: 'healthy', notes: '' }}
          onChange={(next) => setEntry(editingTooth.number, next)}
          onClose={() => setEditingTooth(null)}
        />
      )}

      {popoverTooth && (
        <ToothTreatmentPopover
          tooth={popoverTooth}
          treatments={treatmentsByTooth.get(popoverTooth.number) ?? []}
          onClose={() => setPopoverTooth(null)}
          onAddTreatment={() => {
            setPopoverTooth(null);
            onSwitchToTreatmentTab?.(popoverTooth.number);
          }}
          onEditStatus={() => {
            const t = popoverTooth;
            setPopoverTooth(null);
            setEditingTooth(t);
          }}
        />
      )}

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

// ---------- Modal: chỉnh sửa răng ----------

interface ToothStatusModalProps {
  tooth: ToothDescriptor;
  entry: ToothEntry;
  onChange: (next: ToothEntry) => void;
  onClose: () => void;
}

function ToothStatusModal({ tooth, entry, onChange, onClose }: ToothStatusModalProps) {
  const { t } = useTranslation();
  const options = toothOptions(t);
  const [status, setStatus] = useState<ToothStatus>(entry.status);
  const [notes, setNotes] = useState<string>(entry.notes ?? '');

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={t('uiClinical.toothPosition', { number: tooth.number, arch: t(tooth.arch === 'upper' ? 'uiClinical.upperJaw' : 'uiClinical.lowerJaw'), side: t(tooth.side === 'right' ? 'uiClinical.rightSide' : 'uiClinical.leftSide') })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('uiClinical.cancel')}
          </Button>
          <Button
            onClick={() => {
              onChange({ status, notes });
              onClose();
            }}
          >
            {t('uiClinical.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label={t('uiClinical.toothStatus')}
          value={status}
          onChange={(e) => setStatus(e.target.value as ToothStatus)}
          options={options}
        />
        <Input
          label={t('uiClinical.toothNotes')}
          placeholder={t('uiClinical.toothNoteExample')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          hint={t('uiClinical.toothNoteHint')}
          maxLength={200}
        />
        {status === 'missing' && (
          <p className="text-xs text-gray-500">
            {t('uiClinical.missingToothRule')}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ---------- Popover: răng đã có treatment lines ----------

interface ToothTreatmentPopoverProps {
  tooth: ToothDescriptor;
  treatments: TreatmentLine[];
  onClose: () => void;
  onAddTreatment: () => void;
  onEditStatus: () => void;
  onViewDetail?: () => void;
}

function ToothTreatmentPopover({
  tooth,
  treatments,
  onClose,
  onAddTreatment,
  onEditStatus,
  onViewDetail,
}: ToothTreatmentPopoverProps) {
  const { t } = useTranslation();
  const toothLabel = t('uiClinical.toothPosition', { number: tooth.number, arch: t(tooth.arch === 'upper' ? 'uiClinical.upperJaw' : 'uiClinical.lowerJaw'), side: t(tooth.side === 'right' ? 'uiClinical.rightSide' : 'uiClinical.leftSide') });

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary-600" /> {toothLabel}
        </span>
      }
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {onViewDetail && (
            <Button variant="outline" onClick={onViewDetail}>
              {t('uiClinical.viewToothHistory')}
            </Button>
          )}
          <Button variant="outline" onClick={onEditStatus}>
            {t('uiClinical.editToothStatus')}
          </Button>
          <Button leftIcon={<Wand2 className="h-4 w-4" />} onClick={onAddTreatment}>
            {t('uiClinical.addTreatmentToTooth')}
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-gray-600">
          {t('uiClinical.toothTreatmentLines', { count: treatments.length })}
        </p>
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-gray-50/60">
          {treatments.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">{line.treatmentName}</p>
                <p className="text-xs text-gray-500">{t('uiClinical.code')}: {line.treatmentCode}</p>
              </div>
              <span className="font-mono text-xs text-gray-700">× {line.quantity}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
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
  const quadrantLabels = QUADRANT_LABEL[patientType];
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
                ? (Object.keys(quadrantLabels) as ToothQuadrant[]).map((q) => ({
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