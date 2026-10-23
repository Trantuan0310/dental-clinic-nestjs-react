import { RecallsService, hashToken } from './recalls.service';
import {
  addMonthsToDate,
  revertRecallsForEncounter,
  scheduleRecallsForEncounter,
} from './domain/recall-schedule';

const desk = { sub: 'desk-1', email: 'lt@x', permissions: ['recall.read', 'recall.manage'] };
// 2026-10-23 10:00 at the clinic (UTC+7).
const NOW = new Date('2026-10-23T03:00:00Z');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  patientId: 'p1',
  serviceId: 's1',
  sourceEncounterId: 'e0',
  dueDate: new Date('2026-10-20T00:00:00Z'),
  status: 'PENDING',
  postponedUntil: null,
  emailedAt: null,
  emailTokenHash: null,
  contactAttempts: 0,
  lastContactAt: null,
  lastContactBy: null,
  lastContactResult: null,
  lastContactNote: null,
  resolvedByEncounterId: null,
  closedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  patient: {
    id: 'p1',
    code: 'BN-1',
    fullName: 'Nguyễn An',
    primaryPhone: '0901234567',
    email: 'an@x.vn',
    recallOptOutAt: null,
  },
  service: { id: 's1', code: 'CAO_VOI', name: 'Cạo vôi răng', recallIntervalMonths: 6 },
  sourceEncounter: { id: 'e0', closedAt: new Date('2026-04-20T03:00:00Z') },
  contactedBy: null,
  ...over,
});

function setup(rows: unknown[] = [row()]) {
  const prisma: any = {
    recall: {
      findMany: jest.fn().mockResolvedValue(rows),
      findUnique: jest.fn().mockResolvedValue(rows[0]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    appointment: { findMany: jest.fn().mockResolvedValue([]) },
    patient: { findFirst: jest.fn(), update: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  const audit = { log: jest.fn() };
  const email = { send: jest.fn().mockResolvedValue(true) };
  const service = new RecallsService(prisma, audit as any, email as any);
  return { service, prisma, audit, email };
}

describe('addMonthsToDate', () => {
  it('adds calendar months, clamped to a shorter month', () => {
    expect(addMonthsToDate('2026-04-20', 6)).toBe('2026-10-20');
    expect(addMonthsToDate('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonthsToDate('2027-08-31', 6)).toBe('2028-02-29');
    expect(addMonthsToDate('2026-11-15', 12)).toBe('2027-11-15');
  });
});

describe('scheduleRecallsForEncounter', () => {
  const tx = (treatments: unknown[]) => {
    const t: any = {
      encounter: { findUnique: jest.fn().mockResolvedValue({ patientId: 'p1', treatments }) },
      recall: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'r0', dueDate: new Date('2026-10-20T00:00:00Z') }),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    return t;
  };

  it('closes the open recall for the service and makes the next one, once per service', async () => {
    const t = tx([
      { service: { id: 's1', recallIntervalMonths: 6 } },
      { service: { id: 's1', recallIntervalMonths: 6 } },
      { service: { id: 's2', recallIntervalMonths: null } },
    ]);
    // 23:30 clinic time on 22/10 is still the 22nd at the clinic.
    const closedAt = new Date('2026-10-22T16:30:00Z');
    expect(await scheduleRecallsForEncounter(t, 'e1', closedAt)).toBe(1);
    expect(t.recall.findFirst.mock.calls[0][0].where).toEqual({
      patientId: 'p1',
      serviceId: 's1',
      status: { in: ['PENDING', 'POSTPONED', 'BOOKED'] },
    });
    expect(t.recall.update).toHaveBeenCalledWith({
      where: { id: 'r0' },
      data: { status: 'DONE', resolvedByEncounterId: 'e1', closedAt },
    });
    expect(t.recall.create).toHaveBeenCalledTimes(1);
    expect(t.recall.create.mock.calls[0][0].data).toEqual({
      patientId: 'p1',
      serviceId: 's1',
      sourceEncounterId: 'e1',
      dueDate: new Date('2027-04-22T00:00:00Z'),
    });
  });

  it('an older visit closed again does not replace the recall of a later visit', async () => {
    const t = tx([{ service: { id: 's1', recallIntervalMonths: 6 } }]);
    // A later visit already made a recall due in 2027-06.
    t.recall.findFirst.mockResolvedValue({ id: 'r9', dueDate: new Date('2027-06-01T00:00:00Z') });
    expect(await scheduleRecallsForEncounter(t, 'e-old', new Date('2026-10-22T03:00:00Z'))).toBe(0);
    expect(t.recall.update).not.toHaveBeenCalled();
    expect(t.recall.create).not.toHaveBeenCalled();
  });

  it('makes nothing for services without an interval', async () => {
    const t = tx([{ service: { id: 's2', recallIntervalMonths: null } }]);
    expect(await scheduleRecallsForEncounter(t, 'e1', NOW)).toBe(0);
    expect(t.recall.create).not.toHaveBeenCalled();
  });

  it('on reopen, drops what the encounter made before reopening what it fulfilled', async () => {
    const calls: string[] = [];
    const t: any = {
      recall: {
        deleteMany: jest.fn(async () => calls.push('delete')),
        updateMany: jest.fn(async () => calls.push('reopen')),
      },
    };
    await revertRecallsForEncounter(t, 'e1');
    expect(calls).toEqual(['delete', 'reopen']);
    expect(t.recall.deleteMany).toHaveBeenCalledWith({ where: { sourceEncounterId: 'e1' } });
    expect(t.recall.updateMany).toHaveBeenCalledWith({
      where: { resolvedByEncounterId: 'e1', status: 'DONE' },
      data: { status: 'PENDING', resolvedByEncounterId: null, closedAt: null },
    });
  });
});

describe('RecallsService', () => {
  describe('list', () => {
    it('due: due within the horizon, or a call-back date reached; shows the next visit', async () => {
      const { service, prisma } = setup();
      prisma.appointment.findMany.mockResolvedValue([
        { patientId: 'p1', startAt: new Date('2026-10-30T02:00:00Z') },
      ]);
      const [view] = await service.list({}, NOW);
      const where = prisma.recall.findMany.mock.calls[0][0].where.AND[0];
      expect(where.OR).toEqual([
        { status: 'PENDING', dueDate: { lte: new Date('2026-11-06T00:00:00Z') } },
        { status: 'POSTPONED', postponedUntil: { lte: new Date('2026-10-23T00:00:00Z') } },
      ]);
      expect(view).toMatchObject({
        dueDate: '2026-10-20',
        overdue: true,
        nextVisitAt: new Date('2026-10-30T02:00:00Z'),
        patient: { hasEmail: true, optedOut: false },
      });
    });
  });

  describe('recordContact', () => {
    it('booked: off the call list', async () => {
      const { service, prisma, audit } = setup();
      await service.recordContact('r1', { result: 'BOOKED' }, desk as any, NOW);
      expect(prisma.recall.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'r1', status: { in: ['PENDING', 'POSTPONED'] } },
        data: { status: 'BOOKED', lastContactResult: 'BOOKED', contactAttempts: { increment: 1 } },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RECALL_CONTACTED' }),
        prisma,
      );
    });

    it('call back later needs a date after today', async () => {
      const { service, prisma } = setup();
      await expect(
        service.recordContact(
          'r1',
          { result: 'POSTPONED', postponedUntil: '2026-10-23' },
          desk as any,
          NOW,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'RECALL_POSTPONE_DATE' }),
      });
      await service.recordContact(
        'r1',
        { result: 'POSTPONED', postponedUntil: '2026-11-05' },
        desk as any,
        NOW,
      );
      expect(prisma.recall.updateMany.mock.calls[0][0].data).toMatchObject({
        status: 'POSTPONED',
        postponedUntil: new Date('2026-11-05T00:00:00Z'),
      });
    });

    it('unreachable stays on the list', async () => {
      const { service, prisma } = setup();
      await service.recordContact('r1', { result: 'UNREACHABLE' }, desk as any, NOW);
      expect(prisma.recall.updateMany.mock.calls[0][0].data.status).toBe('PENDING');
    });

    it('dismissing needs a reason', async () => {
      const { service, prisma } = setup();
      await expect(
        service.recordContact('r1', { result: 'DISMISSED' }, desk as any, NOW),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'RECALL_REASON_REQUIRED' }),
      });
      expect(prisma.recall.updateMany).not.toHaveBeenCalled();
    });

    it('is refused on a recall already handled', async () => {
      const { service } = setup([row({ status: 'DONE' })]);
      await expect(
        service.recordContact('r1', { result: 'BOOKED' }, desk as any, NOW),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('sendDueEmails', () => {
    const env = { ...process.env };
    beforeEach(() => {
      process.env.EMAIL_MOCK = 'true';
      process.env.NODE_ENV = 'test';
      delete process.env.APPOINTMENT_EMAIL_NOTICES;
    });
    afterAll(() => {
      process.env = env;
    });

    it('emails each due patient once, with a stop link whose token is stored hashed', async () => {
      const { service, prisma, email } = setup([
        row(),
        row({
          id: 'r2',
          serviceId: 's2',
          service: { id: 's2', code: 'KHAM', name: 'Khám tổng quát' },
        }),
      ]);
      const result = await service.sendDueEmails(NOW);
      expect(result).toEqual({ due: 1, sent: 1, failed: 0 });
      expect(prisma.recall.findMany.mock.calls[0][0].where).toMatchObject({
        status: 'PENDING',
        emailedAt: null,
        patient: { deletedAt: null, recallOptOutAt: null, email: { not: null } },
      });
      expect(prisma.recall.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['r1', 'r2'] }, emailedAt: null, status: 'PENDING' },
        data: { emailedAt: NOW },
      });
      expect(email.send).toHaveBeenCalledTimes(1);
      const text: string = email.send.mock.calls[0][0].text;
      expect(text).toContain('Cạo vôi răng, Khám tổng quát');
      const token = decodeURIComponent(text.match(/token=([^\s]+)/)![1]);
      expect(prisma.recall.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { emailTokenHash: hashToken(token) },
      });
    });

    it('skips a patient who already has a visit booked', async () => {
      const { service, prisma, email } = setup();
      prisma.appointment.findMany.mockResolvedValue([
        { patientId: 'p1', startAt: new Date('2026-10-28T02:00:00Z') },
      ]);
      expect(await service.sendDueEmails(NOW)).toEqual({ due: 0, sent: 0, failed: 0 });
      expect(email.send).not.toHaveBeenCalled();
    });

    it('releases the claim when the mail server did not take it', async () => {
      const { service, prisma, email } = setup();
      email.send.mockResolvedValue(false);
      expect(await service.sendDueEmails(NOW)).toEqual({ due: 1, sent: 0, failed: 1 });
      expect(prisma.recall.updateMany).toHaveBeenLastCalledWith({
        where: { id: { in: ['r1'] }, emailedAt: NOW },
        data: { emailedAt: null, emailTokenHash: null },
      });
    });

    it('sends nothing while visit emails are turned off', async () => {
      process.env.APPOINTMENT_EMAIL_NOTICES = 'false';
      const { service, prisma } = setup();
      await service.sendDueEmails(NOW);
      expect(prisma.recall.findMany).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('stops recall emails for the patient of the link', async () => {
      const { service, prisma, audit } = setup();
      await service.unsubscribe('a-token-of-the-email-link');
      expect(prisma.recall.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { emailTokenHash: hashToken('a-token-of-the-email-link') },
        }),
      );
      expect(prisma.patient.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { recallOptOutAt: expect.any(Date) },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'RECALL_OPTED_OUT', metadata: { via: 'email_link' } }),
        prisma,
      );
    });

    it('refuses an unknown link', async () => {
      const { service, prisma } = setup();
      prisma.recall.findUnique.mockResolvedValue(null);
      await expect(service.unsubscribe('unknown-token-unknown-token')).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
