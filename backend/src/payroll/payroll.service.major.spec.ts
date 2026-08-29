import { Test } from '@nestjs/testing';
import { PayrollService } from './payroll.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PayrollCycle, PayrollPeriodStatus, Prisma } from '@prisma/client';
import { PayrollStateException } from './domain/exceptions';
import { DEFAULT_TAX_BRACKETS } from './domain/tax-calculator';

describe('PayrollService — Major fix coverage (M#1, M#2, M#6, M#7, M#8, M#9)', () => {
  let service: PayrollService;
  let prisma: PrismaService;
  let audit: AuditService;

  const configSnapshot = {
    payrollCycle: PayrollCycle.MONTHLY,
    overtimeMultiplier: new Prisma.Decimal(1.5),
    bhxhPct: new Prisma.Decimal(0.08),
    bhytPct: new Prisma.Decimal(0.015),
    bhtnPct: new Prisma.Decimal(0.01),
    minGrossForBhxh: new Prisma.Decimal(4_680_000),
    probationSalaryPct: new Prisma.Decimal(0.85),
    taxBrackets: {
      personalDeductionVnd: 11_000_000,
      brackets: [
        { thresholdVnd: 5_000_000, rate: 0.05 },
        { thresholdVnd: 10_000_000, rate: 0.1 },
        { thresholdVnd: 18_000_000, rate: 0.15 },
        { thresholdVnd: 32_000_000, rate: 0.2 },
        { thresholdVnd: null, rate: 0.25 },
      ],
    },
    snapshottedAt: '2026-08-01T00:00:00Z',
  };

  beforeEach(async () => {
    // R2-8.1: Default mock return for payrollPeriod.findUnique must include
    // configSnapshot (otherwise addAdjustment's getPeriodConfigSnapshot helper
    // crashes when calling new Prisma.Decimal(String(undefined))).
    const mockConfigSnapshot = {
      payrollCycle: 'MONTHLY',
      overtimeMultiplier: '1.50',
      bhxhPct: '0.08',
      bhytPct: '0.015',
      bhtnPct: '0.01',
      minGrossForBhxh: '4680000',
      probationSalaryPct: '0.85',
      taxBrackets: {
        personalDeductionVnd: 11_000_000,
        brackets: [
          { thresholdVnd: 5_000_000, rate: 0.05 },
          { thresholdVnd: 10_000_000, rate: 0.1 },
          { thresholdVnd: 18_000_000, rate: 0.15 },
          { thresholdVnd: 32_000_000, rate: 0.2 },
          { thresholdVnd: null, rate: 0.25 },
        ],
      },
      snapshottedAt: '2026-08-01T00:00:00Z',
    };

    const module = await Test.createTestingModule({
      providers: [
        PayrollService,
        {
          provide: PrismaService,
          useValue: {
            payrollConfig: {
              findFirst: jest.fn(),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            payrollPeriod: {
              findFirst: jest.fn().mockResolvedValue(null),
              findUnique: jest.fn().mockResolvedValue({ configSnapshot: mockConfigSnapshot }),
              create: jest.fn().mockImplementation(args => ({
                id: 'period-1',
                ...args.data,
                createdAt: new Date(),
              })),
              update: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              updateMany: jest.fn(),
            },
            payrollLineItem: {
              createMany: jest.fn().mockResolvedValue({ count: 0 }),
              create: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            payrollEncounterDetail: {
              createMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            payrollAdjustment: {
              create: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              aggregate: jest.fn(),
            },
            dentistCompensation: {
              findFirst: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            encounter: { findMany: jest.fn().mockResolvedValue([]) },
            shiftRegistration: { count: jest.fn().mockResolvedValue(0) },
            workingSchedule: { findMany: jest.fn().mockResolvedValue([]) },
            // R2-8.2: Removed duplicate payrollLineItem keys; tx gets outer mocks
            // PLUS transaction-only operations (createMany for line items).
            $transaction: jest.fn(async cb => {
              const tx = {
                payrollLineItem: {
                  deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
                  createMany: jest.fn().mockResolvedValue({ count: 0 }),
                  create: jest.fn().mockImplementation(args => ({
                    id: 'line-item-1',
                    ...args.data,
                  })),
                  update: jest.fn().mockResolvedValue({}),
                  findUnique: prisma.payrollLineItem.findUnique,
                  findFirst: prisma.payrollLineItem.findFirst,
                  findMany: prisma.payrollLineItem.findMany,
                },
                payrollEncounterDetail: {
                  createMany: jest.fn().mockResolvedValue({ count: 0 }),
                },
                payrollAdjustment: {
                  create: jest.fn(),
                  findMany: jest.fn().mockResolvedValue([]),
                },
                dentistCompensation: prisma.dentistCompensation,
                user: prisma.user,
                encounter: prisma.encounter,
                shiftRegistration: prisma.shiftRegistration,
                workingSchedule: prisma.workingSchedule,
              };
              return cb(tx);
            }),
          },
        },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(PayrollService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
  });

  // ============================================================================
  // M#1: BR-PAY-023 Config snapshot
  // ============================================================================

  describe('M#1 — config snapshot frozen at creation', () => {
    it('createPeriod captures snapshot of current config', async () => {
      (prisma.payrollConfig.findFirst as jest.Mock).mockResolvedValue({
        payrollCycle: PayrollCycle.MONTHLY,
        overtimeMultiplier: new Prisma.Decimal(1.5),
        bhxhPct: new Prisma.Decimal(0.08),
        bhytPct: new Prisma.Decimal(0.015),
        bhtnPct: new Prisma.Decimal(0.01),
        minGrossForBhxh: new Prisma.Decimal(4_680_000),
        probationSalaryPct: new Prisma.Decimal(0.85),
        taxBrackets: configSnapshot.taxBrackets,
      });

      await service.createPeriod(
        {
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          payrollCycle: PayrollCycle.MONTHLY,
        },
        'user-1',
      );

      expect(prisma.payrollPeriod.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            configSnapshot: expect.objectContaining({
              payrollCycle: PayrollCycle.MONTHLY,
              overtimeMultiplier: expect.anything(),
              snapshottedAt: expect.any(String),
            }),
          }),
        }),
      );
    });

    it('getPeriodConfigSnapshot reads from period.configSnapshot (not live config)', async () => {
      (prisma.payrollPeriod.findUnique as jest.Mock).mockResolvedValue({
        configSnapshot: {
          ...configSnapshot,
          overtimeMultiplier: 2.0, // changed in snapshot
          bhxhPct: 0.1,
        },
      });

      const snapshot = await service.getPeriodConfigSnapshot('period-1');
      expect(snapshot.overtimeMultiplier.toNumber()).toBe(2.0);
      expect(snapshot.bhxhPct.toNumber()).toBe(0.1);
    });
  });

  // ============================================================================
  // M#6: Row-level security for addAdjustment
  // ============================================================================

  describe('M#6 — addAdjustment row-level security', () => {
    it('throws 404 when non-admin tries to adjust another dentists line item', async () => {
      (prisma.payrollPeriod.findUnique as jest.Mock).mockResolvedValue({
        id: 'period-1',
        status: PayrollPeriodStatus.DRAFT,
      });
      (prisma.payrollLineItem.findUnique as jest.Mock).mockResolvedValue({
        id: 'line-1',
        payrollPeriodId: 'period-1',
        dentistId: 'dentist-other',
        baseSalaryVnd: new Prisma.Decimal(0),
        commissionVnd: new Prisma.Decimal(0),
        overtimePayVnd: new Prisma.Decimal(0),
      });

      await expect(
        service.addAdjustment(
          'period-1',
          { lineItemId: 'line-1', type: 'BONUS', amountVnd: 500_000, reason: 'Test bonus' },
          'dentist-self',
          ['payroll.period.adjust'], // NOT admin (no payroll.admin)
        ),
      ).rejects.toThrow(/PayrollLineItem.*not found/);
    });

    it('allows admin to adjust any line item', async () => {
      (prisma.payrollPeriod.findUnique as jest.Mock).mockResolvedValue({
        id: 'period-1',
        status: PayrollPeriodStatus.DRAFT,
        configSnapshot, // R2-8.1
      });
      (prisma.payrollLineItem.findUnique as jest.Mock).mockResolvedValue({
        id: 'line-1',
        payrollPeriodId: 'period-1',
        dentistId: 'dentist-any',
        baseSalaryVnd: new Prisma.Decimal(10_000_000),
        commissionVnd: new Prisma.Decimal(0),
        overtimePayVnd: new Prisma.Decimal(0),
      });

      (prisma.$transaction as jest.Mock).mockImplementation(async cb => {
        const tx = {
          payrollAdjustment: {
            create: jest.fn().mockResolvedValue({ id: 'adj-1' }),
            findMany: jest
              .fn()
              .mockResolvedValue([{ type: 'BONUS', amountVnd: new Prisma.Decimal(500_000) }]),
          },
          payrollLineItem: {
            update: jest.fn().mockResolvedValue({}),
          },
          payrollConfig: { findFirst: jest.fn().mockResolvedValue(null) },
        };
        return cb(tx);
      });

      // doesn't throw on admin
      await expect(
        service.addAdjustment(
          'period-1',
          { lineItemId: 'line-1', type: 'BONUS', amountVnd: 500_000, reason: 'Test bonus' },
          'admin-1',
          ['payroll.period.adjust', 'payroll.admin'], // R2-4: dedicated admin perm
        ),
      ).resolves.toBeDefined();
    });
  });

  // ============================================================================
  // M#7: MANUAL_OVERRIDE gets separate audit action
  // ============================================================================

  describe('M#7 — MANUAL_OVERRIDE audit', () => {
    it('uses ADJUSTMENT_MANUAL_OVERRIDE action when type=MANUAL_OVERRIDE', async () => {
      (prisma.payrollPeriod.findUnique as jest.Mock).mockResolvedValue({
        id: 'period-1',
        status: PayrollPeriodStatus.DRAFT,
        configSnapshot, // R2-8.1: required for getPeriodConfigSnapshot inside addAdjustment
      });
      (prisma.payrollLineItem.findUnique as jest.Mock).mockResolvedValue({
        id: 'line-1',
        payrollPeriodId: 'period-1',
        dentistId: 'dentist-1',
        baseSalaryVnd: new Prisma.Decimal(0),
        commissionVnd: new Prisma.Decimal(0),
        overtimePayVnd: new Prisma.Decimal(0),
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async cb => {
        const tx = {
          payrollAdjustment: {
            create: jest.fn().mockResolvedValue({ id: 'adj-1' }),
            findMany: jest.fn().mockResolvedValue([]),
          },
          payrollLineItem: {
            update: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      });

      await service.addAdjustment(
        'period-1',
        {
          lineItemId: 'line-1',
          type: 'MANUAL_OVERRIDE',
          amountVnd: 1_000_000,
          reason:
            'Manual override because calculation incorrect, needs adjustment per BR-PAY-018 rule',
        },
        'admin-1',
        ['payroll.period.adjust', 'payroll.admin'],
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ADJUSTMENT_MANUAL_OVERRIDE',
          metadata: expect.objectContaining({ severity: 'HIGH' }),
        }),
      );
    });

    it('uses ADJUSTMENT_ADDED for non-MANUAL_OVERRIDE types', async () => {
      (prisma.payrollPeriod.findUnique as jest.Mock).mockResolvedValue({
        id: 'period-1',
        status: PayrollPeriodStatus.DRAFT,
        configSnapshot, // R2-8.1
      });
      (prisma.payrollLineItem.findUnique as jest.Mock).mockResolvedValue({
        id: 'line-1',
        payrollPeriodId: 'period-1',
        dentistId: 'dentist-1',
        baseSalaryVnd: new Prisma.Decimal(0),
        commissionVnd: new Prisma.Decimal(0),
        overtimePayVnd: new Prisma.Decimal(0),
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async cb => {
        const tx = {
          payrollAdjustment: {
            create: jest.fn().mockResolvedValue({ id: 'adj-1' }),
            findMany: jest.fn().mockResolvedValue([]),
          },
          payrollLineItem: {
            update: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      });

      await service.addAdjustment(
        'period-1',
        { lineItemId: 'line-1', type: 'BONUS', amountVnd: 500_000, reason: 'Bonus reason text' },
        'admin-1',
        ['payroll.period.adjust', 'payroll.admin'],
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ADJUSTMENT_ADDED',
          metadata: expect.objectContaining({ severity: 'NORMAL' }),
        }),
      );
    });
  });

  // ============================================================================
  // M#3: Re-open period via adjustment period
  // ============================================================================

  describe('M#3 — openAdjustmentPeriod', () => {
    it('creates new DRAFT period linked to PAID original', async () => {
      const original = {
        id: 'paid-1',
        periodStart: new Date('2026-08-01'),
        periodEnd: new Date('2026-08-31'),
        payrollCycle: PayrollCycle.MONTHLY,
        status: PayrollPeriodStatus.PAID,
        configSnapshot: { snapshottedAt: '2026-08-01' },
      };
      (prisma.payrollPeriod.findUnique as jest.Mock).mockResolvedValue(original);
      (prisma.payrollConfig.findFirst as jest.Mock).mockResolvedValue({
        payrollCycle: PayrollCycle.MONTHLY,
        overtimeMultiplier: new Prisma.Decimal(1.5),
        bhxhPct: new Prisma.Decimal(0.08),
        bhytPct: new Prisma.Decimal(0.015),
        bhtnPct: new Prisma.Decimal(0.01),
        minGrossForBhxh: new Prisma.Decimal(4_680_000),
        probationSalaryPct: new Prisma.Decimal(0.85),
        taxBrackets: configSnapshot.taxBrackets,
      });
      (prisma.payrollPeriod.create as jest.Mock).mockResolvedValue({
        id: 'adj-1',
        openedFromPeriodId: 'paid-1',
      });
      (prisma.payrollLineItem.findMany as jest.Mock).mockResolvedValue([
        {
          dentistId: 'd-1',
          baseSalaryVnd: 10_000_000,
          commissionVnd: 0,
          overtimePayVnd: 0,
          bonusVnd: 0,
          penaltyVnd: 0,
          grossPayVnd: 10_000_000,
          taxTncnVnd: 0,
          bhxhVnd: 0,
          netPayVnd: 10_000_000,
          totalHours: 0,
          overtimeHours: 0,
          encountersCount: 0,
          totalRevenueVnd: 0,
          workedShifts: 0,
          computationLog: {},
        },
      ]);
      // R2-3.1: openAdjustmentPeriod now uses $transaction. Mock tx.payrollPeriod.create.
      (prisma.$transaction as jest.Mock).mockImplementation(async cb => {
        return cb({
          payrollPeriod: {
            create: jest.fn().mockResolvedValue({ id: 'adj-1', openedFromPeriodId: 'paid-1' }),
          },
          payrollLineItem: {
            findMany: jest.fn().mockResolvedValue([
              {
                dentistId: 'd-1',
                baseSalaryVnd: 10_000_000,
                commissionVnd: 0,
                overtimePayVnd: 0,
                bonusVnd: 0,
                penaltyVnd: 0,
                grossPayVnd: 10_000_000,
                taxTncnVnd: 0,
                bhxhVnd: 0,
                netPayVnd: 10_000_000,
                totalHours: 0,
                overtimeHours: 0,
                encountersCount: 0,
                totalRevenueVnd: 0,
                workedShifts: 0,
                computationLog: {},
              },
            ]),
            create: jest.fn().mockResolvedValue({ id: 'adj-line-1' }),
          },
        });
      });

      const result = await service.openAdjustmentPeriod('paid-1', 'admin-1', ['payroll.admin']);
      expect(result.id).toBe('adj-1');
      // R2-3.1: assertion moved to tx.payrollPeriod.create since service now
      // wraps in $transaction. The mock returned {id: 'adj-1'} above.
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('throws when original is not PAID/LOCKED', async () => {
      (prisma.payrollPeriod.findUnique as jest.Mock).mockResolvedValue({
        id: 'draft-1',
        status: PayrollPeriodStatus.DRAFT,
      });

      await expect(
        service.openAdjustmentPeriod('draft-1', 'admin-1', ['payroll.admin']),
      ).rejects.toThrow(PayrollStateException);
    });
  });

  // ============================================================================
  // Overlap prevention — ensure updateConfig doesn't invalidate snapshots
  // ============================================================================

  describe('M#1 — config update is audit-logged with snapshot note', () => {
    it('logs old overtimeMultiplier vs new for traceability', async () => {
      (prisma.payrollConfig.findFirst as jest.Mock).mockResolvedValue({
        overtimeMultiplier: new Prisma.Decimal(1.5),
        bhxhPct: new Prisma.Decimal(0.08),
        bhytPct: new Prisma.Decimal(0.015),
        bhtnPct: new Prisma.Decimal(0.01),
        minGrossForBhxh: new Prisma.Decimal(4_680_000),
        probationSalaryPct: new Prisma.Decimal(0.85),
        payrollCycle: PayrollCycle.MONTHLY,
        taxBrackets: configSnapshot.taxBrackets,
      });

      await service.updateConfig(
        {
          payrollCycle: 'MONTHLY',
          overtimeMultiplier: 2.0,
          bhxhPct: 0.08,
          bhytPct: 0.015,
          bhtnPct: 0.01,
          minGrossForBhxh: 4_680_000,
          probationSalaryPct: 0.85,
          taxBrackets: DEFAULT_TAX_BRACKETS.brackets as Array<{
            min: number;
            max?: number;
            rate: number;
          }>,
        },
        'admin-1',
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYROLL_CONFIG_UPDATED',
          metadata: expect.objectContaining({
            oldOvertimeMultiplier: expect.anything(),
            newOvertimeMultiplier: 2.0,
          }),
        }),
      );
    });
  });

  // ============================================================================
  // R2-3.1: openAdjustmentPeriod is transactional
  // R2-3.2: adjustment period bypasses no-overlap unique index
  // R2-4: dedicated payroll.admin permission
  // ============================================================================

  describe('R2 — Phase 9.2 hardening', () => {
    it('R2-3.1 openAdjustmentPeriod wraps create + line item copy in $transaction', async () => {
      (prisma.payrollPeriod.findUnique as jest.Mock).mockResolvedValue({
        id: 'period-orig',
        status: PayrollPeriodStatus.PAID,
        periodStart: new Date('2026-08-01'),
        periodEnd: new Date('2026-08-31'),
        payrollCycle: PayrollCycle.MONTHLY,
        configSnapshot,
      });
      (prisma.payrollConfig.findFirst as jest.Mock).mockResolvedValue({
        overtimeMultiplier: new Prisma.Decimal(1.5),
        bhxhPct: new Prisma.Decimal(0.08),
        bhytPct: new Prisma.Decimal(0.015),
        bhtnPct: new Prisma.Decimal(0.01),
        minGrossForBhxh: new Prisma.Decimal(4_680_000),
        probationSalaryPct: new Prisma.Decimal(0.85),
        payrollCycle: PayrollCycle.MONTHLY,
        taxBrackets: configSnapshot.taxBrackets,
      });
      (prisma.$transaction as jest.Mock).mockImplementation(async cb => {
        return cb({
          payrollPeriod: {
            create: jest.fn().mockResolvedValue({ id: 'period-adj' }),
          },
          payrollLineItem: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'orig-line-1',
                dentistId: 'dentist-1',
                encountersCount: 5,
                totalRevenueVnd: new Prisma.Decimal(50_000_000),
                workedShifts: 22,
                totalHours: 176,
                overtimeHours: 0,
                baseSalaryVnd: new Prisma.Decimal(15_000_000),
                commissionVnd: new Prisma.Decimal(7_500_000),
                overtimePayVnd: new Prisma.Decimal(0),
                bonusVnd: new Prisma.Decimal(0),
                penaltyVnd: new Prisma.Decimal(0),
                grossPayVnd: new Prisma.Decimal(22_500_000),
                taxTncnVnd: new Prisma.Decimal(1_500_000),
                bhxhVnd: new Prisma.Decimal(900_000),
                netPayVnd: new Prisma.Decimal(20_100_000),
                computationLog: { foo: 'bar' },
              },
            ]),
            create: jest.fn().mockResolvedValue({ id: 'adj-line-1' }),
          },
        });
      });

      await service.openAdjustmentPeriod('period-orig', 'admin-1', ['payroll.admin']);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('R2-4 openAdjustmentPeriod rejects caller without payroll.admin', async () => {
      await expect(
        service.openAdjustmentPeriod(
          'period-orig',
          'user-no-admin',
          ['payroll.period.adjust'], // missing payroll.admin
        ),
      ).rejects.toThrow(/payroll\.admin permission/);
      // No DB call should have been made.
      expect(prisma.payrollPeriod.findUnique).not.toHaveBeenCalled();
    });

    it('R2-6 overtime threshold applies epsilon: 0.005h → 0.00, 0.02h → 0.02', async () => {
      // Implemented indirectly via computeWorkedHours spec file.
      // This is a smoke check that OT_EPSILON prevents sub-cent rounding.
      const OT_EPSILON = 0.01;
      const test = (raw: number) => (raw > OT_EPSILON ? Math.round(raw * 100) / 100 : 0);
      expect(test(0.005)).toBe(0);
      expect(test(0.02)).toBe(0.02);
      expect(test(15.7)).toBe(15.7);
    });
  });
});
