import { ConflictException, NotFoundException } from '@nestjs/common';
import { IntakeService, intakeSchema } from './intake.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PatientsService } from './patients.service';

const answers = {
  allergies: ['Latex'],
  chronicDiseases: [],
  currentMedications: [],
  reason: 'Exam',
  emergencyContact: '',
};
const actor = { sub: 'staff', email: 'staff@example.test', permissions: ['patient.update'] };

function setup() {
  const appointment = {
    patientId: 'patient',
    patient: {
      allergies: ['Penicillin'],
      chronicDiseases: [],
      currentMedications: ['Existing'],
      updatedAt: new Date(),
    },
    intakeForm: { patientId: 'patient', answers },
  };
  const tx = {
    appointment: { findFirst: jest.fn().mockResolvedValue(appointment) },
    intakeForm: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn() },
  };
  const db = { ...tx, $transaction: (run: (client: typeof tx) => unknown) => run(tx) };
  const patients = { updateMedicalHistory: jest.fn(), emitClinicalDataChanged: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new IntakeService(
    db as unknown as PrismaService,
    patients as unknown as PatientsService,
    audit as unknown as AuditService,
  );
  return { service, tx, patients, audit, appointment };
}

describe('pre-visit intake', () => {
  it('rejects patient identifiers and excessively long list entries', () => {
    expect(intakeSchema.safeParse({ ...answers, patientId: 'other' }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...answers, allergies: ['a'.repeat(121)] }).success).toBe(
      false,
    );
  });
  it('preserves the latest medical history on approval', async () => {
    const { service, patients, tx, appointment } = setup();
    await service.review('visit', 'APPROVED', actor);
    expect(patients.updateMedicalHistory).toHaveBeenCalledWith(
      'patient',
      {
        allergies: ['Penicillin', 'Latex'],
        chronicDiseases: [],
        currentMedications: ['Existing'],
        expectedUpdatedAt: appointment.patient.updatedAt.toISOString(),
      },
      actor,
      tx,
    );
    expect(patients.emitClinicalDataChanged).toHaveBeenCalledWith('patient');
  });
  it('discards without changing the patient and rejects a later approval', async () => {
    const { service, patients, tx } = setup();
    await service.review('visit', 'DISCARDED', actor);
    tx.intakeForm.updateMany.mockResolvedValue({ count: 0 });
    tx.intakeForm.findUnique.mockResolvedValue({ status: 'DISCARDED' });
    await expect(service.review('visit', 'APPROVED', actor)).rejects.toThrow(ConflictException);
    expect(patients.updateMedicalHistory).not.toHaveBeenCalled();
  });
  it('hides a submission when the appointment patient has changed', async () => {
    const { service, appointment } = setup();
    appointment.patientId = 'other';
    await expect(service.get('visit', actor)).rejects.toThrow(NotFoundException);
  });
});
