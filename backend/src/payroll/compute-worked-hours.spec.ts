import { PayrollService } from './payroll.service';

/**
 * Tests focused on BR-PAY-011 SPEC formula:
 *   overtime threshold = weeks_in_period × 5 workdays/week × 8 hours/day
 *
 * August 2026: 31 days → 31/7 = 4.428 weeks → 4.428 × 5 × 8 = 177.14 hours threshold
 * January 2026: 31 days → same as August
 */
describe('PayrollService — computeWorkedHours (BR-PAY-011)', () => {
  it('August (31 days): overtime threshold = ~177 hours', async () => {
    const prismaMock: any = {
      payrollConfig: { findFirst: jest.fn() },
      payrollPeriod: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      payrollLineItem: {
        createMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      payrollEncounterDetail: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      payrollAdjustment: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn(),
      },
      dentistCompensation: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      encounter: {
        findMany: jest.fn().mockImplementation(args => {
          // 180 hours total = 180 × 60 min
          // Real signature: tx.encounter.findMany({ where, select })
          // `select` is sibling of `where`, not nested inside it.
          if (args?.select?.startedAt) {
            // computeWorkedHours query
            const enc = {
              startedAt: new Date('2026-08-01T08:00:00Z'),
              closedAt: new Date('2026-08-01T20:00:00Z'),
            };
            return Promise.resolve([enc]);
          }
          // computeEncounters query (no select)
          return Promise.resolve([]);
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      shiftRegistration: { count: jest.fn().mockResolvedValue(0) },
      workingSchedule: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: any) => cb(prismaMock)),
    };

    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);

    const result = await (service as any).computeWorkedHours(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-31'),
    });

    // 12h × 60 = 720min → 12 hours
    expect(result.totalHours).toBe(12);
    // threshold: 31/7 × 5 × 8 = 177.14h → no overtime
    expect(result.overtimeHours).toBe(0);
    expect(result.overtimeThresholdHours).toBeCloseTo(177.14, 1);
  });

  it('When total hours exceed threshold, overtime = total - threshold', async () => {
    const prismaMock: any = {
      encounter: {
        findMany: jest.fn().mockImplementation(args => {
          if (args?.select?.startedAt) {
            // One 200-hour encounter (way over threshold)
            const start = new Date('2026-08-01T00:00:00Z');
            const end = new Date(start.getTime() + 200 * 3_600_000);
            return Promise.resolve([{ startedAt: start, closedAt: end }]);
          }
          return Promise.resolve([]);
        }),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);

    const result = await (service as any).computeWorkedHours(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-31'),
    });

    expect(result.totalHours).toBe(200);
    expect(result.overtimeHours).toBeCloseTo(200 - 177.14, 1);
    expect(result.overtimeHours).toBeGreaterThan(20);
  });

  it('Half-month (15 days): threshold = ~85.7 hours (half of month)', async () => {
    const prismaMock: any = {
      encounter: {
        findMany: jest.fn().mockImplementation(() =>
          Promise.resolve([
            {
              startedAt: new Date('2026-08-01T08:00:00Z'),
              closedAt: new Date('2026-08-01T17:00:00Z'),
            },
          ]),
        ),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);

    const result = await (service as any).computeWorkedHours(prismaMock, 'dentist-1', {
      start: new Date('2026-08-01'),
      end: new Date('2026-08-15'),
    });

    // 15/7 × 5 × 8 = 85.71 hours threshold
    expect(result.overtimeThresholdHours).toBeCloseTo(85.71, 1);
    expect(result.totalHours).toBe(9);
    expect(result.overtimeHours).toBe(0); // 9h well below 85.7
  });
});
