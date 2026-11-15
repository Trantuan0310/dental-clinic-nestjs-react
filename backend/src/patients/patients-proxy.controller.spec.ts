import { ForbiddenException, NotFoundException } from '@nestjs/common';
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

  it('answers an unrelated dentist as for a missing patient (no id probing)', async () => {
    db.encounter.count.mockResolvedValue(0);
    db.appointment.count.mockResolvedValue(0);
    await expect(controller.patientEncounters('p', dentist)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.encounter.findMany).not.toHaveBeenCalled();
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
    // A cancelled visit's chart never counts as the latest one.
    expect(db.encounter.findFirst.mock.calls[0][0].where.status).toEqual({ not: 'CANCELLED' });
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
      NotFoundException,
    );
  });

  it('A6-19: the invoice.read alias alone lists no invoices (was every invoice)', async () => {
    const aliasOnly = { ...dentist, permissions: ['invoice.read'] };
    await expect(controller.patientInvoices('p', aliasOnly)).rejects.toThrow(ForbiddenException);
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });

  it("keeps invoice.read.own to invoices of the caller's encounters", async () => {
    db.encounter.count.mockResolvedValue(1);
    db.invoice.findMany.mockResolvedValue([]);
    await controller.patientInvoices('p', dentist);
    expect(db.invoice.findMany.mock.calls[0][0].where).toEqual({
      patientId: 'p',
      deletedAt: null,
      encounter: { dentistId: dentist.sub },
    });
  });

  it('answers an unrelated dentist the invoice list as for a missing patient', async () => {
    db.encounter.count.mockResolvedValue(0);
    db.appointment.count.mockResolvedValue(0);
    await expect(controller.patientInvoices('p', dentist)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });

  describe('toothHistory', () => {
    it('reads one tooth in one query: only its treatments, only its chart entry', async () => {
      db.encounter.count.mockResolvedValue(1);
      db.encounter.findMany.mockResolvedValue([
        {
          id: 'e1',
          status: 'COMPLETED',
          startedAt: new Date('2026-06-01'),
          closedAt: new Date('2026-06-01'),
          chiefComplaint: null,
          diagnosis: null,
          dentist: { fullName: 'BS A' },
          clinicalNote: null,
          dentalChart: {
            teeth: { '36': { status: 'filled', notes: 'trám' }, '11': { status: 'healthy' } },
          },
          treatments: [
            {
              id: 't1',
              encounterId: 'e1',
              procedure: 'Trám',
              description: null,
              unitPrice: '600000',
              quantity: 1,
              createdAt: new Date(),
              service: { code: 'FILL' },
            },
          ],
        },
      ]);
      const res = await controller.toothHistory('p', 36, dentist);
      const where = db.encounter.findMany.mock.calls[0][0];
      expect(where.where).toEqual({ patientId: 'p', status: { not: 'CANCELLED' } });
      expect(where.select.treatments.where.toothNumbers).toEqual({ array_contains: [36] });
      expect(res.data[0].toothChart).toEqual({ status: 'filled', notes: 'trám' });
      expect(res.data[0].treatments[0]).toMatchObject({
        treatmentName: 'Trám',
        priceCents: 600000,
        toothNumber: 36,
        treatmentCode: 'FILL',
      });
      expect(res.data[0].status).toBe('completed');
    });

    it('refuses a number that is not an FDI tooth', async () => {
      await expect(controller.toothHistory('p', 19, dentist)).rejects.toThrow('FDI');
      await expect(controller.toothHistory('p', 56, dentist)).rejects.toThrow('FDI');
      expect(db.encounter.findMany).not.toHaveBeenCalled();
    });

    it('answers an unrelated dentist as for a missing patient', async () => {
      db.encounter.count.mockResolvedValue(0);
      db.appointment.count.mockResolvedValue(0);
      await expect(controller.toothHistory('p', 36, dentist)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(db.encounter.findMany).not.toHaveBeenCalled();
    });
  });
});
