import { PrismaClient } from '@prisma/client';
import { seedDemoCharts, statusAfter } from './seed-demo-charts';

describe('seed-demo-charts', () => {
  it('maps the demo services to the tooth they leave behind', () => {
    expect(statusAfter('Trám răng composite')).toBe('filled');
    expect(statusAfter('Điều trị tủy (1 lần hẹn)')).toBe('filled');
    expect(statusAfter('Bọc răng sứ')).toBe('crowned');
    expect(statusAfter('Cấy ghép Implant')).toBe('implant');
    expect(statusAfter('Nhổ răng khôn')).toBe('missing');
    expect(statusAfter('Cạo vôi + đánh bóng')).toBeNull();
  });

  it('carries each patient chart forward visit by visit and skips charted visits', async () => {
    const visit = (
      id: string,
      patientId: string,
      treatments: Array<[string, number[]]>,
      chart?: object,
    ) => ({
      id,
      patientId,
      dentistId: 'd',
      closedAt: new Date('2026-06-01'),
      patient: { dob: new Date('1990-01-01') },
      dentalChart: chart ? { teeth: chart } : null,
      treatments: treatments.map(([procedure, toothNumbers]) => ({ procedure, toothNumbers })),
    });
    const create = jest.fn();
    const prisma = {
      encounter: {
        findMany: jest.fn().mockResolvedValue([
          visit('e1', 'p1', [['Trám răng composite', [36]]]),
          visit('e2', 'p1', [
            ['Bọc răng sứ', [11]],
            ['Cạo vôi + đánh bóng', []],
          ]),
          visit('e3', 'p2', [['Cạo vôi + đánh bóng', []]]),
          visit('e4', 'p3', [], { '46': { status: 'cavity', notes: '' } }),
          visit('e5', 'p3', [['Nhổ răng khôn', [48]]]),
        ]),
      },
      dentalChartSnapshot: { create },
    } as unknown as PrismaClient;

    await expect(seedDemoCharts(prisma)).resolves.toBe(3);
    const teeth = (i: number) => create.mock.calls[i][0].data.teeth;
    expect(teeth(0)).toEqual({ '36': { status: 'filled', notes: 'Trám răng composite' } });
    // e2 keeps 36 from e1 and adds 11.
    expect(Object.keys(teeth(1)).sort()).toEqual(['11', '36']);
    // p2 had nothing to chart; p3 builds on the dentist's own chart.
    expect(create.mock.calls[2][0].data.encounterId).toBe('e5');
    expect(teeth(2)).toEqual({
      '46': { status: 'cavity', notes: '' },
      '48': { status: 'missing', notes: 'Nhổ răng khôn' },
    });
  });
});
