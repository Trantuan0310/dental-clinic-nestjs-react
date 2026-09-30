import { Prisma } from '@prisma/client';
import { lockBookingPhone, lockDentistCalendar } from './advisory-lock';
import { CalendarBusyException } from './exceptions';

describe('advisory locks', () => {
  const lockTimeout = () =>
    new Prisma.PrismaClientKnownRequestError(
      'Raw query failed. Code: `55P03`. Message: `canceling statement due to lock timeout`',
      { code: 'P2010', clientVersion: 'test', meta: { code: '55P03' } },
    );

  it('bounds the wait with a transaction-local lock_timeout before locking', async () => {
    const calls: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async (sql: TemplateStringsArray, ...values: unknown[]) => {
        calls.push(`${sql.join('?')}|${values.join(',')}`);
        return 1;
      }),
      $executeRawUnsafe: jest.fn(async (sql: string) => {
        calls.push(sql);
        return 1;
      }),
    };
    await lockDentistCalendar(tx as never, 'dentist-1');
    expect(calls[0]).toBe("SELECT set_config('lock_timeout', ?::text, true)|5000");
    expect(calls[1]).toMatch(/^SELECT pg_advisory_xact_lock\(1, -?\d+\)$/);
  });

  it('turns a lock timeout into a Vietnamese 409 instead of a 500', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $executeRawUnsafe: jest.fn().mockRejectedValue(lockTimeout()),
    };
    const err = await lockDentistCalendar(tx as never, 'dentist-1').catch(e => e);
    expect(err).toBeInstanceOf(CalendarBusyException);
    expect(err.getStatus()).toBe(409);
    expect(err.message).toBe('Đang có thao tác khác trên lịch này, vui lòng thử lại');

    const phoneTx = {
      $executeRaw: jest.fn().mockResolvedValueOnce(1).mockRejectedValue(lockTimeout()),
    };
    await expect(lockBookingPhone(phoneTx as never, '0901234567')).rejects.toBeInstanceOf(
      CalendarBusyException,
    );
  });

  it('passes other database errors through unchanged', async () => {
    const boom = new Error('connection lost');
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $executeRawUnsafe: jest.fn().mockRejectedValue(boom),
    };
    await expect(lockDentistCalendar(tx as never, 'dentist-1')).rejects.toBe(boom);
  });
});
