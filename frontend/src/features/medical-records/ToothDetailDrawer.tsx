import { useEffect, useState } from 'react';
import { Calendar, ClipboardList, FileText, History, Pill, Stethoscope, TrendingUp, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { formatDateTime } from '@/lib/format';
import {
  TOOTH_STATUS_LABEL,
  TOOTH_STATUS_SEMANTIC,
  toothStatusColor,
} from '@/types/medical-records';
import { useToothHistory, type ToothHistory as ToothHistoryData } from './hooks/useToothHistory';

interface ToothDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
  fdi: number | null;
  /** Encounter hiện tại (để gợi ý thêm điều trị trong context). */
  currentEncounterId?: string;
  onAddTreatment?: (fdi: number) => void;
  onJumpToEncounter?: (encounterId: string) => void;
}

const SEMANTIC_LABEL: Record<'healthy' | 'attention' | 'severe', string> = {
  healthy: 'Bình thường',
  attention: 'Cần theo dõi',
  severe: 'Nghiêm trọng',
};

const SEMANTIC_BADGE: Record<'healthy' | 'attention' | 'severe', 'success' | 'warning' | 'danger'> = {
  healthy: 'success',
  attention: 'warning',
  severe: 'danger',
};

export function ToothDetailDrawer({
  open,
  onClose,
  patientId,
  fdi,
  currentEncounterId,
  onAddTreatment,
  onJumpToEncounter,
}: ToothDetailDrawerProps) {
  const history = useToothHistory({
    patientId,
    fdi: fdi ?? 0,
    pageSize: 50,
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'plan'>('overview');

  useEffect(() => {
    if (open) setActiveTab('overview');
  }, [open, fdi]);

  const loading = history.isLoading || (open && history.isFetchingDetails && !history.history.treatments.length && !history.history.timeline.length);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={
        <span className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary-600" />
          {fdi ? `Răng số ${fdi} — Hồ sơ điều trị` : 'Chi tiết răng'}
        </span>
      }
      footer={
        onAddTreatment && fdi && history.history.currentStatus !== 'missing' ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Đóng
            </Button>
            <Button
              onClick={() => {
                onAddTreatment(fdi);
                onClose();
              }}
            >
              Thêm điều trị cho răng này
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Đóng
            </Button>
          </div>
        )
      }
    >
      {!fdi ? (
        <p className="text-sm text-gray-500">Chọn một răng để xem chi tiết.</p>
      ) : loading ? (
        <DrawerSkeleton />
      ) : (
        <ToothDetailContent
          history={history.history}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentEncounterId={currentEncounterId}
          onJumpToEncounter={onJumpToEncounter}
        />
      )}
    </Drawer>
  );
}

interface ToothDetailContentProps {
  history: ToothHistoryData;
  activeTab: 'overview' | 'history' | 'plan';
  setActiveTab: (t: 'overview' | 'history' | 'plan') => void;
  currentEncounterId?: string;
  onJumpToEncounter?: (encounterId: string) => void;
}

function ToothDetailContent({
  history,
  activeTab,
  setActiveTab,
  currentEncounterId,
  onJumpToEncounter,
}: ToothDetailContentProps) {
  const palette = history.currentStatus ? toothStatusColor(history.currentStatus) : null;
  const semantic = history.currentStatus ? TOOTH_STATUS_SEMANTIC[history.currentStatus] : 'healthy';
  const treatmentsByEncounter = new Map<string, typeof history.treatments>();
  for (const t of history.treatments) {
    const arr = treatmentsByEncounter.get(t.encounterId) ?? [];
    arr.push(t);
    treatmentsByEncounter.set(t.encounterId, arr);
  }

  return (
    <div className="space-y-5">
      {/* Header summary */}
      <section
        className={cn(
          'rounded-lg border p-4',
          palette ? `${palette.bg} ${palette.border}` : 'border-gray-200 bg-gray-50',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-gray-500">Trạng thái hiện tại</p>
            <h3 className="mt-1 flex items-center gap-2 text-xl font-semibold">
              {history.currentStatus ? TOOTH_STATUS_LABEL[history.currentStatus] : 'Chưa có dữ liệu'}
            </h3>
            {history.currentNotes && (
              <p className="mt-1 text-sm text-gray-600">{history.currentNotes}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={SEMANTIC_BADGE[semantic]}>{SEMANTIC_LABEL[semantic]}</Badge>
            {history.lastVisitAt && (
              <span className="text-xs text-gray-500">
                <Calendar className="mr-1 inline h-3.5 w-3.5" />
                Khám gần nhất: {formatDateTime(history.lastVisitAt)}
              </span>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
          <Stat label="Số lần điều trị" value={history.treatments.length.toString()} />
          <Stat label="Encounter có điều trị" value={history.totalEncountersWithTreatments.toString()} />
          <Stat label="Số lần thay đổi status" value={history.timeline.length.toString()} />
        </dl>
      </section>

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'overview', label: 'Tổng quan', icon: ClipboardList },
          { id: 'history', label: 'Lịch sử điều trị', icon: History },
          { id: 'plan', label: 'Kế hoạch tiếp theo', icon: TrendingUp },
        ].map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id as 'overview' | 'history' | 'plan')}
              className={cn(
                'inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition',
                active
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </nav>

      {activeTab === 'overview' && (
        <OverviewTab history={history} treatmentsByEncounter={treatmentsByEncounter} currentEncounterId={currentEncounterId} onJumpToEncounter={onJumpToEncounter} />
      )}
      {activeTab === 'history' && <HistoryTab history={history} treatmentsByEncounter={treatmentsByEncounter} onJumpToEncounter={onJumpToEncounter} />}
      {activeTab === 'plan' && <PlanTab history={history} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/40 bg-white/70 px-3 py-2">
      <div className="text-base font-semibold text-gray-900">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
    </div>
  );
}

interface SubProps {
  history: ToothHistoryData;
  treatmentsByEncounter: Map<string, ToothHistoryData['treatments']>;
  currentEncounterId?: string;
  onJumpToEncounter?: (encounterId: string) => void;
}

function OverviewTab({ history, treatmentsByEncounter, currentEncounterId, onJumpToEncounter }: SubProps) {
  return (
    <div className="space-y-4">
      <section>
        <h4 className="mb-2 text-sm font-semibold text-gray-700">
          <History className="mr-1 inline h-4 w-4" /> Thay đổi trạng thái răng
        </h4>
        {history.timeline.length === 0 ? (
          <p className="text-sm text-gray-500">Chưa ghi nhận thay đổi trạng thái nào cho răng này.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-gray-200 pl-4">
            {history.timeline.map((entry, idx) => {
              const palette = toothStatusColor(entry.status);
              return (
                <li key={`${entry.encounterId}-${idx}`} className="relative">
                  <span
                    className={cn('absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-white', palette.bg, palette.border)}
                    aria-hidden
                  />
                  <div className={cn('rounded-md border p-3', palette.bg, palette.border)}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('text-sm font-semibold', palette.text)}>
                        {TOOTH_STATUS_LABEL[entry.status]}
                      </p>
                      <span className="text-xs text-gray-500">
                        {entry.closedAt ? formatDateTime(entry.closedAt) : '—'}
                      </span>
                    </div>
                    {entry.notes && <p className="mt-1 text-xs text-gray-600">{entry.notes}</p>}
                    {entry.encounterCode && (
                      <button
                        type="button"
                        onClick={() => onJumpToEncounter?.(entry.encounterId)}
                        className="mt-1 text-xs text-primary-700 hover:underline"
                      >
                        Xem encounter {entry.encounterCode}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-gray-700">
          <Stethoscope className="mr-1 inline h-4 w-4" /> Đã điều trị gì ({history.treatments.length} dòng)
        </h4>
        {history.treatments.length === 0 ? (
          <p className="text-sm text-gray-500">Răng này chưa được điều trị trong các encounter đã ghi nhận.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
            {Array.from(treatmentsByEncounter.entries()).map(([encounterId, lines]) => (
              <li key={encounterId} className="p-3">
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span className="font-mono">
                    {lines[0]?.encounterCode ?? encounterId.slice(0, 8)} • {lines[0]?.dentistName ?? 'BS'}
                  </span>
                  {currentEncounterId !== encounterId && (
                    <button
                      type="button"
                      onClick={() => onJumpToEncounter?.(encounterId)}
                      className="text-primary-700 hover:underline"
                    >
                      Mở encounter
                    </button>
                  )}
                </div>
                <ul className="space-y-1">
                  {lines.map((line) => (
                    <li key={line.id} className="flex items-start justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">{line.treatmentName}</p>
                        {line.description && <p className="text-xs text-gray-500">{line.description}</p>}
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <p>× {line.quantity}</p>
                        <p className="font-mono text-gray-700">{formatCurrency(line.priceCents * line.quantity)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HistoryTab({ history, treatmentsByEncounter, onJumpToEncounter }: SubProps) {
  if (history.treatments.length === 0) {
    return <p className="text-sm text-gray-500">Răng này chưa có lịch sử điều trị.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l border-gray-200 pl-5">
      {Array.from(treatmentsByEncounter.entries()).map(([encounterId, lines]) => {
        const last = lines[0];
        return (
          <li key={encounterId} className="relative">
            <span className="absolute -left-[22px] top-2 h-3 w-3 rounded-full border-2 border-white bg-primary-500" aria-hidden />
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                <span>
                  <Calendar className="mr-1 inline h-3.5 w-3.5" />
                  {last?.closedAt ? formatDateTime(last.closedAt) : 'Đang điều trị'}
                </span>
                <span className="font-mono">
                  {last?.encounterCode ?? encounterId.slice(0, 8)} • {last?.dentistName ?? 'BS'}
                </span>
              </div>
              <ul className="space-y-2">
                {lines.map((line) => (
                  <li key={line.id} className="rounded border border-gray-100 bg-gray-50/60 p-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-gray-900">{line.treatmentName}</p>
                        {line.treatmentCode && (
                          <p className="font-mono text-xs text-gray-500">{line.treatmentCode}</p>
                        )}
                        {line.description && <p className="text-xs text-gray-600">{line.description}</p>}
                      </div>
                      <div className="text-right text-xs">
                        <p className="font-mono text-gray-700">{formatCurrency(line.priceCents * line.quantity)}</p>
                        <p className="text-gray-500">× {line.quantity}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => onJumpToEncounter?.(encounterId)}
                  className="text-xs text-primary-700 hover:underline"
                >
                  Mở encounter gốc →
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PlanTab({ history }: { history: ToothHistoryData }) {
  const plan = history.upcomingPlan;
  if (!plan) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        <TrendingUp className="mr-1 inline h-4 w-4" />
        Chưa có kế hoạch tiếp theo nào được ghi nhận cho răng này.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs uppercase tracking-wider text-amber-700">Encounter đang điều trị</p>
        <h4 className="mt-1 text-base font-semibold text-amber-900">
          {plan.encounterCode ?? plan.encounterId.slice(0, 8)} • {plan.dentistName ?? 'BS'}
        </h4>
        <p className="text-xs text-amber-700">Bắt đầu: {formatDateTime(plan.startedAt)}</p>
      </div>

      {plan.chiefComplaint && (
        <Block icon={<FileText className="h-4 w-4" />} title="Lý do khám / triệu chứng">
          <p className="whitespace-pre-wrap text-sm text-gray-700">{plan.chiefComplaint}</p>
        </Block>
      )}

      {plan.diagnosis && (
        <Block icon={<Pill className="h-4 w-4" />} title="Chẩn đoán">
          <p className="whitespace-pre-wrap text-sm text-gray-700">{plan.diagnosis}</p>
        </Block>
      )}

      {plan.treatmentPlan ? (
        <Block icon={<ClipboardList className="h-4 w-4" />} title="Kế hoạch điều trị (từ clinical note)">
          <p className="whitespace-pre-wrap text-sm text-gray-700">{plan.treatmentPlan}</p>
        </Block>
      ) : (
        <Block icon={<ClipboardList className="h-4 w-4" />} title="Kế hoạch điều trị">
          <p className="text-sm text-gray-500">
            Chưa có plan trong clinical note. BS có thể bổ sung trong tab Ghi chú của encounter.
          </p>
        </Block>
      )}
    </div>
  );
}

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-3">
      <h5 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-800">
        {icon}
        {title}
      </h5>
      {children}
    </section>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

// Re-exported for tree-shaking friendly imports.
export { X };