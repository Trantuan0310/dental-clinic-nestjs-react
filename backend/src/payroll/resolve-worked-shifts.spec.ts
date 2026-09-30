import { PayrollService } from './payroll.service';

/**
 * Tests for BR-PAY-011: resolveWorkedShifts() — worked hours/overtime now
 * come from duty-schedule data (the recurring WorkingSchedule joined with the
 * approved ShiftRegistrations of each date), not clinical
 * Encounter duration. Threshold formula unchanged:
 *   overtime threshold = weeks_in_period × 5 workdays/week × 8 hours/day
 *
 * August 2026: 31 days → 31/7 = 4.428 weeks → 4.428 × 5 × 8 = 177.14 hours threshold
 */
describe('PayrollService — resolveWorkedShifts (BR-PAY-011)', () => {
  it('single approved shift (12h): no overtime, workedShifts = 1', async () => {
    const prismaMock: any = {
      workingSchedule: { findMany: jest.fn().mockResolvedValue([]) },
      shiftRegistration: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { date: new Date('2026-08-01'), startTime: '08:00', endTime: '20:00' },
          ]),
      },
    };

    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);

    const result = await (service as any).resolveWorkedShifts(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-31'),
    });

    expect(result.workedShifts).toBe(1);
    expect(result.totalHours).toBe(12);
    expect(result.overtimeHours).toBe(0);
    expect(result.overtimeThresholdHours).toBeCloseTo(177.14, 1);
  });

  it('recurring schedule every day of week exceeds threshold: overtime = total - threshold', async () => {
    const prismaMock: any = {
      // dayOfWeek 0-6: every day of the pay period matches, 8h/day
      workingSchedule: {
        findMany: jest.fn().mockResolvedValue(
          [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
            dayOfWeek,
            startTime: new Date('1970-01-01T00:00:00Z'),
            endTime: new Date('1970-01-01T08:00:00Z'),
          })),
        ),
      },
      shiftRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);

    const result = await (service as any).resolveWorkedShifts(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-31'),
    });

    // 31 days × 8h = 248h
    expect(result.workedShifts).toBe(31);
    expect(result.totalHours).toBe(248);
    expect(result.overtimeHours).toBeCloseTo(248 - 177.14, 1);
    expect(result.overtimeHours).toBeGreaterThan(20);
  });

  it('half-month (15 days), single 9h shift: no overtime', async () => {
    const prismaMock: any = {
      workingSchedule: { findMany: jest.fn().mockResolvedValue([]) },
      shiftRegistration: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { date: new Date('2026-08-01'), startTime: '08:00', endTime: '17:00' },
          ]),
      },
    };

    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);

    const result = await (service as any).resolveWorkedShifts(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-15'),
    });

    // 15/7 × 5 × 8 = 85.71 hours threshold
    expect(result.overtimeThresholdHours).toBeCloseTo(85.71, 1);
    expect(result.totalHours).toBe(9);
    expect(result.overtimeHours).toBe(0); // 9h well below 85.7
  });

  it('an approved registration adds to the weekly schedule that date, overlapping minutes counted once', async () => {
    const prismaMock: any = {
      // Every Saturday (dayOfWeek 6) has a standing 08:00-16:00 schedule...
      workingSchedule: {
        findMany: jest.fn().mockResolvedValue([
          {
            dayOfWeek: 6,
            startTime: new Date('1970-01-01T08:00:00Z'),
            endTime: new Date('1970-01-01T16:00:00Z'),
          },
        ]),
      },
      // ...and 2026-08-01 (a Saturday) also has an approved 14:00-18:00 shift:
      // 08:00-18:00 = 10h, as the booking calendar opens it (not 8h + 4h).
      shiftRegistration: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { date: new Date('2026-08-01'), startTime: '14:00', endTime: '18:00' },
          ]),
      },
    };

    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);

    const result = await (service as any).resolveWorkedShifts(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-01'),
    });

    expect(result.workedShifts).toBe(1);
    expect(result.totalHours).toBe(10);
  });

  it('joins overlapping weekly blocks instead of paying the overlap twice', async () => {
    const t = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
    const prismaMock: any = {
      workingSchedule: {
        findMany: jest.fn().mockResolvedValue([
          { dayOfWeek: 6, startTime: t('08:00'), endTime: t('12:00') },
          { dayOfWeek: 6, startTime: t('11:00'), endTime: t('13:00') },
          { dayOfWeek: 6, startTime: t('13:00'), endTime: t('14:00') },
        ]),
      },
      shiftRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);
    const result = await (service as any).resolveWorkedShifts(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-01'),
    });
    expect(result.totalHours).toBe(6);
  });

  it('a date with neither an approved registration nor a matching recurring schedule contributes nothing', async () => {
    const prismaMock: any = {
      workingSchedule: { findMany: jest.fn().mockResolvedValue([]) },
      shiftRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);

    const result = await (service as any).resolveWorkedShifts(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-31'),
    });

    expect(result.workedShifts).toBe(0);
    expect(result.totalHours).toBe(0);
    expect(result.overtimeHours).toBe(0);
  });
  it('counts every weekly block of the day, not only the first (morning + afternoon)', async () => {
    const t = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
    const prismaMock: any = {
      // Saturdays: 08:00-12:00 and 13:30-19:00 = 9.5h
      workingSchedule: {
        findMany: jest.fn().mockResolvedValue([
          {
            dayOfWeek: 6,
            startTime: t('08:00'),
            endTime: t('12:00'),
            validFrom: new Date('2026-01-01'),
            validTo: null,
          },
          {
            dayOfWeek: 6,
            startTime: t('13:30'),
            endTime: t('19:00'),
            validFrom: new Date('2026-01-01'),
            validTo: null,
          },
        ]),
      },
      shiftRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);
    const result = await (service as any).resolveWorkedShifts(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-01'),
    });
    expect(result.workedShifts).toBe(1);
    expect(result.totalHours).toBe(9.5);
  });

  it('uses only the weekly rows valid on each date (schedule changed from a given day)', async () => {
    const t = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
    const prismaMock: any = {
      // Saturdays were 8h until 2026-08-07, then 4h from 2026-08-08.
      workingSchedule: {
        findMany: jest.fn().mockResolvedValue([
          {
            dayOfWeek: 6,
            startTime: t('08:00'),
            endTime: t('16:00'),
            validFrom: new Date('2026-01-01'),
            validTo: new Date('2026-08-07'),
          },
          {
            dayOfWeek: 6,
            startTime: t('08:00'),
            endTime: t('12:00'),
            validFrom: new Date('2026-08-08'),
            validTo: null,
          },
        ]),
      },
      shiftRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);
    const result = await (service as any).resolveWorkedShifts(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-15'),
    });
    // Sat 08-01 = 8h, Sat 08-08 = 4h, Sat 08-15 = 4h
    expect(result.workedShifts).toBe(3);
    expect(result.totalHours).toBe(16);
  });

  it('adds up several approved registrations on the same date', async () => {
    const prismaMock: any = {
      workingSchedule: { findMany: jest.fn().mockResolvedValue([]) },
      shiftRegistration: {
        findMany: jest.fn().mockResolvedValue([
          { date: new Date('2026-08-01'), startTime: '08:00', endTime: '12:00' },
          { date: new Date('2026-08-01'), startTime: '17:00', endTime: '20:00' },
        ]),
      },
    };
    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);
    const result = await (service as any).resolveWorkedShifts(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-01'),
    });
    expect(result.workedShifts).toBe(1);
    expect(result.totalHours).toBe(7);
  });
});
