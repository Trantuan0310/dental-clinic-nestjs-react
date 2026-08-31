import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ExpenseStatus } from '@prisma/client';
import { ExpenseService } from './expense.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { adminPayload } from '../../test/helpers/auth-mock';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let prisma: PrismaMockShape;
  let audit: { log: jest.Mock };
  const actor = adminPayload();

  const baseExpense = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'exp-1',
    code: 'EXP-2026-000001',
    amount: 500000,
    description: 'Mua vật tư',
    expenseDate: new Date('2026-08-01'),
    status: ExpenseStatus.DRAFT,
    categoryId: null,
    category: null,
    notes: null,
    receiptUrl: null,
    createdBy: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    version: 1,
    creator: { fullName: 'Admin' },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        ExpenseService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(ExpenseService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('transition (approve / reject / markReimbursed)', () => {
    it('approves a DRAFT expense (DRAFT -> APPROVED)', async () => {
      (prisma.expense.findUnique as jest.Mock).mockResolvedValue(baseExpense());
      (prisma.expense.update as jest.Mock).mockResolvedValue(
        baseExpense({ status: ExpenseStatus.APPROVED }),
      );

      const result = await service.approve('exp-1', {}, actor);

      expect(result.status).toBe(ExpenseStatus.APPROVED);
      expect(prisma.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ExpenseStatus.APPROVED }),
        }),
      );
    });

    it('rejects a DRAFT expense (DRAFT -> REJECTED)', async () => {
      (prisma.expense.findUnique as jest.Mock).mockResolvedValue(baseExpense());
      (prisma.expense.update as jest.Mock).mockResolvedValue(
        baseExpense({ status: ExpenseStatus.REJECTED }),
      );

      const result = await service.reject('exp-1', { reason: 'Sai hóa đơn' }, actor);

      expect(result.status).toBe(ExpenseStatus.REJECTED);
    });

    it('marks an APPROVED expense as reimbursed (APPROVED -> REIMBURSED) — regression: this always 409ed before the fix', async () => {
      (prisma.expense.findUnique as jest.Mock).mockResolvedValue(
        baseExpense({ status: ExpenseStatus.APPROVED }),
      );
      (prisma.expense.update as jest.Mock).mockResolvedValue(
        baseExpense({ status: ExpenseStatus.REIMBURSED }),
      );

      const result = await service.markReimbursed('exp-1', {}, actor);

      expect(result.status).toBe(ExpenseStatus.REIMBURSED);
      expect(prisma.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: ExpenseStatus.REIMBURSED }),
        }),
      );
      expect(prisma.expenseAudit.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXPENSE_STATUS_CHANGED_TO_REIMBURSED' }),
      );
    });

    it('rejects DRAFT -> REIMBURSED (must go through APPROVED first)', async () => {
      (prisma.expense.findUnique as jest.Mock).mockResolvedValue(baseExpense());

      await expect(service.markReimbursed('exp-1', {}, actor)).rejects.toThrow(ConflictException);
      expect(prisma.expense.update).not.toHaveBeenCalled();
    });

    it('rejects APPROVED -> APPROVED (already approved)', async () => {
      (prisma.expense.findUnique as jest.Mock).mockResolvedValue(
        baseExpense({ status: ExpenseStatus.APPROVED }),
      );

      await expect(service.approve('exp-1', {}, actor)).rejects.toThrow(ConflictException);
    });

    it('rejects REIMBURSED -> anything (terminal state)', async () => {
      (prisma.expense.findUnique as jest.Mock).mockResolvedValue(
        baseExpense({ status: ExpenseStatus.REIMBURSED }),
      );

      await expect(service.approve('exp-1', {}, actor)).rejects.toThrow(ConflictException);
      await expect(service.reject('exp-1', { reason: 'x' }, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects REJECTED -> anything (terminal state)', async () => {
      (prisma.expense.findUnique as jest.Mock).mockResolvedValue(
        baseExpense({ status: ExpenseStatus.REJECTED }),
      );

      await expect(service.approve('exp-1', {}, actor)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException for a missing or soft-deleted expense', async () => {
      (prisma.expense.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.approve('missing', {}, actor)).rejects.toThrow(NotFoundException);

      (prisma.expense.findUnique as jest.Mock).mockResolvedValue(
        baseExpense({ deletedAt: new Date() }),
      );
      await expect(service.approve('exp-1', {}, actor)).rejects.toThrow(NotFoundException);
    });
  });
});
