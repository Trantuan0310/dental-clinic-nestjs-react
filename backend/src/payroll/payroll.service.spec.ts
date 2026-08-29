import { Test } from '@nestjs/testing';
import { PayrollService } from './payroll.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PayrollCycle, PayrollPeriodStatus, Prisma } from '@prisma/client';
import { PeriodOverlapException, PayrollStateException } from './domain/exceptions';
import { DEFAULT_TAX_BRACKETS } from './domain/tax-calculator';

describe('PayrollService — period lifecycle (integration)', () => {
  let service: PayrollService;
  let prisma: PrismaService;
  let audit: AuditService;

  const mockConfig = {
    id: 'config-1',
    payrollCycle: PayrollCycle.MONTHLY,
    overtimeMultiplier: new Prisma.Decimal(1.5),
    defaultTaxTncnPct: new Prisma.Decimal(0.1),
    bhxhPct: new Prisma.Decimal(0.08),
    bhytPct: new Prisma.Decimal(0.015),
    bhtnPct: new Prisma.Decimal(0.01),
    minGrossForBhxh: new Prisma.Decimal(4_680_000),
    probationSalaryPct: new Prisma.Decimal(0.85),
    taxBrackets: DEFAULT_TAX_BRACKETS,
    updatedByUserId: null,
    updatedAt: new Date(),
  };

  const mockPeriod = {
    id: 'period-1',
    periodStart: new Date('2026-08-01'),
    periodEnd: new Date('2026-08-31'),
    payrollCycle: PayrollCycle.MONTHLY,
    status: PayrollPeriodStatus.DRAFT,
    createdByUserId: 'user-1',
    createdAt: new Date(),
    lockedByUserId: null,
    lockedAt: null,
    approvedByUserId: null,
    approvedAt: null,
    markedPaidByUserId: null,
    paidAt: null,
    paymentReference: null,
    lockedImmutableAt: null,
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PayrollService,
        {
          provide: PrismaService,
          useValue: {
            payrollConfig: {
              findFirst: jest.fn().mockResolvedValue(mockConfig),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            payrollPeriod: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            payrollLineItem: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              create: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            payrollEncounterDetail: {
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
              create: jest.fn(),
            },
            dentistCompensation: {
              findFirst: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            user: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            encounter: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            shiftRegistration: {
              count: jest.fn().mockResolvedValue(0),
            },
            payrollAdjustment: {
              create: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              aggregate: jest.fn(),
            },
            workingSchedule: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(PayrollService);
    prisma = module.get(PrismaService);
    audit = module.get(AuditService);
  });

  describe('createPeriod', () => {
    it('creates a DRAFT period', async () => {
      (prisma.payrollPeriod.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.payrollPeriod.create as jest.Mock).mockResolvedValue(mockPeriod);

      const result = await service.createPeriod(
        {
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          payrollCycle: PayrollCycle.MONTHLY,
        },
        'user-1',
      );

      expect(result.status).toBe(PayrollPeriodStatus.DRAFT);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PERIOD_CREATED',
          actorUserId: 'user-1',
        }),
      );
    });

    it('throws PeriodOverlapException when overlap exists', async () => {
      (prisma.payrollPeriod.findFirst as jest.Mock).mockResolvedValue(mockPeriod);

      await expect(
        service.createPeriod(
          {
            periodStart: '2026-08-15',
            periodEnd: '2026-09-15',
            payrollCycle: PayrollCycle.MONTHLY,
          },
          'user-1',
        ),
      ).rejects.toThrow(PeriodOverlapException);
    });

    it('throws when periodEnd <= periodStart', async () => {
      await expect(
        service.createPeriod(
          {
            periodStart: '2026-08-31',
            periodEnd: '2026-08-01',
            payrollCycle: PayrollCycle.MONTHLY,
          },
          'user-1',
        ),
      ).rejects.toThrow(PayrollStateException);
    });

    it('allows LOCKED historical periods to coexist with new ones', async () => {
      (prisma.payrollPeriod.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.payrollPeriod.create as jest.Mock).mockResolvedValue(mockPeriod);

      await service.createPeriod(
        {
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          payrollCycle: PayrollCycle.MONTHLY,
        },
        'user-1',
      );

      // Verify that findFirst excludes LOCKED status
      expect(prisma.payrollPeriod.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: PayrollPeriodStatus.LOCKED },
          }),
        }),
      );
    });
  });

  describe('lockPeriod', () => {
    it('transitions DRAFT → REVIEWING', async () => {
      (prisma.payrollPeriod.findUnique as jest.Mock).mockResolvedValue(mockPeriod);
      (prisma.payrollPeriod.update as jest.Mock).mockResolvedValue({
        ...mockPeriod,
        status: PayrollPeriodStatus.REVIEWING,
      });

      const result = await service.lockPeriod('period-1', 'user-1');
      expect(result.status).toBe(PayrollPeriodStatus.REVIEWING);
    });

    it('throws when trying to lock PAID period', async () => {
      (prisma.payrollPeriod.findUnique as jest.Mock).mockResolvedValue({
        ...mockPeriod,
        status: PayrollPeriodStatus.PAID,
      });

      await expect(service.lockPeriod('period-1', 'user-1')).rejects.toThrow();
    });
  });

  describe('markPaid', () => {
    it('transitions APPROVED → PAID and records payment ref', async () => {
      (prisma.payrollPeriod.findUnique as jest.Mock).mockResolvedValue({
        ...mockPeriod,
        status: PayrollPeriodStatus.APPROVED,
      });
      (prisma.payrollPeriod.update as jest.Mock).mockResolvedValue({
        ...mockPeriod,
        status: PayrollPeriodStatus.PAID,
        paymentReference: 'VCB-001',
      });

      await service.markPaid(
        'period-1',
        { paymentReference: 'VCB-001', paymentDate: '2026-09-05' },
        'user-1',
      );

      expect(prisma.payrollPeriod.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PayrollPeriodStatus.PAID,
            paymentReference: 'VCB-001',
          }),
        }),
      );
    });
  });
});
