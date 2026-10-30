import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  DoorOpen,
  Edit3,
  History,
  ExternalLink,
  FileEdit,
  Phone,
  PhoneCall,
  Stethoscope,
  Trash2,
  Undo2,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { AppointmentStatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Loading';
import { PermissionGuard } from '@/components/PermissionGuard';
import {
  useAppointment,
  useAppointmentHistory,
  useAvailability,
  useBookableServices,
  useCancelAppointment,
  useCheckInAppointment,
  useConfirmAppointment,
  useDentistOptions,
  useDentistsForServices,
  useMarkLeft,
  useMarkNoShow,
  useRescheduleAppointment,
  useStartEncounter,
  useUndoAppointmentStatus,
} from './appointmentApi';
import type { AxiosError } from 'axios';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/errors';
import { notify } from '@/components/ui/Toast';
import {
  formatDate,
  formatDateTime,
  formatPhone,
  formatTimeOnly,
  formatVnd,
  getWeekdayLabel,
} from '@/lib/format';
import { cn } from '@/lib/cn';
import { clinicIso, clinicParts, clinicToday } from '@/lib/clinicTime';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { MessageDraftModal } from '@/features/ai/MessageDraftModal';
import type { Appointment, AppointmentStatus, CheckInPayload } from '@/types/appointment';
import {
  isOverdueNotArrived,
  minutesLate,
  OVERDUE_AFTER_MIN,
  OVERDUE_LABEL,
  useNow,
} from './liveStatus';

interface AppointmentDetailDrawerProps {
  appointmentId: string | null;
  onClose: () => void;
  onEdit?: (appointment: Appointment) => void;
}

type ActionKey =
  | 'cancel'
  | 'no_show'
  | 'reschedule'
  | 'force_check_in'
  | 'left'
  | 'undo_check_in'
  | 'undo_no_show'
  | 'undo_left'
  | 'start';

type QuickReason = { value: string; key: string };
const quickReason = (value: string, key: string): QuickReason => ({ value, key });
const CANCEL_REASONS = [
  quickReason('Bệnh nhân yêu cầu', 'cancelReasonPatientRequest'),
  quickReason('Bác sĩ bận đột xuất', 'cancelReasonDentistUnavailable'),
  quickReason('Trùng lịch khác', 'cancelReasonDuplicate'),
  quickReason('Bệnh nhân không xác nhận được', 'cancelReasonUnableToConfirm'),
];

const NO_SHOW_REASONS = [quickReason('Không liên lạc được', 'noShowReasonUnreachable'), quickReason('Bệnh nhân báo đến muộn quá giờ', 'noShowReasonTooLate'), quickReason('Không rõ lý do', 'noShowReasonUnknown')];

// BR-APPT-033: checked in, then left before the exam.
const LEFT_REASONS = [
  quickReason('Bệnh nhân chờ lâu, xin về', 'leftReasonLongWait'),
  quickReason('Bệnh nhân có việc gấp', 'leftReasonUrgentMatter'),
  quickReason('Bệnh nhân đổi ý, sẽ đặt lịch lại', 'leftReasonChangedMind'),
];

// Labels for the audit trail (BR-APPT-034); unknown actions show their code.
const HISTORY_TRANSLATION: Record<string, string> = {
  APPOINTMENT_CREATED: 'appointmentBooked', APPOINTMENT_WALK_IN: 'walkInTitle', APPOINTMENT_UPDATED: 'edit',
  APPOINTMENT_CONFIRMED: 'confirmAppointment', APPOINTMENT_RESCHEDULED: 'reschedule',
  APPOINTMENT_CHECKIN_OVERRIDDEN: 'forcedCheckInHistory', APPOINTMENT_CANCELLED: 'cancelAppointment',
  APPOINTMENT_NO_SHOW: 'markNoShow', APPOINTMENT_AUTO_NO_SHOW: 'automaticNoShowHistory',
  APPOINTMENT_LEFT: 'patientLeftNotSeen', APPOINTMENT_LEFT_UNDONE: 'undoLeft',
  ENCOUNTER_CANCELLED_VIA_APPOINTMENT: 'encounterCancelledHistory', APPOINTMENT_CHECKED_IN: 'checkIn',
  QUEUE_CALLED: 'queueCalledHistory', QUEUE_SKIPPED: 'queueSkippedHistory', QUEUE_EMERGENCY: 'queueEmergencyHistory',
  QUEUE_EMERGENCY_CLEARED: 'queueEmergencyClearedHistory', QUEUE_UNCALLED: 'queueUncalledHistory',
  APPOINTMENT_TRANSFERRED: 'appointmentTransferredHistory', APPOINTMENT_REASSIGNED: 'appointmentReassignedHistory',
  APPOINTMENT_CHECKIN_UNDONE: 'undoCheckIn', APPOINTMENT_NO_SHOW_REVERTED: 'undoNoShow',
  APPOINTMENT_EXAM_STARTED: 'startEncounter', APPOINTMENT_COMPLETED: 'statusCompleted',
  APPOINTMENT_RETURNED_TO_QUEUE: 'appointmentReturnedToQueueHistory',
};

const LATE_CHECK_IN_REASONS = [
  quickReason('Bệnh nhân đến muộn, đã báo trước', 'lateCheckInReasonNotified'),
  quickReason('Kẹt xe / thời tiết', 'lateCheckInReasonTraffic'),
  quickReason('Bác sĩ đồng ý khám bù trong ngày', 'lateCheckInReasonDentistAgreed'),
];

const UNDO_CHECK_IN_REASONS = [quickReason('Check-in nhầm bệnh nhân', 'undoCheckInWrongPatient'), quickReason('Check-in nhầm lịch hẹn', 'undoCheckInWrongAppointment')];

const UNDO_LEFT_REASONS = [quickReason('Bấm nhầm "Đã về"', 'undoLeftMistake'), quickReason('Bệnh nhân quay lại', 'undoLeftReturned')];

const EARLY_CHECK_IN_REASONS = [quickReason('Bác sĩ đang rảnh, khám sớm', 'earlyCheckInReasonAvailable'), quickReason('Bệnh nhân đến sớm, chờ đến lượt', 'earlyCheckInReasonEarly')];

const UNDO_NO_SHOW_REASONS = [quickReason('Đánh vắng mặt nhầm', 'undoNoShowMistake'), quickReason('Bệnh nhân gọi báo đang đến', 'undoNoShowCalled')];

// Backend requires ≥ 5 chars for a forced check-in (BR-APPT-007), for
// cancelling a checked-in visit after its start (BR-APPT-025) and for undoing
// a check-in or a no-show.
const OVERRIDE_REASON_MIN_LENGTH = 5;
// Mirror the backend check-in window (CHECKIN_WINDOW_BEFORE/AFTER_MIN):
// earlier is refused, later needs a reason (only on the visit's clinic day).
const CHECK_IN_WINDOW_BEFORE_MIN = 15;
const CHECK_IN_WINDOW_AFTER_MIN = 30;

/**
 * The check-in window has closed but the backend offers a forced check-in
 * (CHECK_IN_EXPIRED with a `still_check_in` action) — still the visit's
 * clinic day, so front desk may check the patient in with a reason.
 */
function offersForcedCheckIn(err: unknown): boolean {
  const actions = (err as AxiosError<{ details?: { actions?: Array<{ code: string }> } }>)
    ?.response?.data?.details?.actions;
  return Array.isArray(actions) && actions.some((a) => a.code === 'still_check_in');
}

const STATUS_ORDER: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
];

export function AppointmentDetailDrawer({ appointmentId, onClose, onEdit }: AppointmentDetailDrawerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: appointment, isLoading } = useAppointment(appointmentId ?? undefined);
  const now = useNow();
  // Same test as the backend's isRowScopedDentist (cancel window BR-APPT-009).
  const rowScopedDentist = useAuthStore(
    (s) => s.hasPermission('appointment.read.own') && !s.hasPermission('appointment.read.any'),
  );
  // The front desk drafts a reminder / reply to send from Zalo (AI, never sent by the system).
  const canDraftMessage = useAuthStore((s) => s.hasPermission('appointment.read.any'));
  const [showMessageDraft, setShowMessageDraft] = useState(false);
  const [actionModal, setActionModal] = useState<ActionKey | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // "Phòng khám hủy/dời": the clinic's reason, never counted against the patient.
  const [byClinic, setByClinic] = useState(false);
  // As walk-in: the patient already has an open visit today; the desk confirms
  // checking in this one too (the check-in it was asked for is kept here).
  const [openVisit, setOpenVisit] = useState<{ message: string; payload?: CheckInPayload } | null>(null);

  const checkIn = useCheckInAppointment();
  const confirm = useConfirmAppointment();
  const cancel = useCancelAppointment();
  const noShow = useMarkNoShow();
  const markLeft = useMarkLeft();
  const undoStatus = useUndoAppointmentStatus();
  const { data: history } = useAppointmentHistory(appointmentId ?? undefined);
  const reschedule = useRescheduleAppointment();
  const start = useStartEncounter();
  const { data: dentists } = useDentistOptions();
  const serviceIds = useMemo(
    () => (appointment?.services ?? []).map((sv) => sv.serviceId),
    [appointment?.services],
  );

  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleDentist, setRescheduleDentist] = useState('');

  // Suggest free slots when the reschedule modal is open. We only fetch when
  // the user has typed a date + dentist so the list isn't empty at first.
  const rescheduleTargetDentist =
    actionModal === 'reschedule' ? rescheduleDentist || appointment?.dentistId : undefined;
  // BR-APPT-030: only dentists who perform the booked services that day.
  const { data: capableDentistIds } = useDentistsForServices(
    actionModal === 'reschedule' && !rowScopedDentist ? serviceIds : [],
    rescheduleDate || undefined,
  );
  // The dentist the reschedule sends: shown and checked, even when filtered out.
  const chosenDentist = rescheduleDentist || appointment?.dentistId || '';
  const rescheduleDentistIncapable =
    !!capableDentistIds && !!chosenDentist && !capableDentistIds.includes(chosenDentist);
  // BR-STAFF-006: a dentist on leave, suspended or locked out is missing from
  // the booking list; the current one stays shown but cannot be chosen.
  const isBookable = (id: string) => !dentists || dentists.some((d) => d.id === id);
  const chosenDentistBlocked = !!chosenDentist && !isBookable(chosenDentist);
  const rescheduleDentistOptions: SelectOption[] = (dentists ?? [])
    .filter((d) =>
      rowScopedDentist
        ? d.id === appointment?.dentistId // a dentist keeps their own calendar
        : !capableDentistIds || capableDentistIds.includes(d.id) || d.id === chosenDentist,
    )
    .map((d) => ({
      value: d.id,
      label:
        d.id === chosenDentist && rescheduleDentistIncapable
          ? t('uiScheduling.dentistCannotPerformService', { name: d.fullName })
          : d.fullName,
    }));
  if (chosenDentist && !rescheduleDentistOptions.some((o) => o.value === chosenDentist)) {
    const name =
      chosenDentist === appointment?.dentistId && appointment?.dentistName
        ? appointment.dentistName
        : t('uiScheduling.currentDentist');
    rescheduleDentistOptions.unshift({
      value: chosenDentist,
      label: chosenDentistBlocked ? t('uiScheduling.dentistNotAcceptingBookings', { name }) : name,
      disabled: chosenDentistBlocked,
    });
  }

  // BR-APPT-030/031: a new dentist or day re-plans the visit with that
  // dentist's service durations and buffers, as the API does.
  const originalDate = appointment ? clinicParts(appointment.startsAt).date : '';
  const replans =
    actionModal === 'reschedule' &&
    serviceIds.length > 0 &&
    !!appointment &&
    !!rescheduleDate &&
    (chosenDentist !== appointment.dentistId || rescheduleDate !== originalDate);
  const { data: replanServices, isFetching: isReplanning } = useBookableServices(
    replans && !chosenDentistBlocked ? chosenDentist : undefined,
    replans ? rescheduleDate : undefined,
  );
  const newPlan = useMemo(() => {
    if (!replans || !replanServices) return null;
    const found = serviceIds.map((id) => replanServices.find((sv) => sv.serviceId === id));
    if (found.some((sv) => !sv)) return null; // e.g. a withdrawn service: the API decides
    const chosen = found as NonNullable<(typeof found)[number]>[];
    return {
      durationMin: chosen.reduce((sum, sv) => sum + sv.durationMin, 0),
      bufferBeforeMin: Math.max(0, ...chosen.map((sv) => sv.bufferBeforeMin)),
      bufferAfterMin: Math.max(0, ...chosen.map((sv) => sv.bufferAfterMin)),
    };
  }, [replans, replanServices, serviceIds]);
  // The same services' total keeps the visit's own length (and its override);
  // a new total replaces it.
  const currentMinutes = appointment?.durationMinutes ?? 30;
  const rescheduleMinutes =
    newPlan &&
    newPlan.durationMin !== (appointment?.calculatedDurationMin ?? currentMinutes)
      ? newPlan.durationMin
      : currentMinutes;
  const { data: availability, isLoading: isAvailabilityLoading } = useAvailability(
    rescheduleTargetDentist,
    actionModal === 'reschedule' ? rescheduleDate : undefined,
    {
      slotDuration: rescheduleMinutes,
      bufferBeforeMin: newPlan?.bufferBeforeMin ?? appointment?.bufferBeforeMin,
      bufferAfterMin: newPlan?.bufferAfterMin ?? appointment?.bufferAfterMin,
      // The visit's own slot counts as free when moving it.
      excludeAppointmentId: appointment?.id,
    },
  );

  // Quick-action handlers
  const handleCopyPhone = async () => {
    const phone = appointment?.patientPhone;
    if (!phone) {
      notify.warning(t('uiScheduling.patientPhoneMissing'));
      return;
    }
    try {
      await navigator.clipboard.writeText(phone);
      notify.success(t('uiScheduling.phoneCopied', { phone }));
    } catch {
      notify.error(t('uiScheduling.clipboardUnavailable'));
    }
  };

  const handleCall = () => {
    if (!appointment?.patientPhone) {
      notify.warning(t('uiScheduling.patientPhoneMissing'));
      return;
    }
    window.location.href = `tel:${appointment.patientPhone}`;
  };

  const handleOpenProfile = () => {
    if (!appointment?.patientId) return;
    onClose();
    navigate(`/patients/${appointment.patientId}`);
  };

  useEffect(() => {
    if (actionModal !== 'reschedule' || !appointment) return;
    const parts = clinicParts(appointment.startsAt);
    setRescheduleDate(parts.date);
    setRescheduleTime(parts.time);
    setRescheduleDentist(appointment.dentistId);
    setReason('');
    setError(null);
  }, [actionModal, appointment]);

  useEffect(() => {
    setReason('');
    setError(null);
  }, [actionModal, appointmentId]);

  const closeAction = () => {
    setActionModal(null);
    setReason('');
    setError(null);
    setByClinic(false);
  };

  const handleCheckIn = async () => {
    if (!appointment) return;
    try {
      await checkIn.mutateAsync({ id: appointment.id });
      notify.success(t('uiScheduling.patientCheckedIn', { name: appointment.patientName }));
      onClose();
    } catch (err) {
      if (getApiErrorCode(err) === 'PATIENT_ALREADY_IN_CLINIC') {
        setOpenVisit({ message: getApiErrorMessage(err, t('uiScheduling.checkInError')) });
        return;
      }
      if (offersForcedCheckIn(err)) {
        setActionModal('force_check_in');
        return;
      }
      notify.error(getApiErrorMessage(err, t('uiScheduling.checkInError')));
    }
  };

  const handleForceCheckIn = async () => {
    if (!appointment) return;
    const trimmed = reason.trim();
    if (trimmed.length < OVERRIDE_REASON_MIN_LENGTH) {
      setError(t('uiScheduling.reasonMinLengthError', { count: OVERRIDE_REASON_MIN_LENGTH }));
      return;
    }
    setError(null);
    const payload = { override: true, overrideReason: trimmed };
    try {
      await checkIn.mutateAsync({ id: appointment.id, payload });
      notify.success(t(earlyCheckIn ? 'uiScheduling.earlyCheckInSuccess' : 'uiScheduling.lateCheckInSuccess', { name: appointment.patientName }));
      closeAction();
      onClose();
    } catch (err) {
      if (getApiErrorCode(err) === 'PATIENT_ALREADY_IN_CLINIC') {
        closeAction();
        setOpenVisit({ message: getApiErrorMessage(err, t('uiScheduling.checkInError')), payload });
        return;
      }
      setError(getApiErrorMessage(err, t('uiScheduling.checkInError')));
    }
  };

  const handleCheckInDespiteOpenVisit = async () => {
    if (!appointment || !openVisit) return;
    try {
      await checkIn.mutateAsync({
        id: appointment.id,
        payload: { ...openVisit.payload, ignoreOpenVisit: true },
      });
      notify.success(t('uiScheduling.patientCheckedIn', { name: appointment.patientName }));
      setOpenVisit(null);
      onClose();
    } catch (err) {
      setOpenVisit(null);
      notify.error(getApiErrorMessage(err, t('uiScheduling.checkInError')));
    }
  };

  const handleConfirm = async () => {
    if (!appointment) return;
    try {
      await confirm.mutateAsync(appointment.id);
      notify.success(t('uiScheduling.appointmentConfirmedFor', { name: appointment.patientName }));
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('uiScheduling.confirmAppointmentError')));
    }
  };

  const handleCancel = async () => {
    if (!appointment) return;
    // The API requires ≥ 5 characters for every cancellation.
    if (reason.trim().length < OVERRIDE_REASON_MIN_LENGTH) {
      setError(t('uiScheduling.cancelReasonMinLengthError', { count: OVERRIDE_REASON_MIN_LENGTH }));
      return;
    }
    setError(null);
    try {
      await cancel.mutateAsync({
        id: appointment.id,
        payload: {
          reason: reason.trim(),
          // A visit moved or edited since this copy was loaded is a 409.
          rescheduleCount: appointment.rescheduleCount,
          updatedAt: appointment.updatedAt,
          // After the start only the clinic may cancel a visit not arrived (A3-10).
          ...(byClinic || clinicOnlyCancel ? { byClinic: true } : {}),
        },
      });
      notify.success(t('uiScheduling.appointmentCancelled'));
      closeAction();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, t('uiScheduling.cancelAppointmentError')));
    }
  };

  const handleNoShow = async () => {
    if (!appointment) return;
    if (!reason.trim()) {
      setError(t('uiScheduling.noShowReasonRequired'));
      return;
    }
    setError(null);
    try {
      await noShow.mutateAsync({ id: appointment.id, reason });
      notify.success(t('uiScheduling.appointmentMarkedNoShow'));
      closeAction();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, t('uiScheduling.markNoShowError')));
    }
  };

  const handleLeft = async () => {
    if (!appointment) return;
    if (reason.trim().length < 5) {
      setError(t('uiScheduling.reasonMinLengthError', { count: 5 }));
      return;
    }
    setError(null);
    try {
      await markLeft.mutateAsync({ id: appointment.id, reason });
      notify.success(t('uiScheduling.patientLeftSuccess', { name: appointment.patientName }));
      closeAction();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, t('uiScheduling.patientLeftError')));
    }
  };

  const handleUndo = async (what: 'check-in' | 'no-show' | 'left') => {
    if (!appointment) return;
    if (reason.trim().length < OVERRIDE_REASON_MIN_LENGTH) {
      setError(t('uiScheduling.reasonMinLengthError', { count: OVERRIDE_REASON_MIN_LENGTH }));
      return;
    }
    setError(null);
    try {
      await undoStatus.mutateAsync({ id: appointment.id, what, reason });
      notify.success(
        what === 'check-in'
          ? t('uiScheduling.undoCheckInSuccess', { name: appointment.patientName })
          : what === 'left'
            ? t('uiScheduling.patientReturnedToQueue', { name: appointment.patientName })
            : t('uiScheduling.undoNoShowSuccess', { name: appointment.patientName }),
      );
      closeAction();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, t('uiScheduling.undoStatusError')));
    }
  };

  const handleReschedule = async () => {
    if (!appointment) return;
    if (!rescheduleDate || !rescheduleTime) {
      setError(t('uiScheduling.newDateTimeRequired'));
      return;
    }
    if (chosenDentistBlocked) {
      setError(t('uiScheduling.rescheduleDentistUnavailable'));
      return;
    }
    setError(null);
    try {
      const start = new Date(clinicIso(rescheduleDate, rescheduleTime));
      const end = new Date(start.getTime() + rescheduleMinutes * 60_000);
      await reschedule.mutateAsync({
        id: appointment.id,
        payload: {
          newDentistId: chosenDentist || undefined,
          newStartsAt: start.toISOString(),
          newEndsAt: end.toISOString(),
          reason: reason || t('uiScheduling.reschedule'),
          ...(byClinic ? { byClinic: true } : {}),
          // A visit moved by a colleague since this copy was loaded is a 409 (A3-12).
          rescheduleCount: appointment.rescheduleCount,
          updatedAt: appointment.updatedAt,
        },
      });
      notify.success(t('uiScheduling.appointmentRescheduled'));
      closeAction();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, t('uiScheduling.rescheduleError')));
    }
  };

  const handleStart = async () => {
    if (!appointment) return;
    try {
      await start.mutateAsync(appointment.id);
      notify.success(t('uiScheduling.encounterStartedFor', { name: appointment.patientName }));
      setActionModal(null);
      onClose();
    } catch (err) {
      setActionModal(null);
      notify.error(getApiErrorMessage(err, t('uiScheduling.startEncounterError')));
    }
  };

  if (!appointmentId) return null;

  // Time-based rules the backend enforces, so the drawer only offers what
  // will be accepted (recomputed every 30 s via useNow).
  const startMs = appointment ? new Date(appointment.startsAt).getTime() : 0;
  const started = !!appointment && now >= startMs;
  const overdue = !!appointment && isOverdueNotArrived(appointment, now);
  // Late check-in and the undos are only accepted on the visit's clinic day.
  const visitToday = !!appointment && clinicParts(appointment.startsAt).date === clinicToday(new Date(now));
  const checkInNeedsReason = started && now > startMs + CHECK_IN_WINDOW_AFTER_MIN * 60_000;
  const checkInDayOver = checkInNeedsReason && !visitToday;
  // Clinic "HH:mm" (plus the date when not today) the check-in window opens, while it is still shut.
  const opensMs = startMs - CHECK_IN_WINDOW_BEFORE_MIN * 60_000;
  const checkInOpensAt =
    appointment && now < opensMs
      ? (() => {
          const opens = clinicParts(new Date(opensMs));
          return opens.date === clinicToday(new Date(now))
            ? opens.time
            : t('uiScheduling.checkInOpensDate', { time: opens.time, date: `${opens.date.slice(8, 10)}/${opens.date.slice(5, 7)}` });
        })()
      : null;
  // A3-10: after the start, front desk may still cancel a visit not arrived
  // when the clinic is at fault (absent dentist, closed day) — never a no-show.
  const clinicOnlyCancel = !rowScopedDentist && started;
  const cancelAllowed =
    !!appointment &&
    canCancel(appointment.status) &&
    (rowScopedDentist ? startMs - now >= 24 * 60 * 60_000 : true); // BR-APPT-009 / 010; checked in → "Đã về" (BR-APPT-025)
  // From +15 min, when the visit shows "Quá giờ" (backend MANUAL_NO_SHOW_AFTER_MIN).
  const noShowAllowed =
    !!appointment && canNoShow(appointment.status) && now >= startMs + OVERDUE_AFTER_MIN * 60_000;
  const undoCheckInAllowed =
    !!appointment &&
    appointment.status === 'checked_in' &&
    appointment.visitKind !== 'walk_in' &&
    (!appointment.encounterId || !!appointment.encounterCancelled) &&
    visitToday;
  const noShowToday = !!appointment && appointment.status === 'no_show' && visitToday;
  // A3-07: the window is not open yet, but it is the visit's day.
  const earlyCheckIn = !!checkInOpensAt && visitToday;
  // A3-04: "Đã về" by mistake (or back again) is undone the same day.
  const leftToday =
    !!appointment &&
    appointment.status === 'left' &&
    visitToday &&
    !!appointment.leftAt &&
    clinicParts(appointment.leftAt).date === clinicToday(new Date(now));

  return (
    <>
      <Drawer
        open={!!appointmentId}
        onClose={onClose}
        width="lg"
        title={isLoading ? t('uiScheduling.loading') : appointment ? `${t('uiScheduling.appointmentDetail')} #${appointment.id.slice(-6).toUpperCase()}` : t('uiScheduling.noAppointmentFound')}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : !appointment ? (
          <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiScheduling.noAppointmentFound')}</p>
        ) : (
          <div className="space-y-5">
            {/* Header summary */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-surface-700 dark:bg-surface-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-surface-400">{t('uiScheduling.patient')}</p>
              <p className="mt-0.5 text-base font-semibold text-gray-900 dark:text-surface-100">{appointment.patientName}</p>
                  <p className="text-xs text-gray-500 dark:text-surface-400">
                    {appointment.patientCode} •{' '}
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {formatPhone(appointment.patientPhone ?? null)}
                    </span>
                  </p>
                </div>
                <AppointmentStatusBadge status={appointment.status} overdue={overdue} />
              </div>
              {overdue && (
                <div
                  role="status"
                  className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
                >
                  <p className="font-semibold">
                    {t(`uiScheduling.${OVERDUE_LABEL}`)} — {t('uiScheduling.minutesLate', { count: minutesLate(appointment.startsAt, now) })}
                  </p>
                  <p className="mt-0.5">
                    {t('uiScheduling.overdueInstructions')}
                  </p>
                </div>
              )}
              {/* Quick actions */}
              {appointment.patientPhone && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-200 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Phone className="h-3.5 w-3.5" />}
                    onClick={handleCall}
                    aria-label={t('uiScheduling.callPatient')}
                  >
                    {t('uiScheduling.call')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Copy className="h-3.5 w-3.5" />}
                    onClick={handleCopyPhone}
                    aria-label={t('uiScheduling.copyPhone')}
                  >
                    {t('uiScheduling.copyPhone')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
                    onClick={handleOpenProfile}
                    aria-label={t('uiScheduling.openPatientProfile')}
                  >
                    {t('uiScheduling.viewPatientProfile')}
                  </Button>
                  {canDraftMessage && (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                      onClick={() => setShowMessageDraft(true)}
                    >
                      {t('uiAi.message.open')}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Schedule info */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailRow
                icon={<Calendar className="h-4 w-4" />}
                label={t('uiScheduling.appointmentDate')}
                value={`${getWeekdayLabel(appointment.startsAt)}, ${formatDate(appointment.startsAt, 'dd/MM/yyyy')}`}
              />
              <DetailRow
                icon={<Clock className="h-4 w-4" />}
                label={t('uiScheduling.appointmentTime')}
                value={`${formatTimeOnly(appointment.startsAt)} – ${formatTimeOnly(appointment.endsAt)} (${t('uiScheduling.minutesValue', { count: appointment.durationMinutes })})`}
              />
              <DetailRow
                icon={<User className="h-4 w-4" />}
                label={t('uiScheduling.dentist')}
                value={appointment.dentistName}
              />
              <DetailRow
                icon={<Stethoscope className="h-4 w-4" />}
                label={t('uiScheduling.appointmentType')}
                value={
                  appointment.appointmentType === 'consultation'
                    ? t('uiScheduling.typeConsultation')
                    : appointment.appointmentType === 'treatment'
                      ? t('uiScheduling.typeTreatment')
                      : appointment.appointmentType === 'follow_up'
                        ? t('uiScheduling.typeFollowUp')
                        : '—'
                }
              />
            </div>

            {/* Services (ADR-0009 phase 5) */}
            {(appointment.services?.length || appointment.visitKind === 'walk_in') && (
              <div className="rounded-md border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-surface-400">{t('uiScheduling.service')}</p>
                  {appointment.visitKind === 'walk_in' && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                      {t('uiScheduling.walkIn')}
                    </span>
                  )}
                </div>
                {appointment.services?.length ? (
                  <ul className="space-y-1 text-sm" aria-label={t('uiScheduling.appointmentServices')}>
                    {appointment.services.map((sv) => (
                      <li key={sv.id} className="flex items-center justify-between gap-2">
                        <span className="text-gray-900 dark:text-surface-100">{sv.serviceName}</span>
                        <span className="text-xs text-gray-500">
                          {t('uiScheduling.minutesValue', { count: sv.durationMin })} · {formatVnd(sv.price)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-surface-400">{t('uiScheduling.noServiceSelected')}</p>
                )}
                {(appointment.bufferBeforeMin || appointment.bufferAfterMin) ? (
                  <p className="mt-2 text-xs text-gray-500">
                    {t('uiScheduling.appointmentBuffers', { before: appointment.bufferBeforeMin ?? 0, after: appointment.bufferAfterMin ?? 0 })}
                  </p>
                ) : null}
                {appointment.durationOverrideReason && (
                  <p className="mt-1 text-xs text-amber-700">
                    {t('uiScheduling.durationOverrideNotice', { minutes: appointment.calculatedDurationMin, reason: appointment.durationOverrideReason })}
                  </p>
                )}
              </div>
            )}

            {/* Reason / notes */}
            {(appointment.reason || appointment.chiefComplaint || appointment.notes) && (
              <div className="space-y-2 rounded-md border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
                {appointment.reason && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-surface-400">{t('uiScheduling.reason')}</p>
                    <p className="mt-0.5 text-sm text-gray-900 dark:text-surface-100">{appointment.reason}</p>
                  </div>
                )}
                {appointment.chiefComplaint && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-surface-400">{t('uiScheduling.symptoms')}</p>
                    <p className="mt-0.5 text-sm text-gray-900 dark:text-surface-100">{appointment.chiefComplaint}</p>
                  </div>
                )}
                {appointment.notes && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-surface-400">{t('uiScheduling.internalNote')}</p>
                    <p className="mt-0.5 text-sm text-gray-700 dark:text-surface-200">{appointment.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Status timeline */}
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-500 dark:text-surface-400">{t('uiScheduling.appointmentHistory')}</p>
              <ul className="space-y-2 text-xs">
                <TimelineRow
                  label={t('uiScheduling.appointmentBooked')}
                  time={formatDateTime(appointment.createdAt)}
                  active
                />
                {appointment.checkInAt && (
                  <TimelineRow
                    label="Check-in"
                    time={formatDateTime(appointment.checkInAt)}
                    active
                  />
                )}
                {appointment.status === 'in_progress' && (
                  <TimelineRow label={t('uiScheduling.statusInProgress')} time="—" active />
                )}
                {appointment.status === 'completed' && (
                  <TimelineRow label={t('uiScheduling.statusCompleted')} time={formatDateTime(appointment.updatedAt)} active />
                )}
                {appointment.status === 'cancelled' && appointment.cancelledAt && (
                  <TimelineRow
                    label={t('uiScheduling.cancelledWithReason', { reason: appointment.cancellationReason ?? '' })}
                    time={formatDateTime(appointment.cancelledAt)}
                    danger
                  />
                )}
                {appointment.status === 'left' && appointment.leftAt && (
                  <TimelineRow
                    label={t('uiScheduling.leftWithReason', { reason: appointment.leftReason ?? '' })}
                    time={formatDateTime(appointment.leftAt)}
                    danger
                  />
                )}
                {appointment.status === 'no_show' && appointment.noShowAt && (
                  <TimelineRow
                    label={`No-show: ${appointment.cancellationReason ?? ''}`}
                    time={formatDateTime(appointment.noShowAt)}
                    danger
                  />
                )}
              </ul>
            </div>

            {/* Audit trail (BR-APPT-034) */}
            {history && history.events.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1 text-xs uppercase tracking-wide text-gray-500">
                  <History className="h-3.5 w-3.5" /> {t('uiScheduling.activityLog')}
                </p>
                <ul className="space-y-1.5 text-xs" aria-label={t('uiScheduling.activityLog')}>
                  {history.events.map((e, i) => (
                    <li key={`${e.action}-${i}`} className="flex items-start justify-between gap-3">
                      <span className="text-gray-700">
                        {HISTORY_TRANSLATION[e.action] ? t(`uiScheduling.${HISTORY_TRANSLATION[e.action]}`) : e.action}
                        {historyDetail(e.metadata) && (
                          <span className="text-gray-500"> — {historyDetail(e.metadata)}</span>
                        )}
                        {(e.actorName ?? e.actorEmail) && (
                          <span className="block text-gray-400" title={e.actorEmail ?? undefined}>
                            {e.actorName ?? e.actorEmail}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-gray-500">{formatDateTime(e.at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="border-t border-gray-200 pt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-500 dark:text-surface-400">{t('uiScheduling.actions')}</p>
              <div className="flex flex-wrap gap-2">
                {appointment.status === 'scheduled' || appointment.status === 'confirmed' ? (
                  <PermissionGuard permission="appointment.check_in">
                    {earlyCheckIn ? (
                      // Earlier than the window the same day: with a reason (A3-07).
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                        onClick={() => setActionModal('force_check_in')}
                      >
                        {t('uiScheduling.earlyCheckInOpens', { time: checkInOpensAt })}
                      </Button>
                    ) : checkInOpensAt ? (
                      // The backend refuses check-in this early; say when it opens.
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                        disabled
                      >
                        {t('uiScheduling.checkInOpensAt', { time: checkInOpensAt })}
                      </Button>
                    ) : checkInDayOver ? (
                      // An earlier clinic day: the backend refuses; book a new visit.
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                        disabled
                      >
                        {t('uiScheduling.appointmentDayPassed')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                        // Past the window the backend needs a reason: ask for it up front.
                        onClick={checkInNeedsReason ? () => setActionModal('force_check_in') : handleCheckIn}
                        isLoading={checkIn.isPending}
                      >
                        {overdue ? t('uiScheduling.lateCheckIn') : t('uiScheduling.checkIn')}
                      </Button>
                    )}
                  </PermissionGuard>
                ) : null}

                {/* Confirming is a reminder before the visit; the backend refuses it once started. */}
                {appointment.status === 'scheduled' && !started ? (
                  <PermissionGuard permission="appointment.update">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<PhoneCall className="h-4 w-4" />}
                      onClick={handleConfirm}
                      isLoading={confirm.isPending}
                    >
                      {t('uiScheduling.confirmAppointment')}
                    </Button>
                  </PermissionGuard>
                ) : null}

                {appointment.status === 'checked_in' ? (
                  <PermissionGuard permission="encounter.start">
                    <Button
                      size="sm"
                      variant="primary"
                      leftIcon={<Stethoscope className="h-4 w-4" />}
                      onClick={() => setActionModal('start')}
                      isLoading={start.isPending}
                    >
                      {t('uiScheduling.startEncounter')}
                    </Button>
                  </PermissionGuard>
                ) : null}

                {noShowToday ? (
                  <PermissionGuard permission="appointment.check_in">
                    <Button
                      size="sm"
                      leftIcon={<CheckCircle2 className="h-4 w-4" />}
                      onClick={() => setActionModal('force_check_in')}
                    >
                      {t('uiScheduling.lateCheckIn')}
                    </Button>
                  </PermissionGuard>
                ) : null}

                {noShowToday ? (
                  <PermissionGuard permission="appointment.no_show">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Undo2 className="h-4 w-4" />}
                      onClick={() => setActionModal('undo_no_show')}
                    >
                      {t('uiScheduling.undoNoShow')}
                    </Button>
                  </PermissionGuard>
                ) : null}

                {leftToday ? (
                  <PermissionGuard permission="appointment.mark_left">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Undo2 className="h-4 w-4" />}
                      onClick={() => setActionModal('undo_left')}
                    >
                      {t('uiScheduling.undoLeft')}
                    </Button>
                  </PermissionGuard>
                ) : null}

                {undoCheckInAllowed ? (
                  <PermissionGuard permission="appointment.check_in">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Undo2 className="h-4 w-4" />}
                      onClick={() => setActionModal('undo_check_in')}
                    >
                      {t('uiScheduling.undoCheckIn')}
                    </Button>
                  </PermissionGuard>
                ) : null}

                {appointment.status === 'checked_in' ? (
                  <PermissionGuard permission="appointment.mark_left">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<DoorOpen className="h-4 w-4" />}
                      onClick={() => setActionModal('left')}
                    >
                      {t('uiScheduling.patientLeft')}
                    </Button>
                  </PermissionGuard>
                ) : null}

                {noShowAllowed && (
                  <PermissionGuard permission="appointment.mark_no_show">
                    <Button
                      size="sm"
                      variant={overdue ? 'danger' : 'outline'}
                      leftIcon={<Trash2 className="h-4 w-4" />}
                      onClick={() => setActionModal('no_show')}
                    >
                      {t('uiScheduling.markNoShow')}
                    </Button>
                  </PermissionGuard>
                )}

                {cancelAllowed && (
                  <PermissionGuard permission="appointment.cancel">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<X className="h-4 w-4" />}
                      onClick={() => setActionModal('cancel')}
                    >
                      {t('uiScheduling.cancelAppointment')}
                    </Button>
                  </PermissionGuard>
                )}

                {canReschedule(appointment.status) &&
                  (appointment.rescheduleCount ?? 0) < MAX_RESCHEDULES &&
                  // BR-APPT-009: a dentist moves their own visit only ≥ 24 h ahead.
                  (!rowScopedDentist || startMs - now >= 24 * 60 * 60_000) && (
                  <PermissionGuard permission="appointment.update">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<FileEdit className="h-4 w-4" />}
                      onClick={() => setActionModal('reschedule')}
                    >
                      {t('uiScheduling.reschedule')}
                    </Button>
                  </PermissionGuard>
                )}

                {canEdit(appointment.status) && (
                  <PermissionGuard permission="appointment.update">
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<Edit3 className="h-4 w-4" />}
                      onClick={() => {
                        onEdit?.(appointment);
                        onClose();
                      }}
                    >
                      {t('uiScheduling.edit')}
                    </Button>
                  </PermissionGuard>
                )}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Action modals */}
      <ActionDialog
        open={actionModal === 'cancel'}
        onClose={closeAction}
        title={t('uiScheduling.cancelAppointment')}
        description={t('uiScheduling.cancelReasonDescription')}
        reason={reason}
        setReason={setReason}
        quickReasons={CANCEL_REASONS}
        extra={
          rowScopedDentist ? undefined : clinicOnlyCancel ? (
            <p className="text-xs text-amber-700">
              {t('uiScheduling.clinicCancelPastDueDescription')}
            </p>
          ) : (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={byClinic} onChange={(e) => setByClinic(e.target.checked)} />
              <span>{t('uiScheduling.clinicCancelCheckbox')}</span>
            </label>
          )
        }
        error={error}
        onConfirm={handleCancel}
        isLoading={cancel.isPending}
        confirmLabel={t('uiScheduling.confirmCancel')}
        confirmVariant="danger"
      />

      <ActionDialog
        open={actionModal === 'force_check_in'}
        onClose={closeAction}
        title={earlyCheckIn ? t('uiScheduling.earlyCheckIn') : t('uiScheduling.lateCheckIn')}
        description={
          earlyCheckIn
            ? t('uiScheduling.earlyCheckInDescription', { time: checkInOpensAt })
            : appointment?.status === 'no_show'
            ? t('uiScheduling.checkInAfterNoShowDescription')
            : t('uiScheduling.lateCheckInDescription', { minutes: CHECK_IN_WINDOW_AFTER_MIN })
        }
        reason={reason}
        setReason={setReason}
        quickReasons={earlyCheckIn ? EARLY_CHECK_IN_REASONS : LATE_CHECK_IN_REASONS}
        error={error}
        onConfirm={handleForceCheckIn}
        isLoading={checkIn.isPending}
        confirmLabel={earlyCheckIn ? t('uiScheduling.earlyCheckIn') : t('uiScheduling.checkInAnyway')}
        confirmVariant="primary"
      />

      <ActionDialog
        open={actionModal === 'no_show'}
        onClose={closeAction}
        title={t('uiScheduling.markNoShow')}
        description={t('uiScheduling.noShowDialogDescription')}
        reason={reason}
        setReason={setReason}
        quickReasons={NO_SHOW_REASONS}
        error={error}
        onConfirm={handleNoShow}
        isLoading={noShow.isPending}
        confirmLabel={t('uiScheduling.confirmNoShow')}
        confirmVariant="danger"
      />

      <ActionDialog
        open={actionModal === 'undo_check_in'}
        onClose={closeAction}
        title={t('uiScheduling.undoCheckIn')}
        description={t('uiScheduling.undoCheckInDescription')}
        reason={reason}
        setReason={setReason}
        quickReasons={UNDO_CHECK_IN_REASONS}
        error={error}
        onConfirm={() => void handleUndo('check-in')}
        isLoading={undoStatus.isPending}
        confirmLabel={t('uiScheduling.undoCheckIn')}
        confirmVariant="primary"
      />

      <ActionDialog
        open={actionModal === 'undo_no_show'}
        onClose={closeAction}
        title={t('uiScheduling.undoNoShow')}
        description={t('uiScheduling.undoNoShowDescription')}
        reason={reason}
        setReason={setReason}
        quickReasons={UNDO_NO_SHOW_REASONS}
        error={error}
        onConfirm={() => void handleUndo('no-show')}
        isLoading={undoStatus.isPending}
        confirmLabel={t('uiScheduling.undoNoShow')}
        confirmVariant="primary"
      />

      <ActionDialog
        open={actionModal === 'undo_left'}
        onClose={closeAction}
        title={t('uiScheduling.undoLeft')}
        description={t('uiScheduling.undoLeftDescription')}
        reason={reason}
        setReason={setReason}
        quickReasons={UNDO_LEFT_REASONS}
        error={error}
        onConfirm={() => void handleUndo('left')}
        isLoading={undoStatus.isPending}
        confirmLabel={t('uiScheduling.undoLeft')}
        confirmVariant="primary"
      />

      <ConfirmDialog
        open={!!openVisit}
        onClose={() => setOpenVisit(null)}
        onConfirm={() => void handleCheckInDespiteOpenVisit()}
        isLoading={checkIn.isPending}
        title={t('uiScheduling.patientAlreadyInClinic')}
        description={openVisit?.message}
        confirmLabel={t('uiScheduling.checkInAnyway')}
      />

      {/* A3-03: starting the wrong patient has no easy way back. */}
      <ConfirmDialog
        open={actionModal === 'start'}
        onClose={closeAction}
        onConfirm={() => void handleStart()}
        isLoading={start.isPending}
        title={t('uiScheduling.startEncounterConfirm')}
        description={
          appointment && (
            <>
              {t('uiScheduling.startEncounterDescription', { name: appointment.patientName, code: appointment.patientCode })}
            </>
          )
        }
        confirmLabel={t('uiScheduling.startEncounter')}
      />

      <ActionDialog
        open={actionModal === 'left'}
        onClose={closeAction}
        title={t('uiScheduling.patientLeftNotSeen')}
        description={t('uiScheduling.patientLeftDescription')}
        reason={reason}
        setReason={setReason}
        quickReasons={LEFT_REASONS}
        error={error}
        onConfirm={handleLeft}
        isLoading={markLeft.isPending}
        confirmLabel={t('uiScheduling.confirmPatientLeft')}
        confirmVariant="danger"
      />

      <Modal
        open={actionModal === 'reschedule'}
        onClose={closeAction}
        title={t('uiScheduling.rescheduleAppointment')}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeAction} disabled={reschedule.isPending}>
              {t('uiScheduling.cancel')}
            </Button>
            <Button
              onClick={handleReschedule}
              isLoading={reschedule.isPending}
              disabled={replans && isReplanning}
            >
              {t('uiScheduling.confirmReschedule')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <AlertInline message={error} />}
          <Select
            label={t('uiScheduling.newDentist')}
            value={chosenDentist}
            onChange={(e) => setRescheduleDentist(e.target.value)}
            options={rescheduleDentistOptions}
            disabled={rowScopedDentist}
          />
          {chosenDentistBlocked && (
            <p className="text-xs text-amber-700">
              {t('uiScheduling.rescheduleDentistUnavailable')}
            </p>
          )}
          {rescheduleMinutes !== currentMinutes && (
            <p className="text-xs text-gray-600 dark:text-surface-300">
              {t('uiScheduling.rescheduleDurationChanged', { minutes: rescheduleMinutes, previous: currentMinutes })}
            </p>
          )}
          {rescheduleDentistIncapable && (
            <p className="text-xs text-amber-700">
              {t('uiScheduling.rescheduleServiceUnavailable')}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="date"
              label={t('uiScheduling.newDate')}
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
            <Input
              type="time"
              label={t('uiScheduling.newTime')}
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
            />
          </div>

          {/* Available slot suggestions */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-surface-300">
              {t('uiScheduling.suggestedAvailableSlots')}
              <span className="ml-1 font-normal text-gray-400">
                ({t('uiScheduling.minutesValue', { count: rescheduleMinutes })})
              </span>
            </p>
            {!rescheduleDate ? (
              <p className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                {t('uiScheduling.chooseDateForSuggestions')}
              </p>
            ) : isAvailabilityLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-gray-100 px-3 py-3 text-xs text-gray-500">
                <Spinner size="sm" /> {t('uiScheduling.loadingAvailableSlots')}
              </div>
            ) : !availability?.availableSlots?.length ? (
              <p className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
                {t('uiScheduling.noAvailableSlotsThisDay')}
              </p>
            ) : (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-gray-100 p-2">
                {availability.availableSlots
                  .filter((s) => s.available)
                  .map((s) => {
                    const t = clinicParts(s.startTime).time;
                    const active = rescheduleTime === t;
                    return (
                      <button
                        key={s.startTime}
                        type="button"
                        onClick={() => setRescheduleTime(t)}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300 hover:bg-brand-50',
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          <Textarea
            label={t('uiScheduling.rescheduleReason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('uiScheduling.rescheduleReasonExample')}
            rows={3}
          />
          {!rowScopedDentist && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={byClinic} onChange={(e) => setByClinic(e.target.checked)} />
              <span>
                {t('uiScheduling.rescheduleByClinicNote')}
              </span>
            </label>
          )}
        </div>
      </Modal>
      {appointment && showMessageDraft && (
        <MessageDraftModal
          context={{ kind: 'appointment_reminder', appointmentId: appointment.id }}
          open
          onClose={() => setShowMessageDraft(false)}
        />
      )}
    </>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 p-3 dark:border-surface-700">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-surface-100">{value}</p>
    </div>
  );
}

function TimelineRow({
  label,
  time,
  active,
  danger,
}: {
  label: string;
  time: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`h-2 w-2 rounded-full ${
          danger ? 'bg-red-500' : active ? 'bg-emerald-500' : 'bg-gray-300'
        }`}
      />
      <span className={`flex-1 ${danger ? 'text-red-700' : 'text-gray-700'}`}>{label}</span>
      <span className="text-gray-500">{time}</span>
    </li>
  );
}

function AlertInline({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {message}
    </div>
  );
}

interface ActionDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  reason: string;
  setReason: (v: string) => void;
  quickReasons?: QuickReason[];
  /** Extra controls under the reason (e.g. "Phòng khám hủy"). */
  extra?: React.ReactNode;
  error: string | null;
  onConfirm: () => void;
  isLoading: boolean;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
}

function ActionDialog({
  open,
  onClose,
  title,
  description,
  reason,
  setReason,
  quickReasons,
  extra,
  error,
  onConfirm,
  isLoading,
  confirmLabel,
  confirmVariant = 'danger',
}: ActionDialogProps) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      description={
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-surface-300">{description}</p>
          {error && <AlertInline message={error} />}
          {quickReasons && quickReasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {quickReasons.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setReason(t(`uiScheduling.${preset.key}`))}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    reason === t(`uiScheduling.${preset.key}`)
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:bg-brand-50 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200',
                  )}
                >
                  {t(`uiScheduling.${preset.key}`)}
                </button>
              ))}
            </div>
          )}
          <Textarea
            label={t('uiScheduling.reasonRequired')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('uiScheduling.enterReason')}
            rows={3}
          />
          {extra}
        </div>
      }
      confirmLabel={confirmLabel}
      confirmVariant={confirmVariant}
      isLoading={isLoading}
    />
  );
}

function canCancel(status: AppointmentStatus): boolean {
  return status === 'scheduled' || status === 'confirmed';
}

function canReschedule(status: AppointmentStatus): boolean {
  return status === 'scheduled' || status === 'confirmed';
}

/** BR-APPT-013: a visit moves at most this many times (backend RescheduleLimitReached). */
const MAX_RESCHEDULES = 3;

/** Reason/notes edits, as the backend's update() accepts. */
function canEdit(status: AppointmentStatus): boolean {
  return status === 'scheduled' || status === 'confirmed' || status === 'checked_in';
}

function canNoShow(status: AppointmentStatus): boolean {
  return status === 'scheduled' || status === 'confirmed';
}

// Hint to silence unused import warning for STATUS_ORDER (kept for future timeline enhancements)
void STATUS_ORDER;
/** The one metadata field worth showing next to an audit entry. */
function historyDetail(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const reason = metadata.reason ?? metadata.overrideReason;
  if (typeof reason === 'string' && reason) return reason;
  const codes = metadata.serviceCodes;
  if (Array.isArray(codes) && codes.length) return codes.join(', ');
  return null;
}
