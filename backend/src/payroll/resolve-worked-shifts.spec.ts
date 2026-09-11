import { PayrollService } from './payroll.service';

/**
 * Tests for BR-PAY-011: resolveWorkedShifts() — worked hours/overtime now
 * come from duty-schedule data (approved ShiftRegistration, falling back to
 * the recurring WorkingSchedule for a date without one), not clinical
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
        findMany: jest.fn().mockResolvedValue([
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
        findMany: jest.fn().mockResolvedValue([
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

  it('an approved registration for a date overrides the recurring schedule for that date instead of stacking', async () => {
    const prismaMock: any = {
      // Every Saturday (dayOfWeek 6) has a standing 8h schedule...
      workingSchedule: {
        findMany: jest.fn().mockResolvedValue([
          {
            dayOfWeek: 6,
            startTime: new Date('1970-01-01T00:00:00Z'),
            endTime: new Date('1970-01-01T08:00:00Z'),
          },
        ]),
      },
      // ...but 2026-08-01 (a Saturday) also has its own approved 4h shift —
      // the day should count once, using the approved hours, not 8h+4h=12h.
      shiftRegistration: {
        findMany: jest.fn().mockResolvedValue([
          { date: new Date('2026-08-01'), startTime: '09:00', endTime: '13:00' },
        ]),
      },
    };

    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);

    const result = await (service as any).resolveWorkedShifts(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-01'),
    });

    expect(result.workedShifts).toBe(1);
    expect(result.totalHours).toBe(4);
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
});
