import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntakeStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { resolveAppointmentLink } from '../booking/appointment-link-access';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { isRowScoped } from '../common/row-scope';
import { mergeStringLists, readJsonStringArray } from './domain/patient-rules';
import { PatientsService } from './patients.service';
import { getConsentNotices, recordConsent } from '../consents/consent-record';

const list = z.array(z.string().trim().min(1).max(120)).max(20);
export const intakeSchema = z
  .object({
    allergies: list,
    chronicDiseases: list,
    currentMedications: list,
    reason: z.string().trim().min(1).max(500),
    emergencyContact: z.string().trim().max(200),
  })
  .strict();
const currentFields = {
  allergies: true,
  chronicDiseases: true,
  currentMedications: true,
  updatedAt: true,
} as const;

@Injectable()
export class IntakeService {
  constructor(
    private db: PrismaService,
    private patients: PatientsService,
    private audit: AuditService,
  ) {}

  async submit(token: string, body: unknown, ip?: string) {
    const parsed = intakeSchema
      .extend({ consent: z.literal(true), consentVersion: z.string().min(1).max(120) })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('Phiếu khai không hợp lệ');
    const notice = getConsentNotices().intake;
    const { consentVersion, consent: _consent, ...answers } = parsed.data;
    if (notice.version !== consentVersion)
      throw new ConflictException('Văn bản đồng ý đã thay đổi. Vui lòng tải lại phiếu.');
    return this.db.$transaction(async tx => {
      const appointment = await resolveAppointmentLink(tx, token);
      const result = await tx.intakeForm.createMany({
        data: [{ appointmentId: appointment.id, patientId: appointment.patientId, answers }],
        skipDuplicates: true,
      });
      if (!result.count) throw new ConflictException('Đã nhận phiếu khai cho lịch này');
      await recordConsent(tx, {
        channel: 'INTAKE',
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        notice,
        ip,
      });
      return { status: 'PENDING' };
    });
  }

  private async appointment(db: Prisma.TransactionClient, id: string, actor: JwtPayload) {
    const appointment = await db.appointment.findFirst({
      where: {
        id,
        deletedAt: null,
        patient: { deletedAt: null },
        ...(isRowScoped(actor, 'patient') ? { dentistId: actor.sub } : {}),
      },
      select: { patientId: true, patient: { select: currentFields }, intakeForm: true },
    });
    if (
      !appointment ||
      (appointment.intakeForm && appointment.intakeForm.patientId !== appointment.patientId)
    )
      throw new NotFoundException();
    return appointment;
  }

  async get(id: string, actor: JwtPayload) {
    const { intakeForm, patient } = await this.appointment(this.db, id, actor);
    return (
      intakeForm && {
        status: intakeForm.status,
        submittedAt: intakeForm.submittedAt,
        answers: intakeForm.answers,
        current: patient,
      }
    );
  }

  async review(id: string, decision: 'APPROVED' | 'DISCARDED', actor: JwtPayload) {
    const changedPatient = await this.db.$transaction(async tx => {
      const { patientId, patient, intakeForm } = await this.appointment(tx, id, actor);
      if (!intakeForm) throw new NotFoundException();
      const result = await tx.intakeForm.updateMany({
        where: { appointmentId: id, status: IntakeStatus.PENDING },
        data: { status: decision, reviewedBy: actor.sub, reviewedAt: new Date() },
      });
      if (!result.count) {
        if ((await tx.intakeForm.findUnique({ where: { appointmentId: id } }))?.status === decision)
          return null;
        throw new ConflictException('Phiếu đã được xử lý');
      }
      if (decision === 'APPROVED') {
        const f = intakeSchema.parse(intakeForm.answers);
        await this.patients.updateMedicalHistory(
          patientId,
          {
            allergies: mergeStringLists(readJsonStringArray(patient.allergies), f.allergies),
            currentMedications: mergeStringLists(
              readJsonStringArray(patient.currentMedications),
              f.currentMedications,
            ),
            chronicDiseases: mergeStringLists(
              readJsonStringArray(patient.chronicDiseases),
              f.chronicDiseases,
            ),
            expectedUpdatedAt: patient.updatedAt.toISOString(),
          },
          actor,
          tx,
        );
      }
      await this.audit.log(
        {
          action: 'INTAKE_' + decision,
          actorUserId: actor.sub,
          targetId: id,
          targetType: 'appointment',
        },
        tx,
      );
      return decision === 'APPROVED' ? patientId : null;
    });
    if (changedPatient) this.patients.emitClinicalDataChanged(changedPatient);
    return { status: decision };
  }
}
