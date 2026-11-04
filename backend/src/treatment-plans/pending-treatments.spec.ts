import { TreatmentPlansService } from './treatment-plans.service';
import {
  groupPendingTreatments,
  summarizePending,
  type OpenLine,
} from './domain/pending-treatments';

const NOW = new Date('2026-11-04T05:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60_000);

function line(over: {
  patient?: string;
  procedure?: string;
  quantity?: number;
  unitPrice?: number;
  title?: string;
  accepted?: Date | null;
  dentist?: string;
}): OpenLine {
  const patient = over.patient ?? 'p1';
  return {
    procedure: over.procedure ?? 'Trám răng',
    quantity: over.quantity ?? 1,
    unitPrice: over.unitPrice ?? 300_000,
    plan: {
      id: `plan-${over.title ?? 'A'}`,
      title: over.title ?? 'Kế hoạch A',
      dentistId: over.dentist ?? 'd1',
      dentistName: 'BS An',
      acceptedAt: over.accepted === undefined ? daysAgo(10) : over.accepted,
      createdAt: daysAgo(20),
      patient: {
        id: patient,
        code: `PT-${patient}`,
        fullName: `BN ${patient}`,
        primaryPhone: '0912',
      },
    },
  };
}

describe('groupPendingTreatments', () => {
  it('sums quantity × price per patient and counts every open line', () => {
    const rows = groupPendingTreatments(
      [
        line({ quantity: 2, unitPrice: 300_000 }),
        line({ procedure: 'Nhổ răng', unitPrice: 150_000 }),
      ],
      new Map(),
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      patientId: 'p1',
      lineCount: 2,
      value: 750_000,
      procedures: ['Trám răng', 'Nhổ răng'],
      waitingDays: 10,
      nextAppointmentAt: null,
    });
  });

  it('takes the dentist and the wait from the plan accepted first', () => {
    const rows = groupPendingTreatments(
      [
        line({ title: 'Mới', accepted: daysAgo(3), dentist: 'd2' }),
        line({ title: 'Cũ', accepted: daysAgo(40), dentist: 'd1' }),
      ],
      new Map(),
      NOW,
    );
    expect(rows[0]).toMatchObject({ dentistId: 'd1', waitingDays: 40 });
    expect(rows[0].planTitles).toEqual(['Mới', 'Cũ']);
  });

  it('falls back to the creation date for a plan with no acceptance date', () => {
    const rows = groupPendingTreatments([line({ accepted: null })], new Map(), NOW);
    expect(rows[0].waitingDays).toBe(20);
  });

  it('lists nothing-booked patients first, longest wait first, and keeps the booked ones', () => {
    const rows = groupPendingTreatments(
      [
        line({ patient: 'booked', accepted: daysAgo(90) }),
        line({ patient: 'short', accepted: daysAgo(5) }),
        line({ patient: 'long', accepted: daysAgo(30) }),
      ],
      new Map([['booked', new Date('2026-11-10T03:00:00Z')]]),
      NOW,
    );
    expect(rows.map(r => r.patientId)).toEqual(['long', 'short', 'booked']);
    expect(rows[2].nextAppointmentAt).toBe('2026-11-10T03:00:00.000Z');
  });

  it('shows only the first three procedures, once each', () => {
    const rows = groupPendingTreatments(
      ['A', 'B', 'A', 'C', 'D'].map(procedure => line({ procedure })),
      new Map(),
      NOW,
    );
    expect(rows[0].procedures).toEqual(['A', 'B', 'C']);
    expect(rows[0].lineCount).toBe(5);
  });

  it('summarises only what has no appointment', () => {
    const rows = groupPendingTreatments(
      [line({ patient: 'a', unitPrice: 100_000 }), line({ patient: 'b', unitPrice: 400_000 })],
      new Map([['b', new Date('2026-11-10T03:00:00Z')]]),
      NOW,
    );
    expect(summarizePending(rows)).toEqual({
      patients: 2,
      unscheduledPatients: 1,
      unscheduledValue: 100_000,
    });
  });
});

describe('TreatmentPlansService.pendingTreatments', () => {
  const make = () => {
    const prisma: any = {
      treatmentPlanItem: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new TreatmentPlansService(prisma, { log: jest.fn() } as any) };
  };
  const desk = {
    sub: 'desk',
    email: 'd@x',
    permissions: ['patient.update', 'treatment_plan.read'],
  };
  const dentist = {
    sub: 'dentist-1',
    email: 'bs@x',
    permissions: ['patient.read', 'appointment.read.own', 'treatment_plan.read'],
  };

  it('asks only for accepted, unfinished lines that no live treatment already carries', async () => {
    const { prisma, service } = make();
    await service.pendingTreatments(desk, NOW);
    const where = prisma.treatmentPlanItem.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PLANNED');
    expect(where.plan.status.in).toEqual(['ACCEPTED', 'IN_PROGRESS']);
    expect(where.plan.dentistId).toBeUndefined();
    expect(where.treatments.none.deletedAt).toBeNull();
    expect(prisma.appointment.groupBy).not.toHaveBeenCalled();
  });

  it('limits a dentist to their own plans', async () => {
    const { prisma, service } = make();
    await service.pendingTreatments(dentist, NOW);
    expect(prisma.treatmentPlanItem.findMany.mock.calls[0][0].where.plan.dentistId).toBe(
      'dentist-1',
    );
  });

  it('marks a patient with a later live appointment as booked', async () => {
    const { prisma, service } = make();
    prisma.treatmentPlanItem.findMany.mockResolvedValue([
      {
        procedure: 'Trám răng',
        quantity: 1,
        unitPrice: 300_000,
        plan: {
          id: 'plan-1',
          title: 'Kế hoạch',
          dentistId: 'd1',
          acceptedAt: daysAgo(4),
          createdAt: daysAgo(6),
          dentist: { fullName: 'BS An' },
          patient: { id: 'p1', code: 'PT-1', fullName: 'BN 1', primaryPhone: null },
        },
      },
    ]);
    prisma.appointment.groupBy.mockResolvedValue([
      { patientId: 'p1', _min: { startAt: new Date('2026-11-12T03:00:00Z') } },
    ]);
    const { rows, summary } = await service.pendingTreatments(desk, NOW);
    const where = prisma.appointment.groupBy.mock.calls[0][0].where;
    expect(where.status.in).toEqual(['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS']);
    expect(where.startAt).toEqual({ gt: NOW });
    expect(rows[0].nextAppointmentAt).toBe('2026-11-12T03:00:00.000Z');
    expect(summary).toEqual({ patients: 1, unscheduledPatients: 0, unscheduledValue: 0 });
  });
});
