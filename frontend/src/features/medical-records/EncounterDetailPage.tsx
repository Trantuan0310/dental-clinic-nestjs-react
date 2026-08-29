import { useEffect, useState, lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  FileText,
  Pill,
  BarChart3,
  ListChecks,
} from 'lucide-react';
import { medicalRecordsApi } from '@/features/medical-records/imperativeApi';
import { Button, Card, Modal, StatusBadge, Alert } from '@/components/ui';
import { cn } from '@/lib/cn';

// Tabs are heavy (rich-text editor, dental chart canvas, etc.) — only the
// tab the user has actually opened is fetched. Switching to a new tab triggers
// its dynamic import on demand.
const ClinicalNotesTab = lazy(() =>
  import('./ClinicalNotesTab').then((m) => ({ default: m.ClinicalNotesTab })),
);
const TreatmentsTab = lazy(() =>
  import('./TreatmentsTab').then((m) => ({ default: m.TreatmentsTab })),
);
const PrescriptionsTab = lazy(() =>
  import('./PrescriptionsTab').then((m) => ({ default: m.PrescriptionsTab })),
);
const DentalChartPanel = lazy(() =>
  import('./DentalChartPanel').then((m) => ({ default: m.DentalChartPanel })),
);
const ToothDetailDrawer = lazy(() =>
  import('./ToothDetailDrawer').then((m) => ({ default: m.ToothDetailDrawer })),
);
const SummaryTab = lazy(() =>
  import('./SummaryTab').then((m) => ({ default: m.SummaryTab })),
);

const TabFallback = (
  <div className="flex items-center justify-center py-8 text-sm text-gray-500">
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    <span className="ml-2">Đang tải…</span>
  </div>
);

export default function EncounterDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('notes');
  const [focusTooth, setFocusTooth] = useState<number | null>(null);
  const [initialTreatmentTooth, setInitialTreatmentTooth] = useState<number | null>(null);
  const [detailToothFdi, setDetailToothFdi] = useState<number | null>(null);

  const { data: encounter, isLoading } = useQuery({
    queryKey: ['encounter', id],
    queryFn: () => medicalRecordsApi.getEncounter(id!),
    enabled: !!id,
  });

  const closeMutation = useMutation({
    mutationFn: (summary: string) => medicalRecordsApi.closeEncounter(id!, summary),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', id] });
      setShowCloseDialog(false);
    },
  });

  // When navigating from the dental chart panel to add a treatment, switch tabs and pass the tooth.
  useEffect(() => {
    if (initialTreatmentTooth === null) return;
    setActiveTab('treatments');
  }, [initialTreatmentTooth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!encounter) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-500">Không tìm thấy hồ sơ khám</p>
        <Button variant="outline" className="mt-3" onClick={() => navigate(-1)}>
          Quay lại
        </Button>
      </div>
    );
  }

  const isCompleted = encounter.status === 'completed';
  const elapsedMinutes = Math.floor(
    (Date.now() - new Date(encounter.startedAt).getTime()) / 60000,
  );

  const treatmentToothNumbers = (encounter.treatments ?? []).map((t) =>
    typeof t.toothNumber === 'number' ? t.toothNumber : Number(t.toothNumber),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">
              Hồ sơ khám #{encounter.code}
            </h1>
            <StatusBadge status={encounter.status} />
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            BS. {encounter.dentistName} •{' '}
            {format(new Date(encounter.startedAt), 'HH:mm, dd/MM/yyyy', { locale: vi })}
            {encounter.status === 'in_progress' && (
              <span className="ml-2 flex items-center gap-1 text-amber-600">
                <Clock className="h-4 w-4" />
                {elapsedMinutes} phút
              </span>
            )}
          </p>
        </div>
        {!isCompleted && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCloseDialog(true)}>
              <CheckCircle className="h-4 w-4" />
              Đóng Encounter
            </Button>
          </div>
        )}
      </div>

      {/* Patient Info */}
      <Card noPadding className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <span className="text-lg font-semibold">
                {encounter.patientName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-medium text-gray-900">{encounter.patientName}</p>
              <p className="text-sm text-gray-500">{encounter.patientCode}</p>
            </div>
          </div>
          {encounter.chiefComplaint && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Lý do khám:</span> {encounter.chiefComplaint}
            </div>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <Card noPadding>
        <div className="border-b border-gray-100">
          <div className="m-4 mb-0 inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-gray-100 p-1">
            {[
              { id: 'notes', label: 'Ghi chú', icon: FileText },
              { id: 'treatments', label: 'Điều trị', icon: ListChecks },
              { id: 'prescriptions', label: 'Đơn thuốc', icon: Pill },
              { id: 'chart', label: 'Dental Chart', icon: BarChart3 },
              ...(!isCompleted ? [{ id: 'summary', label: 'Tóm tắt', icon: ListChecks }] : []),
            ].map(({ id: tabId, label, icon: Icon }) => {
              const active = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tabId)}
                  className={cn(
                    'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                    active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:bg-white/50 hover:text-gray-900',
                  )}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4">
          <div hidden={activeTab !== 'notes'}>
            <Suspense fallback={TabFallback}>
              <ClinicalNotesTab encounter={encounter} />
            </Suspense>
          </div>

          <div hidden={activeTab !== 'treatments'}>
            <Suspense fallback={TabFallback}>
              <TreatmentsTab
                encounter={encounter}
                initialToothNumber={initialTreatmentTooth}
                onClearInitialTooth={() => setInitialTreatmentTooth(null)}
                onViewToothDetail={(fdi) => {
                  setDetailToothFdi(fdi);
                  setActiveTab('treatments');
                }}
              />
            </Suspense>
          </div>

          <div hidden={activeTab !== 'prescriptions'}>
            <Suspense fallback={TabFallback}>
              <PrescriptionsTab encounter={encounter} />
            </Suspense>
          </div>

          <div hidden={activeTab !== 'chart'}>
            <Suspense fallback={TabFallback}>
              <DentalChartPanel
                encounter={encounter}
                isLocked={isCompleted}
                highlightToothNumbers={treatmentToothNumbers}
                focusToothNumber={focusTooth}
                onSwitchToTreatmentTab={(tooth) => setInitialTreatmentTooth(tooth)}
                onViewToothDetail={(fdi) => setDetailToothFdi(fdi)}
              />
            </Suspense>
          </div>

          {!isCompleted && (
            <div hidden={activeTab !== 'summary'}>
              <Suspense fallback={TabFallback}>
                <SummaryTab
                  encounter={encounter}
                  onClose={(summary) => closeMutation.mutate(summary)}
                  isClosing={closeMutation.isPending}
                />
              </Suspense>
            </div>
          )}
        </div>
      </Card>

      {/* Quick-jump from treatments list back to chart */}
      {treatmentToothNumbers.length > 0 && activeTab !== 'chart' && (
        <Card noPadding className="p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-gray-700">Răng đã điều trị:</span>
            {treatmentToothNumbers.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setFocusTooth(n);
                  setActiveTab('chart');
                }}
                className="rounded-full border border-brand-200 bg-brand-50 px-3 py-0.5 text-xs font-mono text-brand-700 hover:bg-brand-100"
              >
                {n}
              </button>
            ))}
            <span className="text-xs text-gray-400">Click để nhảy nhanh tới sơ đồ răng.</span>
          </div>
        </Card>
      )}

      {/* Close Dialog */}
      <Modal
        isOpen={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        title="Đóng Encounter"
        size="md"
      >
        <div className="space-y-4">
          <Alert type="info">
            Khi đóng Encounter, hệ thống sẽ tự động:
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              <li>Tạo hóa đơn (draft) với các điều trị đã thực hiện</li>
              <li>Trừ tồn kho vật tư đã dùng</li>
              <li>Khóa ghi chú lâm sàng (read-only)</li>
              <li>Cập nhật trạng thái lịch hẹn = completed</li>
            </ul>
          </Alert>
          <p className="text-sm text-gray-600">
            Hành động này <strong>không thể hoàn tác</strong>.
          </p>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>
              Hủy
            </Button>
            <Button
              onClick={() => {
                closeMutation.mutate('Hoàn thành khám');
              }}
              isLoading={closeMutation.isPending}
            >
              Xác nhận đóng
            </Button>
          </div>
        </div>
      </Modal>

      {/* Tooth Detail Drawer (page-level so it survives tab switches) */}
      <Suspense fallback={null}>
        <ToothDetailDrawer
          open={detailToothFdi !== null}
          onClose={() => setDetailToothFdi(null)}
          patientId={encounter.patientId}
          fdi={detailToothFdi}
          currentEncounterId={encounter.id}
          onAddTreatment={(fdi) => {
            setInitialTreatmentTooth(fdi);
            setActiveTab('treatments');
          }}
        />
      </Suspense>
    </div>
  );
}