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
  userPayloadWithPermissions,
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

    it('404s (not 403) a dentist starting an encounter for another dentist\'s checked-in appointment (regression: actor was previously ignored entirely)', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        status: 'CHECKED_IN',
        deletedAt: null,
        patientId: 'patient-1',
        dentistId: 'some-other-dentist',
        patient: {},
        dentist: {},
      });

      await expect(service.startEncounterForAppointment('appt-1', dentistActor)).rejects.toThrow(
        EncounterNotFoundException,
      );
    });

    it('lets a receptionist (no encounter.read.own/.any) start an encounter for any dentist\'s checked-in appointment', async () => {
      const receptionist = userPayloadWithPermissions(['encounter.read.basic', 'encounter.start']);
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        status: 'CHECKED_IN',
        deletedAt: null,
        patientId: 'patient-1',
        dentistId: 'some-other-dentist',
        patient: {},
        dentist: {},
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.encounter.create as jest.Mock).mockResolvedValue({ id: 'enc-new' });

      const result = await service.startEncounterForAppointment('appt-1', receptionist);
      expect(result.encounterId).toBe('enc-new');
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

  describe('getEncounter (row-level)', () => {
    it('throws when encounter not found', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getEncounter('enc-missing', dentistActor)).rejects.toThrow(
        EncounterNotFoundException,
      );
    });

    it('returns the encounter for its own authoring dentist (encounter.read.own)', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: dentistActor.sub }),
      );
      const result = await service.getEncounter('enc-1', dentistActor);
      expect((result as any).id).toBe('enc-1');
    });

    it('404s (not 403) for a dentist.read.own caller reading another dentist\'s encounter — anti-enumeration, matches BR-PT-014 elsewhere (regression: this route had no row-level check at all)', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: 'some-other-dentist' }),
      );
      await expect(service.getEncounter('enc-1', dentistActor)).rejects.toThrow(
        EncounterNotFoundException,
      );
    });

    it('lets a caller with encounter.read.any read any dentist\'s encounter', async () => {
      const actor = userPayloadWithPermissions(['encounter.read.any']);
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: 'some-other-dentist' }),
      );
      const result = await service.getEncounter('enc-1', actor);
      expect((result as any).id).toBe('enc-1');
    });
  });

  describe('upsertClinicalNote', () => {
    it('upserts clinical note for open encounter', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS }),
      );
      // No note row yet: the guarded update matches nothing, so the service
      // falls through to create.
      (prisma.clinicalNote.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.clinicalNote.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.clinicalNote.create as jest.Mock).mockResolvedValue(validClinicalNote());

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

    it('updates an existing unlocked note through the isLocked-guarded write', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS }),
      );
      (prisma.clinicalNote.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.clinicalNote.findUniqueOrThrow as jest.Mock).mockResolvedValue(validClinicalNote());

      await service.upsertClinicalNote('enc-1', { notes: 'updated' } as any, dentistActor);

      // isLocked: false must be part of the WHERE, not a separate read —
      // that is what stops an in-flight edit landing after closeEncounter()
      // locks the note.
      expect(prisma.clinicalNote.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ encounterId: 'enc-1', isLocked: false }),
        }),
      );
      expect(prisma.clinicalNote.create).not.toHaveBeenCalled();
    });

    it('regression: refuses to edit a closed encounter even when isLocked is stale', async () => {
      // isLocked is only a cache of "encounter is closed" — closeEncounter()
      // locks via updateMany, which matches nothing if no note existed yet,
      // and seeded rows never went through it. Seen on real data: an
      // encounter closed days earlier whose note still read isLocked: false,
      // so the sealed record could be overwritten.
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.COMPLETED }),
      );
      (prisma.clinicalNote.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await expect(
        service.upsertClinicalNote('enc-1', { notes: 'post-close edit' } as any, dentistActor),
      ).rejects.toThrow(EncounterNotClosableException);
      expect(prisma.clinicalNote.updateMany).not.toHaveBeenCalled();
      expect(prisma.clinicalNote.create).not.toHaveBeenCalled();
    });

    it('regression: rejects the edit when the encounter was closed mid-flight', async () => {
      // The read said unlocked, but closeEncounter() committed before this
      // write landed, so the guarded update matches 0 rows and the now-locked
      // row is found on re-read. Previously the upsert had no lock in its
      // WHERE and would have overwritten the sealed note.
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS }),
      );
      (prisma.clinicalNote.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.clinicalNote.findUnique as jest.Mock).mockResolvedValue(
        validClinicalNote({ isLocked: true }),
      );

      await expect(
        service.upsertClinicalNote('enc-1', { notes: 'late edit' } as any, dentistActor),
      ).rejects.toThrow(EncounterNotClosableException);
      expect(prisma.clinicalNote.create).not.toHaveBeenCalled();
    });

    it("regression: a dentist cannot write a clinical note on a colleague's encounter (was previously unchecked entirely)", async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS, dentistId: 'some-other-dentist' }),
      );

      await expect(
        service.upsertClinicalNote('enc-1', { chiefComplaint: 'x' } as any, dentistActor),
      ).rejects.toThrow(EncounterNotFoundException);
      expect(prisma.clinicalNote.upsert).not.toHaveBeenCalled();
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

    it('InsufficientStockException message names the item and quantities (regression: these used to only be in `details`, which the frontend never reads — the user just saw a bare "Insufficient stock")', async () => {
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
      ).rejects.toThrow(/Gloves.*requires 100.*only 5 available/);
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
        encounter: { dentistId: dentistActor.sub },
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

    it('regression: throws when a dentist tries to delete a treatment on a colleague\'s encounter', async () => {
      (prisma.treatment.findUnique as jest.Mock).mockResolvedValue({
        id: 'tr-1',
        encounterId: 'enc-1',
        deletedAt: null,
        encounter: { dentistId: 'some-other-dentist' },
      });

      await expect(service.deleteTreatment('enc-1', 'tr-1', dentistActor)).rejects.toThrow(
        TreatmentNotInEncounterException,
      );
      expect(prisma.treatment.update).not.toHaveBeenCalled();
    });
  });
});
