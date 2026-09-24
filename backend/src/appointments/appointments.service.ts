import { Injectable, Logger } from '@nestjs/common';
import { Appointment, AppointmentStatus, EncounterStatus, Prisma, User } from '@prisma/client';
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
  RescheduleLimitReachedException,
  ScheduleOverlapException,
  SlotConflictException,
} from './domain/exceptions';
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
} from './dto/appointment.dto';

const CHECKIN_WINDOW_BEFORE_MIN = 15;
const CHECKIN_WINDOW_AFTER_MIN = 30;
// Auto no-show must not fire before the check-in window closes — otherwise a
// patient arriving inside the window (e.g. +20 min) is already NO_SHOW and
// can't be checked in, not even with an override (BR-APPT-006 / 012).
const NO_SHOW_GRACE_MIN = CHECKIN_WINDOW_AFTER_MIN;
const LATE_CANCEL_REASON_MIN_LENGTH = 5;

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

    // Honor a client-provided endAt (e.g. a chosen duration) instead of
    // always defaulting — this DTO field has always been accepted and
    // validated but was silently discarded here, so every appointment was
    // persisted at defaultSlotMinutes regardless of what was requested.
    const endAt = dto.endAt
      ? new Date(dto.endAt)
      : new Date(startAt.getTime() + this.defaultSlotMinutes(dentist) * 60_000);
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BackDatedAppointmentException();
    }

    // Wrap the overlap check + insert in a single $transaction under an
    // advisory lock keyed by dentistId. This prevents two concurrent
    // bookings on the same dentist from both passing the gap check
    // (BR-APPT-002 / 003 / 004 — see Phase 9.2 R2-7 lesson).
    return this.prisma.$transaction(async tx => {
      await this.lockDentist(tx, dto.dentistId);
      await this.ensureSlotAvailable(dto.dentistId, startAt, endAt, actor, undefined, tx);

      const created = await tx.appointment.create({
        data: {
          patientId: dto.patientId,
          dentistId: dto.dentistId,
          startAt,
          endAt,
          status: AppointmentStatus.SCHEDULED,
          reason: dto.reason ?? dto.chiefComplaint ?? null,
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
        },
      });

      return created;
    });
  }

  /**
   * Serialize bookings for a dentist using a Postgres advisory lock.
   * The lock is bound to the transaction and released on commit/rollback.
   */
  private async lockDentist(tx: Prisma.TransactionClient, dentistId: string): Promise<void> {
    // FNV-1a 32-bit hash, then take abs(); fits Postgres bigint.
    let h = 0x811c9dc5;
    for (let i = 0; i < dentistId.length; i++) {
      h ^= dentistId.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    const key = BigInt(h);
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${key.toString()}::bigint)`);
  }

  // ==========================================================================
  // State machine: check-in / cancel / no-show / reschedule
  // ==========================================================================

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
    const checkInResult = await this.prisma.appointment.updateMany({
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
    const updated = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
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
        startAt: { lt: cutoff },
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
      await this.ensureSlotAvailable(newDentistId, newStart, newEnd, actor, appt.id, tx);
      await this.ensureNoTimeOff(newDentistId, newStart, newEnd, tx);

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
    const scheduleDate = new Date(q.date);
    const dayStart = startOfClinicDay(q.date);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const schedules = await this.prisma.workingSchedule.findMany({
      where: {
        dentistId: q.dentistId,
        dayOfWeek: scheduleDate.getUTCDay(),
        validFrom: { lte: scheduleDate },
        OR: [{ validTo: null }, { validTo: { gte: scheduleDate } }],
        deletedAt: null,
      },
      orderBy: { startTime: 'asc' },
    });

    if (schedules.length === 0) {
      throw new AppointmentNotFoundException(
        `Working schedule for dentist ${q.dentistId} on ${q.date}`,
      );
    }

    const slotMin = q.slotDuration ?? schedules[0].slotDurationMin ?? 30;

    // Working hours union
    const allBooked = await this.prisma.appointment.findMany({
      where: {
        dentistId: q.dentistId,
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
        startAt: { gte: dayStart, lt: dayEnd },
        deletedAt: null,
      },
      select: { startAt: true, endAt: true },
    });

    const timeOffs = await this.prisma.timeOff.findMany({
      where: {
        dentistId: q.dentistId,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        deletedAt: null,
      },
      select: { startAt: true, endAt: true },
    });

    const slots: string[] = [];
    for (const sched of schedules) {
      const start = this.combineDateAndTime(q.date, this.toTimeString(sched.startTime));
      const end = this.combineDateAndTime(q.date, this.toTimeString(sched.endTime));
      for (let t = start.getTime(); t + slotMin * 60_000 <= end.getTime(); t += slotMin * 60_000) {
        const slotStart = new Date(t);
        const slotEnd = new Date(t + slotMin * 60_000);

        const overlapsBooked = allBooked.some(b => slotStart < b.endAt && b.startAt < slotEnd);
        if (overlapsBooked) continue;
        const overlapsTimeOff = timeOffs.some(o => slotStart < o.endAt && o.startAt < slotEnd);
        if (overlapsTimeOff) continue;

        slots.push(this.toTimeString(new Date(slotStart.getTime() + CLINIC_UTC_OFFSET_MS)));
      }
    }

    return {
      dentistId: q.dentistId,
      date: q.date,
      dayOfWeek: scheduleDate.getUTCDay(),
      workingHours: {
        startTime: this.toTimeString(schedules[0].startTime),
        endTime: this.toTimeString(schedules[schedules.length - 1].endTime),
      },
      slotDuration: slotMin,
      availableSlots: slots,
      blockedReason: null,
    };
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

    const reason = dto.chiefComplaint ?? dto.reason ?? appt.reason;

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        reason: dto.reason !== undefined ? reason : appt.reason,
        notes: dto.notes !== undefined ? dto.notes : appt.notes,
        updatedBy: actor.sub,
      },
    });

    await this.audit.log({
      action: 'APPOINTMENT_UPDATED',
      targetType: 'Appointment',
      targetId: id,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      metadata: { reason, notes: dto.notes },
    });

    return updated;
  }

  async listDentistOptions() {
    return this.prisma.user.findMany({
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
      },
      select: {
        id: true,
        fullName: true,
      },
      orderBy: {
        fullName: 'asc',
      },
    });
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
    if (this.toMinutes(dto.endTime) <= this.toMinutes(dto.startTime)) {
      throw new InvalidAppointmentStateException('endTime must be after startTime');
    }
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
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt.getTime() <= startAt.getTime()) {
      throw new InvalidAppointmentStateException('endAt must be after startAt');
    }

    const checkedIn = await this.prisma.appointment.count({
      where: {
        dentistId: dto.dentistId,
        status: AppointmentStatus.CHECKED_IN,
        startAt: { gte: startAt, lte: endAt },
        deletedAt: null,
      },
    });
    if (checkedIn > 0) {
      throw new InvalidAppointmentStateException(
        `Dentist has ${checkedIn} checked-in appointments during requested time-off window`,
      );
    }

    const created = await this.prisma.timeOff.create({
      data: {
        dentistId: dto.dentistId,
        startAt,
        endAt,
        type: dto.type,
        reason: dto.reason,
        createdBy: actor.sub,
      },
    });

    await this.audit.log({
      action: 'TIME_OFF_CREATED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'time_off',
      targetId: created.id,
      metadata: { dentistId: dto.dentistId, type: dto.type },
    });

    return created;
  }

  async listTimeOffs(dentistId: string | undefined) {
    return {
      data: await this.prisma.timeOff.findMany({
        where: { deletedAt: null, ...(dentistId ? { dentistId } : {}) },
        orderBy: { startAt: 'desc' },
      }),
    };
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

  async cancelShiftRegistration(id: string, actor: JwtPayload) {
    const shift = await this.prisma.shiftRegistration.findUnique({ where: { id } });
    if (!shift) throw new AppointmentNotFoundException(id);

    const isAdmin =
      actor.permissions.includes('shift.cancel') && actor.permissions.includes('shift.approve');
    if (!isAdmin && shift.dentistId !== actor.sub) {
      throw new AppointmentNotFoundException(id);
    }
    if (shift.status !== 'APPROVED' && shift.status !== 'PENDING') {
      throw new InvalidAppointmentStateException(`Cannot cancel shift in status ${shift.status}`);
    }

    // BR-APPT-028 / BR-PAY-014: BS cancel only if ≥ 24h before
    if (!isAdmin && shift.status === 'APPROVED') {
      const shiftStart = this.combineDateAndTime(
        shift.date.toISOString().slice(0, 10),
        shift.startTime,
      );
      const hoursUntil = (shiftStart.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil < 24) {
        throw new InvalidAppointmentStateException(
          'BS may only cancel APPROVED shift ≥ 24h before start; admin override required',
        );
      }
    }

    const updated = await this.prisma.shiftRegistration.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    await this.audit.log({
      action: 'SHIFT_REGISTRATION_CANCELLED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'shift_registration',
      targetId: id,
      metadata: { lateCancel: !isAdmin && shift.status === 'APPROVED' },
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
  private isRowScopedDentist(actor: JwtPayload): boolean {
    return (
      actor.permissions.includes('appointment.read.own') &&
      !actor.permissions.includes('appointment.read.any')
    );
  }

  private async validateDentist(dentistId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: dentistId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!u || u.status !== 'ACTIVE' || !u.userRoles.some(ur => ur.role.code === 'dentist')) {
      throw new AppointmentNotFoundException(
        `Dentist ${dentistId} is not active or lacks dentist role`,
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

  private defaultSlotMinutes(_dentist: User): number {
    // Could later pull from dentist's default schedule; for MVP hard-code 30.
    return 30;
  }

  /**
   * BR-APPT-002/003/004: ensure slot is available — no active appointment
   * collision, inside working schedule, no time-off overlap.
   */
  private async ensureSlotAvailable(
    dentistId: string,
    startAt: Date,
    endAt: Date,
    _actor: JwtPayload,
    excludeAppointmentId?: string,
    txClient?: Prisma.TransactionClient,
  ) {
    const client = (txClient ?? this.prisma) as PrismaService;
    // Overlap check (not exact startAt match): two appointments conflict when
    // newStart < existing.endAt AND existing.startAt < newEnd.
    const conflict = await client.appointment.findFirst({
      where: {
        dentistId,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
        deletedAt: null,
        ...(excludeAppointmentId ? { NOT: { id: excludeAppointmentId } } : {}),
      },
      select: { id: true },
    });
    if (conflict) throw new SlotConflictException();

    // BR-APPT-003: working schedule required
    const localDate = clinicDateOnly(startAt);
    const scheduleDate = new Date(localDate);
    const sched = await client.workingSchedule.findFirst({
      where: {
        dentistId,
        dayOfWeek: scheduleDate.getUTCDay(),
        startTime: {
          lte: this.toPgTime(this.toTimeString(new Date(startAt.getTime() + CLINIC_UTC_OFFSET_MS))),
        },
        endTime: {
          gte: this.toPgTime(this.toTimeString(new Date(endAt.getTime() + CLINIC_UTC_OFFSET_MS))),
        },
        validFrom: { lte: scheduleDate },
        OR: [{ validTo: null }, { validTo: { gte: scheduleDate } }],
        deletedAt: null,
      },
    });
    if (!sched) {
      throw new OutsideWorkingHoursException('Dentist has no working schedule for this day');
    }
    const schedStart = this.combineDateAndTime(localDate, this.toTimeString(sched.startTime));
    const schedEnd = this.combineDateAndTime(localDate, this.toTimeString(sched.endTime));
    if (startAt < schedStart || endAt > schedEnd) {
      throw new OutsideWorkingHoursException(
        `Appointment ${startAt.toISOString()} → ${endAt.toISOString()} falls outside working hours ${this.toTimeString(sched.startTime)}-${this.toTimeString(sched.endTime)}`,
      );
    }

    // BR-APPT-004: time-off overlap
    await this.ensureNoTimeOff(dentistId, startAt, endAt, txClient);
  }

  private async ensureNoTimeOff(
    dentistId: string,
    startAt: Date,
    endAt: Date,
    txClient?: Prisma.TransactionClient,
  ) {
    const client = (txClient ?? this.prisma) as PrismaService;
    const overlap = await client.timeOff.findFirst({
      where: {
        dentistId,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        deletedAt: null,
      },
    });
    if (overlap) {
      throw new DentistUnavailableException(
        `Dentist is on time-off from ${overlap.startAt.toISOString()} to ${overlap.endAt.toISOString()}`,
      );
    }
  }

  // Time helpers
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
