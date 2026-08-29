import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AppointmentCancelledEvent,
  APPOINTMENT_CANCELLED_EVENT,
} from '../common/events/domain-events';

/**
 * Listens to AppointmentCancelledEvent (ADR-0007) and cascade-cancels the
 * encounter if one is IN_PROGRESS for the same appointment. Idempotent.
 */
@Injectable()
export class AppointmentCancelListener {
  private readonly logger = new Logger(AppointmentCancelListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @OnEvent(APPOINTMENT_CANCELLED_EVENT)
  async handleAppointmentCancelled(payload: AppointmentCancelledEvent) {
    this.logger.log(`Appointment ${payload.appointmentId} cancelled; cascade-checking encounter`);

    const result = await this.prisma.encounter.updateMany({
      where: {
        appointmentId: payload.appointmentId,
        status: 'IN_PROGRESS',
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: payload.cancelledAt,
        cancelledBy: payload.cancelledBy,
        cancelledReason: `Appointment cancelled: ${payload.reason ?? 'no reason'}`,
      },
    });

    if (result.count > 0) {
      // Audit each cancelled encounter
      const encounters = await this.prisma.encounter.findMany({
        where: { appointmentId: payload.appointmentId, status: 'CANCELLED' },
        select: { id: true, dentistId: true, patientId: true, startedAt: true },
      });
      for (const enc of encounters) {
        await this.audit.log({
          action: 'ENCOUNTER_CANCELLED_VIA_APPOINTMENT',
          actorUserId: payload.cancelledBy,
          actorEmail: undefined,
          targetType: 'encounter',
          targetId: enc.id,
          metadata: {
            appointmentId: payload.appointmentId,
            reason: payload.reason,
          },
        });
        // Avoid duplicate encounterAudit rows — encounter.updateMany doesn't
        // write an EncounterAudit. Use a single AFTER snapshot:
        await this.prisma.encounterAudit
          .create({
            data: {
              encounterId: enc.id,
              action: 'CANCELLED_VIA_APPOINTMENT',
              actorId: payload.cancelledBy ?? enc.dentistId,
              before: { status: 'IN_PROGRESS' },
              after: { status: 'CANCELLED' },
            },
          })
          .catch((err: unknown) => {
            // swallow audit-race errors; main cancel succeeded.
            this.logger.warn(`Failed to write EncounterAudit: ${err}`);
          });
      }
    }
  }
}
