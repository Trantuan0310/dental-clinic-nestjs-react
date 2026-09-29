import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PatientsService } from './patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import {
  validPatient,
  adminPayload,
  dentistPayload,
  receptionistPayload,
  userPayloadWithPermissions,
} from '../../test/helpers';
import { Gender, IdentifierType } from '@prisma/client';
import {
  PatientContactRequiredException,
  PatientNotFoundException,
  DobLockedException,
  PatientCannotDeleteException,
  PatientMergeInvalidException,
  IdentifierAlreadyExistsException,
  PatientVersionConflictException,
} from './domain/exceptions';

describe('PatientsService', () => {
  let service: PatientsService;
  let prisma: PrismaMockShape;
  let audit: { log: jest.Mock };
  let events: { emit: jest.Mock };
  const actor = adminPayload();

  beforeEach(async () => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ nextval: 42n }]);
    // softDelete runs its check-then-write inside $transaction (BR-PT-010
    // TOCTOU fix) — the default mock's tx stub only has $executeRaw/$queryRaw,
    // not full model methods, so route callbacks through the full mock.
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) =>
      typeof cb === 'function' ? cb(prisma) : cb,
    );

    const module = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get(PatientsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('rejects when neither primaryPhone nor contactPerson is provided', async () => {
      await expect(
        service.create(
          {
            fullName: 'No Contact',
            dob: '1990-01-15',
            gender: Gender.MALE,
          } as any,
          actor,
        ),
      ).rejects.toThrow(PatientContactRequiredException);
    });

    it('rejects minor without contact person', async () => {
      await expect(
        service.create(
          {
            fullName: 'Minor',
            dob: '2020-01-15',
            gender: Gender.MALE,
            primaryPhone: '0901234567',
          } as any,
          actor,
        ),
      ).rejects.toThrow(PatientContactRequiredException);
    });

    it('rejects invalid Vietnamese phone', async () => {
      await expect(
        service.create(
          {
            fullName: 'Bad Phone',
            dob: '1990-01-15',
            gender: Gender.MALE,
            primaryPhone: '12345',
          } as any,
          actor,
        ),
      ).rejects.toThrow(PatientContactRequiredException);
    });

    it('creates patient with code and writes audit log', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.patient.create as jest.Mock).mockResolvedValue(
        validPatient({ id: 'new-p', code: 'PAT-2026-00042' }),
      );

      const result = await service.create(
        {
          fullName: 'Nguyen Van A',
          dob: '1990-01-15',
          gender: Gender.MALE,
          primaryPhone: '0901234567',
        } as any,
        actor,
      );

      expect(result.code).toBe('PAT-2026-00042');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PATIENT_CREATED' }),
      );
    });

    it('throws IdentifierAlreadyExistsException when identifier already exists on another patient', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.patient.create as jest.Mock).mockResolvedValue(validPatient({ id: 'new-p' }));
      (prisma.patientIdentifier.findFirst as jest.Mock).mockResolvedValue({
        id: 'ident-other',
        patientId: 'other-patient',
      });

      await expect(
        service.create(
          {
            fullName: 'Dup ID',
            dob: '1990-01-15',
            gender: Gender.MALE,
            primaryPhone: '0901234567',
            identifiers: [{ type: IdentifierType.CCCD, value: '079123456789' }],
          } as any,
          actor,
        ),
      ).rejects.toThrow(IdentifierAlreadyExistsException);
    });
  });

  describe('update', () => {
    it('throws when patient not found', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.update('p1', { fullName: 'X' } as any, actor)).rejects.toThrow(
        PatientNotFoundException,
      );
    });

    it('rejects code change (BR-PT-016)', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(validPatient());
      await expect(service.update('p1', { code: 'NEW' } as any, actor)).rejects.toThrow(
        PatientContactRequiredException,
      );
    });

    it('rejects DOB change when patient has encounters (BR-PT-017)', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(validPatient());
      (prisma.encounter.count as jest.Mock).mockResolvedValue(1);

      await expect(service.update('p1', { dob: '1991-01-01' } as any, actor)).rejects.toThrow(
        DobLockedException,
      );
    });

    it('writes phone history when primaryPhone changes (BR-PT-009)', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(
        validPatient({ primaryPhone: '0901111111' }),
      );
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.patient.update as jest.Mock).mockResolvedValue(
        validPatient({ primaryPhone: '0902222222' }),
      );

      await service.update('p1', { primaryPhone: '0902222222' } as any, actor);

      expect(prisma.patientPhoneHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 'p1',
            oldPhone: '0901111111',
            newPhone: '0902222222',
          }),
        }),
      );
    });

    it('does NOT write phone history when primaryPhone unchanged', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(
        validPatient({ primaryPhone: '0901111111' }),
      );
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.patient.update as jest.Mock).mockResolvedValue(validPatient());

      await service.update('p1', { primaryPhone: '0901111111' } as any, actor);

      expect(prisma.patientPhoneHistory.create).not.toHaveBeenCalled();
    });

    it('with expectedUpdatedAt, writes only if the row is unchanged since the form loaded', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(validPatient());
      (prisma.patient.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.patient.findUniqueOrThrow as jest.Mock).mockResolvedValue(validPatient());

      await service.update(
        'p1',
        { fullName: 'Nguyễn Văn A', expectedUpdatedAt: '2026-09-01T02:03:04.567Z' },
        actor,
      );

      const call = (prisma.patient.updateMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({
        id: 'p1',
        updatedAt: {
          gte: new Date('2026-09-01T02:03:04.567Z'),
          lt: new Date('2026-09-01T02:03:04.568Z'),
        },
      });
      expect(call.data).toEqual({ fullName: 'Nguyễn Văn A', updatedBy: actor.sub });
      expect(call.data).not.toHaveProperty('allergies');
      expect(prisma.patient.update).not.toHaveBeenCalled();
      expect(audit.log.mock.calls[0][0].metadata.fields).toEqual(['fullName']);
    });

    it('409s PATIENT_VERSION_CONFLICT when the patient changed after the form loaded', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(validPatient());
      (prisma.patient.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const err = await service
        .update('p1', { allergies: [], expectedUpdatedAt: '2026-09-01T02:03:04.567Z' }, actor)
        .catch(e => e);

      expect(err).toBeInstanceOf(PatientVersionConflictException);
      expect(err.getStatus()).toBe(409);
      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          code: 'PATIENT_VERSION_CONFLICT',
          message: 'Hồ sơ vừa được cập nhật ở nơi khác, tải lại rồi thử lại',
        }),
      );
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('overrideDob', () => {
    it('updates DOB and logs PATIENT_DOB_OVERRIDDEN with reason', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(validPatient());
      (prisma.patient.update as jest.Mock).mockResolvedValue(validPatient());

      await service.overrideDob('p1', { dob: '1991-05-05', reason: 'ID correction' } as any, actor);

      expect(prisma.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ dob: new Date('1991-05-05') }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PATIENT_DOB_OVERRIDDEN',
          metadata: expect.objectContaining({ reason: 'ID correction' }),
        }),
      );
    });

    it('throws PatientNotFoundException when missing', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.overrideDob('p1', { dob: '1991-05-05', reason: 'x' } as any, actor),
      ).rejects.toThrow(PatientNotFoundException);
    });

    it('requires a reason of at least 10 characters', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(validPatient());
      await expect(
        service.overrideDob('p1', { dob: '1991-05-05', reason: '  sai  ' } as any, actor),
      ).rejects.toThrow(/ít nhất 10 ký tự/);
      expect(prisma.patient.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('throws when patient not found', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.softDelete('p1', { reason: 'GDPR' } as any, actor)).rejects.toThrow(
        PatientNotFoundException,
      );
    });

    it('blocks delete when future appointments exist (BR-PT-010)', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(validPatient());
      (prisma.appointment.count as jest.Mock).mockResolvedValue(2);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(0);

      await expect(service.softDelete('p1', { reason: 'GDPR' } as any, actor)).rejects.toThrow(
        PatientCannotDeleteException,
      );
    });

    it('blocks delete when outstanding invoices exist (BR-PT-010)', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(validPatient());
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(1);

      await expect(service.softDelete('p1', { reason: 'GDPR' } as any, actor)).rejects.toThrow(
        PatientCannotDeleteException,
      );
    });

    it('soft-deletes when no future appointments or outstanding invoices', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(validPatient());
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(0);
      (prisma.patient.update as jest.Mock).mockResolvedValue(
        validPatient({ deletedAt: new Date() }),
      );

      await service.softDelete('p1', { reason: 'GDPR' } as any, actor);

      expect(prisma.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PATIENT_DELETED' }),
      );
    });
  });

  describe('restore', () => {
    it('restores a soft-deleted patient', async () => {
      (prisma.patient.findUnique as jest.Mock)
        .mockResolvedValueOnce(validPatient({ deletedAt: new Date() }))
        .mockResolvedValueOnce({
          ...validPatient({ deletedAt: null }),
          identifiers: [],
          encounters: [],
        });
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue(null); // no code conflict
      (prisma.patient.update as jest.Mock).mockResolvedValue(validPatient({ deletedAt: null }));

      await service.restore('p1', actor);

      expect(prisma.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('throws PatientCodeConflictException when another active patient has same code', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(
        validPatient({ deletedAt: new Date(), code: 'PAT-2026-00042' }),
      );
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue({ id: 'other-p' });
      await expect(service.restore('p1', actor)).rejects.toThrow(/code/i);
    });

    it('throws PatientNotFoundException when not found', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.restore('p1', actor)).rejects.toThrow(PatientNotFoundException);
    });

    it('refuses to restore a patient that was merged into another record', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(
        validPatient({ deletedAt: new Date() }),
      );
      (prisma.patientMergeLog.findFirst as jest.Mock).mockResolvedValue({
        target: { code: 'BN-2026-00007' },
      });
      await expect(service.restore('p1', actor)).rejects.toThrow(
        /đã được gộp vào hồ sơ BN-2026-00007/,
      );
      expect(prisma.patientMergeLog.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sourcePatientId: 'p1' } }),
      );
      expect(prisma.patient.update).not.toHaveBeenCalled();
    });
  });

  describe('merge', () => {
    it('throws when source patient not found', async () => {
      (prisma.patient.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(validPatient({ id: 'p2' }));
      await expect(
        service.merge({ sourcePatientId: 'p1', targetPatientId: 'p2', reason: 'x' } as any, actor),
      ).rejects.toThrow(PatientNotFoundException);
    });

    it('throws when target patient has different DOB', async () => {
      (prisma.patient.findUnique as jest.Mock)
        .mockResolvedValueOnce(validPatient({ id: 'p1', dob: new Date('1990-01-15') }))
        .mockResolvedValueOnce(validPatient({ id: 'p2', dob: new Date('1991-01-15') }));
      await expect(
        service.merge({ sourcePatientId: 'p1', targetPatientId: 'p2', reason: 'x' } as any, actor),
      ).rejects.toThrow(PatientMergeInvalidException);
    });

    it('reassigns appointments, encounters, invoices and writes patientMergeLog', async () => {
      const basePatient = validPatient({ fullName: 'Same Name', dob: new Date('1990-01-15') });
      (prisma.patient.findUnique as jest.Mock)
        .mockResolvedValueOnce({ ...basePatient, id: 'p1' })
        .mockResolvedValueOnce({ ...basePatient, id: 'p2' });
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(0);
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
      (prisma.encounter.updateMany as jest.Mock).mockResolvedValue({ count: 5 });
      (prisma.invoice.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
      (prisma.patientIdentifier.findMany as jest.Mock).mockResolvedValue([]);

      await service.merge(
        {
          sourcePatientId: 'p1',
          targetPatientId: 'p2',
          reason: 'duplicate detection',
        } as any,
        actor,
      );

      expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: 'p1' },
          data: { patientId: 'p2' },
        }),
      );
      expect(prisma.patientMergeLog.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PATIENT_MERGED' }));
      // Both AI summaries are stale once history/encounters move.
      expect(events.emit).toHaveBeenCalledWith('patient.clinical_data.changed', {
        patientId: 'p2',
      });
      expect(events.emit).toHaveBeenCalledWith('patient.clinical_data.changed', {
        patientId: 'p1',
      });
    });
  });

  describe('merge (medical history, identifiers, transaction)', () => {
    const same = { fullName: 'Nguyễn Văn A', dob: new Date('1990-01-15') };

    beforeEach(() => {
      (prisma.patient.findUnique as jest.Mock)
        .mockResolvedValueOnce(
          validPatient({
            ...same,
            id: 'p1',
            code: 'BN-1',
            allergies: ['penicillin', 'Tôm'],
            chronicDiseases: ['Tiểu đường'],
            currentMedications: ['Metformin'],
          }),
        )
        .mockResolvedValueOnce(
          validPatient({
            ...same,
            id: 'p2',
            code: 'BN-2',
            allergies: ['Penicillin'],
            chronicDiseases: [],
            currentMedications: ['Aspirin'],
          }),
        );
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      (prisma.invoice.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.encounter.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.invoice.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.patientIdentifier.findMany as jest.Mock).mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.patientId === 'p1'
            ? [
                { id: 'i-cccd', type: IdentifierType.CCCD, value: '079123456789' },
                { id: 'i-passport', type: IdentifierType.PASSPORT, value: 'b1234567' },
              ]
            : [{ type: IdentifierType.PASSPORT, value: 'B1234567' }],
        ),
      );
    });

    const run = () =>
      service.merge(
        { sourcePatientId: 'p1', targetPatientId: 'p2', reason: 'Trùng hồ sơ' } as any,
        actor,
      );

    it('unions allergies, chronic diseases and medications into the target (case-insensitive de-dup)', async () => {
      await run();
      expect(prisma.patient.update).toHaveBeenCalledWith({
        where: { id: 'p2' },
        data: {
          allergies: ['Penicillin', 'Tôm'],
          chronicDiseases: ['Tiểu đường'],
          currentMedications: ['Aspirin', 'Metformin'],
          updatedBy: actor.sub,
        },
      });
    });

    it("moves the source's identifiers to the target and drops only exact duplicates", async () => {
      const result = await run();
      expect(prisma.patientIdentifier.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['i-passport'] } },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.patientIdentifier.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['i-cccd'] } },
        data: { patientId: 'p2' },
      });
      expect(result.migrated).toEqual(
        expect.objectContaining({ identifiersMoved: 1, identifiersDropped: 1 }),
      );
    });

    it('runs the eligibility checks inside one Serializable transaction with both rows locked', async () => {
      await run();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      // The reads happen after the locks, i.e. inside the transaction.
      const lockOrder = (prisma.$queryRaw as jest.Mock).mock.invocationCallOrder[1];
      const readOrder = (prisma.patient.findUnique as jest.Mock).mock.invocationCallOrder[0];
      const countOrder = (prisma.appointment.count as jest.Mock).mock.invocationCallOrder[0];
      expect(readOrder).toBeGreaterThan(lockOrder);
      expect(countOrder).toBeGreaterThan(lockOrder);
    });

    it('aborts without moving anything when the source still has future appointments', async () => {
      (prisma.appointment.count as jest.Mock).mockResolvedValue(1);
      await expect(run()).rejects.toThrow(PatientMergeInvalidException);
      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      expect(prisma.patient.update).not.toHaveBeenCalled();
    });

    it('rejects merging a record into itself', async () => {
      await expect(
        service.merge({ sourcePatientId: 'p1', targetPatientId: 'p1' } as any, actor),
      ).rejects.toThrow(PatientMergeInvalidException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateMedicalHistory', () => {
    beforeEach(() => {
      (prisma.patient.findFirst as jest.Mock).mockResolvedValue({ id: 'p1' });
      (prisma.patient.update as jest.Mock).mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: 'p1',
          allergies: data.allergies ?? [],
          chronicDiseases: data.chronicDiseases ?? [],
          currentMedications: data.currentMedications ?? [],
        }),
      );
    });

    it('lets a dentist record history for a patient they treated, trimming and de-duplicating', async () => {
      (prisma.encounter.count as jest.Mock).mockResolvedValue(2);
      const result = await service.updateMedicalHistory(
        'p1',
        { allergies: [' Penicillin ', 'Penicillin', ''], currentMedications: ['Aspirin'] },
        dentistPayload(),
      );
      expect(prisma.encounter.count).toHaveBeenCalledWith({
        where: { patientId: 'p1', dentistId: 'dentist-1', status: { not: 'CANCELLED' } },
      });
      const data = (prisma.patient.update as jest.Mock).mock.calls[0][0].data;
      expect(data).toEqual({
        allergies: ['Penicillin'],
        currentMedications: ['Aspirin'],
        updatedBy: 'dentist-1',
      });
      expect(data).not.toHaveProperty('fullName');
      expect(result.allergies).toEqual(['Penicillin']);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PATIENT_MEDICAL_HISTORY_UPDATED' }),
      );
      // AI summary cache is keyed on this history — it must be invalidated.
      expect(events.emit).toHaveBeenCalledWith('patient.clinical_data.changed', {
        patientId: 'p1',
      });
    });

    it('lets a dentist record a newly found allergy for a patient checked in with them today', async () => {
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      // read scope, then "checked in / in the chair today"
      (prisma.appointment.count as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      await service.updateMedicalHistory('p1', { allergies: ['Latex'] }, dentistPayload());
      expect(prisma.appointment.count).toHaveBeenLastCalledWith({
        where: {
          patientId: 'p1',
          dentistId: 'dentist-1',
          deletedAt: null,
          status: { in: ['CHECKED_IN', 'IN_PROGRESS'] },
          startAt: { gte: expect.any(Date), lte: expect.any(Date) },
        },
      });
      expect(prisma.patient.update).toHaveBeenCalled();
    });

    it('only lets an upcoming booking read, not edit, the medical history (403)', async () => {
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.count as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      await expect(
        service.updateMedicalHistory('p1', { allergies: ['Latex'] }, dentistPayload()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.patient.update).not.toHaveBeenCalled();
    });

    it('limits read access by upcoming booking to the next 7 days', async () => {
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      await expect(
        service.updateMedicalHistory('p1', { allergies: ['X'] }, dentistPayload()),
      ).rejects.toBeInstanceOf(PatientNotFoundException);
      const where = (prisma.appointment.count as jest.Mock).mock.calls[0][0].where;
      const upcoming = where.OR.find((c: any) => c.startAt);
      expect(upcoming.status).toEqual({ in: ['SCHEDULED', 'CONFIRMED'] });
      const horizonDays = (upcoming.startAt.lte.getTime() - Date.now()) / 86400000;
      expect(horizonDays).toBeGreaterThan(6.99);
      expect(horizonDays).toBeLessThanOrEqual(7);
      expect(where.OR).toContainEqual({
        status: { in: ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'] },
      });
    });

    it('hides a patient the dentist neither treated nor is booked with', async () => {
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);
      await expect(
        service.updateMedicalHistory('p1', { allergies: ['X'] }, dentistPayload()),
      ).rejects.toBeInstanceOf(PatientNotFoundException);
      expect(prisma.patient.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('does not scope the front desk or admin', async () => {
      await service.updateMedicalHistory(
        'p1',
        { chronicDiseases: ['Tiểu đường'] },
        userPayloadWithPermissions(['patient.update']),
      );
      expect(prisma.encounter.count).not.toHaveBeenCalled();
      expect(prisma.patient.update).toHaveBeenCalled();
    });

    it('guards the write on expectedUpdatedAt and returns the new updatedAt', async () => {
      const updatedAt = new Date('2026-09-02T00:00:00.000Z');
      (prisma.patient.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.patient.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        id: 'p1',
        allergies: ['Latex'],
        chronicDiseases: [],
        currentMedications: [],
        updatedAt,
      });

      const result = await service.updateMedicalHistory(
        'p1',
        { allergies: ['Latex'], expectedUpdatedAt: '2026-09-01T00:00:00.000Z' },
        userPayloadWithPermissions(['patient.update']),
      );

      expect((prisma.patient.updateMany as jest.Mock).mock.calls[0][0].where).toEqual({
        id: 'p1',
        updatedAt: {
          gte: new Date('2026-09-01T00:00:00.000Z'),
          lt: new Date('2026-09-01T00:00:00.001Z'),
        },
      });
      expect(prisma.patient.update).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ allergies: ['Latex'], updatedAt }));
    });

    it('409s when the history changed after the card loaded, writing nothing', async () => {
      (prisma.patient.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(
        service.updateMedicalHistory(
          'p1',
          { allergies: [], expectedUpdatedAt: '2026-09-01T00:00:00.000Z' },
          userPayloadWithPermissions(['patient.update']),
        ),
      ).rejects.toBeInstanceOf(PatientVersionConflictException);
      expect(audit.log).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('getDetailWithSummary (BR-PT-021 financial masking, BR-PT-014 dentist row-level)', () => {
    // getById() (called internally) selects `identifiers` and `encounters`
    // (for lastVisitAt/By) via `include` — the mock needs both present even
    // though this describe block doesn't exercise them.
    const patientRow = () => ({
      ...validPatient(),
      code: 'PAT-2026-00001',
      primaryPhone: '0901234567',
      address: null,
      occupation: null,
      chronicDiseases: [],
      currentMedications: [],
      contactPersonName: null,
      contactPersonPhone: null,
      notes: null,
      identifiers: [],
      encounters: [],
    });

    // PatientForm / PatientHistoryCard echo it as expectedUpdatedAt.
    it.each([
      ['receptionist', receptionistPayload()],
      ['dentist', dentistPayload()],
      ['admin', adminPayload()],
    ])('returns updatedAt to the %s', async (_role, who) => {
      const updatedAt = new Date('2026-09-01T02:03:04.567Z');
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue({ ...patientRow(), updatedAt });
      (prisma.encounter.count as jest.Mock).mockResolvedValue(2); // dentist has treated them
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getDetailWithSummary('p1', who);

      expect(result.updatedAt).toEqual(updatedAt);
    });

    it('masks all financial fields for receptionist (spec §8.5) even though she holds invoice.read.any', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(patientRow());
      (prisma.encounter.count as jest.Mock).mockResolvedValue(3);

      const result = await service.getDetailWithSummary('p1', receptionistPayload());

      expect(result.summary).toEqual(expect.objectContaining({ totalEncounters: 3 }));
      expect(result.summary).not.toHaveProperty('totalInvoices');
      expect(result.summary).not.toHaveProperty('totalPaid');
      expect(result.summary).not.toHaveProperty('totalOutstanding');
      // Masking must not even touch Invoice — no query, no accidental leak.
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });

    it('shows full unscoped financials for admin', async () => {
      const admin = userPayloadWithPermissions([
        'patient.read',
        'patient.delete',
        'invoice.read.any',
      ]);
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(patientRow());
      (prisma.encounter.count as jest.Mock).mockResolvedValue(5);
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue([
        { status: 'PAID', paidAmount: 500_000, outstandingAmount: 0 },
        { status: 'PARTIAL', paidAmount: 200_000, outstandingAmount: 300_000 },
      ]);

      const result = await service.getDetailWithSummary('p1', admin);

      expect(result.summary).toEqual(
        expect.objectContaining({
          totalEncounters: 5,
          totalInvoices: 2,
          totalPaid: 700_000,
          totalOutstanding: 300_000,
        }),
      );
      // Admin sees every invoice for the patient — no dentist row-level filter.
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: 'p1', deletedAt: null },
        }),
      );
    });

    it("scopes financials to the dentist's own encounters when they hold invoice.read.own", async () => {
      const dentist = dentistPayload('dentist-9');
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(patientRow());
      (prisma.encounter.count as jest.Mock).mockResolvedValue(1);
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue([
        { status: 'ISSUED', paidAmount: 0, outstandingAmount: 150_000 },
      ]);

      const result = await service.getDetailWithSummary('p1', dentist);

      expect(result.summary).toEqual(
        expect.objectContaining({ totalInvoices: 1, totalOutstanding: 150_000 }),
      );
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            patientId: 'p1',
            deletedAt: null,
            encounter: { dentistId: 'dentist-9' },
          },
        }),
      );
    });

    it('404s for a dentist who neither treated nor is booked with this patient (BR-PT-014, anti-enumeration)', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(patientRow());
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await expect(service.getDetailWithSummary('p1', dentistPayload())).rejects.toThrow(
        PatientNotFoundException,
      );
    });

    it('lets a booked dentist see a first-visit patient, with the patient-wide encounter total', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(patientRow());
      // 1st count: "treated by me" (none); 2nd: patient-wide total.
      (prisma.encounter.count as jest.Mock).mockResolvedValueOnce(0).mockResolvedValueOnce(4);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(1);
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getDetailWithSummary('p1', dentistPayload());

      expect(result.summary).toEqual(expect.objectContaining({ totalEncounters: 4 }));
      expect(prisma.encounter.count).toHaveBeenLastCalledWith({ where: { patientId: 'p1' } });
    });

    it('does not count a CANCELLED encounter as "treated"', async () => {
      (prisma.patient.findUnique as jest.Mock).mockResolvedValue(patientRow());
      (prisma.encounter.count as jest.Mock).mockResolvedValue(0);
      (prisma.appointment.count as jest.Mock).mockResolvedValue(0);

      await expect(service.getDetailWithSummary('p1', dentistPayload())).rejects.toThrow(
        PatientNotFoundException,
      );
      expect(prisma.encounter.count).toHaveBeenCalledWith({
        where: { patientId: 'p1', dentistId: 'dentist-1', status: { not: 'CANCELLED' } },
      });
    });
  });

  describe('lookup', () => {
    it('finds patients by exact phone match (BR-PT-007)', async () => {
      (prisma.patient.findMany as jest.Mock).mockResolvedValue([validPatient()]);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.lookup({ phone: '0901234567' } as any, actor);
      expect(result.matchType).toBe('phone_exact');
      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ primaryPhone: '0901234567' }),
        }),
      );
    });

    it('receptionist (unrestricted, holds patient.update) sees a match regardless of who treated the patient', async () => {
      (prisma.patient.findMany as jest.Mock).mockResolvedValue([validPatient({ id: 'p-1' })]);
      // Only used here for batchLastVisit's "last visit" display info, not
      // for a row-scope check — receptionist isn't row-scoped, so lookup()
      // never queries encounters to decide visibility for her.
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.lookup({ phone: '0901234567' } as any, receptionistPayload());
      expect(result.candidates).toHaveLength(1);
    });

    it('dentist sees the match when they have an encounter with that patient (BR-PT-014)', async () => {
      (prisma.patient.findMany as jest.Mock).mockResolvedValue([validPatient({ id: 'p-1' })]);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([{ patientId: 'p-1' }]);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.lookup({ phone: '0901234567' } as any, dentistPayload());
      expect(result.candidates).toHaveLength(1);
      expect(prisma.encounter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ dentistId: 'dentist-1' }) }),
      );
    });

    it('regression: dentist does NOT see a patient they have never treated (lookup() used to take an unused _actor param and skip BR-PT-014 entirely, unlike list()/getDetailWithSummary())', async () => {
      (prisma.patient.findMany as jest.Mock).mockResolvedValue([
        validPatient({ id: 'p-1', fullName: 'Someone Else’s Patient' }),
      ]);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.lookup({ phone: '0901234567' } as any, dentistPayload());
      expect(result.candidates).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('dentist sees a patient booked on their calendar but not yet treated', async () => {
      (prisma.patient.findMany as jest.Mock).mockResolvedValue([validPatient({ id: 'p-1' })]);
      (prisma.encounter.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.appointment.findMany as jest.Mock).mockResolvedValue([{ patientId: 'p-1' }]);
      const result = await service.lookup({ phone: '0901234567' } as any, dentistPayload());
      expect(result.candidates).toHaveLength(1);
    });
  });
});
