import { ForbiddenException } from '@nestjs/common';
import { PatientsProxyController } from './patients-proxy.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import { dentistPayload } from '../../test/helpers';

describe('PatientsProxyController — dentist read scope', () => {
  const dentist = {
    ...dentistPayload(),
    permissions: [...dentistPayload().permissions, 'dental_chart.read'],
  };
  let db: ReturnType<typeof createPrismaMock>;
  let controller: PatientsProxyController;

  beforeEach(() => {
    db = createPrismaMock();
    db.patient.findUnique.mockResolvedValue({ id: 'p', deletedAt: null });
    controller = new PatientsProxyController(
      db as unknown as PrismaService,
      { log: jest.fn() } as unknown as AuditService,
    );
  });

  it("lists every dentist's encounters for a patient the dentist is booked with", async () => {
    db.encounter.count.mockResolvedValue(0);
    db.appointment.count.mockResolvedValue(1);
    db.encounter.findMany.mockResolvedValue([]);
    await controller.patientEncounters('p', dentist);
    expect(db.encounter.findMany.mock.calls[0][0].where).toEqual({ patientId: 'p' });
  });

  it('keeps an unrelated dentist to their own encounters', async () => {
    db.encounter.count.mockResolvedValue(0);
    db.appointment.count.mockResolvedValue(0);
    db.encounter.findMany.mockResolvedValue([]);
    await controller.patientEncounters('p', dentist);
    expect(db.encounter.findMany.mock.calls[0][0].where).toEqual({
      patientId: 'p',
      dentistId: dentist.sub,
    });
  });

  it('shows the latest chart written by a colleague to a dentist who treated the patient', async () => {
    db.encounter.findFirst.mockResolvedValue({
      id: 'e',
      dentistId: 'colleague',
      dentalChart: { id: 'chart' },
    });
    db.encounter.count.mockResolvedValue(1);
    await expect(controller.patientDentalChart('p', dentist)).resolves.toEqual({
      data: { id: 'chart' },
    });
  });

  it('hides the chart from an unrelated dentist', async () => {
    db.encounter.findFirst.mockResolvedValue({
      id: 'e',
      dentistId: 'colleague',
      dentalChart: { id: 'chart' },
    });
    db.encounter.count.mockResolvedValue(0);
    db.appointment.count.mockResolvedValue(0);
    await expect(controller.patientDentalChart('p', dentist)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
