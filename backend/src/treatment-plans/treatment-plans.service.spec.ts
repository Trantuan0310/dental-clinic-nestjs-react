import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TreatmentPlansService } from './treatment-plans.service';
import { markPlanItemsForEncounter, progressStatus } from './domain/plan-progress';

const admin = {
  sub: 'admin-1',
  email: 'admin@x',
  permissions: [
    'patient.read',
    'patient.update',
    'appointment.read.any',
    'treatment_plan.read',
    'treatment_plan.write',
    'treatment_plan.accept',
  ],
};
const dentist = {
  sub: 'dentist-1',
  email: 'bs@x',
  permissions: [
    'patient.read',
    'appointment.read.own',
    'treatment_plan.read',
    'treatment_plan.write',
    'treatment_plan.accept',
  ],
};
const desk = {
  sub: 'desk-1',
  email: 'lt@x',
  permissions: [
    'patient.read',
    'patient.update',
    'appointment.read.any',
    'treatment_plan.read',
    'treatment_plan.accept',
  ],
};

const item = (over: Record<string, unknown> = {}) => ({
  id: 'item-1',
  planId: 'plan-1',
  sequence: 0,
  serviceId: null,
  service: null,
  procedure: 'Trám răng',
  toothNumbers: [16],
  quantity: 2,
  unitPrice: new Prisma.Decimal(300_000),
  notes: null,
  status: 'PLANNED',
  doneAt: null,
  skipReason: null,
  treatments: [],
  ...over,
});

const plan = (over: Record<string, unknown> = {}) => ({
  id: 'plan-1',
  patientId: 'patient-1',
  dentistId: 'dentist-1',
  title: 'Điều trị sâu răng',
  notes: null,
  status: 'DRAFT',
  sourceEncounterId: null,
  proposedAt: null,
  acceptedAt: null,
  acceptedBy: null,
  acceptanceNote: null,
  completedAt: null,
  cancelledAt: null,
  cancelReason: null,
  createdBy: 'dentist-1',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T01:00:00Z'),
  patient: { id: 'patient-1', code: 'BN-1', fullName: 'Nguyễn An' },
  dentist: { id: 'dentist-1', fullName: 'BS Khoa' },
  acceptor: null,
  items: [item()],
  ...over,
});

function setup(row: unknown = plan()) {
  const prisma: any = {
    treatmentPlan: {
      findUnique: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([row]),
      create: jest.fn().mockResolvedValue({ id: 'plan-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    treatmentPlanItem: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient-1' }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'dentist-1' }) },
    service: { count: jest.fn().mockResolvedValue(0) },
    encounter: { findUnique: jest.fn(), count: jest.fn().mockResolvedValue(1) },
    appointment: { count: jest.fn().mockResolvedValue(0) },
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  const audit = { log: jest.fn() };
  const service = new TreatmentPlansService(prisma, audit as any);
  return { service, prisma, audit };
}

describe('progressStatus', () => {
  it('follows the items of an agreed plan', () => {
    expect(progressStatus([{ status: 'PLANNED' }, { status: 'PLANNED' }] as any)).toBe('ACCEPTED');
    expect(progressStatus([{ status: 'DONE' }, { status: 'PLANNED' }] as any)).toBe('IN_PROGRESS');
    expect(progressStatus([{ status: 'DONE' }, { status: 'SKIPPED' }] as any)).toBe('COMPLETED');
    // Everything skipped is not a completed treatment.
    expect(progressStatus([{ status: 'SKIPPED' }] as any)).toBe('ACCEPTED');
  });
});

describe('TreatmentPlansService', () => {
  const lines = [
    { procedure: 'Trám răng', toothNumbers: [16, 26], quantity: 2, unitPrice: 300_000 },
  ];

  describe('create', () => {
    it("a dentist's plan is always their own, whatever dentistId says", async () => {
      const { service, prisma, audit } = setup();
      await service.create(
        { patientId: 'patient-1', dentistId: 'someone-else', title: 'Kế hoạch', items: lines },
        dentist as any,
      );
      expect(prisma.treatmentPlan.create.mock.calls[0][0].data.dentistId).toBe('dentist-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TREATMENT_PLAN_CREATED',
          metadata: expect.objectContaining({ total: 600_000 }),
        }),
        prisma,
      );
    });

    it('refuses a tooth number that is not FDI', async () => {
      const { service, prisma } = setup();
      await expect(
        service.create(
          {
            patientId: 'patient-1',
            title: 'Kế hoạch',
            items: [{ procedure: 'Trám', toothNumbers: [19], unitPrice: 1 }],
          },
          admin as any,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'PLAN_ITEM_INVALID_TOOTH' }),
      });
      expect(prisma.treatmentPlan.create).not.toHaveBeenCalled();
    });

    it("hides another dentist's patient from a dentist who never saw them", async () => {
      const { service, prisma } = setup();
      prisma.encounter.count.mockResolvedValue(0);
      prisma.appointment.count.mockResolvedValue(0);
      await expect(
        service.create({ patientId: 'patient-1', title: 'Kế hoạch', items: lines }, dentist as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    const at = '2026-10-01T01:00:00.000Z';

    it('rewriting the lines of a quote makes it a draft again', async () => {
      const { service, prisma } = setup(plan({ status: 'PROPOSED' }));
      await service.update('plan-1', { items: lines, expectedUpdatedAt: at }, dentist as any);
      expect(prisma.treatmentPlan.updateMany.mock.calls[0][0].data).toMatchObject({
        status: 'DRAFT',
        proposedAt: null,
      });
      expect(prisma.treatmentPlanItem.deleteMany).toHaveBeenCalledWith({
        where: { planId: 'plan-1' },
      });
    });

    it('does not rewrite the quoted lines once the patient agreed', async () => {
      const { service, prisma } = setup(plan({ status: 'ACCEPTED' }));
      await expect(
        service.update('plan-1', { items: lines, expectedUpdatedAt: at }, dentist as any),
      ).rejects.toMatchObject({ status: 409 });
      expect(prisma.treatmentPlanItem.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses an edit made on a stale copy', async () => {
      const { service, prisma } = setup();
      await expect(
        service.update(
          'plan-1',
          { title: 'Mới', expectedUpdatedAt: '2026-09-01T00:00:00.000Z' },
          dentist as any,
        ),
      ).rejects.toMatchObject({ response: expect.objectContaining({ error: 'PLAN_STALE' }) });
      expect(prisma.treatmentPlan.updateMany).not.toHaveBeenCalled();
    });

    it("a dentist may not edit another dentist's plan", async () => {
      const { service } = setup(plan({ dentistId: 'dentist-2' }));
      await expect(
        service.update('plan-1', { title: 'Mới', expectedUpdatedAt: at }, dentist as any),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('accept', () => {
    it('the front desk records the agreement on a quote', async () => {
      const { service, prisma } = setup(plan({ status: 'PROPOSED' }));
      await service.accept('plan-1', ' Khách đồng ý ', desk as any);
      const call = prisma.treatmentPlan.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'plan-1', status: 'PROPOSED' });
      expect(call.data).toMatchObject({
        status: 'ACCEPTED',
        acceptedBy: 'desk-1',
        acceptanceNote: 'Khách đồng ý',
      });
    });

    it('is refused on a plan already agreed', async () => {
      const { service } = setup(plan({ status: 'ACCEPTED' }));
      await expect(service.accept('plan-1', undefined, desk as any)).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe('skip', () => {
    it('skips a planned line and updates the plan progress', async () => {
      const { service, prisma } = setup(plan({ status: 'IN_PROGRESS' }));
      await service.skipItem('plan-1', 'item-1', 'Khách không muốn làm', dentist as any);
      expect(prisma.treatmentPlanItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'item-1', status: 'PLANNED' },
        data: { status: 'SKIPPED', skipReason: 'Khách không muốn làm' },
      });
    });

    it('not while the line is being done in an open encounter', async () => {
      const { service, prisma } = setup(
        plan({
          status: 'ACCEPTED',
          items: [
            item({
              treatments: [
                {
                  id: 't1',
                  encounterId: 'enc-1',
                  encounter: { status: 'IN_PROGRESS', closedAt: null },
                },
              ],
            }),
          ],
        }),
      );
      await expect(
        service.skipItem('plan-1', 'item-1', 'Không làm nữa', dentist as any),
      ).rejects.toMatchObject({ status: 409 });
      expect(prisma.treatmentPlanItem.updateMany).not.toHaveBeenCalled();
    });
  });

  it('the view totals quoted, done and remaining money', async () => {
    const { service } = setup(
      plan({
        status: 'IN_PROGRESS',
        items: [
          item({ id: 'a', status: 'DONE', quantity: 1, unitPrice: new Prisma.Decimal(500_000) }),
          item({ id: 'b', status: 'PLANNED', quantity: 2, unitPrice: new Prisma.Decimal(300_000) }),
          item({ id: 'c', status: 'SKIPPED', quantity: 1, unitPrice: new Prisma.Decimal(100_000) }),
        ],
      }),
    );
    const view = await service.get('plan-1', admin as any);
    expect(view.totals).toEqual({
      quoted: 1_200_000,
      done: 500_000,
      remaining: 600_000,
      skipped: 100_000,
      itemsDone: 1,
      itemsTotal: 2,
    });
  });
});

describe('markPlanItemsForEncounter', () => {
  const tx = () => {
    const t: any = {
      treatment: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ planItemId: 'item-1', planItem: { planId: 'plan-1' } }]),
      },
      treatmentPlanItem: { updateMany: jest.fn() },
      treatmentPlan: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACCEPTED',
          items: [{ status: 'DONE' }, { status: 'PLANNED' }],
        }),
        update: jest.fn(),
      },
    };
    return t;
  };

  it('ticks off the lines on close and moves the plan forward', async () => {
    const t = tx();
    const now = new Date('2026-10-02T03:00:00Z');
    await markPlanItemsForEncounter(t, 'enc-1', true, now);
    expect(t.treatmentPlanItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['item-1'] }, status: 'PLANNED' },
      data: { status: 'DONE', doneAt: now },
    });
    expect(t.treatmentPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { status: 'IN_PROGRESS', completedAt: null },
    });
  });

  it('puts them back on reopen', async () => {
    const t = tx();
    await markPlanItemsForEncounter(t, 'enc-1', false);
    expect(t.treatmentPlanItem.updateMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'DONE' },
      data: { status: 'PLANNED', doneAt: null },
    });
  });
});
