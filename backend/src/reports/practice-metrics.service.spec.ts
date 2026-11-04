import { AppointmentStatus } from '@prisma/client';
import { PracticeMetricsService } from './practice-metrics.service';
import { ReportsService } from './reports.service';

const at = (iso: string) => new Date(iso);

function setup() {
  const prisma = {
    appointment: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    treatmentPlan: { count: jest.fn() },
    encounter: { findMany: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const reports = new ReportsService(prisma as never, {} as never);
  const service = new PracticeMetricsService(prisma as never, reports);
  return { service, prisma };
}

const RANGE = { from: '2026-10-01', to: '2026-10-31' };

describe('PracticeMetricsService.scorecard', () => {
  it('computes the four rates with their counts', async () => {
    const { service, prisma } = setup();
    // no-show: 2 of (2 + 38); rebooking: 3 of 4 finished visits; acceptance 3 of 4 plans.
    prisma.appointment.count.mockImplementation(async ({ where }: any) =>
      where.status === AppointmentStatus.NO_SHOW ? 2 : 38,
    );
    prisma.appointment.findMany.mockResolvedValue([
      { patientId: 'a', startAt: at('2026-10-05T03:00:00Z') },
      { patientId: 'b', startAt: at('2026-10-06T03:00:00Z') },
      { patientId: 'c', startAt: at('2026-10-07T03:00:00Z') },
      { patientId: 'd', startAt: at('2026-10-08T03:00:00Z') },
    ]);
    prisma.appointment.groupBy.mockResolvedValue([
      { patientId: 'a', _max: { startAt: at('2026-11-05T03:00:00Z') } },
      { patientId: 'b', _max: { startAt: at('2026-11-06T03:00:00Z') } },
      { patientId: 'c', _max: { startAt: at('2026-10-07T03:00:00Z') } }, // only the visit itself
    ]);
    prisma.treatmentPlan.count.mockImplementation(async ({ where }: any) =>
      where.acceptedAt ? 3 : 4,
    );
    prisma.encounter.findMany.mockResolvedValue([
      {
        startedAt: at('2026-10-05T03:10:00Z'),
        appointment: {
          startAt: at('2026-10-05T03:00:00Z'),
          checkedInAt: at('2026-10-05T02:50:00Z'),
        },
      },
      {
        startedAt: at('2026-10-06T03:30:00Z'),
        appointment: {
          startAt: at('2026-10-06T03:00:00Z'),
          checkedInAt: at('2026-10-06T03:00:00Z'),
        },
      },
    ]);

    const card = await service.scorecard(RANGE);
    const by = Object.fromEntries(card.metrics.map(m => [m.key, m]));
    expect(by.noShowRate).toMatchObject({ value: 5, numerator: 2, denominator: 40 });
    expect(by.rebookRate).toMatchObject({ value: 50, numerator: 2, denominator: 4 });
    expect(by.planAcceptance).toMatchObject({ value: 75, numerator: 3, denominator: 4 });
    expect(by.medianWait).toMatchObject({ value: 20, unit: 'minutes' });
  });

  it('gives null, not 0%, when there is nothing to measure', async () => {
    const { service, prisma } = setup();
    prisma.appointment.count.mockResolvedValue(0);
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.treatmentPlan.count.mockResolvedValue(0);
    prisma.encounter.findMany.mockResolvedValue([]);
    const card = await service.scorecard(RANGE);
    expect(card.metrics.map(m => m.value)).toEqual([null, null, null, null]);
    expect(prisma.appointment.groupBy).not.toHaveBeenCalled();
  });

  it('asks for rebookings that still hold a slot, after the range starts', async () => {
    const { service, prisma } = setup();
    prisma.appointment.count.mockResolvedValue(0);
    prisma.appointment.findMany.mockResolvedValue([
      { patientId: 'a', startAt: at('2026-10-05T03:00:00Z') },
    ]);
    prisma.appointment.groupBy.mockResolvedValue([]);
    prisma.treatmentPlan.count.mockResolvedValue(0);
    prisma.encounter.findMany.mockResolvedValue([]);
    await service.scorecard(RANGE);
    const where = prisma.appointment.groupBy.mock.calls[0][0].where;
    expect(where.status.notIn).toEqual(expect.arrayContaining(['CANCELLED', 'NO_SHOW', 'LEFT']));
    expect(where.patientId.in).toEqual(['a']);
  });
});

describe('PracticeMetricsService.capacityHeatmap', () => {
  it('lists dentists and returns an empty grid when nobody is open', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([{ id: 'd1', fullName: 'BS An' }]);
    // loadDayCalendars reads schedules etc. through the same client.
    const empty = jest.fn().mockResolvedValue([]);
    Object.assign(prisma, {
      workingSchedule: { findMany: empty },
      shiftRegistration: { findMany: empty },
      scheduleOverride: { findMany: empty },
      timeOff: { findMany: empty },
      clinicClosure: { findMany: empty },
      employee: { findMany: empty },
    });
    prisma.appointment.findMany.mockResolvedValue([]);
    const map = await service.capacityHeatmap({ from: '2026-11-02', to: '2026-11-03' });
    expect(map.dentists).toEqual([{ id: 'd1', fullName: 'BS An' }]);
    expect(map.cells).toEqual([]);
    expect(map.totals.utilization).toBeNull();
  });

  it('only counts the chosen dentist', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([
      { id: 'd1', fullName: 'BS An' },
      { id: 'd2', fullName: 'BS Bình' },
    ]);
    const rows = jest
      .fn()
      .mockImplementation(async ({ where }: any) =>
        where.dentistId?.in?.length === 1 && where.dentistId.in[0] === 'd2' ? [] : [],
      );
    const schedule = jest.fn().mockResolvedValue([
      {
        dentistId: 'd2',
        dayOfWeek: 1,
        validFrom: new Date('2026-01-01'),
        validTo: null,
        startTime: new Date('1970-01-01T08:00:00Z'),
        endTime: new Date('1970-01-01T09:00:00Z'),
        slotDurationMin: 30,
      },
    ]);
    Object.assign(prisma, {
      workingSchedule: { findMany: schedule },
      shiftRegistration: { findMany: rows },
      scheduleOverride: { findMany: rows },
      timeOff: { findMany: rows },
      clinicClosure: { findMany: rows },
      employee: { findMany: rows },
    });
    prisma.appointment.findMany.mockResolvedValue([]);
    const map = await service.capacityHeatmap({
      from: '2026-11-02',
      to: '2026-11-02',
      dentistId: 'd2',
    });
    expect(schedule.mock.calls[0][0].where.dentistId.in).toEqual(['d2']);
    expect(map.cells).toEqual([
      expect.objectContaining({
        weekday: 1,
        hour: 8,
        availableMin: 60,
        bookedMin: 0,
        utilization: 0,
      }),
    ]);
  });
});
