import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConsentsService } from './consents.service';
import { getConsentNotices } from './consent-record';
import { JwtPayload } from '../common/guards/permissions.guard';

const actor = (permissions: string[]): JwtPayload => ({
  sub: 'staff',
  email: 'staff@test.local',
  permissions,
});
const reception = actor([
  'consent.read',
  'consent.manage',
  'patient.read',
  'patient.update',
  'appointment.read.any',
]);
const dentist = actor(['consent.read', 'patient.read', 'appointment.read.own']);
const admin = actor([...reception.permissions, 'consent.export']);

describe('ConsentsService', () => {
  let db: any;
  let audit: any;
  let service: ConsentsService;
  const row = {
    id: 'record',
    patientId: null,
    bookingRequestId: 'booking',
    purpose: 'BOOKING_REQUEST',
    version: '1',
    text: 'Accepted text',
    channel: 'ONLINE',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    withdrawnAt: null,
    bookingRequest: { patientId: 'patient' },
    ipPrefix: '192.0.2.0/24',
    actorId: 'staff',
  };
  beforeEach(() => {
    db = {
      patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient' }) },
      encounter: { count: jest.fn().mockResolvedValue(0) },
      appointment: { count: jest.fn().mockResolvedValue(0) },
      consentRecord: {
        findMany: jest.fn().mockResolvedValue([row]),
        findFirst: jest.fn().mockResolvedValue(row),
        findUniqueOrThrow: jest.fn().mockResolvedValue(row),
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    db.$transaction = jest.fn((fn: any) => fn(db));
    audit = { log: jest.fn() };
    service = new ConsentsService(db, audit);
  });

  it('includes later-confirmed bookings and returns only the public record fields', async () => {
    const result = await service.listForPatient('patient', reception);
    expect(result).toEqual([
      {
        id: 'record',
        patientId: 'patient',
        bookingRequestId: 'booking',
        purpose: 'BOOKING_REQUEST',
        version: '1',
        text: 'Accepted text',
        channel: 'ONLINE',
        createdAt: row.createdAt,
        withdrawnAt: null,
      },
    ]);
    expect(db.consentRecord.findMany.mock.calls[0][0].where.OR).toContainEqual({
      bookingRequest: { patientId: 'patient' },
    });
  });

  it('denies dentists unrelated to the patient and callers without a read scope', async () => {
    await expect(service.listForPatient('patient', dentist)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.listForPatient('patient', actor(['consent.read']))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.consentRecord.findMany).not.toHaveBeenCalled();
  });

  it('lets a dentist read a patient they treated', async () => {
    db.encounter.count.mockResolvedValue(1);
    await expect(service.listForPatient('patient', dentist)).resolves.toHaveLength(1);
  });

  it('rejects missing/deleted patients', async () => {
    db.patient.findFirst.mockResolvedValue(null);
    await expect(service.listForPatient('patient', reception)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('validates desk purpose/version against the approved notice', async () => {
    const notice = getConsentNotices().desk;
    await expect(
      service.recordAtDesk('patient', { purpose: notice.purpose, version: 'old' }, reception),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.recordAtDesk('patient', { purpose: 'arbitrary', version: notice.version }, reception),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.consentRecord.createMany).not.toHaveBeenCalled();
    await service.recordAtDesk('patient', notice, reception, '192.0.2.99');
    expect(db.consentRecord.createMany.mock.calls[0][0].data).toMatchObject({
      patientId: 'patient',
      channel: 'DESK',
      actorId: 'staff',
      text: notice.text,
      ipPrefix: '192.0.2.0/24',
    });
  });

  it('denies write-only and dentist-like custom roles clinic-wide writes', async () => {
    await expect(service.withdraw('patient', 'record', dentist)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.withdraw(
        'patient',
        'record',
        actor([...dentist.permissions, 'consent.manage', 'patient.update']),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.withdraw('patient', 'record', actor(['consent.manage'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('withdraws only a record belonging to the patient and audits once in the transaction', async () => {
    await service.withdraw('patient', 'record', reception);
    expect(db.consentRecord.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'record',
      OR: expect.arrayContaining([
        { patientId: 'patient' },
        { bookingRequest: { patientId: 'patient' } },
      ]),
    });
    expect(db.consentRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'record', withdrawnAt: null },
      data: { withdrawnAt: expect.any(Date), withdrawnBy: 'staff' },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONSENT_WITHDRAWN', targetId: 'record' }),
      db,
    );
    db.consentRecord.updateMany.mockResolvedValue({ count: 0 });
    await service.withdraw('patient', 'record', reception);
    expect(audit.log).toHaveBeenCalledTimes(1);
    db.consentRecord.findFirst.mockResolvedValue(null);
    await expect(service.withdraw('patient', 'foreign-record', reception)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('restricts the global ledger and export to consent.export holders', async () => {
    await expect(service.adminList({}, reception)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.exportCsv({}, dentist)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.consentRecord.findMany).not.toHaveBeenCalled();
    const result = await service.adminList({ q: 'accepted', offset: 5, limit: 10 }, admin);
    expect(result.total).toBe(1);
    expect(db.consentRecord.findMany.mock.calls[0][0]).toMatchObject({
      skip: 5,
      take: 10,
      where: {
        OR: expect.arrayContaining([{ text: { contains: 'accepted', mode: 'insensitive' } }]),
      },
    });
  });

  it('exports every match with safe CSV quoting and formula protection', async () => {
    db.consentRecord.findMany.mockResolvedValue([{ ...row, text: '=SUM(1,2)\n"quote"' }]);
    const csv = await service.exportCsv({ q: 'Accepted' }, admin);
    expect(csv).toContain(
      'id,purpose,version,text,channel,createdAt,withdrawnAt,patientId,bookingRequestId',
    );
    expect(csv).toContain('"\'=SUM(1,2)\n""quote"""');
    expect(db.consentRecord.findMany.mock.calls[0][0].take).toBeUndefined();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONSENTS_EXPORTED' }),
    );
  });
});
