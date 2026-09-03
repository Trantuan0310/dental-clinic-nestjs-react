import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { endOfDayInclusive } from '../common/date-range.util';
import { JwtPayload } from '../common/guards/permissions.guard';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  ApproveExpenseDto,
  RejectExpenseDto,
  ReimburseExpenseDto,
} from './dto/expense.dto';
import { Prisma, ExpenseStatus } from '@prisma/client';

// DRAFT → APPROVED / REJECTED; APPROVED → REIMBURSED. REJECTED/REIMBURSED
// are terminal. (See expense.controller.ts operation summaries.)
const VALID_EXPENSE_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  [ExpenseStatus.DRAFT]: [ExpenseStatus.APPROVED, ExpenseStatus.REJECTED],
  [ExpenseStatus.APPROVED]: [ExpenseStatus.REIMBURSED],
  [ExpenseStatus.REJECTED]: [],
  [ExpenseStatus.REIMBURSED]: [],
};

@Injectable()
export class ExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ==========================================================================
  // Category management
  // ==========================================================================

  async listCategories() {
    return this.prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(data: { name: string; description?: string; type?: string }) {
    return this.prisma.expenseCategory.create({
      data: {
        name: data.name,
        description: data.description,
        type: (data.type as import('@prisma/client').ExpenseType) ?? 'OPERATING',
      },
    });
  }

  // ==========================================================================
  // Expense CRUD
  // ==========================================================================

  async generateCode(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const rows = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('expense_code_seq')
    `;
    const next = rows[0].nextval;
    const padded = String(Number(next)).padStart(6, '0');
    return `EXP-${year}-${padded}`;
  }

  async list(query: {
    status?: ExpenseStatus;
    categoryId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.from || query.to) {
      // `lte: new Date(query.to)` on a bare YYYY-MM-DD date is UTC midnight
      // — a zero-width instant, not "through end of that day". A same-day
      // from/to filter (e.g. "today") would always match nothing.
      where.expenseDate = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: endOfDayInclusive(query.to) }),
      };
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: { category: true, creator: { select: { fullName: true } } },
        orderBy: { expenseDate: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data: data.map(e => this.formatExpense(e)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getById(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        category: true,
        creator: { select: { fullName: true } },
        audits: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    return this.formatExpense(expense);
  }

  async create(dto: CreateExpenseDto, actor: JwtPayload, ip?: string, ua?: string) {
    const code = await this.generateCode();

    const expense = await this.prisma.expense.create({
      data: {
        code,
        amount: dto.amount,
        description: dto.description,
        expenseDate: new Date(dto.expenseDate),
        categoryId: dto.categoryId,
        notes: dto.notes,
        receiptUrl: dto.receiptUrl,
        status: ExpenseStatus.DRAFT,
        createdBy: actor.sub,
      },
      include: { category: true, creator: { select: { fullName: true } } },
    });

    await this.logAudit(expense.id, 'CREATED', null, expense, actor, ip, ua);

    return this.formatExpense(expense);
  }

  async update(id: string, dto: UpdateExpenseDto, actor: JwtPayload, ip?: string, ua?: string) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (existing.status !== ExpenseStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT expenses can be updated');
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.expenseDate !== undefined && { expenseDate: new Date(dto.expenseDate) }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.receiptUrl !== undefined && { receiptUrl: dto.receiptUrl }),
        updatedBy: actor.sub,
        version: { increment: 1 },
      },
      include: { category: true, creator: { select: { fullName: true } } },
    });

    await this.logAudit(id, 'UPDATED', existing, updated, actor, ip, ua);

    return this.formatExpense(updated);
  }

  async delete(id: string, actor: JwtPayload, ip?: string, ua?: string) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (
      existing.status === ExpenseStatus.APPROVED ||
      existing.status === ExpenseStatus.REIMBURSED
    ) {
      throw new BadRequestException('Cannot delete APPROVED or REIMBURSED expenses');
    }

    const deleted = await this.prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actor.sub },
    });

    await this.logAudit(id, 'DELETED', existing, deleted, actor, ip, ua);

    return { id };
  }

  // ==========================================================================
  // State transitions
  // ==========================================================================

  async approve(id: string, dto: ApproveExpenseDto, actor: JwtPayload, ip?: string, ua?: string) {
    return this.transition(id, ExpenseStatus.APPROVED, dto.notes, actor, ip, ua);
  }

  async reject(id: string, dto: RejectExpenseDto, actor: JwtPayload, ip?: string, ua?: string) {
    return this.transition(id, ExpenseStatus.REJECTED, dto.reason, actor, ip, ua);
  }

  async markReimbursed(
    id: string,
    dto: ReimburseExpenseDto,
    actor: JwtPayload,
    ip?: string,
    ua?: string,
  ) {
    return this.transition(id, ExpenseStatus.REIMBURSED, dto.notes, actor, ip, ua);
  }

  private async transition(
    id: string,
    newStatus: ExpenseStatus,
    notes: string | undefined,
    actor: JwtPayload,
    ip?: string,
    ua?: string,
  ) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    // This guard used to block ANY transition once status was APPROVED —
    // which also blocked the one transition APPROVED is actually for
    // (APPROVED -> REIMBURSED), making markReimbursed() 409 on every call.
    if (!VALID_EXPENSE_TRANSITIONS[existing.status].includes(newStatus)) {
      throw new ConflictException(
        `Cannot transition expense from ${existing.status} to ${newStatus}`,
      );
    }

    // Segregation of duties: the person who submitted an expense cannot also
    // be the one who approves it, otherwise the approval step is a no-op.
    if (newStatus === ExpenseStatus.APPROVED && existing.createdBy === actor.sub) {
      throw new ForbiddenException(
        'Không thể tự duyệt chi phí do chính bạn tạo. Cần một người khác có quyền duyệt xác nhận khoản chi này.',
      );
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        status: newStatus,
        notes: notes ?? existing.notes,
        updatedBy: actor.sub,
        version: { increment: 1 },
      },
      include: { category: true, creator: { select: { fullName: true } } },
    });

    await this.logAudit(id, `STATUS_CHANGED_TO_${newStatus}`, existing, updated, actor, ip, ua);

    return this.formatExpense(updated);
  }

  // ==========================================================================
  // Aggregation for financeSummary (wired from billing.service.ts)
  // ==========================================================================

  async aggregateApproved(fromDate: Date, toDate: Date) {
    const agg = await this.prisma.expense.aggregate({
      _sum: { amount: true },
      where: {
        status: ExpenseStatus.APPROVED,
        expenseDate: { gte: fromDate, lte: toDate },
        deletedAt: null,
      },
    });

    return Number(agg._sum.amount ?? 0);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private formatExpense(expense: Record<string, unknown>) {
    return {
      id: expense.id,
      code: expense.code,
      amount: Number(expense.amount),
      description: expense.description,
      expenseDate: (expense.expenseDate as Date).toISOString().slice(0, 10),
      status: expense.status,
      category: expense.category,
      notes: expense.notes,
      receiptUrl: expense.receiptUrl,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
      createdBy: expense.createdBy,
      creatorName: (expense.creator as { fullName: string } | null)?.fullName,
      version: expense.version,
    };
  }

  private async logAudit(
    expenseId: string,
    action: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
    actor: JwtPayload,
    ip?: string,
    ua?: string,
  ) {
    await this.prisma.expenseAudit.create({
      data: {
        expenseId,
        action,
        before: before
          ? ({
              amount: before.amount,
              status: before.status,
              description: before.description,
            } as Prisma.InputJsonValue)
          : undefined,
        after: {
          amount: after.amount,
          status: after.status,
          description: after.description,
        } as Prisma.InputJsonValue,
        actorId: actor.sub,
        actorEmail: actor.email,
      },
    });

    await this.audit.log({
      action: `EXPENSE_${action}`,
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'expense',
      targetId: expenseId,
      metadata: { amount: after.amount, status: after.status },
      ipAddress: ip ?? null,
      userAgent: ua ?? null,
    });
  }
}
