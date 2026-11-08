import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Appointment, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AvailabilityService, slotStepMinutes } from '../appointments/availability.service';
import { freeSlots } from '../appointments/domain/day-calendar';
import { LOCKING_TX_OPTIONS, lockDentistCalendar, lockPatientCalendar } from '../appointments/domain/advisory-lock';
import { clinicDateOnly, startOfClinicDay } from '../common/date-range.util';
import { closureIntervals, nextClinicOpening } from '../common/clinic-hours';
import { JwtPayload } from '../common/guards/permissions.guard';
import { assertClinicWide } from '../common/row-scope';
import { APPOINTMENT_CANCELLED_EVENT, APPOINTMENT_RESCHEDULED_EVENT } from '../common/events/domain-events';
import { BookingService, bookingHoldMinutes, bookingMaxDaysAhead, patientCancelMinHours } from './booking.service';
import { resolveAppointmentLink } from './appointment-link-access';
import { isCalendarDate } from './dto/booking.dto';
import { AppointmentLinkCancelDto, AppointmentLinkRescheduleDto, ApproveAppointmentLinkRescheduleDto } from './dto/appointment-link.dto';

const STAFF_INCLUDE = {
  appointment: { select: {
    id: true, startAt: true, endAt: true, status: true, confirmedByPatient: true,
    patient: { select: { id: true, fullName: true, primaryPhone: true } },
    dentist: { select: { id: true, fullName: true } },
  } },
} as const;

@Injectable()
export class AppointmentLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appointments: AppointmentsService,
    private readonly availability: AvailabilityService,
    private readonly booking: BookingService,
    private readonly events: EventEmitter2,
  ) {}

  async get(token: string) {
    return this.prisma.$transaction(async tx => {
      const appt = await resolveAppointmentLink(tx, token);
      return this.view(tx, appt.id);
    });
  }

  async confirm(token: string) {
    return this.mutate(token, async (tx, appt) => {
      if (!appt.confirmedByPatient) {
        await this.change(tx, appt, { status: 'CONFIRMED', confirmedAt: new Date(),
          confirmedBy: null, confirmedByPatient: true, updatedBy: null });
        await this.audit.log({ action: 'APPOINTMENT_CONFIRMED_BY_PATIENT',
          targetType: 'appointment', targetId: appt.id, metadata: { channel: 'PATIENT_LINK' } }, tx);
      }
      return this.view(tx, appt.id);
    });
  }

  async slots(token: string, date: string) {
    this.validateDate(date);
    return this.prisma.$transaction(async tx => {
      const appt = await resolveAppointmentLink(tx, token);
      if (appt.rescheduleCount >= 3) throw new ConflictException('Đã đạt giới hạn dời lịch');
      const plan = await this.plan(tx, appt, date);
      const loaded = await this.availability.loadDay(appt.dentistId, date, tx);
      const cal = { ...loaded, bookings: loaded.bookings.filter(b => b.id !== appt.id) };
      const held = await this.booking.heldIntervals(appt.dentistId, date, tx);
      const from = startOfClinicDay(date);
      const patientBookings = await tx.appointment.findMany({ where: {
        patientId: appt.patientId, id: { not: appt.id }, deletedAt: null,
        status: { notIn: ['CANCELLED', 'NO_SHOW', 'LEFT'] },
        startAt: { lt: new Date(from.getTime() + 86400000) }, endAt: { gt: from },
      }, select: { startAt: true, endAt: true } });
      const times = freeSlots(cal, plan.durationMin, slotStepMinutes(),
        new Date(Date.now() + 60000), { beforeMin: plan.bufferBeforeMin, afterMin: plan.bufferAfterMin });
      return { date, slots: times.map(hhmm => {
        const startAt = new Date(`${date}T${hhmm}:00+07:00`);
        return { startAt, endAt: new Date(startAt.getTime() + plan.durationMin * 60000) };
      }).filter(s => s.startAt.getTime() !== appt.startAt.getTime() &&
        !held.some(h => s.startAt.getTime() - plan.bufferBeforeMin * 60000 < h.end &&
          h.start < s.endAt.getTime() + plan.bufferAfterMin * 60000) &&
        !(patientBookings ?? []).some(b => s.startAt < b.endAt && b.startAt < s.endAt)) };
    }, LOCKING_TX_OPTIONS);
  }

  async reschedule(token: string, dto: AppointmentLinkRescheduleDto) {
    if (!dto.startAt && !dto.note?.trim()) throw new BadRequestException('Hãy chọn giờ mới hoặc ghi lời nhắn');
    return this.mutate(token, async (tx, appt) => {
      if (appt.rescheduleCount >= 3) throw new ConflictException('Đã đạt giới hạn dời lịch');
      const pending = await tx.appointmentLinkRescheduleRequest.findFirst({
        where: { appointmentId: appt.id, status: 'PENDING' },
      });
      if (pending && this.sameVisit(pending, appt) &&
          (!pending.holdUntil || pending.holdUntil > new Date())) {
        if ((pending.requestedStartAt?.toISOString() ?? null) ===
            (dto.startAt ? new Date(dto.startAt).toISOString() : null) &&
            pending.note === (dto.note?.trim() || null)) return this.view(tx, appt.id);
        throw new ConflictException('Đã có yêu cầu dời lịch đang chờ lễ tân');
      }
      if (pending) await tx.appointmentLinkRescheduleRequest.update({
        where: { id: pending.id }, data: { status: 'CANCELLED', holdUntil: null },
      });
      const startAt = dto.startAt ? new Date(dto.startAt) : null;
      let endAt: Date | null = null;
      let holdUntil: Date | null = null;
      let buffers = { bufferBeforeMin: 0, bufferAfterMin: 0 };
      if (startAt) {
        const plan = await this.assertSlot(tx, appt, startAt);
        buffers = plan;
        endAt = new Date(startAt.getTime() + plan.durationMin * 60000);
        const minutes = bookingHoldMinutes();
        if (minutes > 0) {
          const closures = await tx.clinicClosure.findMany({ where: { deletedAt: null },
            select: { startDate: true, endDate: true, startTime: true } });
          const opening = nextClinicOpening(new Date(), undefined, closureIntervals(closures));
          holdUntil = new Date(Math.min(startAt.getTime(), opening.getTime() + minutes * 60000));
        }
      }
      await this.change(tx, appt, { rescheduleRequestedAt: new Date() });
      const request = await tx.appointmentLinkRescheduleRequest.create({ data: {
        appointmentId: appt.id, dentistId: appt.dentistId,
        originalStartAt: appt.startAt, originalEndAt: appt.endAt,
        requestedStartAt: startAt, requestedEndAt: endAt, holdUntil,
        bufferBeforeMin: buffers.bufferBeforeMin, bufferAfterMin: buffers.bufferAfterMin,
        note: dto.note?.trim() || null,
      } });
      await this.audit.log({ action: 'RESCHEDULE_REQUESTED', targetType: 'appointment',
        targetId: appt.id, metadata: { requestId: request.id,
          requestedStartAt: startAt?.toISOString() ?? null, channel: 'PATIENT_LINK' } }, tx);
      return this.view(tx, appt.id);
    });
  }

  async cancel(token: string, dto: AppointmentLinkCancelDto) {
    const result = await this.mutate(token, async (tx, appt) => {
      if (Date.now() > this.cancelUntil(appt).getTime())
        throw new BadRequestException('Đã gần đến giờ hẹn, vui lòng gọi phòng khám để hủy');
      const now = new Date();
      await this.change(tx, appt, { status: 'CANCELLED', cancelledAt: now, cancelledBy: null,
        cancelledByClinic: false, cancelledReason: dto.reason?.trim() || 'Khách hủy qua liên kết',
        rescheduleRequestedAt: null, updatedBy: null });
      await tx.appointmentLinkRescheduleRequest.updateMany({
        where: { appointmentId: appt.id, status: 'PENDING' },
        data: { status: 'CANCELLED', holdUntil: null },
      });
      await tx.bookingRequest.updateMany({ where: { appointmentId: appt.id }, data: {
        patientCancelledAt: now, closeReason: 'PATIENT_CANCELLED_VISIT',
      } });
      await this.audit.log({ action: 'APPOINTMENT_CANCELLED', targetType: 'appointment',
        targetId: appt.id, metadata: { channel: 'PATIENT_LINK', reason: dto.reason ?? null } }, tx);
      return { view: await this.view(tx, appt.id), appt, now };
    });
    this.events.emit(APPOINTMENT_CANCELLED_EVENT, { appointmentId: result.appt.id,
      patientId: result.appt.patientId, dentistId: result.appt.dentistId,
      cancelledAt: result.now, cancelledBy: null, reason: dto.reason });
    return result.view;
  }

  async listRequests(actor: JwtPayload) {
    assertClinicWide(actor, 'appointment');
    return this.prisma.appointmentLinkRescheduleRequest.findMany({
      where: { status: 'PENDING', appointment: {
        deletedAt: null, patient: { deletedAt: null },
        status: { in: ['SCHEDULED', 'CONFIRMED'] }, startAt: { gt: new Date() },
      } }, include: STAFF_INCLUDE, orderBy: { createdAt: 'asc' },
    });
  }

  async approve(id: string, dto: ApproveAppointmentLinkRescheduleDto, actor: JwtPayload) {
    assertClinicWide(actor, 'appointment');
    const result = await this.prisma.$transaction(async tx => {
      const row = await tx.appointmentLinkRescheduleRequest.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Không tìm thấy yêu cầu');
      await lockDentistCalendar(tx, row.dentistId);
      const initial = await tx.appointment.findUniqueOrThrow({ where: { id: row.appointmentId } });
      await lockPatientCalendar(tx, initial.patientId);
      await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${row.appointmentId}::uuid FOR UPDATE`;
      const appt = await tx.appointment.findUniqueOrThrow({ where: { id: row.appointmentId } });
      const current = await tx.appointmentLinkRescheduleRequest.findUniqueOrThrow({ where: { id } });
      if (current.status !== 'PENDING') throw new ConflictException('Yêu cầu đã được xử lý');
      if (appt.deletedAt || appt.startAt <= new Date() ||
          !['SCHEDULED', 'CONFIRMED'].includes(appt.status) || !this.sameVisit(current, appt))
        throw new ConflictException('Lịch hẹn đã thay đổi, hãy yêu cầu khách chọn lại');
      if (current.holdUntil && current.holdUntil <= new Date())
        throw new ConflictException('Thời gian giữ chỗ đã hết, hãy yêu cầu khách chọn lại');
      const start = dto.startAt ? new Date(dto.startAt) : current.requestedStartAt;
      if (!start) throw new BadRequestException('Cần chọn giờ mới để duyệt lời nhắn');
      const plan = await this.assertSlot(tx, appt, start);
      const end = new Date(start.getTime() + plan.durationMin * 60000);
      const moved = await this.appointments.reschedule(appt.id, {
        newStartsAt: start.toISOString(), newEndsAt: end.toISOString(),
        reason: current.note ?? 'Khách xin dời qua liên kết',
        rescheduleCount: appt.rescheduleCount, updatedAt: appt.updatedAt.toISOString(),
      }, actor, tx);
      const approved = await tx.appointmentLinkRescheduleRequest.update({ where: { id }, data: {
        status: 'APPROVED', approvedAt: new Date(), approvedBy: actor.sub, holdUntil: null,
        requestedStartAt: start, requestedEndAt: end,
      }, include: STAFF_INCLUDE });
      await this.audit.log({ action: 'RESCHEDULE_REQUEST_APPROVED', actorUserId: actor.sub,
        actorEmail: actor.email, targetType: 'appointment', targetId: appt.id,
        metadata: { requestId: id } }, tx);
      return { approved, appt, moved };
    }, LOCKING_TX_OPTIONS);
    this.events.emit(APPOINTMENT_RESCHEDULED_EVENT, { appointmentId: result.appt.id,
      oldStartAt: result.appt.startAt, newStartAt: result.moved.startAt,
      oldDentistId: result.appt.dentistId, newDentistId: result.moved.dentistId });
    return result.approved;
  }

  private async mutate<T>(token: string, write: (tx: Prisma.TransactionClient, appt: Appointment) => Promise<T>) {
    return this.prisma.$transaction(async tx => {
      const initial = await resolveAppointmentLink(tx, token);
      await lockDentistCalendar(tx, initial.dentistId);
      await lockPatientCalendar(tx, initial.patientId);
      await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${initial.id}::uuid FOR UPDATE`;
      const current = await resolveAppointmentLink(tx, token);
      if (current.dentistId !== initial.dentistId || current.startAt.getTime() !== initial.startAt.getTime())
        throw new ConflictException('Lịch hẹn đã thay đổi, hãy tải lại');
      return write(tx, current);
    }, LOCKING_TX_OPTIONS);
  }

  private async change(tx: Prisma.TransactionClient, appt: Appointment, data: Prisma.AppointmentUncheckedUpdateManyInput) {
    const changed = await tx.appointment.updateMany({ where: { id: appt.id, deletedAt: null,
      status: appt.status, startAt: appt.startAt, endAt: appt.endAt, dentistId: appt.dentistId,
      updatedAt: appt.updatedAt, rescheduleCount: appt.rescheduleCount }, data });
    if (!changed.count) throw new ConflictException('Lịch hẹn đã thay đổi, hãy tải lại');
  }

  private validateDate(date: string) {
    if (!isCalendarDate(date)) throw new BadRequestException('Ngày không hợp lệ (YYYY-MM-DD)');
    const days = (startOfClinicDay(date).getTime() - startOfClinicDay(clinicDateOnly()).getTime()) / 86400000;
    if (days < 0 || days > bookingMaxDaysAhead()) throw new BadRequestException('Ngày ngoài thời gian nhận đặt lịch');
  }

  private async plan(tx: Prisma.TransactionClient, appt: Appointment, date: string) {
    await this.appointments.validateDentist(appt.dentistId, { db: tx });
    const services = await tx.appointmentService.findMany({
      where: { appointmentId: appt.id }, select: { serviceId: true }, orderBy: { sortOrder: 'asc' },
    });
    const replanned = date !== clinicDateOnly(appt.startAt) ?
      await this.appointments.planVisit(appt.dentistId, services.map(s => s.serviceId), date,
        { activeServicesOnly: false, db: tx }) : null;
    const duration = (appt.endAt.getTime() - appt.startAt.getTime()) / 60000;
    const keepOverride = !!appt.durationOverrideReason &&
      replanned?.durationMin === appt.calculatedDurationMin;
    return { durationMin: replanned && !keepOverride ? replanned.durationMin : duration,
      bufferBeforeMin: replanned?.bufferBeforeMin ?? appt.bufferBeforeMin,
      bufferAfterMin: replanned?.bufferAfterMin ?? appt.bufferAfterMin };
  }

  private async assertSlot(tx: Prisma.TransactionClient, appt: Appointment, start: Date) {
    if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now() + 60000 ||
        start.getUTCSeconds() || start.getUTCMilliseconds()) throw new BadRequestException('Giờ mới không hợp lệ');
    this.validateDate(clinicDateOnly(start));
    if (start.getTime() === appt.startAt.getTime()) throw new BadRequestException('Hãy chọn giờ khác lịch hiện tại');
    const plan = await this.plan(tx, appt, clinicDateOnly(start));
    const end = new Date(start.getTime() + plan.durationMin * 60000);
    const problem = await this.availability.checkSlot(appt.dentistId, start, end, {
      db: tx, excludeAppointmentId: appt.id,
      buffers: { beforeMin: plan.bufferBeforeMin, afterMin: plan.bufferAfterMin },
    });
    if (problem) throw new ConflictException(problem.message);
    const held = await this.booking.heldIntervals(appt.dentistId, clinicDateOnly(start), tx);
    if (held.some(h => start.getTime() - plan.bufferBeforeMin * 60000 < h.end &&
        h.start < end.getTime() + plan.bufferAfterMin * 60000)) throw new ConflictException('Giờ này đang được giữ chỗ');
    await this.appointments.ensurePatientFree(appt.patientId, start, end, appt.id, tx);
    return plan;
  }

  private sameVisit(row: { dentistId: string; originalStartAt: Date; originalEndAt: Date }, appt: Appointment) {
    return row.dentistId === appt.dentistId && row.originalStartAt.getTime() === appt.startAt.getTime() &&
      row.originalEndAt.getTime() === appt.endAt.getTime();
  }

  private cancelUntil(appt: Appointment) {
    return new Date(appt.startAt.getTime() - patientCancelMinHours() * 3600000);
  }

  private async view(tx: Prisma.TransactionClient, id: string) {
    const appt = await tx.appointment.findUniqueOrThrow({ where: { id }, include: {
      dentist: { select: { fullName: true } },
      services: { select: { serviceName: true }, orderBy: { sortOrder: 'asc' } },
      rescheduleRequests: { orderBy: { createdAt: 'desc' }, take: 1 },
    } });
    const active = ['SCHEDULED', 'CONFIRMED'].includes(appt.status) && appt.startAt > new Date();
    const request = appt.rescheduleRequests[0];
    return { startAt: appt.startAt, endAt: appt.endAt, status: appt.status,
      confirmedAt: appt.confirmedAt, confirmedByPatient: appt.confirmedByPatient,
      dentist: appt.dentist, services: appt.services.map(s => ({ name: s.serviceName })),
      canConfirm: active && !appt.confirmedByPatient,
      canReschedule: active && appt.rescheduleCount < 3,
      canCancel: active && new Date() <= this.cancelUntil(appt), cancelUntil: this.cancelUntil(appt),
      rescheduleRequest: request ? { id: request.id, status: request.status,
        requestedStartAt: request.requestedStartAt, requestedEndAt: request.requestedEndAt,
        note: request.note, holdUntil: request.holdUntil } : null };
  }
}
