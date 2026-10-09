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
  CalendarPlus,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { medicalRecordsApi } from '@/features/medical-records/imperativeApi';
import { Alert, Button, Card, Modal, StatusBadge, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorCode, getApiErrorDetails, getApiErrorMessage } from '@/lib/errors';
import type { PrescriptionAllergyConflict } from '@/types/medical-records';
import { PatientHistoryCard } from './PatientHistoryCard';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';
import { useIsOwnEncounterScope } from './encounterUtils';

/** Close failures (thiếu kho, thiếu giá…) carry a Vietnamese server message. */
function notifyCloseError(err: unknown) {
  notify.error(getApiErrorMessage(err, 'Không thể đóng phiên khám'));
}

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
const AppointmentFormModal = lazy(() =>
  import('@/features/appointments/AppointmentFormModal').then((m) => ({
    default: m.AppointmentFormModal,
  })),
);
const SummaryTab = lazy(() =>
  import('./SummaryTab').then((m) => ({ default: m.SummaryTab })),
);

const MIN_OVERRIDE_REASON = 10;

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

  const [activeTab, setActiveTab] = useState<string>('notes');
  const [focusTooth, setFocusTooth] = useState<number | null>(null);
  const [initialTreatmentTooth, setInitialTreatmentTooth] = useState<number | null>(null);
  const [detailToothFdi, setDetailToothFdi] = useState<number | null>(null);
  const canCloseEncounter = useAuthStore((s) => s.hasPermission('encounter.complete'));
  const canEditChart = useAuthStore((s) => s.hasPermission('dental_chart.write'));
  const canBook = useAuthStore((s) => s.hasPermission('appointment.create'));
  const canCancelEncounter = useAuthStore((s) => s.hasPermission('encounter.cancel'));
  const [booking, setBooking] = useState(false);
  // A3-03: an exam started by mistake (wrong patient / wrong row).
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  // 409 PRESCRIPTION_ALLERGY_CONFLICT on close: an allergy recorded after the
  // prescription was saved. Non-null keeps the dialog open.
  const [closeConflicts, setCloseConflicts] = useState<PrescriptionAllergyConflict[] | null>(null);
  const [closeSummary, setCloseSummary] = useState('');
  const [closeOverrideReason, setCloseOverrideReason] = useState('');

  const { data: encounter, isLoading } = useQuery({
    queryKey: ['encounter', id],
    queryFn: () => medicalRecordsApi.getEncounter(id!),
    enabled: !!id,
  });

  const closeMutation = useMutation({
    mutationFn: ({ summary, allergyOverrideReason }: { summary: string; allergyOverrideReason?: string }) =>
      medicalRecordsApi.closeEncounter(id!, summary, allergyOverrideReason),
    onSuccess: () => {
      setCloseConflicts(null);
      setCloseOverrideReason('');
      queryClient.invalidateQueries({ queryKey: ['encounter', id] });
    },
    onError: (err, vars) => {
      if (getApiErrorCode(err) === 'PRESCRIPTION_ALLERGY_CONFLICT') {
        const details = getApiErrorDetails<{ conflicts?: PrescriptionAllergyConflict[] }>(err);
        setCloseSummary(vars.summary);
        setCloseConflicts(details?.conflicts ?? []);
        return;
      }
      notifyCloseError(err);
    },
  });
  const cancelMutation = useMutation({
    mutationFn: (reason: string) => medicalRecordsApi.cancelEncounter(id!, reason),
    onSuccess: () => {
      setCancelOpen(false);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['encounter', id] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      notify.success('Đã hủy phiên khám — bệnh nhân quay lại hàng chờ (nếu trong ngày)');
    },
    onError: (err) => notify.error(getApiErrorMessage(err, 'Không hủy được phiên khám')),
  });
  const dismissCloseConflicts = () => {
    setCloseConflicts(null);
    setCloseOverrideReason('');
  };
  // A colleague's encounter (dentist row scope) is read-only here.
  const ownScope = useIsOwnEncounterScope(encounter);

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

  // Chart edits and closing the visit are the treating dentist's steps.
  const isEditable = encounter.status === 'in_progress' && canCloseEncounter && ownScope;
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
        <Button variant="ghost" aria-label="Quay lại" onClick={() => navigate(-1)}>
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
            {/^BS\.?\s/i.test(encounter.dentistName) ? '' : 'BS. '}
            {encounter.dentistName} •{' '}
            {format(new Date(encounter.startedAt), 'HH:mm, dd/MM/yyyy', { locale: vi })}
            {encounter.status === 'in_progress' && (
              <span className="ml-2 flex items-center gap-1 text-amber-600">
                <Clock className="h-4 w-4" />
                {elapsedMinutes} phút
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {canBook && (
            <Button variant="outline" onClick={() => setBooking(true)}>
              <CalendarPlus className="h-4 w-4" />
              Đặt lịch tái khám
            </Button>
          )}
          {isEditable && activeTab !== 'summary' && (
            <Button variant="outline" onClick={() => setActiveTab('summary')}>
              <CheckCircle className="h-4 w-4" />
              Đóng Encounter
            </Button>
          )}
          {encounter.status === 'in_progress' && canCancelEncounter && ownScope && (
            <Button variant="ghost" onClick={() => setCancelOpen(true)}>
              <XCircle className="h-4 w-4" />
              Hủy phiên khám (mở nhầm)
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => !cancelMutation.isPending && setCancelOpen(false)}
        title="Hủy phiên khám mở nhầm"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelMutation.isPending}>
              Không hủy
            </Button>
            <Button
              variant="danger"
              isLoading={cancelMutation.isPending}
              disabled={cancelReason.trim().length < 10}
              onClick={() => cancelMutation.mutate(cancelReason.trim())}
            >
              Hủy phiên khám
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            Dùng khi bắt đầu khám nhầm bệnh nhân hoặc nhầm lượt. Bệnh nhân quay lại hàng chờ (lịch trong ngày); sau
            đó có thể hoàn tác check-in nếu check-in nhầm. Bác sĩ chỉ tự hủy được khi phiên chưa có điều trị hay đơn
            thuốc — nếu đã có, xóa phần nhập nhầm trước hoặc nhờ quản trị viên.
          </p>
          <Textarea
            label="Lý do (ít nhất 10 ký tự)"
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="VD: Bắt đầu khám nhầm bệnh nhân"
          />
        </div>
      </Modal>

      {encounter.status === 'in_progress' && encounter.reopenedFromCancel && (
        <Alert type="warning">
          Phiên khám này được mở lại sau khi hủy — kiểm tra và xóa điều trị/đơn thuốc không còn
          đúng trước khi đóng phiên.
        </Alert>
      )}

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

      <PatientHistoryCard patientId={encounter.patientId} />

      {/* Tabs */}
      <Card noPadding>
        <div className="border-b border-gray-100">
          <div className="m-4 mb-0 inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-gray-100 p-1">
            {[
              { id: 'notes', label: 'Ghi chú', icon: FileText },
              { id: 'treatments', label: 'Điều trị', icon: ListChecks },
              { id: 'prescriptions', label: 'Đơn thuốc', icon: Pill },
              { id: 'chart', label: 'Dental Chart', icon: BarChart3 },
              ...(isEditable ? [{ id: 'summary', label: 'Tóm tắt', icon: ListChecks }] : []),
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
                isLocked={encounter.status !== 'in_progress' || !canEditChart || !ownScope}
                highlightToothNumbers={treatmentToothNumbers}
                focusToothNumber={focusTooth}
                onSwitchToTreatmentTab={(tooth) => setInitialTreatmentTooth(tooth)}
                onViewToothDetail={(fdi) => setDetailToothFdi(fdi)}
              />
            </Suspense>
          </div>

          {isEditable && (
            <div hidden={activeTab !== 'summary'}>
              <Suspense fallback={TabFallback}>
                <SummaryTab
                  encounter={encounter}
                  onClose={(summary) => closeMutation.mutate({ summary })}
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

      {booking && (
        <Suspense fallback={null}>
          <AppointmentFormModal
            open={booking}
            onClose={() => setBooking(false)}
            defaultPatientId={encounter.patientId}
            defaultDentistId={encounter.dentistId}
            defaultType="follow_up"
          />
        </Suspense>
      )}

      {/* Allergy conflict found at close (409 PRESCRIPTION_ALLERGY_CONFLICT) */}
      <Modal
        isOpen={closeConflicts !== null}
        onClose={dismissCloseConflicts}
        title={
          <span className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            Cảnh báo dị ứng thuốc
          </span>
        }
        size="md"
      >
        <div className="space-y-4">
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">
              Dị ứng ghi nhận sau khi kê đơn trùng với thuốc trong đơn hiện tại:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {(closeConflicts ?? []).map((c, i) => (
                <li key={`${c.lineIndex}-${c.allergy}-${i}`}>
                  <strong>{c.drugName}</strong> — dị ứng: <strong>{c.allergy}</strong>
                  {c.drugClass ? ` (${c.drugClass})` : ''}
                </li>
              ))}
            </ul>
          </div>
          <Textarea
            label="Lý do vẫn giữ đơn thuốc"
            value={closeOverrideReason}
            onChange={(e) => setCloseOverrideReason(e.target.value)}
            placeholder="VD: Đã hỏi lại bệnh nhân, từng dùng thuốc này không phản ứng"
            rows={3}
            hint={`Tối thiểu ${MIN_OVERRIDE_REASON} ký tự. Lý do được ghi vào nhật ký kiểm toán.`}
          />
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                dismissCloseConflicts();
                setActiveTab('prescriptions');
              }}
            >
              Sửa đơn thuốc
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                closeMutation.mutate({
                  summary: closeSummary,
                  allergyOverrideReason: closeOverrideReason.trim(),
                })
              }
              isLoading={closeMutation.isPending}
              disabled={closeOverrideReason.trim().length < MIN_OVERRIDE_REASON}
            >
              Vẫn đóng phiên
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
