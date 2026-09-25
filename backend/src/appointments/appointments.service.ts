import { ForbiddenException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  Appointment,
  AppointmentStatus,
  DentistProfile,
  EncounterStatus,
  Prisma,
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
import { lockDentistCalendar, lockPatientCalendar } from './domain/advisory-lock';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import { AvailabilityService } from './availability.service';
import {
  AvailabilityQueryDto,
  CancelAppointmentDto,
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
  ListScheduleOverridesQueryDto,
  ListTimeOffsQueryDto,
  ScheduleImpactQueryDto,
} from './dto/appointment.dto';
import { closeQueueEntry, enqueue } from './domain/queue';

const CHECKIN_WINDOW_BEFORE_MIN = 15;
const CHECKIN_WINDOW_AFTER_MIN = 30;
// Auto no-show (BR-APPT-012) fires only once BOTH the check-in window has
// closed AND the booked slot has ended: a patient arriving inside the window
// (e.g. +20 min) checks in normally, and one arriving later but while their
// slot is still running can be force-checked-in with a reason (BR-APPT-007)
// instead of already being NO_SHOW.
const NO_SHOW_GRACE_MIN = CHECKIN_WINDOW_AFTER_MIN;
const LATE_CANCEL_REASON_MIN_LENGTH = 5;

const blankToNull = (v: string | undefined): string | null => (v?.trim() ? v.trim() : null);

/** Statuses that still hold a slot on the calendar. */
const ACTIVE_APPOINTMENT_EXCLUDED_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.LEFT,
];

/** What a visit is made of when booked from the catalogue (ADR-0009 phase 5). */
interface VisitPlan {
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

  async create(dto: CreateAppointmentDto, actor: JwtPayload) {
    const startAt = new Date(dto.startAt);
    if (startAt.getTime() <= Date.now() + 60_000) {
      throw new BackDatedAppointmentException();
    }

    const dentist = await this.validateDentist(dto.dentistId);
    await this.validateActivePatient(dto.patientId);
    const plan = await this.planVisit(dto.dentistId, dto.serviceIds, clinicDateOnly(startAt));

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
    return this.prisma.$transaction(async tx => {
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
          status: AppointmentStatus.SCHEDULED,
          reason: blankToNull(dto.reason),
          chiefComplaint: blankToNull(dto.chiefComplaint),
          appointmentType: dto.appointmentType,
          notes: dto.notes,
          source: dto.source ?? 'PHONE',
          createdBy: actor.sub,
          updatedBy: actor.sub,
        },
      });

      await this.audit.log({
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
        },
      });

      return created;
    });
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
        `Cannot confirm appointment in status ${appt.status}`,
      );
    }
    if (Date.now() >= appt.startAt.getTime()) {
      throw new InvalidAppointmentStateException(
        'Appointment has already started — check the patient in instead of confirming',
      );
    }

    // See checkIn() — guarded write against a concurrent cancel/reschedule.
    const result = await this.prisma.appointment.updateMany({
      where: { id: appointmentId, status: AppointmentStatus.SCHEDULED },
      data: {
        status: AppointmentStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedBy: actor.sub,
        updatedBy: actor.sub,
      },
    });
    if (result.count === 0) {
      throw new InvalidAppointmentStateException(
        'Appointment was changed by someone else — reload and try again',
      );
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

  async checkIn(
    appointmentId: string,
    override: boolean,
    overrideReason: string | undefined,
    actor: JwtPayload,
  ) {
    const appt = await this.requireAppointment(appointmentId);

    const now = Date.now();
    const start = appt.startAt.getTime();
    const windowStart = start - CHECKIN_WINDOW_BEFORE_MIN * 60_000;
    const windowEnd = start + CHECKIN_WINDOW_AFTER_MIN * 60_000;

    if (appt.status === AppointmentStatus.CHECKED_IN) return appt;
    if (
      appt.status !== AppointmentStatus.SCHEDULED &&
      appt.status !== AppointmentStatus.CONFIRMED
    ) {
      throw new InvalidAppointmentStateException(
        `Cannot check-in appointment in status ${appt.status}`,
      );
    }

    if (now < windowStart) {
      throw new CheckInWindowException(
        `Chưa đến giờ check-in. Window opens at ${new Date(windowStart).toISOString()}`,
      );
    }
    if (now > windowEnd && !override) {
      throw new CheckInExpiredException(
        `Now is ${new Date(now).toISOString()}, slot started at ${appt.startAt.toISOString()}`,
        [
          { code: 'no_show', label: 'Mark no-show' },
          { code: 'still_check_in', label: 'Force check-in (reason required)' },
          { code: 'cancel', label: 'Cancel appointment' },
        ],
      );
    }
    if (override && (!overrideReason || overrideReason.length < 5)) {
      throw new CheckInWindowException('Force check-in requires a reason (≥ 5 chars)');
    }

    // BR-APPT-008: active patient
    const patient = await this.prisma.patient.findUnique({ where: { id: appt.patientId } });
    if (!patient || patient.deletedAt) {
      throw new InvalidAppointmentStateException('Patient is deleted');
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
      const checkInResult = await tx.appointment.updateMany({
        where: { id: appointmentId, status: appt.status },
        data: {
          status: AppointmentStatus.CHECKED_IN,
          checkedInAt: new Date(now),
          checkedInBy: actor.sub,
          updatedBy: actor.sub,
        },
      });
      if (checkInResult.count === 0) {
        throw new InvalidAppointmentStateException(
          'Appointment was changed by someone else — reload and try again',
        );
      }
      // ADR-0009 D5: checking in puts the patient in the dentist's queue.
      await enqueue(tx, appt, new Date(now), actor.sub);
      return tx.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    });

    await this.audit.log({
      action: override ? 'APPOINTMENT_CHECKIN_OVERRIDDEN' : 'APPOINTMENT_CHECKED_IN',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'appointment',
      targetId: appointmentId,
      metadata: override ? { override: true, overrideReason } : undefined,
    });

    return updated;
  }

  /** Transition the appointment and create its encounter atomically (BR-MR-001). */
  async startEncounter(appointmentId: string, actor: JwtPayload) {
    return this.prisma.$transaction(async tx => {
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
      if (existing?.status === EncounterStatus.CANCELLED) {
        throw new InvalidAppointmentStateException('Encounter is cancelled');
      }

      await closeQueueEntry(tx, appointmentId, 'STARTED', actor.sub);
      const updated =
        appt.status === AppointmentStatus.CHECKED_IN
          ? await tx.appointment.update({
              where: { id: appointmentId },
              data: { status: AppointmentStatus.IN_PROGRESS, updatedBy: actor.sub },
            })
          : appt;
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

      return { ...updated, encounter: { id: encounter.id } };
    });
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

    if (
      appt.status === AppointmentStatus.CANCELLED ||
      appt.status === AppointmentStatus.NO_SHOW ||
      appt.status === AppointmentStatus.COMPLETED
    ) {
      throw new InvalidAppointmentStateException(
        `Cannot cancel appointment in status ${appt.status}`,
      );
    }
    if (appt.status === AppointmentStatus.IN_PROGRESS) {
      throw new InvalidAppointmentStateException(
        'Cannot cancel appointment while encounter is in progress (BR-APPT-011)',
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
        throw new InvalidAppointmentStateException(
          'Dentist may only cancel an appointment ≥ 24h before start (BR-APPT-009)',
        );
      }
    } else if (now >= appt.startAt.getTime()) {
      // BR-APPT-025: a CHECKED_IN patient who leaves before being seen can't
      // be marked no-show (they did arrive), so cancel is the only way out —
      // without this the appointment stayed CHECKED_IN in the queue forever.
      if (appt.status !== AppointmentStatus.CHECKED_IN) {
        throw new InvalidAppointmentStateException(
          'Receptionist/admin may only cancel before appointment start (BR-APPT-010)',
        );
      }
      if ((dto.reason?.trim().length ?? 0) < LATE_CANCEL_REASON_MIN_LENGTH) {
        throw new InvalidAppointmentStateException(
          `Cancelling a checked-in appointment after its start requires a reason (≥ ${LATE_CANCEL_REASON_MIN_LENGTH} chars)`,
        );
      }
      lateCheckedInCancel = true;
    }

    const updated = await this.prisma.$transaction(async tx => {
      // See checkIn() above — same guarded-write race protection.
      const cancelResult = await tx.appointment.updateMany({
        where: { id: appointmentId, status: appt.status },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledBy: actor.sub,
          cancelledReason: dto.reason,
          updatedBy: actor.sub,
        },
      });
      if (cancelResult.count === 0) {
        throw new InvalidAppointmentStateException(
          'Appointment was changed by someone else — reload and try again',
        );
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
      throw new InvalidAppointmentStateException(`Cannot mark no-show from status ${appt.status}`);
    }

    // See checkIn() above — same guarded-write race protection.
    const noShowResult = await this.prisma.appointment.updateMany({
      where: { id: appointmentId, status: appt.status },
      data: {
        status: AppointmentStatus.NO_SHOW,
        noShowAt: new Date(),
        cancelledReason: dto.reason,
        updatedBy: actor.sub,
      },
    });
    if (noShowResult.count === 0) {
      throw new InvalidAppointmentStateException(
        'Appointment was changed by someone else — reload and try again',
      );
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
   * Cron-driven bulk auto-no-show (BR-APPT-012). Idempotent.
   */
  async autoMarkNoShow() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - NO_SHOW_GRACE_MIN * 60_000);

    // Single guarded write: selecting ids first and then updating by id alone
    // let a check-in that landed between the two queries be overwritten with
    // NO_SHOW. Re-stating the status filter in the write itself closes that.
    const updated = await this.prisma.appointment.updateMany({
      where: {
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        // now > max(startAt + grace, endAt)
        startAt: { lt: cutoff },
        endAt: { lt: now },
        deletedAt: null,
      },
      data: {
        status: AppointmentStatus.NO_SHOW,
        noShowAt: now,
        updatedBy: null,
      },
    });
    if (updated.count === 0) return { updated: 0 };

    await this.audit.log({
      action: 'APPOINTMENT_AUTO_NO_SHOW',
      actorUserId: null,
      targetType: 'appointment',
      metadata: { count: updated.count, cutoff },
    });

    return { updated: updated.count };
  }

  async reschedule(appointmentId: string, dto: RescheduleAppointmentDto, actor: JwtPayload) {
    const appt = await this.requireAppointment(appointmentId);

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
        `Cannot reschedule appointment in status ${appt.status}`,
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
    const newDentistId = dto.newDentistId ?? appt.dentistId;
    if (newDentistId !== appt.dentistId) {
      await this.validateDentist(newDentistId);
    }

    // Single tx under advisory lock to serialize overlap checks (R2-7).
    const result = await this.prisma.$transaction(async tx => {
      await this.lockDentist(tx, newDentistId);
      await this.lockPatient(tx, appt.patientId);
      await this.ensureSlotAvailable(newDentistId, newStart, newEnd, actor, appt.id, tx, {
        bufferBeforeMin: appt.bufferBeforeMin ?? 0,
        bufferAfterMin: appt.bufferAfterMin ?? 0,
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
          rescheduleCount: { increment: 1 },
          lastRescheduleAt: new Date(),
          // A confirmation was for the old time — the new one needs its own.
          status: AppointmentStatus.SCHEDULED,
          confirmedAt: null,
          confirmedBy: null,
          updatedBy: actor.sub,
        },
      });
      if (rescheduleResult.count === 0) {
        throw new InvalidAppointmentStateException(
          'Appointment was changed by someone else — reload and try again',
        );
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
    });

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
      },
    });

    return result;
  }

  // ==========================================================================
  // Availability
  // ==========================================================================

  async getAvailability(q: AvailabilityQueryDto) {
    return this.availability.dayAvailability(q.dentistId, q.date, q.slotDuration, {
      beforeMin: q.bufferBeforeMin,
      afterMin: q.bufferAfterMin,
    });
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
        `Cannot update appointment in status ${appt.status}`,
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
      targetType: 'Appointment',
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
   * practice status. Dentists whose profile is not ACTIVE are left out
   * (BR-STAFF-006); dentists without a profile yet stay listed.
   */
  async listDentistOptions() {
    const rows = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deactivatedAt: null,
        deletedAt: null,
        userRoles: {
          some: {
            role: {
              code: 'dentist',
              deletedAt: null,
            },
          },
        },
        OR: [
          { dentistProfile: null },
          { dentistProfile: { practiceStatus: 'ACTIVE', deletedAt: null } },
        ],
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
              { patient: { fullName: { contains: q.q } } },
              { patient: { primaryPhone: { contains: q.q } } },
              { notes: { contains: q.q } },
            ],
          }
        : {}),
    };
    const pageSize = q.pageSize ?? 50;
    const items = await this.prisma.appointment.findMany({
      where,
      orderBy: { startAt: 'asc' },
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
    this.assertOwnScheduleOrStaff(actor, dto.dentistId);
    if (this.toMinutes(dto.endTime) <= this.toMinutes(dto.startTime)) {
      throw new InvalidAppointmentStateException('endTime must be after startTime');
    }
    await this.validateDentist(dto.dentistId, { forBooking: false });
    // BR-APPT-018: validate no time-range overlap on same dentist + dayOfWeek.
    // We approximate by checking other schedules within ±1 day range of validFrom.
    const validFrom = new Date(dto.validFrom);
    const validTo = dto.validTo ? new Date(dto.validTo) : null;
    const candidates = await this.prisma.workingSchedule.findMany({
      where: {
        dentistId: dto.dentistId,
        dayOfWeek: dto.dayOfWeek,
        deletedAt: null,
        validFrom: { lte: validTo ?? new Date('9999-12-31') },
        OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
      },
    });
    for (const c of candidates) {
      const cStart = this.toMinutes(this.toTimeString(c.startTime));
      const cEnd = this.toMinutes(this.toTimeString(c.endTime));
      const oStart = this.toMinutes(dto.startTime);
      const oEnd = this.toMinutes(dto.endTime);
      if (oStart < cEnd && cStart < oEnd) {
        throw new ScheduleOverlapException();
      }
    }
    // Mirror of createShiftRegistration's check: a recurring schedule must
    // not overlap a pending/approved one-off shift on a matching date, or
    // availability would offer the same hours twice (BR-APPT-026).
    const shifts = await this.prisma.shiftRegistration.findMany({
      where: {
        dentistId: dto.dentistId,
        status: { in: ['PENDING', 'APPROVED'] },
        date: { gte: validFrom, ...(validTo ? { lte: validTo } : {}) },
        deletedAt: null,
      },
    });
    for (const shift of shifts) {
      if (shift.date.getUTCDay() !== dto.dayOfWeek) continue;
      const sStart = this.toMinutes(shift.startTime);
      const sEnd = this.toMinutes(shift.endTime);
      if (this.toMinutes(dto.startTime) < sEnd && sStart < this.toMinutes(dto.endTime)) {
        throw new InvalidAppointmentStateException(
          `Lịch làm việc trùng ca đăng ký ngày ${shift.date.toISOString().slice(0, 10)} ${shift.startTime}-${shift.endTime}`,
        );
      }
    }

    const created = await this.prisma.workingSchedule.create({
      data: {
        dentistId: dto.dentistId,
        dayOfWeek: dto.dayOfWeek,
        startTime: this.toPgTime(dto.startTime),
        endTime: this.toPgTime(dto.endTime),
        slotDurationMin: dto.slotDurationMin ?? 30,
        validFrom,
        validTo,
        isPaidShift: dto.isPaidShift ?? true,
        shiftType: dto.shiftType ?? 'FULL_DAY',
        createdBy: actor.sub,
      },
    });

    await this.audit.log({
      action: 'WORKING_SCHEDULE_CREATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'working_schedule',
      targetId: created.id,
      metadata: {
        dentistId: dto.dentistId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });

    return created;
  }

  async listWorkingSchedules(dentistId: string | undefined, _actor: JwtPayload) {
    const where: Prisma.WorkingScheduleWhereInput = {
      deletedAt: null,
      ...(dentistId ? { dentistId } : {}),
    };
    return {
      data: await this.prisma.workingSchedule.findMany({
        where,
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
    };
  }

  async createTimeOff(dto: CreateTimeOffDto, actor: JwtPayload) {
    this.assertOwnScheduleOrStaff(actor, dto.dentistId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt.getTime() <= startAt.getTime()) {
      throw new InvalidAppointmentStateException('endAt must be after startAt');
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
          `Dentist has ${patientsInClinic} checked-in/in-progress appointments during requested time-off window`,
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
    });

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
        'Dentist already has pending or approved time-off in this period',
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
      throw new InvalidAppointmentStateException(`Time-off is ${current.status}, not PENDING`);
    }
    if (current.endAt.getTime() <= Date.now()) {
      throw new InvalidAppointmentStateException('Time-off has already ended');
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
          `Dentist has ${inClinic} checked-in/in-progress appointments during this time-off`,
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
    });
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
      throw new InvalidAppointmentStateException('A reason (≥ 5 characters) is required to reject');
    }
    const current = await this.prisma.timeOff.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppointmentNotFoundException(id);
    if (current.status !== 'PENDING') {
      throw new InvalidAppointmentStateException(`Time-off is ${current.status}, not PENDING`);
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
      throw new InvalidAppointmentStateException(`Time-off is already ${current.status}`);
    }
    if (current.endAt.getTime() <= Date.now()) {
      throw new InvalidAppointmentStateException('Time-off has already ended');
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
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        patient: { select: { id: true, code: true, fullName: true, primaryPhone: true } },
      },
    });
  }

  // ==========================================================================
  // Schedule overrides (ADR-0009 phase 3)
  // ==========================================================================

  /** Overrides change a whole day of the calendar: front desk/admin only. */
  private assertStaff(actor: JwtPayload) {
    if (this.isRowScopedDentist(actor)) {
      throw new ForbiddenException('Chỉ lễ tân/quản trị được đóng lịch hoặc đổi giờ làm');
    }
  }

  async createScheduleOverride(dto: CreateScheduleOverrideDto, actor: JwtPayload) {
    this.assertStaff(actor);
    const hasTimes = Boolean(dto.startTime) || Boolean(dto.endTime);
    if (hasTimes && !(dto.startTime && dto.endTime)) {
      throw new InvalidAppointmentStateException('Provide both startTime and endTime');
    }
    if (dto.kind === 'CHANGED_HOURS' && !hasTimes) {
      throw new InvalidAppointmentStateException('Changed hours need startTime and endTime');
    }
    if (hasTimes && dto.endTime! <= dto.startTime!) {
      throw new InvalidAppointmentStateException('endTime must be after startTime');
    }
    const localDate = dto.date.slice(0, 10);
    if (localDate < clinicDateOnly()) {
      throw new InvalidAppointmentStateException('Cannot change the calendar of a past day');
    }
    await this.validateDentist(dto.dentistId, { forBooking: false });
    const date = new Date(localDate);
    const dayStart = startOfClinicDay(localDate);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
    // For a closed range only that range matters; otherwise the whole day.
    const windowStart =
      dto.kind === 'CLOSED' && hasTimes
        ? this.combineDateAndTime(localDate, dto.startTime!)
        : dayStart;
    const windowEnd =
      dto.kind === 'CLOSED' && hasTimes ? this.combineDateAndTime(localDate, dto.endTime!) : dayEnd;

    const { created, affectedAppointments } = await this.prisma.$transaction(async tx => {
      await this.lockDentist(tx, dto.dentistId);
      if (dto.kind === 'CHANGED_HOURS') {
        const existing = await tx.scheduleOverride.findFirst({
          where: { dentistId: dto.dentistId, date, kind: 'CHANGED_HOURS', deletedAt: null },
        });
        if (existing) {
          throw new BusinessRuleException(
            'This day already has changed hours; remove them first',
            HttpStatus.CONFLICT,
            { overrideId: existing.id },
            'OVERRIDE_EXISTS',
          );
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
          `Dentist has ${inClinic} checked-in/in-progress appointments in this period`,
        );
      }
      const created = await tx.scheduleOverride.create({
        data: {
          dentistId: dto.dentistId,
          date,
          kind: dto.kind,
          startTime: hasTimes ? this.toPgTime(dto.startTime!) : null,
          endTime: hasTimes ? this.toPgTime(dto.endTime!) : null,
          reason: dto.reason.trim(),
          createdBy: actor.sub,
        },
      });
      // Bookings of that day that the new calendar no longer allows.
      const candidates = await this.affectedInWindow(tx, {
        dentistId: dto.dentistId,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        deletedAt: null,
      });
      const affectedAppointments = [];
      for (const a of candidates) {
        if (await this.calendarProblem(dto.dentistId, a.startAt, a.endAt, tx)) {
          affectedAppointments.push(a);
        }
      }
      return { created, affectedAppointments };
    });
    await this.audit.log({
      action: 'SCHEDULE_OVERRIDE_CREATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'schedule_override',
      targetId: created.id,
      metadata: {
        dentistId: dto.dentistId,
        date: localDate,
        kind: dto.kind,
        affectedAppointmentIds: affectedAppointments.map(a => a.id),
      },
    });
    return { ...this.formatOverride(created), affectedAppointments };
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

  async deleteScheduleOverride(id: string, actor: JwtPayload) {
    this.assertStaff(actor);
    const row = await this.prisma.scheduleOverride.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw new AppointmentNotFoundException(id);
    await this.prisma.scheduleOverride.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actor.sub },
    });
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
      },
    });
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
      throw new AppointmentNotFoundException(dto.dentistId);
    }
    if (this.toMinutes(dto.endTime) <= this.toMinutes(dto.startTime)) {
      throw new InvalidAppointmentStateException('endTime must be after startTime');
    }
    const regDate = new Date(dto.date);
    if (regDate.getTime() < Date.now() - 24 * 60 * 60_000) {
      throw new InvalidAppointmentStateException('Cannot register a shift in the past');
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
          `Shift conflicts with working schedule ${this.toTimeString(s.startTime)}-${this.toTimeString(s.endTime)}`,
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
          `Conflicts with existing shift registration ${p.startTime}-${p.endTime}`,
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

    const updated = await this.prisma.shiftRegistration.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedByUserId: actor.sub,
        approvedAt: new Date(),
      },
    });

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

    const updated = await this.prisma.shiftRegistration.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedByUserId: actor.sub,
        approvedAt: new Date(),
        rejectionReason: reason,
      },
    });

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
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const stale = await this.prisma.shiftRegistration.findMany({
      where: {
        status: 'PENDING',
        date: { lt: today },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (stale.length === 0) return { updated: 0 };
    const updated = await this.prisma.shiftRegistration.updateMany({
      where: { id: { in: stale.map(s => s.id) } },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
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
  ): Promise<VisitPlan | null> {
    if (!serviceIds?.length) return null;
    const day = new Date(localDate);
    const assignments = await this.prisma.dentistService.findMany({
      where: {
        dentistId,
        serviceId: { in: serviceIds },
        effectiveFrom: { lte: day },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
        service: { isActive: true },
      },
      include: { service: true },
    });
    const byService = new Map(assignments.map(a => [a.serviceId, a]));
    const missing = serviceIds.filter(id => !byService.has(id));
    if (missing.length > 0) {
      throw new BusinessRuleException(
        'The dentist does not perform every chosen service on that day',
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

  /** BR-APPT-031: a length different from the services' total needs a reason. */
  private checkDurationOverride(
    plan: VisitPlan | null,
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
        `The services add up to ${plan.durationMin} minutes; a different length (${minutes}) needs a reason (≥ 5 characters)`,
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
    const dentist = await this.validateDentist(dto.dentistId);
    await this.validateActivePatient(dto.patientId);
    const plan = await this.planVisit(dto.dentistId, dto.serviceIds, clinicDateOnly(startAt));
    const minutes = plan?.durationMin ?? dto.durationMin ?? this.defaultSlotMinutes(dentist);
    const endAt = new Date(startAt.getTime() + minutes * 60_000);

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
    });
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
    if (appt.status !== AppointmentStatus.CHECKED_IN) {
      throw new InvalidAppointmentStateException(
        `Only a checked-in patient can leave before the exam (status is ${appt.status})`,
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
        throw new InvalidAppointmentStateException(
          'Appointment was changed by someone else — reload and try again',
        );
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
        where: { targetType: 'appointment', targetId: appointmentId },
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
  isRowScopedDentist(actor: JwtPayload): boolean {
    return (
      actor.permissions.includes('appointment.read.own') &&
      !actor.permissions.includes('appointment.read.any')
    );
  }

  /**
   * BR-STAFF-006: a dentist is an active account with the dentist role and,
   * once profiles exist, an ACTIVE dentist profile. Bookings require an
   * ACTIVE practice; schedules and time-off may still be managed while a
   * dentist is suspended (`forBooking: false`). Accounts without a profile
   * (created before migration 019 or by an old seed) are accepted by role
   * alone until PR-7 removes that fallback.
   */
  async validateDentist(dentistId: string, { forBooking = true } = {}) {
    const u = await this.prisma.user.findUnique({
      where: { id: dentistId },
      include: { userRoles: { include: { role: true } }, dentistProfile: true },
    });
    if (!u || u.status !== 'ACTIVE' || !u.userRoles.some(ur => ur.role.code === 'dentist')) {
      throw new AppointmentNotFoundException(
        `Dentist ${dentistId} is not active or lacks dentist role`,
      );
    }
    const profile = u.dentistProfile && !u.dentistProfile.deletedAt ? u.dentistProfile : null;
    if (!profile) {
      this.logger.warn(
        `Dentist ${dentistId} has no dentist profile; accepted by role (BR-STAFF-006)`,
      );
    } else if (forBooking && profile.practiceStatus !== 'ACTIVE') {
      throw new AppointmentNotFoundException(
        `Dentist ${dentistId} is ${profile.practiceStatus.toLowerCase()} and cannot take bookings`,
      );
    }
    return u;
  }

  private async validateActivePatient(patientId: string) {
    const p = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!p || p.deletedAt) {
      throw new AppointmentNotFoundException(`Patient ${patientId} is deleted`);
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
