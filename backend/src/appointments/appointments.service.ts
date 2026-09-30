import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  Appointment,
  AppointmentStatus,
  BookingRequestStatus,
  DentistProfile,
  EncounterStatus,
  Prisma,
  QueueStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import {
  endOfDayInclusive,
  clinicDateOnly,
  startOfClinicDay,
  endOfClinicDay,
  CLINIC_UTC_OFFSET_MS,
} from '../common/date-range.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AppointmentCancelledEvent,
  APPOINTMENT_CANCELLED_EVENT,
  APPOINTMENT_RESCHEDULED_EVENT,
  AppointmentRescheduledEvent,
  PATIENT_CLINICAL_DATA_CHANGED_EVENT,
  PatientClinicalDataChangedEvent,
} from '../common/events/domain-events';
import {
  AppointmentNotFoundException,
  BackDatedAppointmentException,
  CheckInExpiredException,
  CheckInWindowException,
  DentistUnavailableException,
  InvalidAppointmentStateException,
  OutsideWorkingHoursException,
  PatientDoubleBookedException,
  RescheduleLimitReachedException,
  ScheduleOverlapException,
  SlotConflictException,
} from './domain/exceptions';
import {
  LOCKING_TX_OPTIONS,
  lockClinicClosures,
  lockDentistCalendar,
  lockPatientCalendar,
} from './domain/advisory-lock';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import {
  AvailabilityService,
  effectiveStartAt,
  OPEN_BOOKING_STATUSES,
  PROPOSAL_BOOKING_STATUSES,
  RequestIssue,
  RequestPlanRules,
} from './availability.service';
import {
  AvailabilityQueryDto,
  BulkCreateWorkingSchedulesDto,
  CancelAppointmentDto,
  ClinicClosureDto,
  ListClinicClosuresQueryDto,
  UpdateWorkingScheduleDto,
  CreateAppointmentDto,
  CreateTimeOffDto,
  CreateWorkingScheduleDto,
  ListAppointmentsQueryDto,
  NoShowDto,
  RescheduleAppointmentDto,
  UpdateAppointmentDto,
  CreateScheduleOverrideDto,
  CreateWalkInDto,
  DecideTimeOffDto,
  MarkLeftDto,
  StatusReasonDto,
  ListScheduleOverridesQueryDto,
  ListTimeOffsQueryDto,
  ScheduleImpactQueryDto,
} from './dto/appointment.dto';
import { MAX_VISIT_MINUTES } from './dto/is-appointment-instant';
import { closeQueueEntry, enqueue, LATE_AFTER_MIN } from './domain/queue';
import { reopenCancelledEncounter } from '../medical-records/domain/reopen-encounter';
import { dentistHasTreatedPatient } from '../common/dentist-patient-access';
import { dentistProfileFilter, SCHEDULABLE_ACCOUNT_WHERE } from '../staff/staff-rules';

const CHECKIN_WINDOW_BEFORE_MIN = 15;
const CHECKIN_WINDOW_AFTER_MIN = 30;
/**
 * Auto no-show (BR-APPT-012) waits this long after BOTH the check-in window
 * has closed and the booked slot has ended, i.e. it fires at
 * max(startAt + 30', endAt) + this. A 9:00–9:30 visit is marked at 10:30, so
 * a patient arriving at 9:35 is still SCHEDULED and is checked in late
 * (with a reason). Even once marked, a late check-in or an undo is still
 * possible the same clinic day. Override with APPT_AUTO_NO_SHOW_GRACE_MIN.
 */
export const AUTO_NO_SHOW_GRACE_MIN = positiveIntEnv('APPT_AUTO_NO_SHOW_GRACE_MIN', 60);
/** Manual no-show opens with the "Quá giờ" label (queue LATE_AFTER_MIN). */
const MANUAL_NO_SHOW_AFTER_MIN = LATE_AFTER_MIN;
/** Minimum length of the reason for a late check-in or an undo. */
const STATUS_REASON_MIN_LENGTH = 5;
const LATE_CANCEL_REASON_MIN_LENGTH = 5;
/** Reason recorded when the end-of-day job closes a check-in left open. */
export const END_OF_DAY_LEFT_REASON = 'Hệ thống đóng cuối ngày';

// Front desk reads these messages as-is, so they are in Vietnamese.
export const STALE_APPOINTMENT_MSG = 'Lịch vừa được thay đổi, tải lại rồi thử lại';
/** The client's copy (rescheduleCount / updatedAt) is older than the row. */
export const CHANGED_SINCE_READ_MSG = 'Lịch vừa được thay đổi, vui lòng tải lại';
const STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: 'đã đặt',
  CONFIRMED: 'đã xác nhận',
  CHECKED_IN: 'đã check-in',
  IN_PROGRESS: 'đang khám',
  COMPLETED: 'đã hoàn thành',
  CANCELLED: 'đã hủy',
  NO_SHOW: 'vắng mặt',
  LEFT: 'đã về (chưa khám)',
};

const blankToNull = (v: string | undefined): string | null => (v?.trim() ? v.trim() : null);

function positiveIntEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Audit action of an undone no-show; the cron then waits for the day's end. */
export const NO_SHOW_REVERTED_ACTION = 'APPOINTMENT_NO_SHOW_REVERTED';

/** Statuses that still hold a slot on the calendar. */
const ACTIVE_APPOINTMENT_EXCLUDED_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.LEFT,
];

const DAY_MS = 24 * 60 * 60_000;
const DAY_LABELS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** Longest clinic-wide closure accepted in one entry. */
const MAX_CLOSURE_DAYS = 60;
/** Columns of a booking listed as affected by a calendar change. */
const AFFECTED_APPOINTMENT_SELECT = {
  id: true,
  dentistId: true,
  startAt: true,
  endAt: true,
  status: true,
  patient: { select: { id: true, code: true, fullName: true, primaryPhone: true } },
} as const;
const TIME_OFF_STATUS_LABEL: Record<string, string> = {
  PENDING: 'đang chờ duyệt',
  APPROVED: 'đã được duyệt',
  REJECTED: 'đã bị từ chối',
  CANCELLED: 'đã bị hủy',
};

/** What a visit is made of when booked from the catalogue (ADR-0009 phase 5). */
export interface VisitPlan {
  services: Array<{
    serviceId: string;
    serviceCode: string;
    serviceName: string;
    price: number;
    durationMin: number;
    bufferBeforeMin: number;
    bufferAfterMin: number;
    sortOrder: number;
  }>;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
}

/**
 * AppointmentsService — owns:
 *   - Appointment CRUD + state machine
 *   - Working schedules, time-off, shift registration
 *   - Slot availability calculation
 *   - Cascade-cancel event (BR-APPT-023 / BD-0008)
 *   - Manual no-show; cron entry is in appointments.cron.ts
 *
 * Cross-module concerns:
 *   - On Appointment.cancel: emits APPOINTMENT_CANCELLED_EVENT (sync).
 *     MedicalRecords subscribes in the same DB transaction.
 */
@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly availability: AvailabilityService,
  ) {}

  // ==========================================================================
  // Appointment creation
  // ==========================================================================

  /**
   * `fromBookingRequest`: an online request the front desk accepted. The
   * visit is born CONFIRMED (the patient asked for this exact time) and the
   * request is linked in the same transaction, so two staff confirming the
   * same request can't both create a visit. Its `plan` (BookingService)
   * may keep a service withdrawn after the patient sent the request;
   * `match` narrows the attach to the request as the caller read it. With
   * `tx` the visit is written in the caller's transaction (which already
   * holds its booking-phone lock; dentist then patient locks follow here).
   */
  async create(
    dto: CreateAppointmentDto,
    actor: JwtPayload,
    fromBookingRequest?: {
      id: string;
      expectedStatuses: BookingRequestStatus[];
      plan?: VisitPlan;
      match?: Prisma.BookingRequestWhereInput;
      tx?: Prisma.TransactionClient;
    },
  ) {
    const startAt = new Date(dto.startAt);
    if (startAt.getTime() <= Date.now() + 60_000) {
      throw new BackDatedAppointmentException();
    }
    await this.assertDentistMayBook(dto.dentistId, dto.patientId, actor);

    const dentist = await this.validateDentist(dto.dentistId);
    // The caller's transaction may have just created the patient.
    await this.validateActivePatient(dto.patientId, fromBookingRequest?.tx);
    const plan =
      fromBookingRequest?.plan ??
      (await this.planVisit(dto.dentistId, dto.serviceIds, clinicDateOnly(startAt)));

    // Honor a client-provided endAt (e.g. a chosen duration) instead of
    // always defaulting — this DTO field has always been accepted and
    // validated but was silently discarded here, so every appointment was
    // persisted at defaultSlotMinutes regardless of what was requested.
    // With services, the default length is what they add up to (D4).
    const endAt = dto.endAt
      ? new Date(dto.endAt)
      : new Date(
          startAt.getTime() + (plan?.durationMin ?? this.defaultSlotMinutes(dentist)) * 60_000,
        );
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BackDatedAppointmentException();
    }
    this.assertVisitLength(startAt, endAt);
    const overrideReason = this.checkDurationOverride(
      plan,
      startAt,
      endAt,
      dto.durationOverrideReason,
    );

    // Wrap the overlap check + insert in a single $transaction under an
    // advisory lock keyed by dentistId. This prevents two concurrent
    // bookings on the same dentist from both passing the gap check
    // (BR-APPT-002 / 003 / 004 — see Phase 9.2 R2-7 lesson).
    const write = async (tx: Prisma.TransactionClient) => {
      await this.lockDentist(tx, dto.dentistId);
      await this.lockPatient(tx, dto.patientId);
      await this.ensureSlotAvailable(dto.dentistId, startAt, endAt, actor, undefined, tx, plan);
      await this.ensurePatientFree(dto.patientId, startAt, endAt, undefined, tx);

      const created = await tx.appointment.create({
        data: {
          patientId: dto.patientId,
          dentistId: dto.dentistId,
          startAt,
          endAt,
          ...this.planColumns(plan, overrideReason),
          status: fromBookingRequest ? AppointmentStatus.CONFIRMED : AppointmentStatus.SCHEDULED,
          ...(fromBookingRequest ? { confirmedAt: new Date(), confirmedBy: actor.sub } : {}),
          reason: blankToNull(dto.reason),
          chiefComplaint: blankToNull(dto.chiefComplaint),
          appointmentType: dto.appointmentType,
          notes: dto.notes,
          source: dto.source ?? 'PHONE',
          createdBy: actor.sub,
          updatedBy: actor.sub,
        },
      });

      await this.audit.log(
        {
          action: 'APPOINTMENT_CREATED',
          actorUserId: actor.sub,
          actorEmail: actor.email,
          targetType: 'appointment',
          targetId: created.id,
          metadata: {
            dentistId: dto.dentistId,
            patientId: dto.patientId,
            startAt: dto.startAt,
            ...(plan ? { serviceCodes: plan.services.map(sv => sv.serviceCode) } : {}),
            ...(overrideReason ? { durationOverrideReason: overrideReason } : {}),
            ...(fromBookingRequest ? { bookingRequestId: fromBookingRequest.id } : {}),
          },
        },
        tx,
      );

      if (fromBookingRequest) {
        const attached = await tx.bookingRequest.updateMany({
          where: {
            ...fromBookingRequest.match,
            id: fromBookingRequest.id,
            status: { in: fromBookingRequest.expectedStatuses },
            appointmentId: null,
          },
          data: {
            appointmentId: created.id,
            patientId: dto.patientId,
            status: BookingRequestStatus.CONFIRMED,
            handledBy: actor.sub,
          },
        });
        if (attached.count !== 1) {
          throw new InvalidAppointmentStateException(
            'Yêu cầu đặt lịch vừa được xử lý hoặc đã quá hạn — tải lại rồi thử lại',
          );
        }
      }

      return created;
    };
    return fromBookingRequest?.tx
      ? write(fromBookingRequest.tx)
      : this.prisma.$transaction(write, LOCKING_TX_OPTIONS);
  }

  // See domain/advisory-lock.ts.
  private lockDentist(tx: Prisma.TransactionClient, dentistId: string): Promise<void> {
    return lockDentistCalendar(tx, dentistId);
  }

  private lockPatient(tx: Prisma.TransactionClient, patientId: string): Promise<void> {
    return lockPatientCalendar(tx, patientId);
  }

  // ==========================================================================
  // State machine: confirm / check-in / cancel / no-show / reschedule
  // ==========================================================================

  /**
   * SCHEDULED → CONFIRMED (spec §2.8): front desk has reached the patient
   * (reminder call/message) and they confirmed they will come.
   */
  async confirm(appointmentId: string, actor: JwtPayload) {
    const appt = await this.requireAppointment(appointmentId);

    if (this.isRowScopedDentist(actor) && appt.dentistId !== actor.sub) {
      throw new AppointmentNotFoundException(appointmentId);
    }
    if (appt.status === AppointmentStatus.CONFIRMED) return appt;
    if (appt.status !== AppointmentStatus.SCHEDULED) {
      throw new InvalidAppointmentStateException(
        `Không thể xác nhận lịch hẹn ở trạng thái "${STATUS_LABEL[appt.status]}"`,
      );
    }
    if (Date.now() >= appt.startAt.getTime()) {
      throw new InvalidAppointmentStateException(
        'Đã qua giờ hẹn — không cần xác nhận nữa, hãy check-in khi bệnh nhân đến',
      );
    }

    // See checkIn() — guarded write against a concurrent cancel/reschedule.
    const result = await this.prisma.appointment.updateMany({
      where: this.unchangedSince(appt),
      data: {
        status: AppointmentStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedBy: actor.sub,
        updatedBy: actor.sub,
      },
    });
    if (result.count === 0) {
      throw new InvalidAppointmentStateException(STALE_APPOINTMENT_MSG);
    }
    const updated = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });

    await this.audit.log({
      action: 'APPOINTMENT_CONFIRMED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'appointment',
      targetId: appointmentId,
    });

    return updated;
  }

  /**
   * BR-APPT-007. Inside the window (-15'..+30') a plain check-in; after it,
   * the same clinic day, a late check-in with a reason — also from NO_SHOW
   * (marked by the cron or by hand), provided the slot is still free since
   * a no-show released it. A later day can no longer be checked in.
   */
  async checkIn(
    appointmentId: string,
    override: boolean,
    overrideReason: string | undefined,
    actor: JwtPayload,
  ) {
    const appt = await this.requireAppointment(appointmentId);
    // Row-level, as confirm/markNoShow: a dentist acts on their own calendar only.
    if (this.isRowScopedDentist(actor) && appt.dentistId !== actor.sub) {
      throw new AppointmentNotFoundException(appointmentId);
    }

    const now = Date.now();
    const start = appt.startAt.getTime();
    const windowStart = start - CHECKIN_WINDOW_BEFORE_MIN * 60_000;
    const windowEnd = start + CHECKIN_WINDOW_AFTER_MIN * 60_000;

    if (appt.status === AppointmentStatus.CHECKED_IN) return appt;
    const fromNoShow = appt.status === AppointmentStatus.NO_SHOW;
    if (
      appt.status !== AppointmentStatus.SCHEDULED &&
      appt.status !== AppointmentStatus.CONFIRMED &&
      !fromNoShow
    ) {
      throw new InvalidAppointmentStateException(
        `Không thể check-in lịch hẹn ở trạng thái "${STATUS_LABEL[appt.status]}"`,
      );
    }

    if (now < windowStart) {
      throw new CheckInWindowException(
        `Chưa đến giờ check-in — mở từ ${this.toClinicTimeString(new Date(windowStart))} ngày ${clinicDateOnly(new Date(windowStart))}`,
      );
    }
    const late = fromNoShow || now > windowEnd;
    if (late && !this.isClinicToday(appt.startAt, now)) {
      throw new CheckInExpiredException(
        `Lịch hẹn ngày ${this.viDate(new Date(clinicDateOnly(appt.startAt)))} đã qua — không thể check-in. Hãy đặt lịch mới cho bệnh nhân.`,
        [],
      );
    }
    if (late && !override) {
      // Only exits that will be accepted: cancel is refused after the start
      // (BR-APPT-010), and a NO_SHOW visit is already marked absent.
      throw new CheckInExpiredException(
        fromNoShow
          ? 'Lịch đã bị đánh vắng mặt — check-in muộn cần lý do'
          : `Đã quá ${CHECKIN_WINDOW_AFTER_MIN} phút sau giờ hẹn — check-in muộn cần lý do`,
        [
          { code: 'still_check_in', label: 'Check-in muộn (cần lý do)' },
          ...(fromNoShow ? [] : [{ code: 'no_show', label: 'Đánh vắng mặt' }]),
        ],
      );
    }
    const reason = overrideReason?.trim() ?? '';
    if (override && reason.length < STATUS_REASON_MIN_LENGTH) {
      throw new CheckInWindowException(
        `Check-in muộn cần lý do (ít nhất ${STATUS_REASON_MIN_LENGTH} ký tự)`,
      );
    }

    // BR-APPT-008: active patient
    const patient = await this.prisma.patient.findUnique({ where: { id: appt.patientId } });
    if (!patient || patient.deletedAt) {
      throw new InvalidAppointmentStateException('Hồ sơ bệnh nhân đã bị xóa');
    }

    // Guarded write: only succeed if status is still what we just read.
    // Front-desk check-in/cancel/no-show are the most concurrent-actor-prone
    // flows in the app — two receptionists (or a shift handoff) acting on
    // the same appointment at once both pass the status check above, then
    // a plain .update() would let whichever write lands last silently win
    // (e.g. cancel overwriting a check-in that already happened, patient
    // physically in the waiting room). Same guarded-updateMany pattern as
    // inventory stock writes and shift-registration approve/reject/cancel.
    const updated = await this.prisma.$transaction(async tx => {
      if (fromNoShow) await this.assertSlotStillFree(tx, appt, actor);
      const checkInResult = await this.slotSafe(() =>
        tx.appointment.updateMany({
          where: this.unchangedSince(appt),
          data: {
            status: AppointmentStatus.CHECKED_IN,
            checkedInAt: new Date(now),
            checkedInBy: actor.sub,
            updatedBy: actor.sub,
            // The no-show reason lives on in the audit trail.
            ...(fromNoShow ? { noShowAt: null, cancelledReason: null } : {}),
          },
        }),
      );
      if (checkInResult.count === 0) {
        throw new InvalidAppointmentStateException(STALE_APPOINTMENT_MSG);
      }
      // ADR-0009 D5: checking in puts the patient in the dentist's queue —
      // the row as written, not the earlier read.
      const checkedIn = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
      await enqueue(tx, checkedIn, new Date(now), actor.sub);
      return checkedIn;
    });

    await this.audit.log({
      action: override ? 'APPOINTMENT_CHECKIN_OVERRIDDEN' : 'APPOINTMENT_CHECKED_IN',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'appointment',
      targetId: appointmentId,
      metadata: override
        ? {
            override: true,
            overrideReason: reason,
            ...(fromNoShow
              ? { fromStatus: AppointmentStatus.NO_SHOW, noShowReason: appt.cancelledReason }
              : {}),
          }
        : undefined,
    });

    return updated;
  }

  /**
   * Undo a check-in made by mistake (wrong patient, too early): back to
   * SCHEDULED/CONFIRMED as before, its queue entry closed. Only on the
   * visit's clinic day, for a booked visit whose exam never started (no
   * encounter); a patient who walked out is "Đã về" (markLeft), not an undo.
   */
  async undoCheckIn(appointmentId: string, dto: StatusReasonDto, actor: JwtPayload) {
    const appt = await this.requireAppointment(appointmentId);
    if (this.isRowScopedDentist(actor) && appt.dentistId !== actor.sub) {
      throw new AppointmentNotFoundException(appointmentId);
    }
    const reason = this.statusReason(dto.reason, 'Hoàn tác check-in');
    if (appt.status !== AppointmentStatus.CHECKED_IN) {
      throw new InvalidAppointmentStateException(
        appt.status === AppointmentStatus.IN_PROGRESS
          ? 'Bệnh nhân đã vào khám — không thể hoàn tác check-in'
          : `Chỉ hoàn tác được lịch đã check-in (lịch đang ở trạng thái "${STATUS_LABEL[appt.status]}")`,
      );
    }
    if (appt.visitKind === 'WALK_IN') {
      throw new InvalidAppointmentStateException(
        'Khách vãng lai không có lịch hẹn trước để quay về — nếu khách rời đi, hãy ghi nhận "Đã về"',
      );
    }
    if (!this.isClinicToday(appt.startAt)) {
      throw new InvalidAppointmentStateException('Chỉ hoàn tác check-in trong ngày hẹn');
    }
    const restored = this.bookedStatus(appt);

    return this.prisma.$transaction(async tx => {
      // Serialises with startEncounter, which locks the same row first.
      await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${appointmentId}::uuid FOR UPDATE`;
      const encounter = await tx.encounter.findUnique({
        where: { appointmentId },
        select: { id: true },
      });
      if (encounter) {
        throw new InvalidAppointmentStateException(
          'Lượt khám đã từng được mở — không thể hoàn tác check-in; nếu bệnh nhân về, hãy ghi nhận "Đã về"',
        );
      }
      const res = await tx.appointment.updateMany({
        where: this.unchangedSince(appt),
        data: { status: restored, checkedInAt: null, checkedInBy: null, updatedBy: actor.sub },
      });
      if (res.count === 0) {
        throw new InvalidAppointmentStateException(STALE_APPOINTMENT_MSG);
      }
      await closeQueueEntry(tx, appointmentId, 'CANCELLED', actor.sub);
      await this.auditInTx(tx, actor, appointmentId, 'APPOINTMENT_CHECKIN_UNDONE', {
        reason,
        restoredStatus: restored,
        checkedInAt: appt.checkedInAt?.toISOString() ?? null,
      });
      return tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    });
  }

  /** Transition the appointment and create its encounter atomically (BR-MR-001). */
  async startEncounter(appointmentId: string, actor: JwtPayload) {
    let openedFor: string | null = null;
    const result = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${appointmentId}::uuid FOR UPDATE`;
      const appt = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!appt || appt.deletedAt) throw new AppointmentNotFoundException(appointmentId);
      if (this.isRowScopedDentist(actor) && appt.dentistId !== actor.sub) {
        throw new AppointmentNotFoundException(appointmentId);
      }
      if (
        appt.status !== AppointmentStatus.CHECKED_IN &&
        appt.status !== AppointmentStatus.IN_PROGRESS
      ) {
        throw new InvalidAppointmentStateException(
          `Cannot start encounter from status ${appt.status}; appointment must be CHECKED_IN`,
        );
      }

      const existing = await tx.encounter.findUnique({
        where: { appointmentId },
        select: { id: true, status: true },
      });
      if (existing?.status === EncounterStatus.COMPLETED) {
        throw new InvalidAppointmentStateException('Encounter already completed');
      }

      await closeQueueEntry(tx, appointmentId, 'STARTED', actor.sub);
      const updated =
        appt.status === AppointmentStatus.CHECKED_IN
          ? await tx.appointment.update({
              where: { id: appointmentId },
              data: { status: AppointmentStatus.IN_PROGRESS, updatedBy: actor.sub },
            })
          : appt;
      // An encounter cancelled as started by mistake (MedicalRecordsService
      // .cancelEncounter puts the appointment back to CHECKED_IN) restarts on
      // the same row: appointment_id is unique on encounters.
      if (existing?.status === EncounterStatus.CANCELLED) {
        await reopenCancelledEncounter(tx, existing.id, appt.dentistId, actor.sub);
        openedFor = appt.patientId;
      }
      const encounter =
        existing ??
        (await tx.encounter.create({
          data: {
            appointmentId,
            patientId: appt.patientId,
            dentistId: appt.dentistId,
            status: EncounterStatus.IN_PROGRESS,
            startedAt: new Date(),
          },
        }));
      if (!existing) openedFor = appt.patientId;
      // BR-APPT-034: the exam start is part of the visit's history.
      if (appt.status === AppointmentStatus.CHECKED_IN) {
        await this.auditInTx(tx, actor, appointmentId, 'APPOINTMENT_EXAM_STARTED', {
          encounterId: encounter.id,
          ...(existing?.status === EncounterStatus.CANCELLED ? { restarted: true } : {}),
        });
      }

      return { ...updated, encounter: { id: encounter.id } };
    });
    // After commit: an encounter opened (new or reopened) changes the AI
    // summary's "open encounters" line.
    if (openedFor) {
      const payload: PatientClinicalDataChangedEvent = { patientId: openedFor };
      this.events.emit(PATIENT_CLINICAL_DATA_CHANGED_EVENT, payload);
    }
    return result;
  }

  /**
   * Complete encounter: appointment → COMPLETED. Called by MedicalRecords
   * module after Encounter.status flips to COMPLETED in same transaction
   * (BR-MR-003 / BR-APPT-022).
   */
  async completeEncounter(
    appointmentId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Appointment> {
    return tx.appointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.COMPLETED },
    });
  }

  async cancel(appointmentId: string, dto: CancelAppointmentDto, actor: JwtPayload) {
    const appt = await this.requireAppointment(appointmentId);
    // The client saw an older version (moved or edited since): reload first.
    if (
      (dto.rescheduleCount !== undefined && dto.rescheduleCount !== appt.rescheduleCount) ||
      (dto.updatedAt !== undefined &&
        new Date(dto.updatedAt).getTime() !== appt.updatedAt.getTime())
    ) {
      throw new InvalidAppointmentStateException(CHANGED_SINCE_READ_MSG);
    }

    if (
      appt.status === AppointmentStatus.CANCELLED ||
      appt.status === AppointmentStatus.NO_SHOW ||
      appt.status === AppointmentStatus.COMPLETED ||
      appt.status === AppointmentStatus.LEFT
    ) {
      throw new InvalidAppointmentStateException(
        `Không thể hủy lịch hẹn ở trạng thái "${STATUS_LABEL[appt.status]}"`,
      );
    }
    if (appt.status === AppointmentStatus.IN_PROGRESS) {
      // BR-APPT-011
      throw new InvalidAppointmentStateException(
        'Không thể hủy lịch khi bệnh nhân đang khám — hãy kết thúc hoặc hủy lượt khám trước',
      );
    }

    // BR-APPT-009 / 010 — authorization windows
    const now = Date.now();
    let lateCheckedInCancel = false;
    if (this.isRowScopedDentist(actor)) {
      // A plain dentist may only cancel their OWN appointments. The old
      // check here was `dentistId === actor.sub`, and fell through to the
      // receptionist/admin branch (only a "before start" check, no
      // ownership check at all) for anything else — including another
      // dentist's appointment, which a dentist could then cancel freely.
      if (appt.dentistId !== actor.sub) {
        throw new AppointmentNotFoundException(appointmentId);
      }
      const hoursUntil = (appt.startAt.getTime() - now) / (1000 * 60 * 60);
      if (hoursUntil < 24) {
        // BR-APPT-009
        throw new InvalidAppointmentStateException(
          'Bác sĩ chỉ được hủy lịch trước giờ hẹn ít nhất 24 giờ — hãy nhờ lễ tân hủy',
        );
      }
    } else if (now >= appt.startAt.getTime()) {
      // BR-APPT-025: a CHECKED_IN patient who leaves before being seen can't
      // be marked no-show (they did arrive), so cancel is the only way out —
      // without this the appointment stayed CHECKED_IN in the queue forever.
      if (appt.status !== AppointmentStatus.CHECKED_IN) {
        // BR-APPT-010
        throw new InvalidAppointmentStateException(
          'Đã qua giờ hẹn nên không thể hủy — nếu bệnh nhân không đến, hãy đánh vắng mặt',
        );
      }
      if ((dto.reason?.trim().length ?? 0) < LATE_CANCEL_REASON_MIN_LENGTH) {
        throw new InvalidAppointmentStateException(
          `Hủy lịch đã check-in sau giờ hẹn cần lý do (ít nhất ${LATE_CANCEL_REASON_MIN_LENGTH} ký tự)`,
        );
      }
      lateCheckedInCancel = true;
    }

    const updated = await this.prisma.$transaction(async tx => {
      // See checkIn() above — same guarded-write race protection; a visit
      // moved between the read and this write is not cancelled blindly.
      const cancelResult = await tx.appointment.updateMany({
        where: this.unchangedSince(appt),
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: actor.sub,
          cancelledReason: dto.reason,
          updatedBy: actor.sub,
        },
      });
      if (cancelResult.count === 0) {
        throw new InvalidAppointmentStateException(STALE_APPOINTMENT_MSG);
      }
      const u = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
      await closeQueueEntry(tx, appointmentId, 'CANCELLED', actor.sub);

      // Cascade: BD-0008 — if Encounter is in_progress, mark CANCELLED.
      // Handled here in same tx so ROLLBACK rolls back both. Sync emit below.
      await tx.encounter.updateMany({
        where: { appointmentId, status: AppointmentStatus.IN_PROGRESS },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: actor.sub,
          cancelledReason: 'appointment cancelled',
        },
      });

      return u;
    });

    await this.audit.log({
      action: 'APPOINTMENT_CANCELLED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'appointment',
      targetId: appointmentId,
      metadata: lateCheckedInCancel
        ? { reason: dto.reason, lateCheckedInCancel: true }
        : { reason: dto.reason },
    });

    // Sync emit — ADR-0007
    this.events.emit(APPOINTMENT_CANCELLED_EVENT, {
      appointmentId: updated.id,
      patientId: updated.patientId,
      dentistId: updated.dentistId,
      cancelledAt: updated.cancelledAt ?? new Date(),
      cancelledBy: actor.sub,
      reason: dto.reason,
    } satisfies AppointmentCancelledEvent);

    return updated;
  }

  async markNoShow(appointmentId: string, dto: NoShowDto, actor: JwtPayload) {
    const appt = await this.requireAppointment(appointmentId);

    // Row-level: dentist can only mark their own appointments no-show. Added
    // alongside granting dentist the appointment.no_show permission itself
    // (previously the route always 403'd for dentist, making this a moot
    // check) — without this, that grant alone would have newly exposed the
    // same missing-ownership-check bug already fixed for update/reschedule/
    // cancel/startEncounter above.
    if (this.isRowScopedDentist(actor) && appt.dentistId !== actor.sub) {
      throw new AppointmentNotFoundException(appointmentId);
    }

    // BR-APPT-025 — manual no_show only from scheduled/confirmed
    if (
      appt.status !== AppointmentStatus.SCHEDULED &&
      appt.status !== AppointmentStatus.CONFIRMED
    ) {
      throw new InvalidAppointmentStateException(
        `Không thể đánh vắng mặt lịch hẹn ở trạng thái "${STATUS_LABEL[appt.status]}"`,
      );
    }
    // A patient can't miss a visit that hasn't started yet; one who calls
    // ahead to say they won't come is a cancellation.
    const now = new Date();
    if (now < appt.startAt) {
      throw new InvalidAppointmentStateException(
        'Chưa đến giờ hẹn, hãy dùng Hủy lịch nếu khách báo không đến',
      );
    }
    // Not before the visit shows "Quá giờ" (+15'): the patient may be on the way.
    const latestStart = new Date(now.getTime() - MANUAL_NO_SHOW_AFTER_MIN * 60_000);
    if (appt.startAt > latestStart) {
      throw new InvalidAppointmentStateException(
        `Chỉ đánh vắng mặt khi đã quá giờ hẹn ${MANUAL_NO_SHOW_AFTER_MIN} phút — bệnh nhân có thể đang đến`,
      );
    }

    // See checkIn() above — same guarded-write race protection; the time
    // filter also covers a concurrent reschedule to a later start.
    const noShowResult = await this.prisma.appointment.updateMany({
      where: { id: appointmentId, status: appt.status, startAt: { lte: latestStart } },
      data: {
        status: AppointmentStatus.NO_SHOW,
        noShowAt: new Date(),
        cancelledReason: dto.reason,
        updatedBy: actor.sub,
      },
    });
    if (noShowResult.count === 0) {
      throw new InvalidAppointmentStateException(STALE_APPOINTMENT_MSG);
    }
    const updated = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });

    await this.audit.log({
      action: 'APPOINTMENT_NO_SHOW',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'appointment',
      targetId: appointmentId,
      metadata: { reason: dto.reason, manual: true },
    });

    return updated;
  }

  /**
   * Undo a no-show (marked by hand or by the cron) on the visit's clinic
   * day: the patient called or turned up. Back to SCHEDULED/CONFIRMED as
   * before, provided the slot the no-show released is still free. The cron
   * then leaves the visit alone until the day is over (autoMarkNoShow).
   */
  async undoNoShow(appointmentId: string, dto: StatusReasonDto, actor: JwtPayload) {
    const appt = await this.requireAppointment(appointmentId);
    if (this.isRowScopedDentist(actor) && appt.dentistId !== actor.sub) {
      throw new AppointmentNotFoundException(appointmentId);
    }
    const reason = this.statusReason(dto.reason, 'Hoàn tác vắng mặt');
    if (appt.status !== AppointmentStatus.NO_SHOW) {
      throw new InvalidAppointmentStateException(
        `Chỉ hoàn tác được lịch đang vắng mặt (lịch đang ở trạng thái "${STATUS_LABEL[appt.status]}")`,
      );
    }
    if (!this.isClinicToday(appt.startAt)) {
      throw new InvalidAppointmentStateException('Chỉ hoàn tác vắng mặt trong ngày hẹn');
    }
    const restored = this.bookedStatus(appt);

    return this.prisma.$transaction(async tx => {
      await this.assertSlotStillFree(tx, appt, actor);
      const res = await this.slotSafe(() =>
        tx.appointment.updateMany({
          where: this.unchangedSince(appt),
          data: { status: restored, noShowAt: null, cancelledReason: null, updatedBy: actor.sub },
        }),
      );
      if (res.count === 0) {
        throw new InvalidAppointmentStateException(STALE_APPOINTMENT_MSG);
      }
      await this.auditInTx(tx, actor, appointmentId, NO_SHOW_REVERTED_ACTION, {
        reason,
        restoredStatus: restored,
        noShowReason: appt.cancelledReason,
        noShowAt: appt.noShowAt?.toISOString() ?? null,
      });
      return tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    });
  }

  /**
   * Cron-driven bulk auto-no-show (BR-APPT-012). Idempotent. Due once
   * now > max(startAt + check-in window, endAt) + AUTO_NO_SHOW_GRACE_MIN; a
   * visit whose no-show was undone waits until its clinic day is over.
   */
  async autoMarkNoShow() {
    const now = new Date();
    const graceMs = AUTO_NO_SHOW_GRACE_MIN * 60_000;
    const cutoff = new Date(now.getTime() - CHECKIN_WINDOW_AFTER_MIN * 60_000 - graceMs);
    const endCutoff = new Date(now.getTime() - graceMs);

    const due: Prisma.AppointmentWhereInput = {
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
      // now > max(startAt + window, endAt) + grace
      startAt: { lt: cutoff },
      endAt: { lt: endCutoff },
      deletedAt: null,
    };
    // The ids are read first so each appointment gets its own history entry
    // (BR-APPT-034). The write re-states the whole filter, so a check-in that
    // lands between the two queries is not overwritten with NO_SHOW.
    const candidates = await this.prisma.appointment.findMany({
      where: due,
      select: { id: true, startAt: true },
    });
    if (candidates.length === 0) return { updated: 0 };
    const reverted = new Set(
      (
        await this.prisma.auditLog.findMany({
          where: {
            action: NO_SHOW_REVERTED_ACTION,
            targetId: { in: candidates.map(a => a.id) },
          },
          select: { targetId: true },
        })
      ).map(r => r.targetId),
    );
    const todayStart = startOfClinicDay(clinicDateOnly(now));
    const ids = candidates
      .filter(a => !reverted.has(a.id) || a.startAt < todayStart)
      .map(a => a.id);
    if (ids.length === 0) return { updated: 0 };
    const updated = await this.prisma.appointment.updateMany({
      where: { ...due, id: { in: ids } },
      data: {
        status: AppointmentStatus.NO_SHOW,
        noShowAt: now,
        updatedBy: null,
      },
    });
    if (updated.count === 0) return { updated: 0 };

    // Some rows changed in between: audit only the ones this run marked.
    const marked =
      updated.count === ids.length
        ? ids
        : (
            await this.prisma.appointment.findMany({
              where: { id: { in: ids }, status: AppointmentStatus.NO_SHOW, noShowAt: now },
              select: { id: true },
            })
          ).map(a => a.id);
    // One batched write for the history entries (same columns as AuditService.log).
    await this.prisma.auditLog.createMany({
      data: marked.map(id => ({
        action: 'APPOINTMENT_AUTO_NO_SHOW',
        actorUserId: null,
        targetType: 'appointment',
        targetId: id,
        metadata: { cutoff: cutoff.toISOString(), graceMin: AUTO_NO_SHOW_GRACE_MIN },
      })),
    });

    return { updated: updated.count };
  }

  /**
   * End of the clinic day: a patient still CHECKED_IN from an earlier day
   * never saw the dentist, so the visit is closed as LEFT with its queue
   * entry — a forgotten entry would otherwise keep the dentist "busy" in the
   * queue the next day. IN_PROGRESS visits are left alone: they own an
   * encounter (medical record) that only the dentist may close.
   */
  async closeStaleCheckIns() {
    const today = clinicDateOnly();
    const dayStart = startOfClinicDay(today);
    const stale = await this.prisma.appointment.findMany({
      where: { status: AppointmentStatus.CHECKED_IN, startAt: { lt: dayStart }, deletedAt: null },
      select: { id: true },
    });
    let closed = 0;
    let failed = 0;
    for (const { id } of stale) {
      try {
        const done = await this.prisma.$transaction(async tx => {
          const res = await tx.appointment.updateMany({
            where: { id, status: AppointmentStatus.CHECKED_IN, startAt: { lt: dayStart } },
            data: {
              status: AppointmentStatus.LEFT,
              leftAt: new Date(),
              leftReason: END_OF_DAY_LEFT_REASON,
              updatedBy: null,
            },
          });
          if (res.count === 0) return false;
          await closeQueueEntry(tx, id, 'LEFT', null);
          return true;
        });
        if (!done) continue;
        closed++;
        await this.audit.log({
          action: 'APPOINTMENT_LEFT',
          actorUserId: null,
          targetType: 'appointment',
          targetId: id,
          metadata: { reason: END_OF_DAY_LEFT_REASON, auto: true },
        });
      } catch (err: unknown) {
        // One bad row must not stop the others; it is retried next night.
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`closeStaleCheckIns: appointment ${id} not closed: ${msg}`);
      }
    }

    // Entries of earlier days still open whose visit has moved on (or was
    // closed above): nobody can be waiting or called for a past day. An
    // entry whose visit is still CHECKED_IN (its close failed above) stays
    // open with it, so the two never disagree.
    const entries = await this.prisma.queueEntry.updateMany({
      where: {
        doneAt: null,
        queueDate: { lt: new Date(today) },
        OR: [
          { appointment: { status: { not: AppointmentStatus.CHECKED_IN } } },
          { appointment: { deletedAt: { not: null } } },
        ],
      },
      data: {
        doneAt: new Date(),
        closeReason: 'LEFT',
        status: QueueStatus.LEFT,
        updatedBy: null,
      },
    });
    if (closed || failed || entries.count) {
      this.logger.log(
        `closeStaleCheckIns: ${closed} check-ins closed, ${failed} failed, ${entries.count} other queue entries closed`,
      );
    }
    return { appointments: closed, failed, queueEntries: entries.count };
  }

  async reschedule(appointmentId: string, dto: RescheduleAppointmentDto, actor: JwtPayload) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { services: { select: { serviceId: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!appt || appt.deletedAt) throw new AppointmentNotFoundException(appointmentId);

    // Row-level: dentist can only reschedule their own appointments.
    if (this.isRowScopedDentist(actor) && appt.dentistId !== actor.sub) {
      throw new AppointmentNotFoundException(appointmentId);
    }

    // Only a not-yet-arrived appointment can move. CHECKED_IN / IN_PROGRESS
    // mean the patient is already at the clinic (or in the chair).
    if (
      appt.status !== AppointmentStatus.SCHEDULED &&
      appt.status !== AppointmentStatus.CONFIRMED
    ) {
      throw new InvalidAppointmentStateException(
        `Không thể đổi lịch hẹn ở trạng thái "${STATUS_LABEL[appt.status]}"`,
      );
    }
    if (appt.rescheduleCount >= 3) {
      throw new RescheduleLimitReachedException();
    }

    const newStart = new Date(dto.newStartsAt);
    const newEnd = new Date(dto.newEndsAt);
    if (newEnd.getTime() <= newStart.getTime()) {
      throw new BackDatedAppointmentException();
    }
    if (newStart.getTime() <= Date.now() + 60_000) {
      throw new BackDatedAppointmentException();
    }
    this.assertVisitLength(newStart, newEnd);
    const newDentistId = dto.newDentistId ?? appt.dentistId;
    if (this.isRowScopedDentist(actor)) {
      // A dentist moves their own bookings only within their own calendar.
      if (newDentistId !== actor.sub) {
        throw new ForbiddenException('Bác sĩ chỉ đổi lịch trong lịch làm việc của chính mình');
      }
      // BR-APPT-009, as for cancelling: at least 24 h ahead. Front desk and
      // admin are not limited.
      if (appt.startAt.getTime() - Date.now() < DAY_MS) {
        throw new InvalidAppointmentStateException(
          'Bác sĩ chỉ được đổi lịch trước giờ hẹn ít nhất 24 giờ — hãy nhờ lễ tân đổi',
        );
      }
    }
    // Also when the dentist stays: one now on leave, suspended or locked out
    // takes no bookings (BR-STAFF-006).
    await this.validateDentist(newDentistId);

    // BR-APPT-030/031, as on create: a new dentist or day re-plans the visit
    // (that dentist must perform every booked service that day; their own
    // durations and the buffers apply). Booked prices stay (ADR-0009 D6).
    const newDay = clinicDateOnly(newStart);
    const serviceIds = appt.services.map(sv => sv.serviceId);
    const replanned =
      serviceIds.length > 0 &&
      (newDentistId !== appt.dentistId || newDay !== clinicDateOnly(appt.startAt))
        ? await this.planVisit(newDentistId, serviceIds, newDay, { activeServicesOnly: false })
        : null;
    const minutesOf = (from: Date, to: Date) =>
      Math.round((to.getTime() - from.getTime()) / 60_000);
    let planData: Prisma.AppointmentUpdateManyMutationInput = {};
    if (serviceIds.length > 0) {
      const planned = replanned?.durationMin ?? appt.calculatedDurationMin;
      const expected = planned ?? minutesOf(appt.startAt, appt.endAt);
      // A length already overridden carries its reason while neither the
      // length nor the services' total changes.
      const keepsOverride =
        planned === appt.calculatedDurationMin &&
        minutesOf(newStart, newEnd) === minutesOf(appt.startAt, appt.endAt);
      const overrideReason = this.checkDurationOverride(
        { durationMin: expected },
        newStart,
        newEnd,
        dto.durationOverrideReason ??
          (keepsOverride ? (appt.durationOverrideReason ?? undefined) : undefined),
      );
      planData = {
        calculatedDurationMin: expected,
        durationOverrideReason: overrideReason,
        ...(replanned
          ? {
              bufferBeforeMin: replanned.bufferBeforeMin,
              bufferAfterMin: replanned.bufferAfterMin,
            }
          : {}),
      };
    }
    const buffers = replanned ?? {
      bufferBeforeMin: appt.bufferBeforeMin ?? 0,
      bufferAfterMin: appt.bufferAfterMin ?? 0,
    };

    // Single tx under advisory lock to serialize overlap checks (R2-7).
    const result = await this.prisma.$transaction(async tx => {
      await this.lockDentist(tx, newDentistId);
      await this.lockPatient(tx, appt.patientId);
      await this.ensureSlotAvailable(newDentistId, newStart, newEnd, actor, appt.id, tx, {
        bufferBeforeMin: buffers.bufferBeforeMin,
        bufferAfterMin: buffers.bufferAfterMin,
      });
      await this.ensurePatientFree(appt.patientId, newStart, newEnd, appt.id, tx);

      // See checkIn() — guarded write, so a concurrent check-in/cancel or a
      // second reschedule (which would bypass the limit) can't be overwritten.
      const rescheduleResult = await tx.appointment.updateMany({
        where: {
          id: appointmentId,
          status: appt.status,
          rescheduleCount: appt.rescheduleCount,
        },
        data: {
          dentistId: newDentistId,
          startAt: newStart,
          endAt: newEnd,
          ...planData,
          rescheduleCount: { increment: 1 },
          lastRescheduleAt: new Date(),
          // A confirmation was for the old time — the new one needs its own.
          status: AppointmentStatus.SCHEDULED,
          confirmedAt: null,
          confirmedBy: null,
          // The day-before reminder was for the old time (booking notices).
          reminderSentAt: null,
          updatedBy: actor.sub,
        },
      });
      if (rescheduleResult.count === 0) {
        throw new InvalidAppointmentStateException(STALE_APPOINTMENT_MSG);
      }
      const updated = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });

      await tx.appointmentRescheduleLog.create({
        data: {
          appointmentId,
          oldDentistId: appt.dentistId,
          oldStartAt: appt.startAt,
          oldEndAt: appt.endAt,
          newDentistId,
          newStartAt: newStart,
          newEndAt: newEnd,
          reason: dto.reason,
          changedBy: actor.sub,
        },
      });

      return updated;
    }, LOCKING_TX_OPTIONS);

    await this.audit.log({
      action: 'APPOINTMENT_RESCHEDULED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'appointment',
      targetId: appointmentId,
      metadata: {
        oldStart: appt.startAt,
        newStart,
        rescheduleCount: result.rescheduleCount,
        ...(result.durationOverrideReason
          ? { durationOverrideReason: result.durationOverrideReason }
          : {}),
      },
    });
    this.events.emit(APPOINTMENT_RESCHEDULED_EVENT, {
      appointmentId,
      oldStartAt: appt.startAt,
      newStartAt: newStart,
      oldDentistId: appt.dentistId,
      newDentistId,
    } satisfies AppointmentRescheduledEvent);

    return result;
  }

  // ==========================================================================
  // Availability
  // ==========================================================================

  async getAvailability(q: AvailabilityQueryDto) {
    return this.availability.dayAvailability(
      q.dentistId,
      q.date,
      q.slotDuration,
      { beforeMin: q.bufferBeforeMin, afterMin: q.bufferAfterMin },
      q.excludeAppointmentId,
    );
  }

  async getWaitingQueue(
    dentistId: string | undefined,
    date: string | undefined,
    actor: JwtPayload,
  ) {
    const target = date ?? clinicDateOnly();
    const dayStart = startOfClinicDay(target);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Row-level: a dentist omitting dentistId used to see the whole
    // clinic's checked-in queue (patient names + appointment ids of every
    // dentist), not just their own — force-scope regardless of the query
    // param, same pattern as billing.listInvoices' dentistId fix.
    const where: Prisma.AppointmentWhereInput = {
      status: AppointmentStatus.CHECKED_IN,
      dentistId: this.isRowScopedDentist(actor) ? actor.sub : dentistId,
      startAt: { gte: dayStart, lt: dayEnd },
      deletedAt: null,
    };

    const rows = await this.prisma.appointment.findMany({
      where,
      orderBy: { checkedInAt: 'asc' },
      include: { patient: { select: { id: true, code: true, fullName: true } } },
    });

    const now = Date.now();
    return {
      data: rows.map(r => {
        const waited = r.checkedInAt ? Math.round((now - r.checkedInAt.getTime()) / 60_000) : 0;
        return {
          id: r.id,
          patient: r.patient,
          appointmentStartAt: r.startAt,
          checkedInAt: r.checkedInAt,
          waitingMinutes: waited,
        };
      }),
    };
  }

  // ==========================================================================
  // Appointment detail & update
  // ==========================================================================

  /**
   * GET /appointments/:id — fetch single appointment with patient + dentist names.
   */
  async getById(id: string, actor: JwtPayload) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, deletedAt: null },
      include: {
        patient: { select: { id: true, code: true, fullName: true, primaryPhone: true } },
        dentist: { select: { id: true, fullName: true } },
        // The FK lives on Encounter (appointmentId), not Appointment — the
        // frontend navigates from an in-progress/completed appointment to
        // its encounter and needs this id even though nothing here
        // otherwise displays details about the encounter itself.
        encounter: { select: { id: true } },
        services: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!appt) throw new AppointmentNotFoundException(id);

    // Row-level: dentist can only read their own appointments.
    if (this.isRowScopedDentist(actor) && appt.dentistId !== actor.sub) {
      throw new AppointmentNotFoundException(id);
    }

    return appt;
  }

  /**
   * PATCH /appointments/:id — update non-scheduling fields (reason, notes, chiefComplaint).
   * To change date/time/dentist, use /appointments/:id/reschedule instead.
   */
  async update(id: string, dto: UpdateAppointmentDto, actor: JwtPayload) {
    const appt = await this.requireAppointment(id);

    // Row-level: dentist can only update their own appointments.
    if (this.isRowScopedDentist(actor) && appt.dentistId !== actor.sub) {
      throw new AppointmentNotFoundException(id);
    }

    const updatable: AppointmentStatus[] = [
      AppointmentStatus.SCHEDULED,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.CHECKED_IN,
    ];
    if (!updatable.includes(appt.status)) {
      throw new InvalidAppointmentStateException(
        `Không thể sửa lịch hẹn ở trạng thái "${STATUS_LABEL[appt.status]}"`,
      );
    }

    // Each field is stored on its own (chiefComplaint used to overwrite
    // reason); undefined leaves the column unchanged.
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        reason: dto.reason !== undefined ? blankToNull(dto.reason) : undefined,
        chiefComplaint:
          dto.chiefComplaint !== undefined ? blankToNull(dto.chiefComplaint) : undefined,
        appointmentType: dto.appointmentType,
        notes: dto.notes,
        updatedBy: actor.sub,
      },
    });

    await this.audit.log({
      action: 'APPOINTMENT_UPDATED',
      targetType: 'appointment',
      targetId: id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      metadata: {
        reason: dto.reason,
        chiefComplaint: dto.chiefComplaint,
        appointmentType: dto.appointmentType,
        notes: dto.notes,
      },
    });

    return updated;
  }

  /**
   * `{ id, fullName }` as before, plus the profile's calendar colour and
   * practice status. Accounts that are not deactivated (PENDING_SETUP
   * included) with the dentist role. `booking` (default) lists who takes new
   * appointments (BR-STAFF-006: ACTIVE practice, employee not on leave);
   * `schedule` also lists suspended dentists and dentists on leave, whose
   * working hours and time off stay manageable. A dentist role without a
   * profile (e.g. given on the Users page) stays listed, as validateDentist
   * still accepts it, with `practiceStatus: null`; the Users page flags such
   * accounts so a profile gets created — hiding them would silently drop a
   * bookable dentist from every picker.
   */
  async listDentistOptions(scope: 'booking' | 'schedule' = 'booking') {
    const rows = await this.prisma.user.findMany({
      where: {
        ...SCHEDULABLE_ACCOUNT_WHERE,
        userRoles: {
          some: {
            role: {
              code: 'dentist',
              deletedAt: null,
            },
          },
        },
        OR: [{ dentistProfile: null }, { dentistProfile: dentistProfileFilter(scope) }],
      },
      select: {
        id: true,
        fullName: true,
        dentistProfile: { select: { calendarColor: true, practiceStatus: true } },
      },
      orderBy: {
        fullName: 'asc',
      },
    });
    return rows.map(({ dentistProfile, ...u }) => ({
      ...u,
      calendarColor: dentistProfile?.calendarColor ?? null,
      practiceStatus: dentistProfile?.practiceStatus ?? null,
    }));
  }

  async list(q: ListAppointmentsQueryDto, actor: JwtPayload) {
    // BR-APPT-024 row-level scope — was inferred from an unrelated
    // patient.* permission combo instead of checking appointment.read.own/
    // .any directly (as getById() correctly does). Coincidentally correct
    // for the 3 seeded roles today, but fragile: a future role with
    // patient.read alone would be silently scoped here regardless of its
    // actual appointment permissions.
    const isDentist = this.isRowScopedDentist(actor);
    const where: Prisma.AppointmentWhereInput = {
      deletedAt: null,
      ...(isDentist ? { dentistId: actor.sub } : q.dentistId ? { dentistId: q.dentistId } : {}),
      ...(q.patientId ? { patientId: q.patientId } : {}),
      // Calendar filters cover the clinic's complete Vietnam day. Explicit
      // timestamps already supplied by calendar views retain their boundaries.
      ...(q.from || q.to
        ? {
            startAt: {
              ...(q.from ? { gte: startOfClinicDay(q.from) } : {}),
              ...(q.to ? { lte: endOfClinicDay(q.to) } : {}),
            },
          }
        : {}),
      ...(q.status?.length ? { status: { in: q.status } } : {}),
      ...(q.q
        ? {
            OR: [
              { patient: { fullName: { contains: q.q, mode: 'insensitive' } } },
              { patient: { code: { contains: q.q, mode: 'insensitive' } } },
              { patient: { primaryPhone: { contains: q.q } } },
              { notes: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    // One patient's visits without a start date ("recent appointments"):
    // newest first, so the first page is the latest visits, not the oldest.
    const order = q.sort ?? (q.patientId && !q.from ? 'desc' : 'asc');
    const pageSize = q.pageSize ?? 50;
    // Cursor paging is not a snapshot: a booking moved or added between two
    // page reads may be skipped or seen twice (the client de-duplicates ids).
    const items = await this.prisma.appointment.findMany({
      where,
      // id breaks ties so cursor paging neither repeats nor skips rows
      // booked at the same time (the list/calendar pages read every page).
      orderBy: [{ startAt: order }, { id: order }],
      take: pageSize + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        patient: { select: { id: true, code: true, fullName: true, primaryPhone: true } },
        dentist: { select: { id: true, fullName: true } },
        // The FK lives on Encounter (appointmentId), not Appointment — the
        // frontend navigates from an in-progress/completed appointment to
        // its encounter and needs this id even though nothing here
        // otherwise displays details about the encounter itself.
        encounter: { select: { id: true } },
      },
    });
    const hasMore = items.length > pageSize;
    const trimmed = hasMore ? items.slice(0, pageSize) : items;
    return {
      data: trimmed,
      pagination: {
        pageSize,
        nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
        hasMore,
      },
    };
  }

  async listToday(actor: JwtPayload) {
    const dayStart = startOfClinicDay(clinicDateOnly());
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const isDentist = this.isRowScopedDentist(actor);
    const items = await this.prisma.appointment.findMany({
      where: {
        startAt: { gte: dayStart, lt: dayEnd },
        deletedAt: null,
        ...(isDentist ? { dentistId: actor.sub } : {}),
      },
      orderBy: { startAt: 'asc' },
      include: {
        patient: { select: { id: true, code: true, fullName: true, primaryPhone: true } },
        dentist: { select: { id: true, fullName: true } },
        // The FK lives on Encounter (appointmentId), not Appointment — the
        // frontend navigates from an in-progress/completed appointment to
        // its encounter and needs this id even though nothing here
        // otherwise displays details about the encounter itself.
        encounter: { select: { id: true } },
      },
    });
    return { data: items };
  }

  // ==========================================================================
  // Working schedule + time-off
  // ==========================================================================

  async createWorkingSchedule(dto: CreateWorkingScheduleDto, actor: JwtPayload) {
    const { created } = await this.bulkCreateWorkingSchedules(
      {
        dentistId: dto.dentistId,
        daysOfWeek: [dto.dayOfWeek],
        blocks: [{ startTime: dto.startTime, endTime: dto.endTime, shiftType: dto.shiftType }],
        slotDurationMin: dto.slotDurationMin,
        validFrom: dto.validFrom,
        validTo: dto.validTo,
        isPaidShift: dto.isPaidShift,
      },
      actor,
    );
    return created[0];
  }

  /**
   * Several weekdays × several blocks (e.g. Mon–Sat, 08:00-12:00 and
   * 13:30-19:00) in one transaction: all rows are saved or none is.
   * New hours only add bookable time, so no booking can become affected.
   */
  async bulkCreateWorkingSchedules(dto: BulkCreateWorkingSchedulesDto, actor: JwtPayload) {
    this.assertOwnScheduleOrStaff(actor, dto.dentistId);
    const blocks = [...dto.blocks].sort(
      (a, b) => this.toMinutes(a.startTime) - this.toMinutes(b.startTime),
    );
    blocks.forEach((b, i) => {
      this.assertTimeOrder(b.startTime, b.endTime);
      const prev = blocks[i - 1];
      if (prev && this.toMinutes(b.startTime) < this.toMinutes(prev.endTime)) {
        throw new BadRequestException(
          `Các khung giờ không được chồng nhau: ${prev.startTime}-${prev.endTime} và ${b.startTime}-${b.endTime}`,
        );
      }
    });
    const validFrom = this.dateOnly(dto.validFrom);
    const validTo = dto.validTo ? this.dateOnly(dto.validTo) : null;
    this.assertValidity(validFrom, validTo);
    await this.validateDentist(dto.dentistId, { forBooking: false });

    const created = await this.prisma.$transaction(async tx => {
      await this.lockDentist(tx, dto.dentistId);
      const rows = [];
      for (const dayOfWeek of [...dto.daysOfWeek].sort((a, b) => a - b)) {
        for (const b of blocks) {
          await this.assertScheduleFits(tx, {
            dentistId: dto.dentistId,
            dayOfWeek,
            startTime: b.startTime,
            endTime: b.endTime,
            validFrom,
            validTo,
          });
          rows.push(
            await tx.workingSchedule.create({
              data: {
                dentistId: dto.dentistId,
                dayOfWeek,
                startTime: this.toPgTime(b.startTime),
                endTime: this.toPgTime(b.endTime),
                slotDurationMin: dto.slotDurationMin ?? 30,
                validFrom,
                validTo,
                isPaidShift: dto.isPaidShift ?? true,
                shiftType: b.shiftType ?? this.shiftTypeOf(b.startTime, b.endTime),
                createdBy: actor.sub,
              },
            }),
          );
        }
      }
      return rows;
    }, LOCKING_TX_OPTIONS);

    for (const row of created) {
      await this.audit.log({
        action: 'WORKING_SCHEDULE_CREATED',
        actorUserId: actor.sub,
        actorEmail: actor.email,
        targetType: 'working_schedule',
        targetId: row.id,
        metadata: {
          dentistId: dto.dentistId,
          dayOfWeek: row.dayOfWeek,
          startTime: row.startTime ? this.toTimeString(row.startTime) : undefined,
          endTime: row.endTime ? this.toTimeString(row.endTime) : undefined,
        },
      });
    }
    return { created };
  }

  /**
   * Edit a weekly schedule row. Past days keep the hours they had (payroll
   * reads them): a change to a schedule already in effect applies from
   * `effectiveFrom` (default today) — the row ends the day before and a new
   * row carries the new hours. A row not started yet is edited in place.
   * `validTo` alone ends (or extends) the row. Bookings the new calendar no
   * longer allows are returned, never cancelled.
   */
  async updateWorkingSchedule(id: string, dto: UpdateWorkingScheduleDto, actor: JwtPayload) {
    const row = await this.requireActiveSchedule(id, actor);
    const today = this.dateOnly(clinicDateOnly());
    const started = row.validFrom <= today;
    const current = {
      dayOfWeek: row.dayOfWeek,
      startTime: this.toTimeString(row.startTime),
      endTime: this.toTimeString(row.endTime),
      slotDurationMin: row.slotDurationMin,
      shiftType: row.shiftType,
      isPaidShift: row.isPaidShift,
    };
    const next = {
      dayOfWeek: dto.dayOfWeek ?? current.dayOfWeek,
      startTime: dto.startTime ?? current.startTime,
      endTime: dto.endTime ?? current.endTime,
      slotDurationMin: dto.slotDurationMin ?? current.slotDurationMin,
      shiftType: dto.shiftType ?? current.shiftType,
      isPaidShift: dto.isPaidShift ?? current.isPaidShift,
    };
    this.assertTimeOrder(next.startTime, next.endTime);
    const validTo =
      dto.validTo === undefined
        ? row.validTo
        : dto.validTo === null
          ? null
          : this.dateOnly(dto.validTo);
    const hoursChanged = (Object.keys(next) as Array<keyof typeof next>).some(
      k => next[k] !== current[k],
    );

    // In place: nothing but validTo changes, or the row has not started yet
    // (or starts on the day the change applies) — no past day is rewritten.
    let effectiveFrom = row.validFrom;
    if (hoursChanged) {
      effectiveFrom = dto.effectiveFrom
        ? this.dateOnly(dto.effectiveFrom)
        : started
          ? today
          : row.validFrom;
      if (effectiveFrom < today && started) {
        throw new BadRequestException(
          'Chỉ áp dụng thay đổi từ hôm nay trở đi; các ngày đã qua giữ nguyên giờ cũ để tính lương',
        );
      }
      if (effectiveFrom < row.validFrom) effectiveFrom = row.validFrom;
      if (row.validTo && effectiveFrom > row.validTo) {
        throw new BadRequestException(
          `Ngày áp dụng ${this.viDate(effectiveFrom)} nằm sau ngày hết hiệu lực ${this.viDate(row.validTo)} của lịch`,
        );
      }
    } else {
      // Ending a running schedule: its last day may be yesterday at the
      // earliest (today onwards stops), never earlier (payroll history).
      const yesterday = new Date(today.getTime() - DAY_MS);
      const minEnd = started && row.validFrom < yesterday ? yesterday : row.validFrom;
      if (validTo && validTo < minEnd) {
        throw new BadRequestException(
          `Ngày làm việc cuối phải từ ${this.viDate(minEnd)} trở đi (không sửa các ngày đã qua)`,
        );
      }
    }
    const split = hoursChanged && effectiveFrom > row.validFrom;
    const newFrom = split ? effectiveFrom : row.validFrom;
    this.assertValidity(newFrom, validTo);
    if (!hoursChanged && (validTo?.getTime() ?? null) === (row.validTo?.getTime() ?? null)) {
      return {
        schedule: row,
        endedSchedule: null,
        affectedAppointments: [],
        affectedBookingRequests: [],
      };
    }

    const result = await this.prisma.$transaction(async tx => {
      await this.lockDentist(tx, row.dentistId);
      await this.assertScheduleFits(
        tx,
        { dentistId: row.dentistId, ...next, validFrom: newFrom, validTo },
        [row.id],
      );
      let endedSchedule = null;
      let schedule;
      if (split) {
        endedSchedule = await tx.workingSchedule.update({
          where: { id: row.id },
          data: { validTo: new Date(effectiveFrom.getTime() - DAY_MS) },
        });
        schedule = await tx.workingSchedule.create({
          data: {
            dentistId: row.dentistId,
            dayOfWeek: next.dayOfWeek,
            startTime: this.toPgTime(next.startTime),
            endTime: this.toPgTime(next.endTime),
            slotDurationMin: next.slotDurationMin,
            validFrom: effectiveFrom,
            validTo,
            isPaidShift: next.isPaidShift,
            shiftType: next.shiftType,
            createdBy: actor.sub,
          },
        });
      } else {
        schedule = await tx.workingSchedule.update({
          where: { id: row.id },
          data: {
            dayOfWeek: next.dayOfWeek,
            startTime: this.toPgTime(next.startTime),
            endTime: this.toPgTime(next.endTime),
            slotDurationMin: next.slotDurationMin,
            shiftType: next.shiftType,
            isPaidShift: next.isPaidShift,
            validTo,
          },
        });
      }
      // Only the old weekday can lose hours; the rest of the range is
      // checked against the calendar as it now stands.
      const checkFrom = hoursChanged
        ? effectiveFrom
        : validTo
          ? new Date(validTo.getTime() + DAY_MS)
          : null;
      const checkTo = this.laterEnd(row.validTo, validTo);
      const impact =
        checkFrom && (!checkTo || checkFrom <= checkTo)
          ? await this.affectedInRange(tx, row.dentistId, row.dayOfWeek, checkFrom, checkTo, {
              wholeFirstDay: checkFrom.getTime() === today.getTime(),
            })
          : { affectedAppointments: [], affectedBookingRequests: [] };
      return { schedule, endedSchedule, ...impact };
    }, LOCKING_TX_OPTIONS);

    await this.audit.log({
      action: 'WORKING_SCHEDULE_UPDATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'working_schedule',
      targetId: row.id,
      metadata: {
        dentistId: row.dentistId,
        before: { ...current, validTo: row.validTo?.toISOString().slice(0, 10) ?? null },
        after: { ...next, validTo: validTo?.toISOString().slice(0, 10) ?? null },
        effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
        newScheduleId: split ? result.schedule.id : undefined,
        affectedAppointmentIds: result.affectedAppointments.map(a => a.id),
      },
    });
    return result;
  }

  /**
   * Remove a schedule that has not started yet (nothing was worked or paid on
   * it). One already in effect is ended instead (PATCH validTo) so payroll
   * keeps its history.
   */
  async deleteWorkingSchedule(id: string, actor: JwtPayload) {
    const row = await this.requireActiveSchedule(id, actor);
    const today = this.dateOnly(clinicDateOnly());
    if (row.validFrom <= today) {
      throw new InvalidAppointmentStateException(
        'Lịch đã bắt đầu hiệu lực nên không xóa được (cần giữ để tính lương). Hãy dùng "Kết thúc" để dừng lịch từ một ngày.',
      );
    }
    const impact = await this.prisma.$transaction(async tx => {
      await this.lockDentist(tx, row.dentistId);
      await tx.workingSchedule.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return this.affectedInRange(tx, row.dentistId, row.dayOfWeek, row.validFrom, row.validTo);
    }, LOCKING_TX_OPTIONS);
    await this.audit.log({
      action: 'WORKING_SCHEDULE_DELETED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'working_schedule',
      targetId: id,
      metadata: {
        dentistId: row.dentistId,
        dayOfWeek: row.dayOfWeek,
        startTime: this.toTimeString(row.startTime),
        endTime: this.toTimeString(row.endTime),
        affectedAppointmentIds: impact.affectedAppointments.map(a => a.id),
      },
    });
    return impact;
  }

  private async requireActiveSchedule(id: string, actor: JwtPayload) {
    const row = await this.prisma.workingSchedule.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new AppointmentNotFoundException(id, 'Không tìm thấy lịch làm việc');
    this.assertOwnScheduleOrStaff(actor, row.dentistId);
    const today = this.dateOnly(clinicDateOnly());
    if (row.validTo && row.validTo < today) {
      throw new InvalidAppointmentStateException(
        'Lịch này đã hết hiệu lực và được giữ nguyên để tính lương; hãy thêm lịch mới',
      );
    }
    return row;
  }

  /**
   * BR-APPT-018: no two weekly rows of a dentist overlap in hours on the same
   * weekday while both are valid; nor may a row overlap a pending/approved
   * one-off shift on a matching date (BR-APPT-026), or availability would
   * offer the same hours twice.
   */
  private async assertScheduleFits(
    db: Prisma.TransactionClient,
    row: {
      dentistId: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      validFrom: Date;
      validTo: Date | null;
    },
    excludeIds: string[] = [],
  ) {
    const oStart = this.toMinutes(row.startTime);
    const oEnd = this.toMinutes(row.endTime);
    const candidates = await db.workingSchedule.findMany({
      where: {
        dentistId: row.dentistId,
        dayOfWeek: row.dayOfWeek,
        deletedAt: null,
        validFrom: { lte: row.validTo ?? new Date('9999-12-31') },
        OR: [{ validTo: null }, { validTo: { gte: row.validFrom } }],
        ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      },
    });
    for (const c of candidates ?? []) {
      const cStart = this.toTimeString(c.startTime);
      const cEnd = this.toTimeString(c.endTime);
      if (oStart < this.toMinutes(cEnd) && this.toMinutes(cStart) < oEnd) {
        throw new ScheduleOverlapException(
          `${DAY_LABELS[row.dayOfWeek]} ${row.startTime}-${row.endTime} trùng lịch đã có ${cStart}-${cEnd} ` +
            `(hiệu lực từ ${this.viDate(c.validFrom)}${c.validTo ? ` đến ${this.viDate(c.validTo)}` : ''}). ` +
            'Hãy sửa hoặc kết thúc lịch cũ trước.',
        );
      }
    }
    const shifts = await db.shiftRegistration.findMany({
      where: {
        dentistId: row.dentistId,
        status: { in: ['PENDING', 'APPROVED'] },
        date: { gte: row.validFrom, ...(row.validTo ? { lte: row.validTo } : {}) },
        deletedAt: null,
      },
    });
    for (const shift of shifts ?? []) {
      if (shift.date.getUTCDay() !== row.dayOfWeek) continue;
      const sStart = this.toMinutes(shift.startTime);
      const sEnd = this.toMinutes(shift.endTime);
      if (oStart < sEnd && sStart < oEnd) {
        throw new InvalidAppointmentStateException(
          `Lịch làm việc trùng ca đăng ký ngày ${shift.date.toISOString().slice(0, 10)} ${shift.startTime}-${shift.endTime}`,
        );
      }
    }
  }

  /** Default shift label of a block: morning, afternoon, evening or full day. */
  private shiftTypeOf(start: string, end: string): 'MORNING' | 'AFTERNOON' | 'NIGHT' | 'FULL_DAY' {
    const s = this.toMinutes(start);
    const e = this.toMinutes(end);
    if (e <= 13 * 60) return 'MORNING';
    if (s >= 18 * 60) return 'NIGHT';
    if (s >= 12 * 60) return 'AFTERNOON';
    return 'FULL_DAY';
  }

  async listWorkingSchedules(dentistId: string | undefined, _actor: JwtPayload) {
    const where: Prisma.WorkingScheduleWhereInput = {
      deletedAt: null,
      ...(dentistId ? { dentistId } : {}),
    };
    return {
      data: await this.prisma.workingSchedule.findMany({
        where,
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }, { validFrom: 'asc' }],
      }),
    };
  }

  async createTimeOff(dto: CreateTimeOffDto, actor: JwtPayload) {
    this.assertOwnScheduleOrStaff(actor, dto.dentistId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException('Thời điểm kết thúc nghỉ phải sau thời điểm bắt đầu');
    }
    // BR-APPT-019: no time-off entirely in the past. One that has already
    // started (e.g. sick since this morning) is still allowed.
    if (endAt.getTime() <= Date.now()) {
      throw new InvalidAppointmentStateException('Không thể ghi nhận nghỉ phép đã kết thúc');
    }
    await this.validateDentist(dto.dentistId, { forBooking: false });
    // BR-SCH-001: whoever can approve records effective time-off directly;
    // anyone else (a dentist asking for leave, front desk) files a request.
    const autoApprove = actor.permissions.includes('time_off.approve');

    const overlapsWindow = {
      dentistId: dto.dentistId,
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      deletedAt: null,
    };
    // Under the dentist's calendar lock (same as create()/reschedule()), so a
    // booking can't land in the window unnoticed between these checks and
    // the insert — it would be missing from affectedAppointments.
    const { created, affectedAppointments } = await this.prisma.$transaction(async tx => {
      await this.lockDentist(tx, dto.dentistId);
      await this.ensureNoOverlappingTimeOff(tx, dto.dentistId, startAt, endAt);
      const patientsInClinic = !autoApprove
        ? 0
        : await tx.appointment.count({
            where: {
              ...overlapsWindow,
              status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS] },
            },
          });
      if (patientsInClinic > 0) {
        throw new InvalidAppointmentStateException(
          `Bác sĩ đang có ${patientsInClinic} bệnh nhân đã check-in/đang khám trong khoảng nghỉ này`,
        );
      }

      // Still-booked appointments are not blocked (sick leave has to be
      // recordable) but returned so front desk can reschedule/cancel them.
      const affectedAppointments = await tx.appointment.findMany({
        where: {
          ...overlapsWindow,
          status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        },
        orderBy: { startAt: 'asc' },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          status: true,
          patient: { select: { id: true, code: true, fullName: true, primaryPhone: true } },
        },
      });

      const created = await tx.timeOff.create({
        data: {
          dentistId: dto.dentistId,
          startAt,
          endAt,
          type: dto.type,
          reason: dto.reason,
          createdBy: actor.sub,
          status: autoApprove ? 'APPROVED' : 'PENDING',
          ...(autoApprove ? { decidedBy: actor.sub, decidedAt: new Date() } : {}),
        },
      });
      return { created, affectedAppointments };
    }, LOCKING_TX_OPTIONS);

    await this.audit.log({
      action: autoApprove ? 'TIME_OFF_CREATED' : 'TIME_OFF_REQUESTED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'time_off',
      targetId: created.id,
      metadata: {
        dentistId: dto.dentistId,
        type: dto.type,
        affectedAppointmentIds: affectedAppointments.map(a => a.id),
      },
    });

    return { ...created, affectedAppointments };
  }

  async listTimeOffs(query: ListTimeOffsQueryDto) {
    return {
      data: await this.prisma.timeOff.findMany({
        where: {
          deletedAt: null,
          ...(query.dentistId ? { dentistId: query.dentistId } : {}),
          ...(query.status ? { status: query.status } : {}),
        },
        orderBy: { startAt: 'desc' },
      }),
    };
  }

  /** BR-SCH-002: at most one pending/approved time-off over any moment. */
  private async ensureNoOverlappingTimeOff(
    tx: Prisma.TransactionClient,
    dentistId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ) {
    const clash = await tx.timeOff.findFirst({
      where: {
        dentistId,
        status: { in: ['PENDING', 'APPROVED'] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (clash) {
      throw new BusinessRuleException(
        'Bác sĩ đã có đơn nghỉ phép (chờ duyệt hoặc đã duyệt) trùng khoảng thời gian này',
        HttpStatus.CONFLICT,
        { timeOffId: clash.id, status: clash.status },
        'TIME_OFF_OVERLAP',
      );
    }
  }

  /** BR-SCH-001: approving makes the time-off block bookings. */
  async approveTimeOff(id: string, dto: DecideTimeOffDto, actor: JwtPayload) {
    const current = await this.prisma.timeOff.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppointmentNotFoundException(id);
    if (current.status !== 'PENDING') {
      throw new InvalidAppointmentStateException(
        `Đơn nghỉ phép ${TIME_OFF_STATUS_LABEL[current.status] ?? current.status}, không còn chờ duyệt`,
      );
    }
    if (current.endAt.getTime() <= Date.now()) {
      throw new InvalidAppointmentStateException('Kỳ nghỉ phép đã kết thúc');
    }
    const { updated, affectedAppointments } = await this.prisma.$transaction(async tx => {
      await this.lockDentist(tx, current.dentistId);
      const window = {
        dentistId: current.dentistId,
        startAt: { lt: current.endAt },
        endAt: { gt: current.startAt },
        deletedAt: null,
      };
      const inClinic = await tx.appointment.count({
        where: {
          ...window,
          status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS] },
        },
      });
      if (inClinic > 0) {
        throw new InvalidAppointmentStateException(
          `Bác sĩ đang có ${inClinic} bệnh nhân đã check-in/đang khám trong khoảng nghỉ này`,
        );
      }
      const affectedAppointments = await this.affectedInWindow(tx, window);
      const updated = await tx.timeOff.update({
        where: { id },
        data: {
          status: 'APPROVED',
          decidedBy: actor.sub,
          decidedAt: new Date(),
          decisionNote: dto.note ?? null,
        },
      });
      return { updated, affectedAppointments };
    }, LOCKING_TX_OPTIONS);
    await this.audit.log({
      action: 'TIME_OFF_APPROVED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'time_off',
      targetId: id,
      metadata: {
        dentistId: current.dentistId,
        affectedAppointmentIds: affectedAppointments.map(a => a.id),
      },
    });
    return { ...updated, affectedAppointments };
  }

  async rejectTimeOff(id: string, dto: DecideTimeOffDto, actor: JwtPayload) {
    const note = dto.note?.trim();
    if (!note || note.length < 5) {
      throw new BadRequestException('Cần nhập lý do từ chối (tối thiểu 5 ký tự)');
    }
    const current = await this.prisma.timeOff.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppointmentNotFoundException(id);
    if (current.status !== 'PENDING') {
      throw new InvalidAppointmentStateException(
        `Đơn nghỉ phép ${TIME_OFF_STATUS_LABEL[current.status] ?? current.status}, không còn chờ duyệt`,
      );
    }
    const updated = await this.prisma.timeOff.update({
      where: { id },
      data: { status: 'REJECTED', decidedBy: actor.sub, decidedAt: new Date(), decisionNote: note },
    });
    await this.audit.log({
      action: 'TIME_OFF_REJECTED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'time_off',
      targetId: id,
      metadata: { dentistId: current.dentistId, note },
    });
    return updated;
  }

  /** The dentist (own) or staff withdraws a pending or not-yet-ended approved time-off. */
  async cancelTimeOff(id: string, actor: JwtPayload) {
    const current = await this.prisma.timeOff.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppointmentNotFoundException(id);
    this.assertOwnScheduleOrStaff(actor, current.dentistId);
    if (current.status !== 'PENDING' && current.status !== 'APPROVED') {
      throw new InvalidAppointmentStateException(
        `Đơn nghỉ phép ${TIME_OFF_STATUS_LABEL[current.status] ?? current.status}`,
      );
    }
    if (current.endAt.getTime() <= Date.now()) {
      throw new InvalidAppointmentStateException('Kỳ nghỉ phép đã kết thúc');
    }
    const updated = await this.prisma.timeOff.update({
      where: { id },
      data: { status: 'CANCELLED', decidedBy: actor.sub, decidedAt: new Date() },
    });
    await this.audit.log({
      action: 'TIME_OFF_CANCELLED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'time_off',
      targetId: id,
      metadata: { dentistId: current.dentistId, previousStatus: current.status },
    });
    return updated;
  }

  private affectedInWindow(tx: Prisma.TransactionClient, window: Prisma.AppointmentWhereInput) {
    return tx.appointment.findMany({
      where: {
        ...window,
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
      },
      orderBy: { startAt: 'asc' },
      select: AFFECTED_APPOINTMENT_SELECT,
    });
  }

  // ==========================================================================
  // Schedule overrides (ADR-0009 phase 3)
  // ==========================================================================

  /**
   * Overrides change a whole day of the calendar: clinic management only
   * (front desk has no schedule.write; a dentist edits the weekly schedule
   * and asks for time-off instead).
   */
  private assertStaff(actor: JwtPayload) {
    if (this.isRowScopedDentist(actor)) {
      throw new ForbiddenException(
        'Chỉ quản trị phòng khám được đóng lịch hoặc đổi giờ làm theo ngày; bác sĩ hãy xin nghỉ phép hoặc sửa lịch làm việc cố định',
      );
    }
  }

  async createScheduleOverride(dto: CreateScheduleOverrideDto, actor: JwtPayload) {
    this.assertStaff(actor);
    if (dto.ranges?.length && dto.kind !== 'CHANGED_HOURS') {
      throw new BadRequestException('Chỉ "Đổi giờ làm" mới nhận nhiều khung giờ');
    }
    const hasTimes = Boolean(dto.startTime) || Boolean(dto.endTime);
    if (hasTimes && !(dto.startTime && dto.endTime)) {
      throw new BadRequestException('Cần nhập cả giờ bắt đầu và giờ kết thúc');
    }
    // CHANGED_HOURS: one or more blocks that together replace the weekly
    // schedule that day (several blocks keep a lunch break).
    const blocks =
      dto.kind === 'CHANGED_HOURS'
        ? (dto.ranges?.length
            ? dto.ranges
            : hasTimes
              ? [{ startTime: dto.startTime!, endTime: dto.endTime! }]
              : []
          ).slice()
        : hasTimes
          ? [{ startTime: dto.startTime!, endTime: dto.endTime! }]
          : [];
    if (dto.kind === 'CHANGED_HOURS' && blocks.length === 0) {
      throw new BadRequestException('Đổi giờ làm cần ít nhất một khung giờ (bắt đầu và kết thúc)');
    }
    blocks.sort((a, b) => this.toMinutes(a.startTime) - this.toMinutes(b.startTime));
    blocks.forEach((b, i) => {
      this.assertTimeOrder(b.startTime, b.endTime);
      const prev = blocks[i - 1];
      if (prev && this.toMinutes(b.startTime) < this.toMinutes(prev.endTime)) {
        throw new BadRequestException(
          `Các khung giờ không được chồng nhau: ${prev.startTime}-${prev.endTime} và ${b.startTime}-${b.endTime}`,
        );
      }
    });
    const localDate = dto.date.slice(0, 10);
    if (localDate < clinicDateOnly()) {
      throw new BadRequestException('Không thể sửa lịch của ngày đã qua');
    }
    await this.validateDentist(dto.dentistId, { forBooking: false });
    const date = new Date(localDate);
    const dayStart = startOfClinicDay(localDate);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    // For a closed range only that range matters; otherwise the whole day.
    const windowStart =
      dto.kind === 'CLOSED' && hasTimes
        ? this.combineDateAndTime(localDate, dto.startTime!)
        : dayStart;
    const windowEnd =
      dto.kind === 'CLOSED' && hasTimes ? this.combineDateAndTime(localDate, dto.endTime!) : dayEnd;

    const { created, affectedAppointments, affectedBookingRequests } =
      await this.prisma.$transaction(async tx => {
        await this.lockDentist(tx, dto.dentistId);
        if (dto.kind === 'CHANGED_HOURS') {
          const existing = await tx.scheduleOverride.findMany({
            where: { dentistId: dto.dentistId, date, kind: 'CHANGED_HOURS', deletedAt: null },
          });
          for (const e of existing ?? []) {
            const eStart = this.toTimeString(e.startTime!);
            const eEnd = this.toTimeString(e.endTime!);
            const clash = blocks.find(
              b =>
                this.toMinutes(b.startTime) < this.toMinutes(eEnd) &&
                this.toMinutes(eStart) < this.toMinutes(b.endTime),
            );
            if (clash) {
              throw new BusinessRuleException(
                `Ngày này đã có khung đổi giờ ${eStart}-${eEnd} trùng với ${clash.startTime}-${clash.endTime}; hãy xóa khung cũ trước`,
                HttpStatus.CONFLICT,
                { overrideId: e.id },
                'OVERRIDE_EXISTS',
              );
            }
          }
        }
        const inClinic = await tx.appointment.count({
          where: {
            dentistId: dto.dentistId,
            startAt: { lt: windowEnd },
            endAt: { gt: windowStart },
            deletedAt: null,
            status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS] },
          },
        });
        if (inClinic > 0) {
          throw new InvalidAppointmentStateException(
            `Bác sĩ đang có ${inClinic} bệnh nhân đã check-in/đang khám trong khoảng thời gian này`,
          );
        }
        const rows = [];
        for (const b of blocks.length ? blocks : [null]) {
          rows.push(
            await tx.scheduleOverride.create({
              data: {
                dentistId: dto.dentistId,
                date,
                kind: dto.kind,
                startTime: b ? this.toPgTime(b.startTime) : null,
                endTime: b ? this.toPgTime(b.endTime) : null,
                reason: dto.reason.trim(),
                createdBy: actor.sub,
              },
            }),
          );
        }
        // Bookings of that day that the new calendar no longer allows.
        const impact = await this.affectedInRange(tx, dto.dentistId, null, date, date);
        return { created: rows, ...impact };
      }, LOCKING_TX_OPTIONS);
    await this.audit.log({
      action: 'SCHEDULE_OVERRIDE_CREATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'schedule_override',
      targetId: created[0].id,
      metadata: {
        dentistId: dto.dentistId,
        date: localDate,
        kind: dto.kind,
        overrideIds: created.map(c => c.id),
        affectedAppointmentIds: affectedAppointments.map(a => a.id),
      },
    });
    return {
      ...this.formatOverride(created[0]),
      overrides: created.map(c => this.formatOverride(c)),
      affectedAppointments,
      affectedBookingRequests,
    };
  }

  async listScheduleOverrides(query: ListScheduleOverridesQueryDto) {
    const rows = await this.prisma.scheduleOverride.findMany({
      where: {
        deletedAt: null,
        date: { gte: new Date(query.from?.slice(0, 10) ?? clinicDateOnly()) },
        ...(query.dentistId ? { dentistId: query.dentistId } : {}),
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map(r => this.formatOverride(r));
  }

  /**
   * Removing an override brings the weekly schedule back for that day, which
   * can leave bookings made inside changed hours outside working time: those
   * are returned (never cancelled). The blocks of one "changed hours" day
   * replace the weekly schedule together, so removing one removes them all
   * (deleting only 08:00–12:00 used to leave 13:30–17:00 as the whole day).
   */
  async deleteScheduleOverride(id: string, actor: JwtPayload) {
    this.assertStaff(actor);
    const row = await this.prisma.scheduleOverride.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new AppointmentNotFoundException(id, 'Không tìm thấy ngoại lệ lịch');
    const scope: Prisma.ScheduleOverrideWhereInput =
      row.kind === 'CHANGED_HOURS'
        ? { dentistId: row.dentistId, date: row.date, kind: 'CHANGED_HOURS', deletedAt: null }
        : { id, deletedAt: null };
    const { deletedIds, ...impact } = await this.prisma.$transaction(async tx => {
      await this.lockDentist(tx, row.dentistId);
      const rows = await tx.scheduleOverride.findMany({ where: scope, select: { id: true } });
      await tx.scheduleOverride.updateMany({
        where: { id: { in: rows.map(r => r.id) } },
        data: { deletedAt: new Date(), deletedBy: actor.sub },
      });
      return {
        deletedIds: rows.map(r => r.id),
        ...(await this.affectedInRange(tx, row.dentistId, null, row.date, row.date)),
      };
    }, LOCKING_TX_OPTIONS);
    await this.audit.log({
      action: 'SCHEDULE_OVERRIDE_DELETED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'schedule_override',
      targetId: id,
      metadata: {
        dentistId: row.dentistId,
        date: row.date.toISOString().slice(0, 10),
        kind: row.kind,
        overrideIds: deletedIds,
        affectedAppointmentIds: impact.affectedAppointments.map(a => a.id),
      },
    });
    return { ...impact, deletedIds };
  }

  private formatOverride(r: {
    id: string;
    dentistId: string;
    date: Date;
    kind: string;
    startTime: Date | null;
    endTime: Date | null;
    reason: string;
    createdBy: string;
    createdAt: Date;
  }) {
    return {
      id: r.id,
      dentistId: r.dentistId,
      date: r.date.toISOString().slice(0, 10),
      kind: r.kind,
      startTime: r.startTime ? this.toTimeString(r.startTime) : null,
      endTime: r.endTime ? this.toTimeString(r.endTime) : null,
      reason: r.reason,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    };
  }

  // ==========================================================================
  // Clinic-wide closed days (Tết, holidays — migration 035)
  // ==========================================================================

  async listClinicClosures(query: ListClinicClosuresQueryDto) {
    const rows = await this.prisma.clinicClosure.findMany({
      where: {
        deletedAt: null,
        endDate: { gte: this.dateOnly(query.from ?? clinicDateOnly()) },
      },
      orderBy: { startDate: 'asc' },
      include: { creator: { select: { fullName: true } } },
    });
    return rows.map(r => this.formatClosure(r));
  }

  /**
   * Every dentist is closed all day from startDate to endDate. Bookings
   * already on those days are returned for the front desk to move — the
   * system never cancels them (same as time-off and overrides).
   *
   * Known gap: only closures are serialized here (lockClinicClosures), not
   * every dentist's calendar, so a booking committed while this transaction
   * runs may be missing from `affectedAppointments`. It is still refused
   * from then on and listed by the schedule-impact report (BR-SCH-005),
   * which reads the calendar as it stands.
   */
  async createClinicClosure(dto: ClinicClosureDto, actor: JwtPayload) {
    const { startDate, endDate } = this.closureDates(dto);
    const result = await this.prisma.$transaction(async tx => {
      await lockClinicClosures(tx);
      await this.assertNoClosureOverlap(tx, startDate, endDate);
      await this.assertNobodyInClinic(tx, startDate, endDate);
      const created = await tx.clinicClosure.create({
        data: { startDate, endDate, reason: dto.reason.trim(), createdBy: actor.sub },
      });
      return { created, ...(await this.closureAffected(tx, startDate, endDate)) };
    }, LOCKING_TX_OPTIONS);
    await this.audit.log({
      action: 'CLINIC_CLOSURE_CREATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'clinic_closure',
      targetId: result.created.id,
      metadata: {
        startDate: dto.startDate.slice(0, 10),
        endDate: dto.endDate.slice(0, 10),
        affectedAppointmentIds: result.affectedAppointments.map(a => a.id),
      },
    });
    return {
      ...this.formatClosure(result.created),
      affectedAppointments: result.affectedAppointments,
      affectedBookingRequests: result.affectedBookingRequests,
    };
  }

  async updateClinicClosure(id: string, dto: ClinicClosureDto, actor: JwtPayload) {
    const row = await this.requireOpenClosure(id);
    // A closure already running keeps its first day (those days are past).
    const today = this.dateOnly(clinicDateOnly());
    const started = row.startDate <= today;
    const { startDate, endDate } = this.closureDates(dto, started ? row.startDate : undefined);
    const result = await this.prisma.$transaction(async tx => {
      await lockClinicClosures(tx);
      await this.assertNoClosureOverlap(tx, startDate, endDate, id);
      await this.assertNobodyInClinic(tx, startDate, endDate);
      const updated = await tx.clinicClosure.update({
        where: { id },
        data: { startDate, endDate, reason: dto.reason.trim() },
      });
      return { updated, ...(await this.closureAffected(tx, startDate, endDate)) };
    }, LOCKING_TX_OPTIONS);
    await this.audit.log({
      action: 'CLINIC_CLOSURE_UPDATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'clinic_closure',
      targetId: id,
      metadata: {
        before: {
          startDate: row.startDate.toISOString().slice(0, 10),
          endDate: row.endDate.toISOString().slice(0, 10),
          reason: row.reason,
        },
        after: {
          startDate: startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
          reason: dto.reason.trim(),
        },
        affectedAppointmentIds: result.affectedAppointments.map(a => a.id),
      },
    });
    return {
      ...this.formatClosure(result.updated),
      affectedAppointments: result.affectedAppointments,
      affectedBookingRequests: result.affectedBookingRequests,
    };
  }

  /** Reopening only frees hours, so no booking can become affected. */
  async deleteClinicClosure(id: string, actor: JwtPayload) {
    const row = await this.requireOpenClosure(id);
    await this.prisma.clinicClosure.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actor.sub },
    });
    await this.audit.log({
      action: 'CLINIC_CLOSURE_DELETED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'clinic_closure',
      targetId: id,
      metadata: {
        startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate.toISOString().slice(0, 10),
        reason: row.reason,
      },
    });
  }

  private async requireOpenClosure(id: string) {
    const row = await this.prisma.clinicClosure.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new AppointmentNotFoundException(id, 'Không tìm thấy ngày nghỉ phòng khám');
    if (row.endDate < this.dateOnly(clinicDateOnly())) {
      throw new InvalidAppointmentStateException(
        'Đợt nghỉ này đã qua, được giữ nguyên làm lịch sử',
      );
    }
    return row;
  }

  private closureDates(dto: ClinicClosureDto, keepStart?: Date) {
    const startDate = this.dateOnly(dto.startDate);
    const endDate = this.dateOnly(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('Ngày kết thúc phải từ ngày bắt đầu trở đi');
    }
    if (keepStart && startDate.getTime() !== keepStart.getTime()) {
      throw new BadRequestException(
        'Đợt nghỉ đã bắt đầu nên không đổi được ngày bắt đầu; chỉ sửa ngày kết thúc hoặc lý do',
      );
    }
    if (!keepStart && startDate < this.dateOnly(clinicDateOnly())) {
      throw new BadRequestException('Không thể tạo ngày nghỉ cho ngày đã qua');
    }
    if (endDate.getTime() - startDate.getTime() > (MAX_CLOSURE_DAYS - 1) * DAY_MS) {
      throw new BadRequestException(`Một đợt nghỉ tối đa ${MAX_CLOSURE_DAYS} ngày`);
    }
    return { startDate, endDate };
  }

  private async assertNoClosureOverlap(
    tx: Prisma.TransactionClient,
    startDate: Date,
    endDate: Date,
    excludeId?: string,
  ) {
    const clash = await tx.clinicClosure.findFirst({
      where: {
        deletedAt: null,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (clash) {
      throw new BusinessRuleException(
        `Trùng đợt nghỉ đã có ${this.viDate(clash.startDate)}–${this.viDate(clash.endDate)} (${clash.reason})`,
        HttpStatus.CONFLICT,
        { closureId: clash.id },
        'CLINIC_CLOSURE_OVERLAP',
      );
    }
  }

  /** Same guard as overrides: never close on patients already in the chair. */
  private async assertNobodyInClinic(tx: Prisma.TransactionClient, startDate: Date, endDate: Date) {
    const inClinic = await tx.appointment.count({
      where: {
        startAt: { lt: this.endOfDate(endDate) },
        endAt: { gt: startOfClinicDay(this.isoDate(startDate)) },
        deletedAt: null,
        status: { in: [AppointmentStatus.CHECKED_IN, AppointmentStatus.IN_PROGRESS] },
      },
    });
    if (inClinic > 0) {
      throw new InvalidAppointmentStateException(
        `Đang có ${inClinic} bệnh nhân đã check-in/đang khám trong những ngày này`,
      );
    }
  }

  /** Every upcoming booking and open online request of the closed days. */
  private async closureAffected(tx: Prisma.TransactionClient, startDate: Date, endDate: Date) {
    const start = new Date(
      Math.max(startOfClinicDay(this.isoDate(startDate)).getTime(), Date.now()),
    );
    const end = this.endOfDate(endDate);
    const affectedAppointments =
      (await tx.appointment.findMany({
        where: {
          startAt: { gte: start, lt: end },
          deletedAt: null,
          status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        },
        orderBy: { startAt: 'asc' },
        take: 1000,
        select: { ...AFFECTED_APPOINTMENT_SELECT, dentist: { select: { fullName: true } } },
      })) ?? [];
    return {
      affectedAppointments: affectedAppointments.map(({ dentist, ...a }) => ({
        ...a,
        dentistName: dentist?.fullName ?? null,
      })),
      affectedBookingRequests: await this.requestsWithIssues(tx, null, null, start, end),
    };
  }

  private formatClosure(r: {
    id: string;
    startDate: Date;
    endDate: Date;
    reason: string;
    createdBy: string;
    createdAt: Date;
    creator?: { fullName: string } | null;
  }) {
    return {
      id: r.id,
      startDate: this.isoDate(r.startDate),
      endDate: this.isoDate(r.endDate),
      reason: r.reason,
      createdBy: r.createdBy,
      createdByName: r.creator?.fullName ?? null,
      createdAt: r.createdAt,
    };
  }

  // ==========================================================================
  // Impact of a calendar change (BR-SCH-005): listed, never cancelled
  // ==========================================================================

  /**
   * Upcoming SCHEDULED/CONFIRMED bookings and open online requests of a
   * dentist between two clinic dates (inclusive; `to` null = no end), on
   * `dayOfWeek` only when given, that the calendar as it now stands inside
   * `tx` no longer allows. Call it after writing the change.
   */
  private async affectedInRange(
    tx: Prisma.TransactionClient,
    dentistId: string,
    dayOfWeek: number | null,
    from: Date,
    to: Date | null,
    { wholeFirstDay = false } = {},
  ) {
    const dayStart = startOfClinicDay(this.isoDate(from));
    const start = new Date(Math.max(dayStart.getTime(), Date.now()));
    const end = to ? this.endOfDate(to) : null;
    const onDay = (at: Date) =>
      dayOfWeek === null || new Date(clinicDateOnly(at)).getUTCDay() === dayOfWeek;
    const upcoming = {
      startAt: { gte: start, ...(end ? { lt: end } : {}) },
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
    };
    // A change taking effect today also reaches today's visits that have
    // already started or whose patient is checked in / in the chair.
    const today = {
      startAt: { gte: dayStart, lt: start },
      status: {
        in: [
          AppointmentStatus.SCHEDULED,
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.CHECKED_IN,
          AppointmentStatus.IN_PROGRESS,
        ],
      },
    };
    const rows =
      (await tx.appointment.findMany({
        where: {
          dentistId,
          deletedAt: null,
          ...(wholeFirstDay && dayStart.getTime() < start.getTime()
            ? { OR: [upcoming, today] }
            : upcoming),
        },
        orderBy: { startAt: 'asc' },
        take: 1000,
        select: AFFECTED_APPOINTMENT_SELECT,
      })) ?? [];
    const affectedAppointments = [];
    for (const a of rows) {
      if (onDay(a.startAt) && (await this.calendarProblem(dentistId, a.startAt, a.endAt, tx))) {
        affectedAppointments.push(a);
      }
    }
    const affectedBookingRequests = await this.requestsWithIssues(
      tx,
      dentistId,
      dayOfWeek,
      start,
      end,
    );
    return { affectedAppointments, affectedBookingRequests };
  }

  /**
   * Open online requests in [start, end) (for one dentist, on one weekday
   * when given) that can no longer be confirmed as they stand — the same
   * check as the booking-request list's `slotIssue`
   * (AvailabilityService.requestIssues), read inside `tx`.
   */
  private async requestsWithIssues(
    tx: Prisma.TransactionClient,
    dentistId: string | null,
    dayOfWeek: number | null,
    start: Date,
    end: Date | null,
  ) {
    const rows = (await this.openBookingRequests(tx, dentistId, start, end)).filter(
      r =>
        dayOfWeek === null ||
        new Date(clinicDateOnly(effectiveStartAt(r))).getUTCDay() === dayOfWeek,
    );
    const issues = await this.availability.requestIssues(this.requestPlanRules(), rows, tx);
    return rows.flatMap(r => {
      const issue = issues.get(r.id);
      return issue ? [this.formatBookingRequest(r, issue)] : [];
    });
  }

  /** What AvailabilityService.requestPlan needs from this service. */
  requestPlanRules(): RequestPlanRules {
    return {
      validateDentist: id => this.validateDentist(id),
      planVisit: (dentistId, serviceIds, date) => this.planVisit(dentistId, serviceIds, date),
    };
  }

  /**
   * Online requests still waiting on the clinic or the patient, at their
   * current time (the proposal if any) and dentist (the proposed one if any);
   * `dentistId` null = every dentist.
   */
  private async openBookingRequests(
    tx: Prisma.TransactionClient,
    dentistId: string | null,
    start: Date,
    end: Date | null,
  ) {
    const range = { gte: start, ...(end ? { lt: end } : {}) };
    return (
      (await tx.bookingRequest.findMany({
        where: {
          appointmentId: null,
          OR: [
            {
              status: {
                in: OPEN_BOOKING_STATUSES.filter(s => !PROPOSAL_BOOKING_STATUSES.includes(s)),
              },
              requestedStartAt: range,
              ...(dentistId ? { preferredDentistId: dentistId } : {}),
            },
            {
              status: { in: PROPOSAL_BOOKING_STATUSES },
              AND: [
                {
                  OR: [
                    { proposedStartAt: range },
                    { proposedStartAt: null, requestedStartAt: range },
                  ],
                },
                ...(dentistId
                  ? [
                      {
                        OR: [
                          { proposedDentistId: dentistId },
                          { proposedDentistId: null, preferredDentistId: dentistId },
                        ],
                      },
                    ]
                  : []),
              ],
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
        select: {
          id: true,
          referenceCode: true,
          fullName: true,
          phone: true,
          status: true,
          appointmentId: true,
          serviceId: true,
          createdAt: true,
          preferredDentistId: true,
          proposedDentistId: true,
          requestedStartAt: true,
          proposedStartAt: true,
        },
      })) ?? []
    );
  }

  private formatBookingRequest(
    r: {
      id: string;
      referenceCode: string;
      fullName: string;
      phone: string;
      status: BookingRequestStatus;
      requestedStartAt: Date;
      proposedStartAt: Date | null;
    },
    issue: RequestIssue,
  ) {
    return {
      id: r.id,
      referenceCode: r.referenceCode,
      fullName: r.fullName,
      phone: r.phone,
      status: r.status,
      startAt: effectiveStartAt(r),
      slotIssue: issue,
    };
  }

  /**
   * BR-SCH-005: upcoming SCHEDULED/CONFIRMED bookings the current calendar no
   * longer allows (approved time-off, closed day/range, changed or removed
   * hours) — the front desk's to-do list for rescheduling.
   */
  async scheduleImpact(query: ScheduleImpactQueryDto, actor: JwtPayload) {
    const from = query.from?.slice(0, 10) ?? clinicDateOnly();
    const toDate = query.to?.slice(0, 10);
    const start = new Date(Math.max(startOfClinicDay(from).getTime(), Date.now()));
    const end = toDate
      ? new Date(startOfClinicDay(toDate).getTime() + 24 * 60 * 60_000)
      : new Date(startOfClinicDay(from).getTime() + 61 * 24 * 60 * 60_000);
    const dentistId = this.isRowScopedDentist(actor) ? actor.sub : query.dentistId;
    const rows = await this.prisma.appointment.findMany({
      where: {
        ...(dentistId ? { dentistId } : {}),
        startAt: { gte: start, lt: end },
        deletedAt: null,
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
      },
      orderBy: { startAt: 'asc' },
      take: 500,
      select: {
        id: true,
        dentistId: true,
        startAt: true,
        endAt: true,
        status: true,
        dentist: { select: { fullName: true } },
        patient: { select: { id: true, code: true, fullName: true, primaryPhone: true } },
      },
    });
    const affected = [];
    for (const r of rows) {
      const problem = await this.calendarProblem(r.dentistId, r.startAt, r.endAt, this.prisma);
      if (problem) {
        affected.push({
          ...r,
          dentistName: r.dentist.fullName,
          reason: problem.kind,
          message: problem.message,
        });
      }
    }
    return affected;
  }

  // ==========================================================================
  // Shift Registration (Phase 9, BD-0010)
  // ==========================================================================

  async createShiftRegistration(
    dto: {
      dentistId: string;
      date: string;
      startTime: string;
      endTime: string;
      maxEncounters?: number;
      notes?: string;
    },
    actor: JwtPayload,
  ) {
    if (dto.dentistId !== actor.sub && !actor.permissions.includes('shift.approve')) {
      throw new AppointmentNotFoundException(dto.dentistId, 'Không tìm thấy bác sĩ');
    }
    this.assertTimeOrder(dto.startTime, dto.endTime);
    const regDate = new Date(dto.date);
    // `date` is a DATE column; past = before today's clinic date (as the cron).
    if (regDate < new Date(clinicDateOnly())) {
      throw new InvalidAppointmentStateException('Không thể đăng ký ca cho ngày đã qua');
    }

    // BR-APPT-026 / M#4: conflict check against working schedules
    const dow = regDate.getUTCDay();
    const conflictingSchedules = await this.prisma.workingSchedule.findMany({
      where: {
        dentistId: dto.dentistId,
        dayOfWeek: dow,
        deletedAt: null,
        validFrom: { lte: regDate },
        OR: [{ validTo: null }, { validTo: { gte: regDate } }],
      },
    });
    for (const s of conflictingSchedules) {
      const sStart = this.toMinutes(this.toTimeString(s.startTime));
      const sEnd = this.toMinutes(this.toTimeString(s.endTime));
      const oStart = this.toMinutes(dto.startTime);
      const oEnd = this.toMinutes(dto.endTime);
      if (oStart < sEnd && sStart < oEnd) {
        throw new InvalidAppointmentStateException(
          `Ca đăng ký trùng lịch làm việc cố định ${this.toTimeString(s.startTime)}-${this.toTimeString(s.endTime)}`,
        );
      }
    }

    // M#4: conflict against other PENDING/APPROVED shift registrations
    const peerShifts = await this.prisma.shiftRegistration.findMany({
      where: {
        dentistId: dto.dentistId,
        date: regDate,
        status: { in: ['PENDING', 'APPROVED'] },
        deletedAt: null,
      },
    });
    for (const p of peerShifts) {
      const pStart = this.toMinutes(p.startTime);
      const pEnd = this.toMinutes(p.endTime);
      const oStart = this.toMinutes(dto.startTime);
      const oEnd = this.toMinutes(dto.endTime);
      if (oStart < pEnd && pStart < oEnd) {
        throw new InvalidAppointmentStateException(
          `Trùng ca đã đăng ký ${p.startTime}-${p.endTime}`,
        );
      }
    }

    const created = await this.prisma.shiftRegistration.create({
      data: {
        dentistId: dto.dentistId,
        date: regDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        maxEncounters: dto.maxEncounters ?? null,
        notes: dto.notes ?? null,
        status: 'PENDING',
        createdByUserId: actor.sub,
      },
    });

    await this.audit.log({
      action: 'SHIFT_REGISTRATION_CREATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'shift_registration',
      targetId: created.id,
      metadata: { dentistId: dto.dentistId, date: dto.date, status: 'PENDING' },
    });

    return created;
  }

  async approveShiftRegistration(id: string, reason: string | undefined, actor: JwtPayload) {
    const shift = await this.prisma.shiftRegistration.findUnique({ where: { id } });
    if (!shift) throw new AppointmentNotFoundException(id);
    if (shift.status !== 'PENDING') {
      throw new InvalidAppointmentStateException(`Cannot approve shift in status ${shift.status}`);
    }
    // BR-APPT-029: a past day's shift can no longer be approved (clinic date).
    if (shift.date < new Date(clinicDateOnly())) {
      throw new InvalidAppointmentStateException('Không thể duyệt ca của ngày đã qua');
    }

    // Guarded write: a concurrent approve/reject/cancel/auto-cancel wins.
    const res = await this.prisma.shiftRegistration.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        approvedByUserId: actor.sub,
        approvedAt: new Date(),
      },
    });
    if (res.count === 0) {
      throw new InvalidAppointmentStateException(
        'Đăng ký ca vừa được thay đổi, tải lại rồi thử lại',
      );
    }
    const updated = await this.prisma.shiftRegistration.findUniqueOrThrow({ where: { id } });

    await this.audit.log({
      action: 'SHIFT_REGISTRATION_APPROVED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'shift_registration',
      targetId: id,
      metadata: { reason },
    });

    return updated;
  }

  async rejectShiftRegistration(id: string, reason: string, actor: JwtPayload) {
    const shift = await this.prisma.shiftRegistration.findUnique({ where: { id } });
    if (!shift) throw new AppointmentNotFoundException(id);
    if (shift.status !== 'PENDING') {
      throw new InvalidAppointmentStateException(`Cannot reject shift in status ${shift.status}`);
    }

    // See approveShiftRegistration() — same guarded write.
    const res = await this.prisma.shiftRegistration.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        approvedByUserId: actor.sub,
        approvedAt: new Date(),
        rejectionReason: reason,
      },
    });
    if (res.count === 0) {
      throw new InvalidAppointmentStateException(
        'Đăng ký ca vừa được thay đổi, tải lại rồi thử lại',
      );
    }
    const updated = await this.prisma.shiftRegistration.findUniqueOrThrow({ where: { id } });

    await this.audit.log({
      action: 'SHIFT_REGISTRATION_REJECTED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'shift_registration',
      targetId: id,
      metadata: { reason },
    });

    return updated;
  }

  async listShiftRegistrations(
    actor: JwtPayload,
    query: { dentistId?: string; status?: string; from?: string; to?: string },
  ) {
    const isAdmin = actor.permissions.includes('shift.read.any');
    const where: Prisma.ShiftRegistrationWhereInput = {
      deletedAt: null,
      ...(isAdmin && query.dentistId ? { dentistId: query.dentistId } : {}),
      ...(!isAdmin ? { dentistId: actor.sub } : {}),
      ...(query.status ? { status: query.status as any } : {}),
      // See list() above — `lte: new Date(query.to)` on a bare date is a
      // zero-width UTC-midnight instant, not "through end of that day".
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: endOfDayInclusive(query.to) } : {}),
            },
          }
        : {}),
    };
    return {
      data: await this.prisma.shiftRegistration.findMany({ where, orderBy: { date: 'desc' } }),
    };
  }

  /**
   * BR-APPT-029: cron auto-cancel PENDING past-date shifts.
   */
  async autoCancelPastPendingShifts() {
    // `date` is a DATE column (UTC midnight of the calendar day); "today" is
    // the clinic's, not UTC's, so 00:00–07:00 VN counts as the new day.
    const today = new Date(clinicDateOnly());

    // One guarded write: a shift approved between a read and this update
    // must not be cancelled, so PENDING is part of the write itself.
    const updated = await this.prisma.shiftRegistration.updateMany({
      where: {
        status: 'PENDING',
        date: { lt: today },
        deletedAt: null,
      },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (updated.count === 0) return { updated: 0 };
    await this.audit.log({
      action: 'SHIFT_REGISTRATION_AUTO_CANCELLED',
      targetType: 'shift_registration',
      metadata: { count: updated.count, reason: 'past date unapproved' },
    });
    return { updated: updated.count };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  // ==========================================================================
  // Services, walk-in, LEFT, history (ADR-0009 phase 5)
  // ==========================================================================

  /**
   * BR-APPT-030: every chosen service must be active and assigned to the
   * dentist that day. Length = sum of each service's duration (the dentist's
   * override first, BR-SVC-006); buffers = the largest of the services (D4).
   */
  async planVisit(
    dentistId: string,
    serviceIds: string[] | undefined,
    localDate: string,
    { activeServicesOnly = true } = {},
  ): Promise<VisitPlan | null> {
    if (!serviceIds?.length) return null;
    const day = new Date(localDate);
    const assignments = await this.prisma.dentistService.findMany({
      where: {
        dentistId,
        serviceId: { in: serviceIds },
        effectiveFrom: { lte: day },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
        // A visit already booked keeps a service withdrawn since (reschedule).
        ...(activeServicesOnly ? { service: { isActive: true } } : {}),
      },
      include: { service: true },
    });
    const byService = new Map(assignments.map(a => [a.serviceId, a]));
    if (!activeServicesOnly) {
      // Deactivating a service ends its assignments on that day
      // (CatalogService.setServiceActive), so a visit booked before then could
      // never move to a later date. For a withdrawn service, the dentist's
      // latest assignment to it still counts.
      const withdrawn = serviceIds.filter(id => !byService.has(id));
      if (withdrawn.length > 0) {
        const past = await this.prisma.dentistService.findMany({
          where: { dentistId, serviceId: { in: withdrawn }, service: { isActive: false } },
          include: { service: true },
          orderBy: { effectiveFrom: 'desc' },
        });
        for (const a of past) if (!byService.has(a.serviceId)) byService.set(a.serviceId, a);
      }
    }
    const missing = serviceIds.filter(id => !byService.has(id));
    if (missing.length > 0) {
      throw new BusinessRuleException(
        'Bác sĩ này không thực hiện dịch vụ của lịch hẹn vào ngày đã chọn',
        HttpStatus.CONFLICT,
        { serviceIds: missing },
        'SERVICE_NOT_ASSIGNED',
      );
    }
    const services = serviceIds.map((id, index) => {
      const a = byService.get(id)!;
      return {
        serviceId: id,
        serviceCode: a.service.code,
        serviceName: a.service.name,
        price: Number(a.price ?? a.service.basePrice),
        durationMin: a.durationMin ?? a.service.defaultDurationMin,
        bufferBeforeMin: a.service.bufferBeforeMin,
        bufferAfterMin: a.service.bufferAfterMin,
        sortOrder: index,
      };
    });
    return {
      services,
      durationMin: services.reduce((sum, sv) => sum + sv.durationMin, 0),
      bufferBeforeMin: Math.max(...services.map(sv => sv.bufferBeforeMin)),
      bufferAfterMin: Math.max(...services.map(sv => sv.bufferAfterMin)),
    };
  }

  /** One visit is at most MAX_VISIT_MINUTES long, as a walk-in (an 8-hour booking is a typo). */
  private assertVisitLength(startAt: Date, endAt: Date) {
    if (endAt.getTime() - startAt.getTime() > MAX_VISIT_MINUTES * 60_000) {
      throw new BadRequestException(
        `Một lịch hẹn dài tối đa ${MAX_VISIT_MINUTES} phút (${MAX_VISIT_MINUTES / 60} giờ)`,
      );
    }
  }

  /** BR-APPT-031: a length different from the services' total needs a reason. */
  private checkDurationOverride(
    plan: Pick<VisitPlan, 'durationMin'> | null,
    startAt: Date,
    endAt: Date,
    reason: string | undefined,
  ): string | null {
    if (!plan) return null;
    const minutes = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
    if (minutes === plan.durationMin) return null;
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < 5) {
      throw new InvalidAppointmentStateException(
        `Các dịch vụ cần ${plan.durationMin} phút; đặt ${minutes} phút cần lý do (ít nhất 5 ký tự)`,
      );
    }
    return trimmed;
  }

  private planColumns(plan: VisitPlan | null, overrideReason: string | null) {
    if (!plan) return {};
    return {
      bufferBeforeMin: plan.bufferBeforeMin,
      bufferAfterMin: plan.bufferAfterMin,
      calculatedDurationMin: plan.durationMin,
      durationOverrideReason: overrideReason,
      services: { create: plan.services },
    };
  }

  /**
   * BR-APPT-032: a walk-in is booked from now and checked in at once. The
   * dentist must be working, free and not on leave right now; the 1-minute
   * lead time of pre-booked visits does not apply.
   */
  async createWalkIn(dto: CreateWalkInDto, actor: JwtPayload) {
    const startAt = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    await this.assertDentistMayBook(dto.dentistId, dto.patientId, actor);
    const dentist = await this.validateDentist(dto.dentistId);
    await this.validateActivePatient(dto.patientId);
    const plan = await this.planVisit(dto.dentistId, dto.serviceIds, clinicDateOnly(startAt));
    const minutes = plan?.durationMin ?? dto.durationMin ?? this.defaultSlotMinutes(dentist);
    const endAt = new Date(startAt.getTime() + minutes * 60_000);
    this.assertVisitLength(startAt, endAt);

    const created = await this.prisma.$transaction(async tx => {
      await this.lockDentist(tx, dto.dentistId);
      await this.lockPatient(tx, dto.patientId);
      await this.ensureSlotAvailable(dto.dentistId, startAt, endAt, actor, undefined, tx, plan);
      await this.ensurePatientFree(dto.patientId, startAt, endAt, undefined, tx);
      const walkIn = await tx.appointment.create({
        data: {
          patientId: dto.patientId,
          dentistId: dto.dentistId,
          startAt,
          endAt,
          ...this.planColumns(plan, null),
          visitKind: 'WALK_IN',
          source: 'WALK_IN',
          status: AppointmentStatus.CHECKED_IN,
          checkedInAt: new Date(),
          checkedInBy: actor.sub,
          reason: blankToNull(dto.reason),
          chiefComplaint: blankToNull(dto.chiefComplaint),
          appointmentType: dto.appointmentType,
          createdBy: actor.sub,
          updatedBy: actor.sub,
        },
        include: { services: true },
      });
      await enqueue(tx, walkIn, walkIn.checkedInAt ?? startAt, actor.sub);
      return walkIn;
    }, LOCKING_TX_OPTIONS);
    await this.audit.log({
      action: 'APPOINTMENT_WALK_IN',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'appointment',
      targetId: created.id,
      metadata: {
        dentistId: dto.dentistId,
        patientId: dto.patientId,
        startAt: startAt.toISOString(),
        ...(plan ? { serviceCodes: plan.services.map(sv => sv.serviceCode) } : {}),
      },
    });
    return created;
  }

  /**
   * BR-APPT-033 (ADR-0009 D2): a checked-in patient who leaves before the
   * exam starts is LEFT, not cancelled or no-show; the slot is released.
   */
  async markLeft(appointmentId: string, dto: MarkLeftDto, actor: JwtPayload) {
    const appt = await this.requireAppointment(appointmentId);
    if (this.isRowScopedDentist(actor) && appt.dentistId !== actor.sub) {
      throw new AppointmentNotFoundException(appointmentId);
    }
    if (appt.status !== AppointmentStatus.CHECKED_IN) {
      throw new InvalidAppointmentStateException(
        `Chỉ ghi nhận "đã về" cho bệnh nhân đã check-in (lịch đang ở trạng thái "${STATUS_LABEL[appt.status]}")`,
      );
    }
    await this.prisma.$transaction(async tx => {
      const result = await tx.appointment.updateMany({
        where: { id: appointmentId, status: AppointmentStatus.CHECKED_IN },
        data: {
          status: AppointmentStatus.LEFT,
          leftAt: new Date(),
          leftReason: dto.reason.trim(),
          updatedBy: actor.sub,
        },
      });
      if (result.count === 0) {
        throw new InvalidAppointmentStateException(STALE_APPOINTMENT_MSG);
      }
      await closeQueueEntry(tx, appointmentId, 'LEFT', actor.sub);
    });
    await this.audit.log({
      action: 'APPOINTMENT_LEFT',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'appointment',
      targetId: appointmentId,
      metadata: { reason: dto.reason.trim() },
    });
    // No encounter exists before the exam starts, so nothing else to close.
    return this.prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  }

  /** BR-APPT-034: who did what to an appointment, oldest first. */
  async history(appointmentId: string, actor: JwtPayload) {
    await this.getById(appointmentId, actor); // 404 + row-level scope
    const [events, reschedules] = await Promise.all([
      this.prisma.auditLog.findMany({
        // Case-insensitive: update() used to write 'Appointment' (rows kept on VPS).
        where: {
          targetType: { equals: 'appointment', mode: 'insensitive' },
          targetId: appointmentId,
        },
        orderBy: { occurredAt: 'asc' },
        select: { action: true, occurredAt: true, actorEmailAtTime: true, metadata: true },
      }),
      this.prisma.appointmentRescheduleLog.findMany({
        where: { appointmentId },
        orderBy: { changedAt: 'asc' },
      }),
    ]);
    return {
      events: events.map(e => ({
        action: e.action,
        at: e.occurredAt,
        actorEmail: e.actorEmailAtTime,
        metadata: e.metadata,
      })),
      reschedules,
    };
  }

  /**
   * Guard for a write decided on an earlier read: the row must still have
   * the same status, time, dentist and reschedule count, so a concurrent
   * reschedule or dentist swap between the read and the write is a 409
   * (STALE_APPOINTMENT_MSG) instead of acting on a visit that moved.
   */
  private unchangedSince(appt: Appointment): Prisma.AppointmentWhereInput {
    return {
      id: appt.id,
      status: appt.status,
      startAt: appt.startAt,
      dentistId: appt.dentistId,
      rescheduleCount: appt.rescheduleCount,
    };
  }

  /** True when `at` falls on the clinic day of `now`. */
  private isClinicToday(at: Date, now = Date.now()): boolean {
    return clinicDateOnly(at) === clinicDateOnly(new Date(now));
  }

  /** The booked status an undo returns to: confirmedAt is cleared on reschedule. */
  private bookedStatus(appt: Appointment): AppointmentStatus {
    return appt.confirmedAt ? AppointmentStatus.CONFIRMED : AppointmentStatus.SCHEDULED;
  }

  /** Trimmed reason, required for an undo. */
  private statusReason(value: string | undefined, what: string): string {
    const reason = value?.trim() ?? '';
    if (reason.length < STATUS_REASON_MIN_LENGTH) {
      throw new BadRequestException(
        `${what} cần lý do (ít nhất ${STATUS_REASON_MIN_LENGTH} ký tự)`,
      );
    }
    return reason;
  }

  /**
   * A NO_SHOW visit gave its slot back; before it holds the slot again the
   * dentist and the patient must still be free then (same locks and checks
   * as a booking).
   */
  private async assertSlotStillFree(
    tx: Prisma.TransactionClient,
    appt: Appointment,
    actor: JwtPayload,
  ) {
    await this.lockDentist(tx, appt.dentistId);
    await this.lockPatient(tx, appt.patientId);
    await this.ensureSlotAvailable(
      appt.dentistId,
      appt.startAt,
      appt.endAt,
      actor,
      appt.id,
      tx,
      appt,
    );
    await this.ensurePatientFree(appt.patientId, appt.startAt, appt.endAt, appt.id, tx);
  }

  /** idx_appointments_slot_active (migration 017) as a slot conflict, not a 500. */
  private async slotSafe<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new SlotConflictException();
      }
      throw e;
    }
  }

  /** History entry written with the change it records (rolls back with it). */
  private auditInTx(
    tx: Prisma.TransactionClient,
    actor: JwtPayload,
    appointmentId: string,
    action: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: {
        action,
        actorUserId: actor.sub,
        actorEmailAtTime: actor.email ?? null,
        targetType: 'appointment',
        targetId: appointmentId,
        metadata,
      },
    });
  }

  private async requireAppointment(id: string) {
    const appt = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appt || appt.deletedAt) throw new AppointmentNotFoundException(id);
    return appt;
  }

  /**
   * True when the actor may only act on appointments they're the assigned
   * dentist for (holds appointment.read.own but not .read.any) — a plain
   * dentist. False for receptionist/admin, who legitimately act on any
   * dentist's appointments (front-desk scheduling/coordination) despite
   * holding neither or both of those two codes.
   *
   * getById() already applied this exact check inline; update(), reschedule(),
   * cancel(), startEncounter() and getWaitingQueue() did not, letting a
   * dentist read-only-blocked from someone else's appointment nonetheless
   * edit, reschedule, cancel or start an encounter for it.
   */
  /**
   * A dentist (row-scoped: appointment.read.own only) books follow-up visits
   * on their own calendar, for patients they have already treated. Front
   * desk and admin book for anyone.
   */
  private async assertDentistMayBook(dentistId: string, patientId: string, actor: JwtPayload) {
    if (!this.isRowScopedDentist(actor)) return;
    if (dentistId !== actor.sub) {
      throw new ForbiddenException('Bác sĩ chỉ đặt lịch vào lịch làm việc của chính mình');
    }
    // Follow-ups need a real (non-cancelled) visit, not just a booking.
    if (!(await dentistHasTreatedPatient(this.prisma, patientId, actor.sub))) {
      throw new ForbiddenException('Bác sĩ chỉ đặt lịch tái khám cho bệnh nhân mình đã khám');
    }
  }

  isRowScopedDentist(actor: JwtPayload): boolean {
    return (
      actor.permissions.includes('appointment.read.own') &&
      !actor.permissions.includes('appointment.read.any')
    );
  }

  /**
   * BR-STAFF-006: a dentist is an account that is not deactivated (a
   * PENDING_SETUP account still practises) with the dentist role and, once
   * profiles exist, a dentist profile. Bookings require an ACTIVE practice
   * and an employee who is not on leave; schedules and time-off may still be
   * managed while a dentist is suspended or on leave (`forBooking: false`).
   * Accounts without a profile (created before migration 019 or by an old
   * seed) are accepted by role alone until PR-7 removes that fallback.
   */
  async validateDentist(dentistId: string, { forBooking = true } = {}) {
    const u = await this.prisma.user.findUnique({
      where: { id: dentistId },
      include: {
        userRoles: { include: { role: true } },
        dentistProfile: { include: { employee: { select: { employmentStatus: true } } } },
      },
    });
    if (
      !u ||
      u.status === 'DEACTIVATED' ||
      u.deactivatedAt ||
      u.deletedAt ||
      !u.userRoles.some(ur => ur.role.code === 'dentist')
    ) {
      throw new AppointmentNotFoundException(
        dentistId,
        'Bác sĩ không tồn tại hoặc không còn hoạt động',
      );
    }
    const profile = u.dentistProfile && !u.dentistProfile.deletedAt ? u.dentistProfile : null;
    if (!profile) {
      this.logger.warn(
        `Dentist ${dentistId} has no dentist profile; accepted by role (BR-STAFF-006)`,
      );
    } else if (forBooking && profile.practiceStatus !== 'ACTIVE') {
      throw new AppointmentNotFoundException(
        dentistId,
        'Bác sĩ đang tạm ngưng hoặc đã nghỉ, không nhận lịch hẹn',
      );
    } else if (forBooking && profile.employee && profile.employee.employmentStatus !== 'ACTIVE') {
      throw new AppointmentNotFoundException(
        dentistId,
        'Bác sĩ đang tạm nghỉ, không nhận lịch hẹn mới. Chọn bác sĩ khác.',
      );
    }
    return u;
  }

  private async validateActivePatient(
    patientId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const p = await db.patient.findUnique({ where: { id: patientId } });
    if (!p || p.deletedAt) {
      throw new AppointmentNotFoundException(
        patientId,
        'Không tìm thấy bệnh nhân hoặc hồ sơ đã bị xóa',
      );
    }
    return p;
  }

  private defaultSlotMinutes(dentist: { dentistProfile?: DentistProfile | null }): number {
    return dentist.dentistProfile?.defaultSlotMinutes ?? 30;
  }

  /**
   * BR-APPT-002/003/004: ensure slot is available — no active appointment
   * collision, inside working schedule, no time-off overlap.
   */
  /**
   * BR-APPT-002/003/004/027, BR-SCH-001/003/004: throws when [startAt, endAt)
   * can't be booked. All rules live in AvailabilityService/day-calendar.
   */
  async ensureSlotAvailable(
    dentistId: string,
    startAt: Date,
    endAt: Date,
    _actor: JwtPayload,
    excludeAppointmentId?: string,
    txClient?: Prisma.TransactionClient,
    buffers?: { bufferBeforeMin: number; bufferAfterMin: number } | null,
  ) {
    const problem = await this.availability.checkSlot(dentistId, startAt, endAt, {
      db: txClient ?? this.prisma,
      excludeAppointmentId,
      buffers: buffers
        ? { beforeMin: buffers.bufferBeforeMin, afterMin: buffers.bufferAfterMin }
        : undefined,
    });
    if (!problem) return;
    if (problem.kind === 'SLOT_CONFLICT') throw new SlotConflictException();
    if (problem.kind === 'OUTSIDE_WORKING_HOURS')
      throw new OutsideWorkingHoursException(problem.message);
    throw new DentistUnavailableException(problem.message);
  }

  /** Like ensureSlotAvailable but ignoring bookings, for impact checks. */
  private calendarProblem(
    dentistId: string,
    startAt: Date,
    endAt: Date,
    client: PrismaService | Prisma.TransactionClient,
  ) {
    return this.availability.checkSlot(dentistId, startAt, endAt, {
      db: client,
      ignoreBookings: true,
    });
  }

  /** A patient can't be in two chairs at once, whichever dentists are involved. */
  private async ensurePatientFree(
    patientId: string,
    startAt: Date,
    endAt: Date,
    excludeAppointmentId: string | undefined,
    txClient: Prisma.TransactionClient,
  ) {
    const clash = await txClient.appointment.findFirst({
      where: {
        patientId,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        status: { notIn: ACTIVE_APPOINTMENT_EXCLUDED_STATUSES },
        deletedAt: null,
        ...(excludeAppointmentId ? { NOT: { id: excludeAppointmentId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new PatientDoubleBookedException();
  }

  /**
   * Plain dentists hold schedule.write so they can manage their OWN
   * schedule/time-off; without this they could also edit a colleague's.
   */
  private assertOwnScheduleOrStaff(actor: JwtPayload, dentistId: string) {
    if (this.isRowScopedDentist(actor) && dentistId !== actor.sub) {
      throw new ForbiddenException('Bác sĩ chỉ được quản lý lịch làm việc/nghỉ của chính mình');
    }
  }

  /** 400 unless end is after start ("HH:mm", same day). */
  private assertTimeOrder(start: string, end: string) {
    if (this.toMinutes(end) <= this.toMinutes(start)) {
      throw new BadRequestException(`Giờ kết thúc phải sau giờ bắt đầu (${start}-${end})`);
    }
  }

  private assertValidity(validFrom: Date, validTo: Date | null) {
    if (validTo && validTo < validFrom) {
      throw new BadRequestException('Ngày hết hiệu lực phải từ ngày bắt đầu hiệu lực trở đi');
    }
  }

  /** A DATE column value (UTC midnight) for a clinic date "YYYY-MM-DD". */
  private dateOnly(value: string): Date {
    return new Date(value.slice(0, 10));
  }

  private isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /** dd/mm/yyyy for messages. */
  private viDate(d: Date): string {
    return this.isoDate(d).split('-').reverse().join('/');
  }

  /** Exclusive end instant of a clinic date. */
  private endOfDate(d: Date): Date {
    return new Date(startOfClinicDay(this.isoDate(d)).getTime() + DAY_MS);
  }

  /** The later of two validTo values, null meaning "no end". */
  private laterEnd(a: Date | null, b: Date | null): Date | null {
    if (!a || !b) return null;
    return a > b ? a : b;
  }

  // Time helpers
  private toClinicTimeString(d: Date): string {
    return this.toTimeString(new Date(d.getTime() + CLINIC_UTC_OFFSET_MS));
  }

  private toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(v => Number(v));
    return h * 60 + m;
  }

  private toTimeString(d: Date): string {
    return `${this.pad(d.getUTCHours())}:${this.pad(d.getUTCMinutes())}`;
  }

  private toPgTime(hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(v => Number(v));
    return new Date(Date.UTC(1970, 0, 1, h, m, 0));
  }

  private combineDateAndTime(dateIso: string, hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(v => Number(v));
    return new Date(`${dateIso}T${this.pad(h)}:${this.pad(m)}:00+07:00`);
  }

  private pad(n: number): string {
    return String(n).padStart(2, '0');
  }
}
