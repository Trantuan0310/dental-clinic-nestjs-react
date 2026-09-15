import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RedisCacheService } from '../common/redis-cache.service';
import { ExpenseService } from '../expense/expense.service';
import { BillingService } from '../billing/billing.service';
import { BillingController } from '../billing/billing.controller';
import { AiService } from '../ai/ai.service';
import { AiController } from '../ai/ai.controller';
import { AppointmentsService } from '../appointments/appointments.service';
import { MedicalRecordsService } from '../medical-records/medical-records.service';
import {
  EncounterNotClosableException,
  EncounterNotFoundException,
} from '../medical-records/domain/exceptions';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import {
  adminPayload,
  dentistPayload,
  receptionistPayload,
  validEncounter,
} from '../../test/helpers';

describe('Phase one audit regressions', () => {
  const dentist = dentistPayload();
  const admin = {
    ...adminPayload(),
    permissions: ['patient.delete', 'invoice.read.any', 'encounter.read.any', 'shift.approve'],
  };
  const receptionist = {
    ...receptionistPayload(),
    permissions: [...receptionistPayload().permissions, 'invoice.read.any'],
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  let db: ReturnType<typeof createPrismaMock>;
  let medical: MedicalRecordsService;

  beforeEach(() => {
    jest.clearAllMocks();
    db = createPrismaMock();
    db.$transaction.mockImplementation(async cb => cb(db));
    db.encounter.findUnique.mockResolvedValue(
      validEncounter({ dentistId: dentist.sub, status: 'IN_PROGRESS' }),
    );
    medical = new MedicalRecordsService(
      db as unknown as PrismaService,
      audit as unknown as AuditService,
      events as unknown as EventEmitter2,
    );
  });

  it.each([dentist, admin, receptionist])(
    'BILL-01 scopes by-encounter reads for $sub',
    async actor => {
      db.invoice.findFirst.mockResolvedValue(null);
      const billing = new BillingService(
        db as unknown as PrismaService,
        audit as unknown as AuditService,
        {} as ExpenseService,
      );
      const response = await new BillingController(billing).byEncounter('other-encounter', actor);
      expect(response.data).toEqual([]);
      expect(db.invoice.findFirst).toHaveBeenCalledWith({
        where: {
          encounterId: 'other-encounter',
          deletedAt: null,
          ...(!actor.permissions.includes('invoice.read.any') && {
            encounter: { dentistId: actor.sub },
          }),
        },
        include: { items: { orderBy: { sequence: 'asc' } } },
      });
    },
  );

  it('BILL-01 returns an allowed invoice without changing its shape', async () => {
    const invoice = { id: 'i', items: [{ id: 'line' }] };
    db.invoice.findFirst.mockResolvedValue(invoice);
    const billing = new BillingService(
      db as unknown as PrismaService,
      audit as unknown as AuditService,
      {} as ExpenseService,
    );
    expect((await new BillingController(billing).byEncounter('e', dentist)).data).toEqual([
      invoice,
    ]);
  });

  function ai() {
    const cache = {
      getJSON: jest.fn().mockResolvedValue({ patientId: 'p', bullets: [] }),
      setJSON: jest.fn(),
    };
    const service = new AiService(
      db as unknown as PrismaService,
      cache as unknown as RedisCacheService,
      { get: () => undefined } as unknown as ConfigService,
    );
    return { cache, service };
  }

  it.each([false, true])(
    'AI-01 refuses unrelated patients before cache/provider (refresh=%s)',
    async refresh => {
      db.patient.findFirst.mockResolvedValue({ id: 'p' });
      db.encounter.count.mockResolvedValue(0);
      const { cache, service } = ai();
      await expect(service.getPatientSummary('p', 3, refresh, dentist)).rejects.toThrow(
        'Patient not found',
      );
      expect(cache.getJSON).not.toHaveBeenCalled();
      expect(db.encounter.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([dentist, admin, receptionist])(
    'AI-01 preserves allowed cached access for $sub',
    async actor => {
      db.patient.findFirst.mockResolvedValue({ id: 'p' });
      db.encounter.count.mockResolvedValue(1);
      const { service } = ai();
      const result = await new AiController(service).getPatientSummary('p', {}, actor);
      expect(result.data.cached).toBe(true);
      if (
        !actor.permissions.includes('patient.update') &&
        !actor.permissions.includes('patient.delete')
      ) {
        expect(db.encounter.count).toHaveBeenCalledWith({
          where: { patientId: 'p', dentistId: actor.sub },
        });
      }
    },
  );

  it('SHIFT-01 blocks a dentist registering a colleague even when the slot is empty', async () => {
    const service = new AppointmentsService(
      db as unknown as PrismaService,
      audit as unknown as AuditService,
      events as unknown as EventEmitter2,
    );
    await expect(
      service.createShiftRegistration(
        { dentistId: 'other', date: '2099-01-01', startTime: '08:00', endTime: '12:00' },
        dentist,
      ),
    ).rejects.toThrow();
    expect(db.workingSchedule.findMany).not.toHaveBeenCalled();
    expect(db.shiftRegistration.create).not.toHaveBeenCalled();
  });

  it.each([dentist, admin])(
    'SHIFT-01 preserves self-registration and admin delegation for $sub',
    async actor => {
      const dentistId = actor === admin ? dentist.sub : actor.sub;
      db.workingSchedule.findMany.mockResolvedValue([]);
      db.shiftRegistration.findMany.mockResolvedValue([]);
      db.shiftRegistration.create.mockResolvedValue({ id: 's' });
      const service = new AppointmentsService(
        db as unknown as PrismaService,
        audit as unknown as AuditService,
        events as unknown as EventEmitter2,
      );
      await service.createShiftRegistration(
        { dentistId, date: '2099-01-01', startTime: '08:00', endTime: '12:00' },
        actor,
      );
      expect(db.shiftRegistration.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ dentistId }) }),
      );
    },
  );

  const writes = [
    [
      'clinical note',
      (s: MedicalRecordsService, actor: typeof dentist) =>
        s.upsertClinicalNote('e', { notes: 'edit' }, actor),
    ],
    [
      'create treatment',
      (s: MedicalRecordsService, actor: typeof dentist) =>
        s.createTreatment('e', { procedure: 'Test', unitPrice: 100 }, actor),
    ],
    [
      'edit treatment',
      (s: MedicalRecordsService, actor: typeof dentist) =>
        s.updateTreatment('e', 't', { unitPrice: 1 }, actor),
    ],
    [
      'delete treatment',
      (s: MedicalRecordsService, actor: typeof dentist) => s.deleteTreatment('e', 't', actor),
    ],
    [
      'create prescription',
      (s: MedicalRecordsService, actor: typeof dentist) =>
        s.upsertPrescription('e', { lines: [{ drugName: 'Test' }] }, actor),
    ],
    [
      'edit prescription',
      (s: MedicalRecordsService, actor: typeof dentist) =>
        s.updatePrescription('p', { notes: 'edit' }, actor),
    ],
    [
      'delete prescription',
      (s: MedicalRecordsService, actor: typeof dentist) => s.deletePrescription('p', actor),
    ],
    [
      'dental chart',
      (s: MedicalRecordsService, actor: typeof dentist) =>
        s.snapshotDentalChart('e', { patientType: 'ADULT', teeth: {} }, actor),
    ],
  ] as const;

  describe.each(['COMPLETED', 'CANCELLED'] as const)('MR-01 immutable %s encounter', status => {
    it.each(writes)('blocks %s for dentist and admin', async (_name, write) => {
      db.encounter.findUnique.mockResolvedValue(validEncounter({ dentistId: dentist.sub, status }));
      db.prescription.findUnique.mockResolvedValue({ id: 'p', encounterId: 'e', deletedAt: null });
      for (const actor of [dentist, admin]) {
        await expect(write(medical, actor)).rejects.toThrow(EncounterNotClosableException);
      }
      expect(db.treatment.update).not.toHaveBeenCalled();
      expect(db.prescription.update).not.toHaveBeenCalled();
      expect(db.clinicalNote.create).not.toHaveBeenCalled();
    });
  });

  it('MR-01 checks ownership before exposing closed status', async () => {
    db.encounter.findUnique.mockResolvedValue(
      validEncounter({ dentistId: 'other', status: 'COMPLETED' }),
    );
    await expect(medical.updateTreatment('e', 't', { unitPrice: 1 }, dentist)).rejects.toThrow(
      EncounterNotFoundException,
    );
  });

  it('MR-01 permits an active treatment edit inside the locked transaction', async () => {
    db.treatment.findUnique.mockResolvedValue({
      id: 't',
      encounterId: 'e',
      deletedAt: null,
      encounter: { dentistId: dentist.sub },
    });
    db.treatment.update.mockResolvedValue({ id: 't', unitPrice: 123 });
    expect(await medical.updateTreatment('e', 't', { unitPrice: 123 }, dentist)).toEqual({
      id: 't',
      unitPrice: 123,
    });
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.encounter.findUnique.mock.invocationCallOrder[0],
    );
    expect(db.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
  });

  it('MR-03 serializes two closes on the same encounter and emits only once', async () => {
    let status = 'IN_PROGRESS';
    let stock = 10;
    let tail = Promise.resolve();
    // Simulate transaction-scoped row locking, not PostgreSQL isolation itself.
    db.$transaction.mockImplementation(async callback => {
      let release: (() => void) | undefined;
      const tx = {
        ...db,
        $queryRaw: jest.fn(async () => {
          const previous = tail;
          tail = new Promise<void>(resolve => {
            release = resolve;
          });
          await previous;
          return [];
        }),
      };
      try {
        return await callback(tx);
      } finally {
        release?.();
      }
    });
    db.encounter.findUnique.mockImplementation(async () => ({
      ...validEncounter({ dentistId: dentist.sub }),
      status,
      treatments: [
        {
          id: 't',
          procedure: 'Test',
          unitPrice: 100,
          inventoryUsages: [{ inventoryItemId: 'i', quantity: 2, unit: 'ml' }],
        },
      ],
    }));
    db.encounter.update.mockImplementation(async () => {
      status = 'COMPLETED';
      return {};
    });
    db.inventoryItem.findUnique.mockImplementation(async () => ({
      id: 'i',
      name: 'Item',
      quantityOnHand: stock,
      deletedAt: null,
    }));
    db.inventoryItem.updateMany.mockImplementation(async () => {
      stock -= 2;
      return { count: 1 };
    });
    const results = await Promise.allSettled([
      medical.closeEncounter('e', {}, dentist),
      medical.closeEncounter('e', {}, dentist),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(stock).toBe(8);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });
});
