import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppointmentStatus, Prisma, QueuePriority, QueueStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import { clinicDateOnly, startOfClinicDay } from '../common/date-range.util';
import { AppointmentsService, STALE_APPOINTMENT_MSG, VisitPlan } from './appointments.service';
import {
  LOCKING_TX_OPTIONS,
  lockDentistCalendar,
  lockPatientCalendar,
} from './domain/advisory-lock';
import { compareQueue, priorityAtCheckIn } from './domain/queue';
import { AppointmentNotFoundException } from './domain/exceptions';
import {
  APPOINTMENT_RESCHEDULED_EVENT,
  AppointmentRescheduledEvent,
} from '../common/events/domain-events';

const OPEN_STATUSES: QueueStatus[] = [QueueStatus.WAITING, QueueStatus.CALLED, QueueStatus.SKIPPED];

const ENTRY_INCLUDE = {
  appointment: {
    select: {
      id: true,
      status: true,
      startAt: true,
      endAt: true,
      visitKind: true,
      chiefComplaint: true,
      patient: { select: { id: true, code: true, fullName: true, primaryPhone: true } },
      services: {
        select: { serviceName: true, durationMin: true },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
} satisfies Prisma.QueueEntryInclude;

type EntryRow = Prisma.QueueEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;
type ApptWithServices = Prisma.AppointmentGetPayload<{ include: { services: true } }>;

/** reassignDay also takes bookings started this long ago (the check-in window, A3-05). */
const REASSIGN_GRACE_MIN = 30;

const queueError = (message: string, code: string, status = HttpStatus.CONFLICT) =>
  new BusinessRuleException(message, status, undefined, code);

/**
 * Dispatch (ADR-0009 phase 6): the pre-exam queue per dentist, calling and
 * skipping patients, emergency priority, moving a waiting patient to another
 * dentist, and moving a whole day of bookings to a substitute (D3).
 * Slot rules come from AvailabilityService via AppointmentsService, so a
 * transfer can never land where a booking could not.
 */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appointments: AppointmentsService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /** GET /queue — open entries for a clinic date, in dispatch order per dentist. */
  async list(q: { dentistId?: string; date?: string }, actor: JwtPayload) {
    const date = q.date ?? clinicDateOnly();
    const dentistId = this.appointments.isRowScopedDentist(actor) ? actor.sub : q.dentistId;
    const rows = await this.prisma.queueEntry.findMany({
      where: {
        queueDate: new Date(date),
        doneAt: null,
        status: { in: OPEN_STATUSES },
        ...(dentistId ? { dentistId } : {}),
      },
      include: ENTRY_INCLUDE,
    });
    const dentists = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map(r => r.dentistId))] } },
      select: { id: true, fullName: true, dentistProfile: { select: { calendarColor: true } } },
    });
    const byId = new Map(dentists.map(d => [d.id, d]));
    const now = Date.now();
    const position = new Map<string, number>();
    return rows
      .sort((a, b) => a.dentistId.localeCompare(b.dentistId) || compareQueue(a, b))
      .map(r => {
        const next = r.status === QueueStatus.WAITING ? (position.get(r.dentistId) ?? 0) + 1 : null;
        if (next) position.set(r.dentistId, next);
        return this.present(r, byId.get(r.dentistId), next, now);
      });
  }

  private present(
    r: EntryRow,
    dentist:
      { fullName: string; dentistProfile: { calendarColor: string | null } | null } | undefined,
    position: number | null,
    now: number,
  ) {
    return {
      id: r.id,
      appointmentId: r.appointmentId,
      dentistId: r.dentistId,
      dentistName: dentist?.fullName ?? '',
      calendarColor: dentist?.dentistProfile?.calendarColor ?? null,
      status: r.status,
      priority: r.priority,
      position,
      checkedInAt: r.checkedInAt,
      waitingMinutes: Math.max(0, Math.round((now - r.checkedInAt.getTime()) / 60_000)),
      emergencyReason: r.emergencyReason,
      calledAt: r.calledAt,
      callCount: r.callCount,
      skipReason: r.skipReason,
      skipCount: r.skipCount,
      transferredFromId: r.transferredFromId,
      transferReason: r.transferReason,
      appointment: r.appointment,
    };
  }

  private async openEntry(id: string, actor: JwtPayload) {
    const entry = await this.prisma.queueEntry.findUnique({ where: { id } });
    // A dentist only sees their own queue; another dentist's entry is a 404.
    if (
      !entry ||
      entry.doneAt ||
      (this.appointments.isRowScopedDentist(actor) && entry.dentistId !== actor.sub)
    ) {
      throw new AppointmentNotFoundException(id, 'Không tìm thấy lượt chờ');
    }
    return entry;
  }

  /** Guarded status change: fails with 409 if someone changed the entry first. */
  private async guardedUpdate(
    id: string,
    from: QueueStatus[],
    data: Prisma.QueueEntryUpdateManyMutationInput,
  ) {
    try {
      const res = await this.prisma.queueEntry.updateMany({
        where: { id, doneAt: null, status: { in: from } },
        data,
      });
      if (res.count === 0) {
        throw queueError(
          'Hàng đợi vừa được người khác thay đổi — tải lại rồi thử lại',
          'QUEUE_STALE',
        );
      }
    } catch (e) {
      // queue_entries_one_called_per_day_idx: one called patient per dentist per day.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw queueError(
          'Bác sĩ đang gọi một bệnh nhân khác — bắt đầu khám hoặc bỏ qua bệnh nhân đó trước',
          'QUEUE_DENTIST_BUSY',
        );
      }
      throw e;
    }
    return this.prisma.queueEntry.findUniqueOrThrow({ where: { id } });
  }

  private log(
    action: string,
    actor: JwtPayload,
    appointmentId: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.log({
      action,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'appointment',
      targetId: appointmentId,
      metadata,
    });
  }

  /** BR-DSP-002: call a waiting (or previously skipped) patient in. */
  async call(id: string, actor: JwtPayload) {
    const entry = await this.openEntry(id, actor);
    // Sent twice (A3-21): the patient is already being called.
    if (entry.status === QueueStatus.CALLED) return entry;
    const updated = await this.guardedUpdate(id, [QueueStatus.WAITING, QueueStatus.SKIPPED], {
      status: QueueStatus.CALLED,
      calledAt: new Date(),
      calledBy: actor.sub,
      callCount: { increment: 1 },
      updatedBy: actor.sub,
    });
    await this.log('QUEUE_CALLED', actor, entry.appointmentId, { callCount: updated.callCount });
    return updated;
  }

  /**
   * A3-15: called by mistake — back to waiting in the same place, without
   * the skip count or a reason a "skip" would need.
   */
  async uncall(id: string, actor: JwtPayload) {
    const entry = await this.openEntry(id, actor);
    if (entry.status === QueueStatus.WAITING) return entry;
    const updated = await this.guardedUpdate(id, [QueueStatus.CALLED], {
      status: QueueStatus.WAITING,
      updatedBy: actor.sub,
    });
    await this.log('QUEUE_UNCALLED', actor, entry.appointmentId, {});
    return updated;
  }

  /** BR-DSP-003: the patient did not answer; they wait at the end and can be called again. */
  async skip(id: string, reason: string, actor: JwtPayload) {
    const entry = await this.openEntry(id, actor);
    const updated = await this.guardedUpdate(id, [QueueStatus.WAITING, QueueStatus.CALLED], {
      status: QueueStatus.SKIPPED,
      skippedAt: new Date(),
      skipReason: reason.trim(),
      skipCount: { increment: 1 },
      updatedBy: actor.sub,
    });
    await this.log('QUEUE_SKIPPED', actor, entry.appointmentId, { reason: reason.trim() });
    return updated;
  }

  /** BR-DSP-004: an emergency goes before everyone waiting. */
  async markEmergency(id: string, reason: string, actor: JwtPayload) {
    const entry = await this.openEntry(id, actor);
    if (entry.priority === QueuePriority.EMERGENCY) return entry;
    const updated = await this.guardedUpdate(id, OPEN_STATUSES, {
      priority: QueuePriority.EMERGENCY,
      emergencyReason: reason.trim(),
      updatedBy: actor.sub,
    });
    await this.log('QUEUE_EMERGENCY', actor, entry.appointmentId, {
      reason: reason.trim(),
      previousPriority: entry.priority,
    });
    return updated;
  }

  /**
   * A3-15: an emergency marked by mistake goes back to the class the
   * patient had from their check-in (on time, late or walk-in).
   */
  async clearEmergency(id: string, reason: string, actor: JwtPayload) {
    const entry = await this.openEntry(id, actor);
    if (entry.priority !== QueuePriority.EMERGENCY) return entry;
    const appt = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: entry.appointmentId },
      select: { visitKind: true, startAt: true },
    });
    const priority = priorityAtCheckIn(appt, entry.checkedInAt);
    const updated = await this.guardedUpdate(id, OPEN_STATUSES, {
      priority,
      emergencyReason: null,
      updatedBy: actor.sub,
    });
    await this.log('QUEUE_EMERGENCY_CLEARED', actor, entry.appointmentId, {
      reason: reason.trim(),
      emergencyReason: entry.emergencyReason,
      priority,
    });
    return updated;
  }

  /**
   * The visit as the new dentist would do it (A5-05): their durations and
   * the services' buffers, unless the length was set by hand (BR-APPT-031).
   * Booked prices stay (ADR-0009 D6).
   */
  private async planFor(appt: ApptWithServices, dentistId: string, date: string) {
    const current = Math.round((appt.endAt.getTime() - appt.startAt.getTime()) / 60_000);
    if (!appt.services.length) return { plan: null, minutes: current };
    const plan = await this.appointments.planVisit(
      dentistId,
      appt.services.map(s => s.serviceId),
      date,
      // A booked visit keeps a service withdrawn since, as on reschedule.
      { activeServicesOnly: false },
    );
    return {
      plan,
      minutes: plan && !appt.durationOverrideReason ? plan.durationMin : current,
    };
  }

  /** Writes the new dentist's plan onto the visit and its service rows. */
  private async writePlan(
    tx: Prisma.TransactionClient,
    appointmentId: string,
    plan: VisitPlan | null,
  ): Promise<Prisma.AppointmentUpdateManyMutationInput> {
    if (!plan) return {};
    for (const sv of plan.services) {
      await tx.appointmentService.updateMany({
        where: { appointmentId, serviceId: sv.serviceId },
        data: {
          durationMin: sv.durationMin,
          bufferBeforeMin: sv.bufferBeforeMin,
          bufferAfterMin: sv.bufferAfterMin,
        },
      });
    }
    return {
      calculatedDurationMin: plan.durationMin,
      bufferBeforeMin: plan.bufferBeforeMin,
      bufferAfterMin: plan.bufferAfterMin,
    };
  }

  /**
   * BR-DSP-005: move a waiting (or called) patient to another dentist. They
   * join that dentist's queue (A3-01): the new dentist must perform the
   * services and be on duty, but may be busy — the queue orders patients,
   * so several patients can be handed over at once. The visit is set from
   * now (or its booked time if still ahead) with the new dentist's length;
   * past the end of their hours needs `allowOvertime`. The patient keeps
   * their priority and check-in time.
   */
  async transfer(
    id: string,
    dto: { dentistId: string; reason: string; allowOvertime?: boolean },
    actor: JwtPayload,
  ) {
    const entry = await this.openEntry(id, actor);
    if (entry.dentistId === dto.dentistId) {
      throw queueError(
        'Bệnh nhân đã ở hàng đợi của bác sĩ này',
        'QUEUE_SAME_DENTIST',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.appointments.validateDentist(dto.dentistId);
    const appt = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: entry.appointmentId },
      include: { services: { orderBy: { sortOrder: 'asc' } } },
    });
    const nowMin = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    const from = appt.startAt > nowMin ? appt.startAt : nowMin;
    const { plan, minutes } = await this.planFor(appt, dto.dentistId, clinicDateOnly(from));
    const reason = dto.reason.trim();
    const moved = await this.prisma.$transaction(async tx => {
      await lockDentistCalendar(tx, dto.dentistId);
      await lockPatientCalendar(tx, appt.patientId);
      const slot = await this.appointments.queueSlot(tx, dto.dentistId, from, minutes, {
        excludeAppointmentId: appt.id,
        overtimeReason: dto.allowOvertime ? reason : null,
        buffers: plan ?? appt,
      });
      await this.appointments.ensurePatientFree(
        appt.patientId,
        slot.startAt,
        slot.endAt,
        appt.id,
        tx,
      );
      const planData = await this.writePlan(tx, appt.id, plan);
      const res = await tx.appointment.updateMany({
        where: { id: appt.id, status: AppointmentStatus.CHECKED_IN, dentistId: entry.dentistId },
        // A new reminder only matters for a later visit; cleared like a reschedule.
        data: {
          dentistId: dto.dentistId,
          startAt: slot.startAt,
          endAt: slot.endAt,
          ...planData,
          reminderSentAt: null,
          updatedBy: actor.sub,
        },
      });
      if (res.count === 0) {
        throw queueError(STALE_APPOINTMENT_MSG, 'QUEUE_STALE');
      }
      await tx.appointmentRescheduleLog.create({
        data: {
          appointmentId: appt.id,
          oldDentistId: appt.dentistId,
          oldStartAt: appt.startAt,
          oldEndAt: appt.endAt,
          newDentistId: dto.dentistId,
          newStartAt: slot.startAt,
          newEndAt: slot.endAt,
          reason,
          changedBy: actor.sub,
        },
      });
      // Guarded like guardedUpdate: an entry closed (or moved) since the
      // read above must not be reopened under the new dentist. A called
      // patient waits again, now in the new dentist's line.
      const requeued = await tx.queueEntry.updateMany({
        where: {
          id,
          doneAt: null,
          dentistId: entry.dentistId,
          status: { in: OPEN_STATUSES },
        },
        data: {
          dentistId: dto.dentistId,
          queueDate: new Date(clinicDateOnly(slot.startAt)),
          status: QueueStatus.WAITING,
          transferredFromId: entry.dentistId,
          transferReason: reason,
          updatedBy: actor.sub,
        },
      });
      if (requeued.count === 0) {
        // Rolls back the appointment move above too.
        throw queueError(
          'Bệnh nhân vừa bắt đầu khám hoặc đã rời hàng đợi — tải lại rồi thử lại',
          'QUEUE_STALE',
        );
      }
      return slot;
    }, LOCKING_TX_OPTIONS);
    await this.log('APPOINTMENT_TRANSFERRED', actor, appt.id, {
      fromDentistId: entry.dentistId,
      toDentistId: dto.dentistId,
      reason,
      startAt: moved.startAt.toISOString(),
      ...(moved.overtime ? { overtime: true } : {}),
    });
    return this.prisma.queueEntry.findUniqueOrThrow({ where: { id } });
  }

  /**
   * BR-DSP-006 (ADR-0009 D3 "thay bác sĩ"): move a dentist's day to a
   * substitute. Bookings not checked in yet keep their time (also those
   * just started whose patient may still arrive, A3-05) and take the
   * substitute's durations (A5-05); patients already waiting are moved to
   * the substitute's queue as by transfer(). Each one is checked on its
   * own; the ones the substitute cannot take are listed with the reason
   * and stay where they are. Closing the absent dentist's calendar is a
   * separate step (schedule override / time-off).
   */
  async reassignDay(
    dto: { fromDentistId: string; toDentistId: string; date: string; reason: string },
    actor: JwtPayload,
  ) {
    if (dto.fromDentistId === dto.toDentistId) {
      throw queueError(
        'Chọn một bác sĩ khác để thay',
        'QUEUE_SAME_DENTIST',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.appointments.validateDentist(dto.toDentistId);
    const dayStart = startOfClinicDay(dto.date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
    // A booking whose patient may still check in (within the check-in
    // window after its start) still needs a dentist.
    const notBefore = Math.max(dayStart.getTime(), Date.now() - REASSIGN_GRACE_MIN * 60_000);
    const candidates = await this.prisma.appointment.findMany({
      where: {
        dentistId: dto.fromDentistId,
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        startAt: { gte: new Date(notBefore), lt: dayEnd },
        deletedAt: null,
      },
      include: {
        services: { orderBy: { sortOrder: 'asc' } },
        patient: { select: { code: true, fullName: true } },
      },
      orderBy: { startAt: 'asc' },
    });
    const reason = dto.reason.trim();
    const moved: Array<{ appointmentId: string; startAt: Date; patientName: string }> = [];
    const transferred: Array<{ appointmentId: string; startAt: Date; patientName: string }> = [];
    const failed: Array<{
      appointmentId: string;
      startAt: Date;
      patientName: string;
      reason: string;
      checkedIn?: boolean;
    }> = [];
    for (const appt of candidates) {
      try {
        const { plan, minutes } = await this.planFor(appt, dto.toDentistId, dto.date);
        const endAt = new Date(appt.startAt.getTime() + minutes * 60_000);
        await this.prisma.$transaction(async tx => {
          await lockDentistCalendar(tx, dto.toDentistId);
          try {
            await this.appointments.ensureSlotAvailable(
              dto.toDentistId,
              appt.startAt,
              endAt,
              actor,
              appt.id,
              tx,
              plan ?? appt,
            );
          } catch (e) {
            const length = Math.round((appt.endAt.getTime() - appt.startAt.getTime()) / 60_000);
            // Say why when it is the substitute's longer visit that does not fit.
            if (e instanceof Error && minutes !== length) {
              throw new Error(`Bác sĩ thay cần ${minutes} phút cho lượt này — ${e.message}`);
            }
            throw e;
          }
          const planData = await this.writePlan(tx, appt.id, plan);
          // The slot was checked for the time read above: a booking moved
          // meanwhile must not be carried over at its new time unchecked.
          const res = await tx.appointment.updateMany({
            where: {
              id: appt.id,
              dentistId: dto.fromDentistId,
              status: appt.status,
              startAt: appt.startAt,
              endAt: appt.endAt,
              rescheduleCount: appt.rescheduleCount,
            },
            // The reminder names the dentist: the new one gets its own.
            data: {
              dentistId: dto.toDentistId,
              endAt,
              ...planData,
              reminderSentAt: null,
              updatedBy: actor.sub,
            },
          });
          if (res.count === 0) throw new Error(STALE_APPOINTMENT_MSG);
          await tx.appointmentRescheduleLog.create({
            data: {
              appointmentId: appt.id,
              oldDentistId: dto.fromDentistId,
              oldStartAt: appt.startAt,
              oldEndAt: appt.endAt,
              newDentistId: dto.toDentistId,
              newStartAt: appt.startAt,
              newEndAt: endAt,
              reason,
              changedBy: actor.sub,
            },
          });
        }, LOCKING_TX_OPTIONS);
        await this.log('APPOINTMENT_REASSIGNED', actor, appt.id, {
          fromDentistId: dto.fromDentistId,
          toDentistId: dto.toDentistId,
          reason,
        });
        // The patient is told of the new dentist (booking notices).
        this.events?.emit(APPOINTMENT_RESCHEDULED_EVENT, {
          appointmentId: appt.id,
          oldStartAt: appt.startAt,
          newStartAt: appt.startAt,
          oldDentistId: dto.fromDentistId,
          newDentistId: dto.toDentistId,
        } satisfies AppointmentRescheduledEvent);
        moved.push({
          appointmentId: appt.id,
          startAt: appt.startAt,
          patientName: appt.patient.fullName,
        });
      } catch (e) {
        failed.push({
          appointmentId: appt.id,
          startAt: appt.startAt,
          patientName: appt.patient.fullName,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // A3-05: patients already waiting for the absent dentist that day.
    const waiting = await this.prisma.queueEntry.findMany({
      where: {
        dentistId: dto.fromDentistId,
        queueDate: new Date(dto.date),
        doneAt: null,
        status: { in: OPEN_STATUSES },
      },
      include: ENTRY_INCLUDE,
    });
    for (const entry of waiting.sort(compareQueue)) {
      const patientName = entry.appointment.patient.fullName;
      try {
        await this.transfer(entry.id, { dentistId: dto.toDentistId, reason }, actor);
        transferred.push({
          appointmentId: entry.appointmentId,
          startAt: entry.appointment.startAt,
          patientName,
        });
      } catch (e) {
        failed.push({
          appointmentId: entry.appointmentId,
          startAt: entry.appointment.startAt,
          patientName,
          reason: e instanceof Error ? e.message : String(e),
          checkedIn: true,
        });
      }
    }
    return { moved, transferred, failed };
  }
}
