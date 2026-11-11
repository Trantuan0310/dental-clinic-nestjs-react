import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentsService } from '../../appointments/appointments.service';
import { AvailabilityService } from '../../appointments/availability.service';
import { clinicDateOnly } from '../../common/date-range.util';
import type { JwtPayload } from '../../common/guards/permissions.guard';
import type { ChangeAction, ChangeKind } from './assistant-tools';
import type {
  CancelAppointmentDto,
  RescheduleAppointmentDto,
} from '../../appointments/dto/appointment.dto';

type Proposal = {
  type: ChangeKind;
  appointmentId: string;
  claimId: string;
  resultId: string;
  dto: CancelAppointmentDto & Partial<RescheduleAppointmentDto>;
};
const PROPOSAL_ACTION = 'AI_APPOINTMENT_PROPOSED';
const TTL_MS = 15 * 60_000;

@Injectable()
export class AssistantActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly availability: AvailabilityService,
  ) {}

  private permission(type: ChangeKind, actor: JwtPayload) {
    if (
      !actor.permissions.includes(
        type === 'cancel_appointment' ? 'appointment.cancel' : 'appointment.update',
      )
    ) {
      throw new ForbiddenException('Không có quyền thực hiện thay đổi lịch hẹn');
    }
  }

  async propose(
    type: ChangeKind,
    args: Record<string, unknown>,
    actor: JwtPayload,
  ): Promise<ChangeAction> {
    this.permission(type, actor);
    const id = typeof args.appointmentId === 'string' ? args.appointmentId : '';
    if (!id) throw new BadRequestException('Cần appointmentId từ appointments_on');
    const appt = await this.appointments.getById(id, actor);
    if (!['SCHEDULED', 'CONFIRMED'].includes(appt.status))
      throw new BadRequestException('Chỉ đổi lịch chưa đến khám');
    const own = this.appointments.appointmentScope(actor) === 'own';
    if (appt.startAt.getTime() <= Date.now() + (own ? 24 * 3600_000 : 0)) {
      throw new BadRequestException('Đã quá hạn thay đổi lịch; hãy nhờ lễ tân kiểm tra');
    }
    const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
    if (reason.length < 5 || reason.length > 500)
      throw new BadRequestException('Lý do cần từ 5 đến 500 ký tự');
    const dto: Proposal['dto'] = {
      reason,
      updatedAt: appt.updatedAt.toISOString(),
      rescheduleCount: appt.rescheduleCount,
    };
    let startAt = appt.startAt.toISOString();
    let endAt = appt.endAt.toISOString();
    let dentistName = appt.dentist?.fullName ?? '';
    if (type === 'reschedule_appointment') {
      if (appt.rescheduleCount >= 3)
        throw new BadRequestException('Đã đạt giới hạn 3 lần dời lịch');
      const date = typeof args.date === 'string' ? args.date : '';
      const time = typeof args.time === 'string' ? args.time : '';
      const parsed = new Date(`${date}T00:00:00+07:00`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(parsed.getTime()) ||
        clinicDateOnly(parsed) !== date ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
      )
        throw new BadRequestException('Ngày hoặc giờ không hợp lệ');
      const dentistId = typeof args.dentistId === 'string' ? args.dentistId : appt.dentistId;
      if (!dentistId || (own && dentistId !== actor.sub))
        throw new ForbiddenException('Bác sĩ chỉ đổi trong lịch của mình');
      await this.appointments.validateDentist(dentistId);
      const changedPlan = dentistId !== appt.dentistId || date !== clinicDateOnly(appt.startAt);
      const plan = changedPlan
        ? await this.appointments.planVisit(
            dentistId,
            appt.services.map(s => s.serviceId),
            date,
            { activeServicesOnly: false },
          )
        : null;
      const durationMin =
        plan?.durationMin ?? (appt.endAt.getTime() - appt.startAt.getTime()) / 60_000;
      const slots = await this.availability.dayAvailability(
        dentistId,
        date,
        durationMin,
        {
          beforeMin: plan?.bufferBeforeMin ?? appt.bufferBeforeMin ?? 0,
          afterMin: plan?.bufferAfterMin ?? appt.bufferAfterMin ?? 0,
        },
        id,
      );
      if (!slots.availableSlots.some(slot => slot === time))
        throw new BadRequestException('Giờ này không còn trống');
      startAt = `${date}T${time}:00+07:00`;
      endAt = new Date(Date.parse(startAt) + durationMin * 60_000).toISOString();
      dto.newStartsAt = startAt;
      dto.newEndsAt = endAt;
      dto.newDentistId = dentistId;
      if (dentistId !== appt.dentistId) {
        const dentists = await this.appointments.listDentistOptions('booking');
        dentistName = dentists.find(d => d.id === dentistId)?.fullName ?? '';
      }
    }
    const metadata: Proposal = {
      type,
      appointmentId: id,
      dto,
      claimId: randomUUID(),
      resultId: randomUUID(),
    };
    const row = await this.prisma.auditLog.create({
      data: {
        action: PROPOSAL_ACTION,
        actorUserId: actor.sub,
        targetType: 'appointment',
        targetId: id,
        metadata: JSON.parse(JSON.stringify(metadata)),
      },
    });
    return {
      type,
      payload: { proposalId: row.id },
      view: {
        patientRef: '',
        dentistName,
        startAt,
        endAt,
        reason,
        previousStartAt: appt.startAt.toISOString(),
        previousEndAt: appt.endAt.toISOString(),
        previousDentistName: appt.dentist?.fullName ?? '',
      },
    };
  }

  async confirm(proposalId: string, actor: JwtPayload) {
    const row = await this.prisma.auditLog.findUnique({ where: { id: proposalId } });
    if (!row || row.action !== PROPOSAL_ACTION || row.actorUserId !== actor.sub)
      throw new NotFoundException('Không có đề xuất này');
    const p = row.metadata as unknown as Proposal;
    if (p.type !== 'cancel_appointment' && p.type !== 'reschedule_appointment')
      throw new NotFoundException('Không có đề xuất này');
    if (Date.now() - row.occurredAt.getTime() > TTL_MS)
      throw new ConflictException('Đề xuất hết hạn; hãy soạn lại');
    this.permission(p.type, actor);
    // Recheck scope even for a replay; the actor may have lost access.
    await this.appointments.getById(p.appointmentId, actor);
    const done = await this.prisma.auditLog.findUnique({ where: { id: p.resultId } });
    if (done) throw new ConflictException('Đề xuất đã được xác nhận');
    try {
      // The unique claim survives restarts and serializes confirmations across instances.
      await this.prisma.auditLog.create({
        data: {
          id: p.claimId,
          action: 'AI_ACTION_STARTED',
          actorUserId: actor.sub,
          targetType: 'appointment',
          targetId: p.appointmentId,
          metadata: { proposalId },
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const finished = await this.prisma.auditLog.findUnique({ where: { id: p.resultId } });
      if (finished) throw new ConflictException('Đề xuất đã được xác nhận');
      throw new ConflictException('Đề xuất đã được xác nhận; kiểm tra lịch trước khi soạn lại');
    }
    // shortcut: a crash after the claim consumes the proposal; inspect the visit and propose again rather than risk a second mutation.
    if (p.type === 'cancel_appointment')
      await this.appointments.cancel(p.appointmentId, p.dto, actor);
    else
      await this.appointments.reschedule(p.appointmentId, p.dto as RescheduleAppointmentDto, actor);
    await this.prisma.auditLog.create({
      data: {
        id: p.resultId,
        action: 'AI_ACTION_EXECUTED',
        actorUserId: actor.sub,
        targetType: 'appointment',
        targetId: p.appointmentId,
        metadata: { proposalId, action: p.type },
      },
    });
    return { id: p.appointmentId };
  }
}
