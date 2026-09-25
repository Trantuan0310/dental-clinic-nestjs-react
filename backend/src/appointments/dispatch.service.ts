import { HttpStatus, Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma, QueuePriority, QueueStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import { clinicDateOnly, startOfClinicDay } from '../common/date-range.util';
import { AppointmentsService } from './appointments.service';
import { lockDentistCalendar } from './domain/advisory-lock';
import { compareQueue } from './domain/queue';
import { AppointmentNotFoundException } from './domain/exceptions';

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
      throw new AppointmentNotFoundException(`Queue entry ${id}`);
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
      // queue_entries_one_called_idx: one called patient per dentist.
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
   * BR-DSP-005: move a waiting patient to another dentist. The visit keeps
   * its length and buffers and starts now (or at its booked time if that is
   * still ahead); the new dentist must perform its services and be free.
   * The patient keeps their priority and check-in time.
   */
  async transfer(id: string, dto: { dentistId: string; reason: string }, actor: JwtPayload) {
    const entry = await this.openEntry(id, actor);
    if (entry.status === QueueStatus.CALLED) {
      throw queueError('Bệnh nhân đang được gọi — bỏ qua trước khi chuyển bác sĩ', 'QUEUE_CALLED');
    }
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
    const start = appt.startAt > nowMin ? appt.startAt : nowMin;
    const end = new Date(start.getTime() + (appt.endAt.getTime() - appt.startAt.getTime()));
    if (appt.services.length) {
      await this.appointments.planVisit(
        dto.dentistId,
        appt.services.map(s => s.serviceId),
        clinicDateOnly(start),
      );
    }
    const reason = dto.reason.trim();
    await this.prisma.$transaction(async tx => {
      await lockDentistCalendar(tx, dto.dentistId);
      await this.appointments.ensureSlotAvailable(
        dto.dentistId,
        start,
        end,
        actor,
        appt.id,
        tx,
        appt,
      );
      const moved = await tx.appointment.updateMany({
        where: { id: appt.id, status: AppointmentStatus.CHECKED_IN, dentistId: entry.dentistId },
        data: { dentistId: dto.dentistId, startAt: start, endAt: end, updatedBy: actor.sub },
      });
      if (moved.count === 0) {
        throw queueError(
          'Lịch hẹn vừa được người khác thay đổi — tải lại rồi thử lại',
          'QUEUE_STALE',
        );
      }
      await tx.appointmentRescheduleLog.create({
        data: {
          appointmentId: appt.id,
          oldDentistId: appt.dentistId,
          oldStartAt: appt.startAt,
          oldEndAt: appt.endAt,
          newDentistId: dto.dentistId,
          newStartAt: start,
          newEndAt: end,
          reason,
          changedBy: actor.sub,
        },
      });
      await tx.queueEntry.update({
        where: { id },
        data: {
          dentistId: dto.dentistId,
          queueDate: new Date(clinicDateOnly(start)),
          status: QueueStatus.WAITING,
          transferredFromId: entry.dentistId,
          transferReason: reason,
          updatedBy: actor.sub,
        },
      });
    });
    await this.log('APPOINTMENT_TRANSFERRED', actor, appt.id, {
      fromDentistId: entry.dentistId,
      toDentistId: dto.dentistId,
      reason,
    });
    return this.prisma.queueEntry.findUniqueOrThrow({ where: { id } });
  }

  /**
   * BR-DSP-006 (ADR-0009 D3 "thay bác sĩ"): move a dentist's not-yet-arrived
   * bookings on a date to a substitute, keeping each time. Each booking is
   * checked on its own; the ones the substitute cannot take are listed with
   * the reason and stay where they are. Checked-in patients are moved one by
   * one with transfer().
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
    const candidates = await this.prisma.appointment.findMany({
      where: {
        dentistId: dto.fromDentistId,
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        startAt: { gte: new Date(Math.max(dayStart.getTime(), Date.now())), lt: dayEnd },
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
    const failed: Array<{
      appointmentId: string;
      startAt: Date;
      patientName: string;
      reason: string;
    }> = [];
    for (const appt of candidates) {
      try {
        if (appt.services.length) {
          await this.appointments.planVisit(
            dto.toDentistId,
            appt.services.map(s => s.serviceId),
            dto.date,
          );
        }
        await this.prisma.$transaction(async tx => {
          await lockDentistCalendar(tx, dto.toDentistId);
          await this.appointments.ensureSlotAvailable(
            dto.toDentistId,
            appt.startAt,
            appt.endAt,
            actor,
            appt.id,
            tx,
            appt,
          );
          const res = await tx.appointment.updateMany({
            where: { id: appt.id, dentistId: dto.fromDentistId, status: appt.status },
            data: { dentistId: dto.toDentistId, updatedBy: actor.sub },
          });
          if (res.count === 0) throw new Error('Lịch hẹn vừa được người khác thay đổi');
          await tx.appointmentRescheduleLog.create({
            data: {
              appointmentId: appt.id,
              oldDentistId: dto.fromDentistId,
              oldStartAt: appt.startAt,
              oldEndAt: appt.endAt,
              newDentistId: dto.toDentistId,
              newStartAt: appt.startAt,
              newEndAt: appt.endAt,
              reason,
              changedBy: actor.sub,
            },
          });
        });
        await this.log('APPOINTMENT_REASSIGNED', actor, appt.id, {
          fromDentistId: dto.fromDentistId,
          toDentistId: dto.toDentistId,
          reason,
        });
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
    return { moved, failed };
  }
}
