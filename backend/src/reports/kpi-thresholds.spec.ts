import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PracticeMetricsService } from './practice-metrics.service';
import { SCORECARD_TARGETS, ScorecardMetric } from './practice-metrics';
import { UpdateKpiThresholdsDto } from './dto/kpi-threshold.dto';
import { ReportsController } from './reports.controller';
import { REQUIRED_PERMISSIONS_KEY } from '../common/guards/permissions.guard';

const defaults = () =>
  Object.entries(SCORECARD_TARGETS).map(([key, row]) => ({
    key: key as ScorecardMetric['key'],
    target: row.target,
    okAt: row.okAt,
  }));
function setup() {
  const prisma = {
    kpiThreshold: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return { prisma, service: new PracticeMetricsService(prisma as never, {} as never) };
}

describe('six editable KPI thresholds', () => {
  it('returns all defaults and applies persisted thresholds without changing units/direction', async () => {
    const { service, prisma } = setup();
    prisma.kpiThreshold.findMany.mockResolvedValue([{ key: 'noShowRate', target: 2, okAt: 4 }]);
    const rows = await service.thresholds();
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      key: 'noShowRate',
      target: 2,
      okAt: 4,
      unit: 'percent',
      direction: 'lower',
    });
    expect(rows[5].target).toBe(95);
  });

  it('persists all six atomically with the editing actor', async () => {
    const { service, prisma } = setup();
    const rows = defaults();
    rows[0].target = 0;
    await service.updateThresholds(rows, 'actor');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.kpiThreshold.upsert).toHaveBeenCalledTimes(6);
    expect(prisma.kpiThreshold.upsert).toHaveBeenCalledWith({
      where: { key: 'noShowRate' },
      create: { key: 'noShowRate', target: 0, okAt: 10, updatedBy: 'actor' },
      update: { target: 0, okAt: 10, updatedBy: 'actor' },
    });
  });

  it.each([
    ['missing', (rows: ReturnType<typeof defaults>) => rows.pop()],
    [
      'duplicate',
      (rows: ReturnType<typeof defaults>) => {
        rows[1] = rows[0];
      },
    ],
    [
      'lower ordering',
      (rows: ReturnType<typeof defaults>) => {
        rows[0].target = 11;
      },
    ],
    [
      'higher ordering',
      (rows: ReturnType<typeof defaults>) => {
        rows[1].target = 69;
      },
    ],
    [
      'percent bound',
      (rows: ReturnType<typeof defaults>) => {
        rows[5].target = 101;
      },
    ],
    [
      'minute bound',
      (rows: ReturnType<typeof defaults>) => {
        rows[3].okAt = 481;
      },
    ],
    [
      'negative',
      (rows: ReturnType<typeof defaults>) => {
        rows[0].target = -1;
      },
    ],
    [
      'NaN',
      (rows: ReturnType<typeof defaults>) => {
        rows[0].target = NaN;
      },
    ],
    [
      'infinity',
      (rows: ReturnType<typeof defaults>) => {
        rows[3].okAt = Infinity;
      },
    ],
  ])('rejects %s before any write', async (_name, mutate) => {
    const { service, prisma } = setup();
    const rows = defaults();
    mutate(rows);
    await expect(service.updateThresholds(rows, 'actor')).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('validates nested DTOs without coercing empty or string values', async () => {
    for (const target of ['', '5', null, Infinity, -1]) {
      const thresholds = defaults();
      thresholds[0].target = target as number;
      expect(
        await validate(plainToInstance(UpdateKpiThresholdsDto, { thresholds })),
      ).not.toHaveLength(0);
    }
    expect(
      await validate(plainToInstance(UpdateKpiThresholdsDto, { thresholds: defaults() })),
    ).toHaveLength(0);
  });

  it('gates edits separately from revenue and debt views', () => {
    const permissions = (method: keyof ReportsController) =>
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, ReportsController.prototype[method]);
    expect(permissions('updateThresholds')).toEqual(['role.upsert']);
    expect(permissions('financialWaterfall')).toEqual(['report.revenue.read']);
    expect(permissions('dentistPanels')).toEqual(['report.revenue.read']);
    expect(permissions('monthlyAging')).toEqual(['report.outstanding.read']);
  });
});
