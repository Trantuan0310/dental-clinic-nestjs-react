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
  ADULT_TEETH,
  TOOTH_STATUSES,
  TOOTH_STATUS_LABEL,
  snapshotToWire,
  toothQuadrantOf,
  toothStatusColor,
  wireToSnapshotMap,
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

const TOOTH_OPTIONS: Array<{ value: ToothStatus; label: string }> = TOOTH_STATUSES.map((s) => ({
  value: s,
  label: TOOTH_STATUS_LABEL[s],
}));

const EMPTY_TEETH: Record<string, ToothEntry> = ADULT_TEETH.reduce<Record<string, ToothEntry>>((acc, t) => {
  acc[String(t.number)] = { status: 'healthy', notes: '' };
  return acc;
}, {});

const QUADRANT_LABEL: Record<ToothQuadrant, string> = {
  Q1: 'Q1 · Hàm trên, phải (18→11)',
  Q2: 'Q2 · Hàm trên, trái (21→28)',
  Q3: 'Q3 · Hàm dưới, trái (38→31)',
  Q4: 'Q4 · Hàm dưới, phải (41→48)',
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
  const isMounted = useIsMounted();
  // Backend exposes the latest snapshot per-patient, not per-encounter.
  const patientId = _patientId ?? encounter.patientId;
  const { data: snapshot, isLoading } = useDentalChart(patientId);
  const save = useSaveDentalChart(encounter.id);

  const history = useHistory<Record<string, ToothEntry>>(EMPTY_TEETH);
  const lastSavedHash = useRef<string>(hashTeethMap(EMPTY_TEETH));

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
    const merged = wireToSnapshotMap(records);
    history.reset(merged);
    lastSavedHash.current = hashTeethMap(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.id, snapshot?.snapshotAt]);

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
      const payload = snapshotToWire(teeth, 'ADULT');
      save.mutate(
        { payload },
        {
          onSuccess: () => {
            lastSavedHash.current = currentHash;
          },
          onError: (err) => {
            notify.error(getApiErrorMessage(err, 'Không thể lưu sơ đồ răng'));
          },
        },
      );
    },
    [teeth, isLocked],
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
    const targetFdis = pickTeethForBulk(bulkScope, bulkQuadrant, history.state, enabledStatuses);
    if (targetFdis.length === 0) {
      notify.info('Không có răng nào trong phạm vi đã chọn.');
      return;
    }
    const next = { ...history.state };
    for (const fdi of targetFdis) {
      const existing = next[fdi] ?? { status: 'healthy' as ToothStatus, notes: '' };
      next[fdi] = { status: bulkStatus, notes: existing.notes ?? '' };
    }
    history.push(next);
    setBulkOpen(false);
  }, [bulkScope, bulkQuadrant, bulkStatus, history, enabledStatuses, isLocked]);

  const handleManualSave = useCallback(async () => {
    const currentHash = hashTeethMap(teeth);
    if (currentHash === lastSavedHash.current) return;
    try {
      await save.mutateAsync({ payload: snapshotToWire(teeth, 'ADULT') });
      lastSavedHash.current = currentHash;
      notify.success('Đã lưu sơ đồ răng');
    } catch (err) {
      notify.error(getApiErrorMessage(err, 'Không thể lưu sơ đồ răng'));
    }
  }, [save, teeth]);

  const handleReset = useCallback(() => {
    history.push({ ...EMPTY_TEETH });
  }, [history]);

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
    return ADULT_TEETH.filter((t) => String(t.number).includes(q) || t.name.toLowerCase().includes(q)).map(
      (t) => String(t.number),
    );
  }, [search]);

  return (
    <div className="space-y-5" data-testid="dental-chart-panel">
      <Card
        title={
          <span className="flex items-center gap-2">
            Sơ đồ răng
          </span>
        }
        description={
          <>
            Chạm vào răng để cập nhật tình trạng. Mỗi encounter có đúng <strong>1 snapshot</strong>; thay đổi được lưu tự động sau
            ~1.5s và có thể hoàn tác bằng nút <strong>Undo</strong>.
          </>
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
              <Tooltip label="Hoàn tác (Ctrl+Z)">
                <button
                  type="button"
                  disabled={!history.canUndo || isLocked}
                  onClick={history.undo}
                  className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Undo"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip label="Làm lại (Ctrl+Y)">
                <button
                  type="button"
                  disabled={!history.canRedo || isLocked}
                  onClick={history.redo}
                  className="rounded p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Redo"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <Tooltip label="Đặt nhanh trạng thái cho nhiều răng">
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} disabled={isLocked} leftIcon={<Wand2 className="h-4 w-4" />}>
                Bulk
              </Button>
            </Tooltip>
            <Tooltip label="Reset toàn bộ răng về Bình thường">
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
              Lưu ngay
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm răng (VD: 16, 21)"
                className="pl-8"
              />
            </div>
            <span className="text-xs text-gray-500">Tự nhảy tới răng khi nhấn Enter</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">Lọc theo trạng thái:</span>
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
                  {TOOTH_STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-gray-500">Đang tải sơ đồ răng…</p>
        ) : (
          <DentalChart
            teeth={teeth}
            onToothClick={handleToothClick}
            readOnly={isLocked}
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
          <p className="mt-2 text-xs text-amber-600">Không tìm thấy răng phù hợp với “{search}”.</p>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-7">
        {TOOTH_OPTIONS.map((opt) => (
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
        <Info className="mt-0.5 h-4 w-4 text-gray-500" />
        <div className="flex-1 space-y-1">
          <p>
            <strong>{treatmentHighlight.size}</strong> răng đã có điều trị trong encounter này — chúng được viền nổi bật.
            Click vào sẽ mở danh sách điều trị để thêm/sửa nhanh.
          </p>
          <p>
            Auto-save: <strong>{save.isPending ? 'đang lưu…' : dirty ? 'sẽ lưu sau 1.5s' : 'đã đồng bộ'}</strong>.
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
  scope: BulkScope,
  quadrant: ToothQuadrant,
  teeth: Record<string, ToothEntry>,
  enabled: Set<ToothStatus>,
): string[] {
  const result: string[] = [];
  if (scope === 'quadrant') {
    for (const t of ADULT_TEETH) {
      if (t.quadrant === quadrant) result.push(String(t.number));
    }
  } else if (scope === 'arch') {
    const arch = quadrant === 'Q1' || quadrant === 'Q2' ? 'upper' : 'lower';
    for (const t of ADULT_TEETH) {
      if (t.arch === arch) result.push(String(t.number));
    }
  } else {
    for (const t of ADULT_TEETH) {
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
  const [status, setStatus] = useState<ToothStatus>(entry.status);
  const [notes, setNotes] = useState<string>(entry.notes ?? '');

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`Răng ${tooth.number} — ${tooth.arch === 'upper' ? 'Hàm trên' : 'Hàm dưới'} ${
        tooth.side === 'right' ? 'phải' : 'trái'
      }`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            onClick={() => {
              onChange({ status, notes });
              onClose();
            }}
          >
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label="Tình trạng"
          value={status}
          onChange={(e) => setStatus(e.target.value as ToothStatus)}
          options={TOOTH_OPTIONS}
        />
        <Input
          label="Ghi chú"
          placeholder="VD: Đã hàn Composite tháng 7/2026"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          hint="Tối đa 200 ký tự (BR-MR-009)"
          maxLength={200}
        />
        {status === 'missing' && (
          <p className="text-xs text-gray-500">
            Răng <strong>đã mất</strong> không thể chọn cho điều trị mới (BR-MR-009).
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
  const toothLabel = `Răng ${tooth.number} — ${tooth.arch === 'upper' ? 'Hàm trên' : 'Hàm dưới'} ${
    tooth.side === 'right' ? 'phải' : 'trái'
  }`;

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
              Xem lịch sử răng
            </Button>
          )}
          <Button variant="outline" onClick={onEditStatus}>
            Sửa tình trạng răng
          </Button>
          <Button leftIcon={<Wand2 className="h-4 w-4" />} onClick={onAddTreatment}>
            Thêm điều trị cho răng này
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-gray-600">
          Răng này hiện có <strong>{treatments.length}</strong> dòng điều trị trong encounter này.
        </p>
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-gray-50/60">
          {treatments.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">{line.treatmentName}</p>
                <p className="text-xs text-gray-500">Mã: {line.treatmentCode}</p>
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
}: BulkActionModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary-600" /> Bulk actions
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={onApply} leftIcon={<RotateCcw className="h-4 w-4" />}>
            Áp dụng
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label="Phạm vi"
          value={scope}
          onChange={(e) => setScope(e.target.value as BulkScope)}
          options={[
            { value: 'quadrant', label: 'Một quadrant (4 vùng)' },
            { value: 'arch', label: 'Toàn hàm (trên hoặc dưới)' },
            { value: 'remaining', label: 'Các răng chưa được lọc' },
          ]}
        />
        {scope !== 'remaining' && (
          <Select
            label={scope === 'quadrant' ? 'Quadrant' : 'Hàm'}
            value={quadrant}
            onChange={(e) => setQuadrant(toothQuadrantOfFromScope(scope, e.target.value))}
            options={
              scope === 'quadrant'
                ? (Object.keys(QUADRANT_LABEL) as ToothQuadrant[]).map((q) => ({
                    value: q,
                    label: QUADRANT_LABEL[q],
                  }))
                : [
                    { value: 'Q1', label: 'Hàm trên (Q1+Q2)' },
                    { value: 'Q3', label: 'Hàm dưới (Q3+Q4)' },
                  ]
            }
          />
        )}
        <Select
          label="Đặt trạng thái"
          value={status}
          onChange={(e) => setStatus(e.target.value as ToothStatus)}
          options={TOOTH_OPTIONS}
        />
        {scope === 'remaining' && (
          <p className="text-xs text-gray-500">
            Áp dụng cho <strong>{[...enabledStatuses].length === TOOTH_STATUSES.length ? 'tất cả 32 răng' : 'các răng có trạng thái hiện đang được lọc'}</strong>.
            Nhớ tắt các trạng thái bạn muốn giữ nguyên trước khi áp dụng.
          </p>
        )}
        <p className="text-xs text-gray-500">
          Bulk sẽ đẩy 1 bước vào lịch sử Undo. Sau khi áp dụng có thể nhấn <strong>Undo</strong> để khôi phục.
        </p>
      </div>
    </Modal>
  );
}

function toothQuadrantOfFromScope(scope: BulkScope, value: string): ToothQuadrant {
  if (scope === 'arch') {
    return value === 'Q1' ? 'Q1' : 'Q3';
  }
  return toothQuadrantOf(parseInt(value, 10)) ?? 'Q1';
}