import { PayrollService } from './payroll.service';

/** Day-calendar rows resolveWorkedShifts reads besides schedules/shifts. */
const emptyCalendarRows = (
  rows: { overrides?: unknown[]; timeOffs?: unknown[]; closures?: unknown[] } = {},
) => ({
  scheduleOverride: { findMany: jest.fn().mockResolvedValue(rows.overrides ?? []) },
  timeOff: { findMany: jest.fn().mockResolvedValue(rows.timeOffs ?? []) },
  clinicClosure: { findMany: jest.fn().mockResolvedValue(rows.closures ?? []) },
});

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
      ...emptyCalendarRows(),
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
      ...emptyCalendarRows(),
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
      ...emptyCalendarRows(),
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
      ...emptyCalendarRows(),
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
      ...emptyCalendarRows(),
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
      ...emptyCalendarRows(),
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
      ...emptyCalendarRows(),
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
      ...emptyCalendarRows(),
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
      ...emptyCalendarRows(),
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

  describe('day calendar: closures, CLOSED, time-off, CHANGED_HOURS (H3, A1-01)', () => {
    const t = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
    // Mon-Sat 08:00-17:00 (9h), week of 2026-09-07 (Mon) .. 2026-09-13 (Sun).
    const weekly = [1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
      dayOfWeek,
      startTime: t('08:00'),
      endTime: t('17:00'),
      validFrom: new Date('2026-01-01'),
      validTo: null,
    }));
    const week = { start: new Date('2026-09-07'), end: new Date('2026-09-13') };
    const run = async (
      rows: Parameters<typeof emptyCalendarRows>[0] = {},
      opts: Record<string, unknown> = {},
    ) => {
      const prismaMock: any = {
        ...emptyCalendarRows(rows),
        workingSchedule: { findMany: jest.fn().mockResolvedValue(weekly) },
        shiftRegistration: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new PayrollService(prismaMock as any, { log: jest.fn() } as any);
      return (service as any).resolveWorkedShifts(prismaMock, 'dentist-1', week, opts);
    };

    it('baseline: 6 days x 9h = 54h, 14h overtime', async () => {
      const r = await run();
      expect(r.totalHours).toBe(54);
      expect(r.overtimeHours).toBe(14);
    });

    it('a clinic closure (Tet) pays no hours and no overtime for those days', async () => {
      const r = await run({
        closures: [
          { startDate: new Date('2026-09-07'), endDate: new Date('2026-09-13'), reason: 'Tết' },
        ],
      });
      expect(r.totalHours).toBe(0);
      expect(r.overtimeHours).toBe(0);
      expect(r.workedShifts).toBe(0);
    });

    it('approved time-off is unpaid (owner decision), partial days count the rest', async () => {
      const r = await run({
        timeOffs: [
          // Mon all day + Tue morning 08:00-12:00 VN
          {
            startAt: new Date('2026-09-07T00:00:00+07:00'),
            endAt: new Date('2026-09-08T12:00:00+07:00'),
          },
        ],
      });
      expect(r.totalHours).toBe(54 - 9 - 4);
      expect(r.workedShifts).toBe(5);
    });

    it('a CLOSED override removes the day or the closed range', async () => {
      const r = await run({
        overrides: [
          {
            date: new Date('2026-09-09'),
            kind: 'CLOSED',
            startTime: null,
            endTime: null,
            reason: 'x',
          },
          {
            date: new Date('2026-09-10'),
            kind: 'CLOSED',
            startTime: t('13:00'),
            endTime: t('17:00'),
            reason: 'x',
          },
        ],
      });
      expect(r.totalHours).toBe(54 - 9 - 4);
    });

    it('CHANGED_HOURS on a Sunday (no weekly schedule) is paid', async () => {
      const r = await run({
        overrides: [
          {
            date: new Date('2026-09-13'),
            kind: 'CHANGED_HOURS',
            startTime: t('08:00'),
            endTime: t('12:00'),
            reason: 'Làm bù',
          },
        ],
      });
      expect(r.totalHours).toBe(58);
      expect(r.workedShifts).toBe(7);
    });

    it('no hours after the termination date', async () => {
      const r = await run({}, { lastPaidDay: new Date('2026-09-09') });
      expect(r.totalHours).toBe(27);
    });

    it('reports completed visits that ran outside paid hours (walk-in after closing)', async () => {
      const r = await run(
        {},
        {
          visits: [
            {
              id: 'enc-in',
              startedAt: new Date('2026-09-07T09:00:00+07:00'),
              closedAt: new Date('2026-09-07T10:00:00+07:00'),
            },
            {
              id: 'enc-late',
              startedAt: new Date('2026-09-07T16:30:00+07:00'),
              closedAt: new Date('2026-09-07T18:00:00+07:00'),
            },
            {
              id: 'enc-sunday',
              startedAt: new Date('2026-09-13T09:00:00+07:00'),
              closedAt: new Date('2026-09-13T09:40:00+07:00'),
            },
          ],
        },
      );
      expect(r.outsideHours.map((o: any) => [o.encounterId, o.minutes])).toEqual([
        ['enc-late', 60],
        ['enc-sunday', 40],
      ]);
      // Reported only, not paid.
      expect(r.totalHours).toBe(54);
    });
  });
});
