import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EncounterStatus } from '@prisma/client';
import { MedicalRecordsService } from './medical-records.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import {
  validEncounter,
  validClinicalNote,
  validTreatment,
  dentistPayload,
} from '../../test/helpers';
import {
  EncounterNotFoundException,
  EncounterNotClosableException,
  InsufficientStockException,
  PrescriptionAlreadyExistsException,
  TreatmentNotInEncounterException,
} from './domain/exceptions';

describe('MedicalRecordsService', () => {
  let service: MedicalRecordsService;
  let prisma: PrismaMockShape;
  let audit: { log: jest.Mock };
  let events: { emit: jest.Mock };
  const dentistActor = dentistPayload();

  beforeEach(async () => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        MedicalRecordsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get(MedicalRecordsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('startEncounterForAppointment', () => {
    it('throws when appointment not found', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.startEncounterForAppointment('appt-1', dentistActor)).rejects.toThrow(
        EncounterNotFoundException,
      );
    });

    it('throws when appointment not CHECKED_IN or IN_PROGRESS', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        status: 'SCHEDULED',
        deletedAt: null,
        patientId: 'patient-1',
        dentistId: 'dentist-1',
        patient: {},
        dentist: {},
      });
      await expect(service.startEncounterForAppointment('appt-1', dentistActor)).rejects.toThrow(
        EncounterNotClosableException,
      );
    });

    it('returns existing encounter if IN_PROGRESS (idempotent)', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        status: 'CHECKED_IN',
        deletedAt: null,
        patientId: 'patient-1',
        dentistId: 'dentist-1',
        patient: {},
        dentist: {},
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        id: 'enc-existing',
        status: EncounterStatus.IN_PROGRESS,
      });

      const result = await service.startEncounterForAppointment('appt-1', dentistActor);
      expect(result.encounterId).toBe('enc-existing');
    });
  });

  describe('upsertClinicalNote', () => {
    it('upserts clinical note for open encounter', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS }),
      );
      (prisma.clinicalNote.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.clinicalNote.upsert as jest.Mock).mockResolvedValue(validClinicalNote());

      const result = await service.upsertClinicalNote(
        'enc-1',
        { chiefComplaint: 'Pain in upper right' } as any,
        dentistActor,
      );
      expect(result).toBeDefined();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CLINICAL_NOTE_UPSERTED' }),
      );
    });

    it('rejects modification when clinical note is locked (encounter closed)', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.COMPLETED }),
      );
      (prisma.clinicalNote.findUnique as jest.Mock).mockResolvedValue({
        ...validClinicalNote(),
        isLocked: true,
      });
      await expect(
        service.upsertClinicalNote('enc-1', { chiefComplaint: 'late change' } as any, dentistActor),
      ).rejects.toThrow();
    });
  });

  describe('createTreatment', () => {
    it('creates treatment on open encounter', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS }),
      );
      (prisma.treatment.aggregate as jest.Mock).mockResolvedValue({ _max: { sequence: null } });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.treatment.create as jest.Mock).mockResolvedValue(validTreatment());

      const result = await service.createTreatment(
        'enc-1',
        { procedure: 'D1110', description: 'Cleaning' } as any,
        dentistActor,
      );
      expect(result).toBeDefined();
    });
  });

  describe('closeEncounter', () => {
    it('throws when encounter is COMPLETED (BR-MR-003)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.COMPLETED, treatments: [] }),
      );
      await expect(
        service.closeEncounter('enc-1', { summary: 'done' } as any, dentistActor),
      ).rejects.toThrow(EncounterNotClosableException);
    });

    it('uses guarded updateMany for inventory decrement (R2-9 / BR-INV-003)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        ...validEncounter({ status: EncounterStatus.IN_PROGRESS }),
        treatments: [
          {
            id: 'tr-1',
            procedure: 'D1110',
            description: 'Cleaning',
            unitPrice: 500_000,
            inventoryUsages: [{ id: 'u-1', inventoryItemId: 'item-1', quantity: 2, unit: 'box' }],
          },
        ],
      });
      (prisma.inventoryItem.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          id: 'item-1',
          name: 'Gloves',
          quantityOnHand: 10,
          deletedAt: null,
        })
        .mockResolvedValueOnce({ quantityOnHand: 8 });
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.closeEncounter('enc-1', { summary: 'done' } as any, dentistActor);

      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'item-1',
            quantityOnHand: { gte: 2 },
            deletedAt: null,
          }),
          data: expect.objectContaining({
            quantityOnHand: { decrement: 2 },
          }),
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        expect.stringContaining('encounter.closed'),
        expect.objectContaining({ encounterId: 'enc-1' }),
      );
    });

    it('throws InsufficientStockException when stock updateMany returns count=0', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        ...validEncounter({ status: EncounterStatus.IN_PROGRESS }),
        treatments: [
          {
            id: 'tr-1',
            procedure: 'D1110',
            description: 'Cleaning',
            unitPrice: 500_000,
            inventoryUsages: [{ id: 'u-1', inventoryItemId: 'item-1', quantity: 100, unit: 'box' }],
          },
        ],
      });
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        id: 'item-1',
        name: 'Gloves',
        quantityOnHand: 5,
        deletedAt: null,
      });
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.closeEncounter('enc-1', { summary: 'done' } as any, dentistActor),
      ).rejects.toThrow(InsufficientStockException);
    });
  });

  describe('upsertPrescription', () => {
    it('rejects when prescription already exists for encounter', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS }),
      );
      (prisma.prescription.findUnique as jest.Mock).mockResolvedValue({
        id: 'rx-existing',
        encounterId: 'enc-1',
      });
      await expect(
        service.upsertPrescription('enc-1', { lines: [] } as any, dentistActor),
      ).rejects.toThrow(PrescriptionAlreadyExistsException);
    });

    it('creates prescription when none exists', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS }),
      );
      (prisma.prescription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.prescription.create as jest.Mock).mockResolvedValue({
        id: 'rx-1',
        encounterId: 'enc-1',
      });

      const result = await service.upsertPrescription(
        'enc-1',
        { lines: [{ medicationName: 'Amoxicillin', dosage: '500mg' }] } as any,
        dentistActor,
      );
      expect(result).toBeDefined();
    });
  });

  describe('updateTreatment', () => {
    it('throws when treatment does not belong to encounter', async () => {
      (prisma.treatment.findUnique as jest.Mock).mockResolvedValue({
        id: 'tr-1',
        encounterId: 'other-enc',
        deletedAt: null,
      });
      await expect(
        service.updateTreatment('enc-1', 'tr-1', { description: 'new' } as any, dentistActor),
      ).rejects.toThrow(TreatmentNotInEncounterException);
    });
  });

  describe('deleteTreatment', () => {
    it('soft-deletes treatment when belongs to encounter', async () => {
      (prisma.treatment.findUnique as jest.Mock).mockResolvedValue({
        id: 'tr-1',
        encounterId: 'enc-1',
        deletedAt: null,
      });
      (prisma.treatment.update as jest.Mock).mockResolvedValue({});

      await service.deleteTreatment('enc-1', 'tr-1', dentistActor);

      expect(prisma.treatment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tr-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
