import { Prisma } from '@prisma/client';
import { MessagingService } from './messaging.service';
import { messagingConfigProblems, normalizeVnMobile, stripAccents } from './messaging-config';
import { EsmsProvider } from './providers/esms.provider';
import { ZaloZnsProvider } from './providers/zalo-zns.provider';

// 2026-10-23 10:00 at the clinic.
const NOW = new Date('2026-10-23T03:00:00Z');

function setup(env: NodeJS.ProcessEnv) {
  const prisma: any = {
    messageLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    appointment: { findMany: jest.fn().mockResolvedValue([]) },
    recall: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new MessagingService(prisma);
  service.env = { CLINIC_NAME: 'Nha khoa A', CLINIC_PHONE: '0901234567', ...env };
  return { service, prisma };
}

describe('messaging config', () => {
  it('reads Vietnamese mobile numbers however they are typed', () => {
    expect(normalizeVnMobile('0901 234 567')).toBe('0901234567');
    expect(normalizeVnMobile('+84 901.234.567')).toBe('0901234567');
    expect(normalizeVnMobile('84901234567')).toBe('0901234567');
    expect(normalizeVnMobile('0281234567')).toBeNull(); // landline
    expect(normalizeVnMobile('12345')).toBeNull();
  });

  it('drops accents for brandname SMS', () => {
    expect(stripAccents('Nhắc lịch khám – Đặng Thị Ánh')).toBe('Nhac lich kham – Dang Thi Anh');
  });

  it('names what a real provider lacks', () => {
    expect(messagingConfigProblems({ SMS_PROVIDER: 'esms', ESMS_API_KEY: 'k' })).toEqual([
      'SMS (eSMS): thiếu ESMS_SECRET_KEY',
      'SMS (eSMS): thiếu ESMS_BRANDNAME',
    ]);
    expect(messagingConfigProblems({ SMS_PROVIDER: 'mock' })).toEqual([]);
  });
});

describe('MessagingService.send', () => {
  const input = {
    phone: '0901 234 567',
    template: 'VISIT_REMINDER' as const,
    text: 'Nhắc lịch',
    dedupeKey: 'visit-reminder:a1:2026-10-24T02:00:00.000Z',
  };

  it('does nothing while every channel is off', async () => {
    const { service, prisma } = setup({});
    expect(await service.send(input)).toBeNull();
    expect(prisma.messageLog.create).not.toHaveBeenCalled();
  });

  it('mock: logs the message as MOCKED, Zalo first', async () => {
    const { service, prisma } = setup({ SMS_PROVIDER: 'mock', ZALO_PROVIDER: 'mock' });
    expect(await service.send(input)).toBe('MOCKED');
    expect(prisma.messageLog.create.mock.calls[0][0].data).toMatchObject({
      dedupeKey: input.dedupeKey,
      recipient: '0901234567',
      status: 'SKIPPED',
    });
    expect(prisma.messageLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: expect.objectContaining({ channel: 'ZALO', provider: 'mock', status: 'MOCKED' }),
    });
  });

  it('sends a key once: a repeat is dropped by the unique key', async () => {
    const { service, prisma } = setup({ SMS_PROVIDER: 'mock' });
    prisma.messageLog.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    expect(await service.send(input)).toBeNull();
    expect(prisma.messageLog.update).not.toHaveBeenCalled();
  });

  it('skips a number that is not a Vietnamese mobile', async () => {
    const { service, prisma } = setup({ SMS_PROVIDER: 'mock' });
    expect(await service.send({ ...input, phone: '028 1234 567' })).toBe('SKIPPED');
    expect(prisma.messageLog.create.mock.calls[0][0].data.error).toMatch(/không phải số di động/);
  });

  it('falls back to SMS when Zalo fails, and says why', async () => {
    const { service, prisma } = setup({ ZALO_PROVIDER: 'zns', SMS_PROVIDER: 'mock' });
    // No template id configured: the Zalo send fails before any HTTP call.
    expect(await service.send(input)).toBe('MOCKED');
    expect(prisma.messageLog.update.mock.calls[0][0].data).toMatchObject({
      channel: 'SMS',
      error: expect.stringContaining('ZALO_ZNS_TEMPLATE_VISIT_REMINDER'),
    });
  });
});

describe('providers', () => {
  it('eSMS: posts the text without accents and reads CodeResult 100 as sent', async () => {
    const http = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ CodeResult: '100', SMSID: 'sms-9' }),
    });
    const esms = new EsmsProvider(
      { ESMS_API_KEY: 'k', ESMS_SECRET_KEY: 's', ESMS_BRANDNAME: 'NHAKHOA' },
      http as any,
    );
    const result = await esms.send({
      phone: '0901234567',
      template: 'TEST',
      text: 'Nhắc lịch',
      params: {},
      trackingId: 't1',
    });
    expect(result).toEqual({ ok: true, providerId: 'sms-9' });
    const body = JSON.parse(http.mock.calls[0][1].body);
    expect(body).toMatchObject({
      Phone: '0901234567',
      Content: 'Nhac lich',
      Brandname: 'NHAKHOA',
      SmsType: '2',
    });
  });

  it('Zalo ZNS: sends the approved template with 84-prefixed phone', async () => {
    const http = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: 0, data: { msg_id: 'z-1' } }),
    });
    const zns = new ZaloZnsProvider(
      { ZALO_OA_ACCESS_TOKEN: 'tok', ZALO_ZNS_TEMPLATE_RECALL_REMINDER: '123' },
      http as any,
    );
    const result = await zns.send({
      phone: '0901234567',
      template: 'RECALL_REMINDER',
      text: 'x',
      params: { customer_name: 'An' },
      trackingId: 't2',
    });
    expect(result).toEqual({ ok: true, providerId: 'z-1' });
    expect(http.mock.calls[0][1].headers.access_token).toBe('tok');
    expect(JSON.parse(http.mock.calls[0][1].body)).toEqual({
      phone: '84901234567',
      template_id: '123',
      template_data: { customer_name: 'An' },
      tracking_id: 't2',
    });
  });
});

describe('phone reminders', () => {
  it('visit reminders: one per visit and start time, not for a visit just booked', async () => {
    const { service, prisma } = setup({ SMS_PROVIDER: 'mock' });
    const startAt = new Date('2026-10-24T02:00:00Z');
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'a1',
        startAt,
        createdAt: new Date('2026-10-20T02:00:00Z'),
        patientId: 'p1',
        patient: { fullName: 'An', primaryPhone: '0901234567' },
        dentist: { fullName: 'BS Khoa' },
      },
      {
        id: 'a2',
        startAt,
        createdAt: new Date(startAt.getTime() - 60 * 60_000),
        patientId: 'p2',
        patient: { fullName: 'Bình', primaryPhone: '0907654321' },
        dentist: null,
      },
    ]);
    expect(await service.sendVisitReminders(NOW)).toEqual({ due: 1, sent: 1 });
    expect(prisma.messageLog.create.mock.calls[0][0].data.dedupeKey).toBe(
      `visit-reminder:a1:${startAt.toISOString()}`,
    );
  });

  it('none at night', async () => {
    const { service, prisma } = setup({ SMS_PROVIDER: 'mock' });
    await service.sendVisitReminders(new Date('2026-10-23T15:00:00Z')); // 22:00
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('recall reminders skip patients already booked', async () => {
    const { service, prisma } = setup({ SMS_PROVIDER: 'mock' });
    prisma.recall.findMany.mockResolvedValue([
      {
        id: 'r1',
        patientId: 'p1',
        patient: { fullName: 'An', primaryPhone: '0901234567' },
        service: { name: 'Cạo vôi' },
      },
      {
        id: 'r2',
        patientId: 'p2',
        patient: { fullName: 'Bình', primaryPhone: '0907654321' },
        service: { name: 'Cạo vôi' },
      },
    ]);
    prisma.appointment.findMany.mockResolvedValue([{ patientId: 'p2' }]);
    expect(await service.sendRecallReminders(NOW)).toEqual({ due: 1, sent: 1 });
    expect(prisma.messageLog.create.mock.calls[0][0].data.dedupeKey).toBe('recall:r1');
  });
});
