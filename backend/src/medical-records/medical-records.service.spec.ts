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
  PrescriptionAllergyConflictException,
  PrescriptionVersionConflictException,
  TreatmentNotInEncounterException,
  DentalChartInvalidToothException,
  DentalChartPatientMismatchException,
} from './domain/exceptions';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreatePrescriptionDto,
  CreateTreatmentDto,
  UpdatePrescriptionDto,
} from './dto/medical-record.dto';

describe('MedicalRecordsService', () => {
  let service: MedicalRecordsService;
  let prisma: PrismaMockShape;
  let audit: { log: jest.Mock };
  let events: { emit: jest.Mock };
  const dentistActor = dentistPayload();

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(async cb => cb(prisma));
    prisma.encounter.findUnique.mockResolvedValue(
      validEncounter({ status: EncounterStatus.IN_PROGRESS }),
    );
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

    it("404s (not 403) a dentist starting an encounter for another dentist's checked-in appointment (regression: actor was previously ignored entirely)", async () => {
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

    it("lets a receptionist (no encounter.read.own/.any) start an encounter for any dentist's checked-in appointment", async () => {
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

    it("404s (not 403) for a dentist.read.own caller reading another dentist's encounter — anti-enumeration, matches BR-PT-014 elsewhere (regression: this route had no row-level check at all)", async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: 'some-other-dentist' }),
      );
      await expect(service.getEncounter('enc-1', dentistActor)).rejects.toThrow(
        EncounterNotFoundException,
      );
    });

    it("lets a caller with encounter.read.any read any dentist's encounter", async () => {
      const actor = userPayloadWithPermissions(['encounter.read.any']);
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: 'some-other-dentist' }),
      );
      const result = await service.getEncounter('enc-1', actor);
      expect((result as any).id).toBe('enc-1');
    });

    it("lets a dentist booked with the patient read a colleague's encounter (read-only)", async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: 'some-other-dentist', patientId: 'patient-1' }),
      );
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(1);
      const result = await service.getEncounter('enc-1', dentistActor);
      expect((result as any).id).toBe('enc-1');
      expect(prisma.appointment.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ patientId: 'patient-1', dentistId: dentistActor.sub }),
      });
    });

    it("lets a dentist who treated the patient read a colleague's encounter", async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: 'some-other-dentist' }),
      );
      (prisma.encounter.count as jest.Mock).mockResolvedValue(2);
      await expect(service.getEncounter('enc-1', dentistActor)).resolves.toBeDefined();
      expect(prisma.encounter.count).toHaveBeenCalledWith({
        where: {
          patientId: 'patient-1',
          dentistId: dentistActor.sub,
          status: { not: 'CANCELLED' },
        },
      });
    });

    it('exposes the chart type the snapshot endpoint will accept (BR-MR-012)', async () => {
      const childDob = new Date();
      childDob.setFullYear(childDob.getFullYear() - 7);
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        ...validEncounter({ dentistId: dentistActor.sub }),
        patient: { id: 'patient-1', code: 'P1', fullName: 'Bé A', dob: childDob, deletedAt: null },
      });
      const result = await service.getEncounter('enc-1', dentistActor);
      expect((result as any).dentalChartPatientType).toBe('CHILD');
    });
  });

  describe('listEncounters (row-level)', () => {
    it("returns every dentist's encounters of a patient the dentist may read", async () => {
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(1);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([]);
      await service.listEncounters({ patientId: 'patient-1', actor: dentistActor });
      const where = (prisma.encounter.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where).toEqual({ patientId: 'patient-1' });
    });

    it('keeps an unrelated dentist to their own encounters', async () => {
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([]);
      await service.listEncounters({ patientId: 'patient-1', actor: dentistActor });
      const where = (prisma.encounter.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where).toEqual({ patientId: 'patient-1', dentistId: dentistActor.sub });
    });

    it('keeps the cross-patient list (My patients) to own encounters', async () => {
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([]);
      await service.listEncounters({ actor: dentistActor });
      const where = (prisma.encounter.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where).toEqual({ dentistId: dentistActor.sub });
      expect(prisma.appointment.count).not.toHaveBeenCalled();
    });
  });

  describe('getLatestDentalChartForPatient (row-level)', () => {
    it('404s for a dentist with no relationship to the patient', async () => {
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      await expect(
        service.getLatestDentalChartForPatient('patient-1', dentistActor),
      ).rejects.toMatchObject({ status: 404 });
      expect(prisma.encounter.findFirst).not.toHaveBeenCalled();
    });

    it('returns the chart to a booked dentist and to encounter.read.any', async () => {
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(1);
      (prisma.encounter.findFirst as jest.Mock).mockResolvedValue({ dentalChart: { id: 'c' } });
      await expect(
        service.getLatestDentalChartForPatient('patient-1', dentistActor),
      ).resolves.toEqual({ id: 'c' });
      await expect(
        service.getLatestDentalChartForPatient(
          'patient-1',
          userPayloadWithPermissions(['encounter.read.any']),
        ),
      ).resolves.toEqual({ id: 'c' });
    });
  });

  describe('snapshotDentalChart (BR-MR-012, FDI)', () => {
    beforeEach(() => {
      prisma.dentalChartSnapshot = {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      };
    });

    const withDob = (years: number) => {
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - years);
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        ...validEncounter({ dentistId: dentistActor.sub }),
        patient: { dob, deletedAt: null },
      });
    };

    it('saves a mixed-dentition CHILD chart with primary and permanent teeth', async () => {
      withDob(8);
      (prisma.dentalChartSnapshot.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.dentalChartSnapshot.create as jest.Mock).mockResolvedValue({ id: 's' });
      await service.snapshotDentalChart(
        'enc-1',
        {
          patientType: 'CHILD',
          teeth: { '55': { status: 'cavity' }, '16': { status: 'healthy' } },
        },
        dentistActor,
      );
      expect(prisma.dentalChartSnapshot.create).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith('patient.clinical_data.changed', {
        patientId: 'patient-1',
      });
    });

    it('rejects an ADULT chart for a child', async () => {
      withDob(8);
      await expect(
        service.snapshotDentalChart('enc-1', { patientType: 'ADULT', teeth: {} }, dentistActor),
      ).rejects.toBeInstanceOf(DentalChartPatientMismatchException);
    });

    it.each([
      ['ADULT', 30, '55'],
      ['ADULT', 30, '19'],
      ['CHILD', 8, '56'],
      ['CHILD', 8, 'abc'],
    ])('rejects tooth key on a %s chart (age %d): %s', async (type, age, key) => {
      withDob(age as number);
      await expect(
        service.snapshotDentalChart(
          'enc-1',
          {
            patientType: type as 'ADULT' | 'CHILD',
            teeth: { [key as string]: { status: 'cavity' } },
          },
          dentistActor,
        ),
      ).rejects.toBeInstanceOf(DentalChartInvalidToothException);
      expect(prisma.dentalChartSnapshot.create).not.toHaveBeenCalled();
    });
  });

  describe('CreateTreatmentDto.toothNumbers (FDI)', () => {
    const errors = (toothNumbers: number[]) =>
      validateSync(
        plainToInstance(CreateTreatmentDto, { procedure: 'Trám', unitPrice: 1, toothNumbers }),
      ).filter(e => e.property === 'toothNumbers');

    it.each([[[11, 18, 48]], [[51, 55, 65, 75, 85]]])('accepts %j', teeth => {
      expect(errors(teeth)).toHaveLength(0);
    });

    it.each([[[19]], [[50]], [[56]], [[86]], [[10]], [[49]], [[90]]])('rejects %j', teeth => {
      expect(errors(teeth)).not.toHaveLength(0);
    });
  });

  describe('cancelEncounter (row-level)', () => {
    const cancelActor = userPayloadWithPermissions(
      ['encounter.read.own', 'encounter.cancel'],
      'dentist-1',
    );

    beforeEach(() => {
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.queueEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it("404s for a dentist cancelling another dentist's encounter and changes nothing", async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: 'some-other-dentist' }),
      );
      await expect(service.cancelEncounter('enc-1', 'Nhầm bệnh nhân', cancelActor)).rejects.toThrow(
        EncounterNotFoundException,
      );
      expect(prisma.encounter.update).not.toHaveBeenCalled();
      expect(prisma.encounterAudit.create).not.toHaveBeenCalled();
    });

    it('lets a dentist cancel their own encounter', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: 'dentist-1' }),
      );
      await service.cancelEncounter('enc-1', 'Bệnh nhân về', cancelActor);
      expect(prisma.encounter.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: EncounterStatus.CANCELLED }),
        }),
      );
    });

    it("lets encounter.read.any cancel any dentist's encounter", async () => {
      const admin = userPayloadWithPermissions(['encounter.read.any', 'encounter.cancel']);
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: 'some-other-dentist' }),
      );
      await service.cancelEncounter('enc-1', 'Hủy theo yêu cầu', admin);
      expect(prisma.encounter.update).toHaveBeenCalled();
    });
  });

  describe('cancelEncounter (appointment + queue)', () => {
    const admin = userPayloadWithPermissions(['encounter.read.any', 'encounter.cancel']);

    beforeEach(() => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS }),
      );
      (prisma.queueEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it('puts the IN_PROGRESS appointment back to CHECKED_IN and reopens its queue entry in the same transaction (regression: appointment stayed stuck IN_PROGRESS)', async () => {
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.cancelEncounter('enc-1', '  Bắt đầu nhầm phiên khám  ', admin);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: 'enc-1' },
        data: expect.objectContaining({
          status: EncounterStatus.CANCELLED,
          cancelledReason: 'Bắt đầu nhầm phiên khám',
        }),
      });
      expect(prisma.appointment.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt-1', status: 'IN_PROGRESS', startAt: { gte: expect.any(Date) } },
        data: { status: 'CHECKED_IN', updatedBy: admin.sub },
      });
      expect(prisma.queueEntry.updateMany).toHaveBeenCalledWith({
        // only today's (clinic date) entry reopens
        where: { appointmentId: 'appt-1', closeReason: 'STARTED', queueDate: expect.any(Date) },
        data: expect.objectContaining({ status: 'WAITING', doneAt: null, closeReason: null }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ENCOUNTER_CANCELLED' }),
      );
    });

    it("closes an earlier day's appointment as LEFT instead of an orphan CHECKED_IN", async () => {
      (prisma.appointment.updateMany as jest.Mock)
        .mockResolvedValueOnce({ count: 0 }) // not a visit of today
        .mockResolvedValueOnce({ count: 1 });

      await service.cancelEncounter('enc-1', 'Hủy phiên khám bị bỏ quên', admin);

      const [today, earlier] = (prisma.appointment.updateMany as jest.Mock).mock.calls;
      const todayStart = today[0].where.startAt.gte as Date;
      expect(earlier[0]).toEqual({
        where: { id: 'appt-1', status: 'IN_PROGRESS', startAt: { lt: todayStart } },
        data: expect.objectContaining({
          status: 'LEFT',
          leftAt: expect.any(Date),
          leftReason: 'Hủy phiên khám của ngày trước',
        }),
      });
      // The stale entry is closed if still open, never reopened.
      expect(prisma.queueEntry.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.queueEntry.updateMany).toHaveBeenCalledWith({
        where: { appointmentId: 'appt-1', doneAt: null },
        data: expect.objectContaining({ closeReason: 'LEFT', status: 'LEFT' }),
      });
      expect(prisma.encounterAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          after: expect.objectContaining({ appointmentStatus: 'LEFT' }),
        }),
      });
    });

    it('leaves the queue alone when the appointment was not IN_PROGRESS', async () => {
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      await service.cancelEncounter('enc-1', 'Bắt đầu nhầm phiên khám', admin);
      expect(prisma.encounter.update).toHaveBeenCalled();
      expect(prisma.queueEntry.updateMany).not.toHaveBeenCalled();
    });

    it.each([undefined, '', 'ngắn', '   quá ngắn   '])(
      'rejects a missing or short reason (%p) without touching anything',
      async reason => {
        await expect(service.cancelEncounter('enc-1', reason as any, admin)).rejects.toThrow(
          /ít nhất 10 ký tự/,
        );
        expect(prisma.encounter.update).not.toHaveBeenCalled();
        expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      },
    );
  });

  describe('startEncounterForAppointment after a cancel', () => {
    it('reopens the cancelled encounter row instead of refusing (appointment_id is unique)', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        status: 'CHECKED_IN',
        deletedAt: null,
        patientId: 'patient-1',
        dentistId: 'dentist-1',
        patient: {},
        dentist: {},
      });
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        id: 'enc-1',
        status: EncounterStatus.CANCELLED,
        dentistId: 'dentist-1',
        startedAt: new Date('2026-09-01T01:00:00Z'),
        cancelledAt: new Date('2026-09-01T02:00:00Z'),
        cancelledBy: 'admin-1',
        cancelledReason: 'Bắt đầu nhầm phiên khám',
      });

      const result = await service.startEncounterForAppointment('appt-1', dentistActor);

      expect(result.encounterId).toBe('enc-1');
      expect(prisma.encounter.create).not.toHaveBeenCalled();
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: 'enc-1' },
        data: expect.objectContaining({
          status: EncounterStatus.IN_PROGRESS,
          cancelledAt: null,
          cancelledBy: null,
          cancelledReason: null,
        }),
      });
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt-1' },
        data: { status: 'IN_PROGRESS', updatedBy: dentistActor.sub },
      });
      expect(prisma.encounterAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'REOPENED', encounterId: 'enc-1' }),
      });
      // The AI summary's open-encounter count changed.
      expect(events.emit).toHaveBeenCalledWith('patient.clinical_data.changed', {
        patientId: 'patient-1',
      });
    });

    it('keeps the dentist and start time from before the cancel in the REOPENED audit', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        status: 'CHECKED_IN',
        deletedAt: null,
        patientId: 'patient-1',
        dentistId: 'dentist-1',
      });
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        id: 'enc-1',
        status: EncounterStatus.CANCELLED,
        dentistId: 'dentist-old',
        startedAt: new Date('2026-09-01T01:00:00Z'),
        cancelledAt: new Date('2026-09-01T02:00:00Z'),
        cancelledBy: 'admin-1',
        cancelledReason: 'Bắt đầu nhầm phiên khám',
      });

      await service.startEncounterForAppointment('appt-1', dentistActor);

      expect(prisma.encounterAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'REOPENED',
          before: expect.objectContaining({
            status: EncounterStatus.CANCELLED,
            dentistId: 'dentist-old',
            startedAt: '2026-09-01T01:00:00.000Z',
          }),
        }),
      });
    });

    it('still refuses a COMPLETED encounter', async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        status: 'IN_PROGRESS',
        deletedAt: null,
        patientId: 'patient-1',
        dentistId: 'dentist-1',
      });
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        id: 'enc-1',
        status: EncounterStatus.COMPLETED,
      });
      await expect(service.startEncounterForAppointment('appt-1', dentistActor)).rejects.toThrow(
        EncounterNotClosableException,
      );
      expect(prisma.encounter.update).not.toHaveBeenCalled();
    });
  });

  describe('front-desk exemption (start / list)', () => {
    // A role with neither encounter.read.own nor .any (receptionist) must keep
    // starting and listing encounters for every dentist — the reason the
    // start/list check differs from the clinical-write one.
    const frontDesk = userPayloadWithPermissions(['encounter.start', 'encounter.read.basic']);

    it("starts an encounter for another dentist's appointment", async () => {
      (prisma.appointment.findUnique as jest.Mock).mockResolvedValue({
        id: 'appt-1',
        dentistId: 'some-other-dentist',
        patientId: 'patient-1',
        status: 'CHECKED_IN',
        deletedAt: null,
      });
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: 'some-other-dentist' }),
      );
      await expect(
        service.startEncounterForAppointment('appt-1', frontDesk),
      ).resolves.toBeDefined();
    });

    it('is still barred from clinical writes on any encounter', async () => {
      const writer = userPayloadWithPermissions(['treatment.write'], 'user-1');
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ dentistId: 'some-other-dentist' }),
      );
      await expect(service.cancelEncounter('enc-1', 'Hủy vì tạo nhầm', writer)).rejects.toThrow(
        EncounterNotFoundException,
      );
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

    describe('allergy re-check against the current prescription', () => {
      const activeRx = {
        id: 'rx-1',
        encounterId: 'enc-1',
        deletedAt: null,
        version: 2,
        lines: [{ drugName: 'Augmentin 625mg', deletedAt: null }],
      };

      beforeEach(() => {
        (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
          ...validEncounter({ status: EncounterStatus.IN_PROGRESS }),
          treatments: [],
        });
        (prisma.prescription.findUnique as jest.Mock).mockResolvedValue(activeRx);
        // allergy recorded after the prescription was saved
        (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
          allergies: ['Không chịu được Penicillin'],
        });
        (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
      });

      it('409s PRESCRIPTION_ALLERGY_CONFLICT and closes nothing', async () => {
        const err = await service
          .closeEncounter('enc-1', { summary: 'done' } as any, dentistActor)
          .catch(e => e);

        expect(err).toBeInstanceOf(PrescriptionAllergyConflictException);
        expect(err.getResponse()).toEqual(
          expect.objectContaining({
            error: 'PRESCRIPTION_ALLERGY_CONFLICT',
            details: {
              conflicts: [
                expect.objectContaining({
                  drugName: 'Augmentin 625mg',
                  allergy: 'Không chịu được Penicillin',
                }),
              ],
            },
          }),
        );
        expect(prisma.encounter.update).not.toHaveBeenCalled();
        expect(events.emit).not.toHaveBeenCalled();
      });

      it('rejects a reason under 10 characters', async () => {
        await expect(
          service.closeEncounter(
            'enc-1',
            { summary: 'done', allergyOverrideReason: 'ngắn' } as any,
            dentistActor,
          ),
        ).rejects.toThrow(/ít nhất 10 ký tự/);
      });

      it('closes when the same pair was already overridden on this prescription', async () => {
        (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
          {
            metadata: {
              prescriptionId: 'rx-1',
              conflicts: [{ drugName: 'AUGMENTIN 625mg', allergy: 'Không chịu được penicillin' }],
            },
          },
        ]);

        await service.closeEncounter('enc-1', { summary: 'done' } as any, dentistActor);

        expect(prisma.encounter.update).toHaveBeenCalled();
        expect(audit.log).not.toHaveBeenCalledWith(
          expect.objectContaining({ action: 'PRESCRIPTION_ALLERGY_OVERRIDE' }),
        );
      });

      it('still 409s when the override was for another prescription or another allergy', async () => {
        (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
          {
            metadata: {
              prescriptionId: 'rx-old',
              conflicts: [{ drugName: 'Augmentin 625mg', allergy: 'Không chịu được Penicillin' }],
            },
          },
          {
            metadata: {
              prescriptionId: 'rx-1',
              conflicts: [{ drugName: 'Augmentin 625mg', allergy: 'Dị ứng Amoxicillin' }],
            },
          },
        ]);

        await expect(
          service.closeEncounter('enc-1', { summary: 'done' } as any, dentistActor),
        ).rejects.toThrow(PrescriptionAllergyConflictException);
      });

      it('closes with a reason and records PRESCRIPTION_ALLERGY_OVERRIDE', async () => {
        await service.closeEncounter(
          'enc-1',
          { summary: 'done', allergyOverrideReason: '  Đã hỏi lại, BN dùng Augmentin ổn  ' } as any,
          dentistActor,
        );

        expect(prisma.encounter.update).toHaveBeenCalled();
        expect(audit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'PRESCRIPTION_ALLERGY_OVERRIDE',
            targetId: 'enc-1',
            metadata: expect.objectContaining({
              prescriptionId: 'rx-1',
              reason: 'Đã hỏi lại, BN dùng Augmentin ổn',
              atClose: true,
              conflicts: [expect.objectContaining({ drugName: 'Augmentin 625mg' })],
            }),
          }),
        );
      });

      it('ignores a deleted prescription', async () => {
        (prisma.prescription.findUnique as jest.Mock).mockResolvedValue({
          ...activeRx,
          deletedAt: new Date(),
        });
        await service.closeEncounter('enc-1', { summary: 'done' } as any, dentistActor);
        expect(prisma.encounter.update).toHaveBeenCalled();
      });
    });
  });

  describe('prescription DTO limits', () => {
    const errorsFor = (line: Record<string, unknown>) =>
      validateSync(
        plainToInstance(CreatePrescriptionDto, { lines: [{ drugName: 'Amoxicillin', ...line }] }),
      );

    it('caps dosage/frequency at the VARCHAR(100) columns and quantity at 10000', () => {
      expect(
        errorsFor({ dosage: 'x'.repeat(100), frequency: 'y'.repeat(100), quantity: 10000 }),
      ).toEqual([]);
      expect(errorsFor({ dosage: 'x'.repeat(101) })).not.toEqual([]);
      expect(errorsFor({ frequency: 'y'.repeat(101) })).not.toEqual([]);
      expect(errorsFor({ quantity: 3e9 })).not.toEqual([]);
    });

    it('requires version on the PATCH payload', () => {
      expect(validateSync(plainToInstance(UpdatePrescriptionDto, { notes: 'x' }))).not.toEqual([]);
      expect(
        validateSync(plainToInstance(UpdatePrescriptionDto, { notes: 'x', version: 0 })),
      ).toEqual([]);
    });
  });

  describe('updatePrescription', () => {
    beforeEach(() => {
      (prisma.prescription.findUnique as jest.Mock).mockResolvedValue({
        id: 'rx-1',
        encounterId: 'enc-1',
        deletedAt: null,
        version: 3,
        encounter: { dentistId: dentistActor.sub },
      });
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS, dentistId: dentistActor.sub }),
      );
      (prisma.prescription.update as jest.Mock).mockResolvedValue({ id: 'rx-1', version: 4 });
    });

    it('409s PRESCRIPTION_VERSION_CONFLICT on a stale version and writes nothing', async () => {
      await expect(
        service.updatePrescription('rx-1', { notes: 'x', version: 2 }, dentistActor),
      ).rejects.toThrow(PrescriptionVersionConflictException);
      expect(prisma.prescription.update).not.toHaveBeenCalled();
    });

    it('updates when the version matches', async () => {
      await service.updatePrescription('rx-1', { notes: 'x', version: 3 }, dentistActor);
      expect(prisma.prescription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rx-1' },
          data: expect.objectContaining({ notes: 'x', version: { increment: 1 } }),
        }),
      );
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
        {
          lines: [
            {
              drugName: 'Amoxicillin',
              dosage: '500mg',
              frequency: '3 lần/ngày',
              durationDays: 5,
              quantity: 15,
              unit: 'viên',
            },
          ],
        },
        dentistActor,
      );
      expect(result).toBeDefined();
      expect(prisma.prescriptionLine.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          drugName: 'Amoxicillin',
          duration: '5',
          quantity: 15,
          unit: 'viên',
        }),
      });
    });
  });

  describe('upsertPrescription (replace / restore)', () => {
    const line = { drugName: 'Paracetamol 500mg', dosage: '1 viên', durationDays: 3 };

    beforeEach(() => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS }),
      );
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({ allergies: [] });
      (prisma.prescription.update as jest.Mock).mockResolvedValue({ id: 'rx-1', version: 3 });
    });

    it('replaces header and every line of the active prescription when the caller echoes its version', async () => {
      (prisma.prescription.findUnique as jest.Mock).mockResolvedValue({
        id: 'rx-1',
        encounterId: 'enc-1',
        deletedAt: null,
        version: 2,
      });

      await service.upsertPrescription(
        'enc-1',
        { version: 2, diagnosis: 'Viêm tủy', lines: [line] } as any,
        dentistActor,
      );

      expect(prisma.prescriptionLine.updateMany).toHaveBeenCalledWith({
        where: { prescriptionId: 'rx-1', deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.prescription.update).toHaveBeenCalledWith({
        where: { id: 'rx-1' },
        data: expect.objectContaining({ diagnosis: 'Viêm tủy', version: { increment: 1 } }),
      });
      const updateData = (prisma.prescription.update as jest.Mock).mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty('deletedAt');
      expect(updateData).not.toHaveProperty('createdAt');
      expect(prisma.prescription.create).not.toHaveBeenCalled();
      expect(prisma.prescriptionLine.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ prescriptionId: 'rx-1', drugName: 'Paracetamol 500mg' }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PRESCRIPTION_REPLACED' }),
      );
    });

    it('409s a stale version and changes nothing', async () => {
      (prisma.prescription.findUnique as jest.Mock).mockResolvedValue({
        id: 'rx-1',
        encounterId: 'enc-1',
        deletedAt: null,
        version: 3,
      });
      await expect(
        service.upsertPrescription('enc-1', { version: 2, lines: [line] } as any, dentistActor),
      ).rejects.toThrow(PrescriptionVersionConflictException);
      expect(prisma.prescriptionLine.updateMany).not.toHaveBeenCalled();
      expect(prisma.prescription.update).not.toHaveBeenCalled();
    });

    it('reuses a soft-deleted prescription row instead of reporting "already exists" (regression)', async () => {
      (prisma.prescription.findUnique as jest.Mock).mockResolvedValue({
        id: 'rx-old',
        encounterId: 'enc-1',
        deletedAt: new Date('2026-09-01T00:00:00Z'),
        version: 1,
      });

      await service.upsertPrescription('enc-1', { lines: [line] } as any, dentistActor);

      expect(prisma.prescriptionLine.updateMany).toHaveBeenCalledWith({
        where: { prescriptionId: 'rx-old', deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.prescription.update).toHaveBeenCalledWith({
        where: { id: 'rx-old' },
        data: expect.objectContaining({ deletedAt: null, createdBy: dentistActor.sub }),
      });
      // the original issue time is kept
      expect((prisma.prescription.update as jest.Mock).mock.calls[0][0].data).not.toHaveProperty(
        'createdAt',
      );
      expect(prisma.prescription.create).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRESCRIPTION_CREATED',
          metadata: expect.objectContaining({ reusedDeletedPrescription: true }),
        }),
      );
    });
  });

  describe('upsertPrescription (allergy screening)', () => {
    const amoxicillin = { drugName: 'Augmentin 625mg', dosage: '1 viên', frequency: '2 lần/ngày' };

    beforeEach(() => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ status: EncounterStatus.IN_PROGRESS }),
      );
      (prisma.prescription.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.prescription.create as jest.Mock).mockResolvedValue({ id: 'rx-1' });
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
        allergies: ['Dị ứng Penicillin'],
      });
    });

    it('409s PRESCRIPTION_ALLERGY_CONFLICT with the drug/allergy pairs and saves nothing', async () => {
      const err = await service
        .upsertPrescription('enc-1', { lines: [amoxicillin] } as any, dentistActor)
        .catch(e => e);

      expect(err).toBeInstanceOf(PrescriptionAllergyConflictException);
      expect(err.getStatus()).toBe(409);
      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          error: 'PRESCRIPTION_ALLERGY_CONFLICT',
          details: {
            conflicts: [
              expect.objectContaining({
                lineIndex: 0,
                drugName: 'Augmentin 625mg',
                allergy: 'Dị ứng Penicillin',
              }),
            ],
          },
        }),
      );
      expect(prisma.patient.findUnique).toHaveBeenCalledWith({
        where: { id: 'patient-1' },
        select: { allergies: true },
      });
      expect(prisma.prescription.create).not.toHaveBeenCalled();
      expect(prisma.prescriptionLine.create).not.toHaveBeenCalled();
    });

    it('still blocks when the override reason is under 10 characters', async () => {
      await expect(
        service.upsertPrescription(
          'enc-1',
          { lines: [amoxicillin], allergyOverrideReason: '  ngắn  ' } as any,
          dentistActor,
        ),
      ).rejects.toThrow(/ít nhất 10 ký tự/);
      expect(prisma.prescription.create).not.toHaveBeenCalled();
    });

    it('saves with a reason and records PRESCRIPTION_ALLERGY_OVERRIDE', async () => {
      await service.upsertPrescription(
        'enc-1',
        {
          lines: [amoxicillin],
          allergyOverrideReason: 'Đã test da âm tính, bệnh nhân đồng ý',
        } as any,
        dentistActor,
      );
      expect(prisma.prescription.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRESCRIPTION_ALLERGY_OVERRIDE',
          targetId: 'enc-1',
          metadata: expect.objectContaining({
            reason: 'Đã test da âm tính, bệnh nhân đồng ý',
            conflicts: [expect.objectContaining({ drugName: 'Augmentin 625mg' })],
          }),
        }),
      );
    });

    it('does not ask for a reason when nothing matches', async () => {
      await service.upsertPrescription(
        'enc-1',
        { lines: [{ drugName: 'Paracetamol 500mg' }] } as any,
        dentistActor,
      );
      expect(prisma.prescription.create).toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PRESCRIPTION_ALLERGY_OVERRIDE' }),
      );
    });
  });

  describe('getEncounter (prescription visibility)', () => {
    const withPrescription = (deletedAt: Date | null) => ({
      ...validEncounter({ dentistId: dentistActor.sub }),
      patient: { id: 'patient-1', code: 'P1', fullName: 'A' },
      dentist: { id: dentistActor.sub, fullName: 'B' },
      treatments: [],
      clinicalNote: null,
      prescription: { id: 'rx-1', encounterId: 'enc-1', deletedAt, version: 4, lines: [] },
    });

    it('hides a soft-deleted prescription (regression: it was returned and printed)', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        withPrescription(new Date('2026-09-01T00:00:00Z')),
      );
      const result: any = await service.getEncounter('enc-1', dentistActor);
      expect(result.prescriptions).toEqual([]);
      expect(result.prescription).toBeNull();
    });

    it('flags an encounter reopened after a cancel that still carries earlier data', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        ...withPrescription(null),
        audits: [{ id: 'aud-1' }],
      });
      const result: any = await service.getEncounter('enc-1', dentistActor);
      expect(result.reopenedFromCancel).toBe(true);
      expect(result).not.toHaveProperty('audits');
    });

    it('does not flag a reopened encounter with nothing recorded, or one never reopened', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        ...withPrescription(new Date('2026-09-01T00:00:00Z')),
        audits: [{ id: 'aud-1' }],
      });
      expect(((await service.getEncounter('enc-1', dentistActor)) as any).reopenedFromCancel).toBe(
        false,
      );
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue({
        ...withPrescription(null),
        audits: [],
      });
      expect(((await service.getEncounter('enc-1', dentistActor)) as any).reopenedFromCancel).toBe(
        false,
      );
    });

    it('returns the active prescription with its version and filters deleted lines in the query', async () => {
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(withPrescription(null));
      const result: any = await service.getEncounter('enc-1', dentistActor);
      expect(result.prescriptions).toEqual([expect.objectContaining({ id: 'rx-1', version: 4 })]);
      const include = (prisma.encounter.findUnique as jest.Mock).mock.calls[0][0].include;
      expect(include.prescription.include.lines.where).toEqual({ deletedAt: null });
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

    it("regression: throws when a dentist tries to delete a treatment on a colleague's encounter", async () => {
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
