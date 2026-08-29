import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard, JwtPayload } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { ExpenseService } from './expense.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  ApproveExpenseDto,
  RejectExpenseDto,
  ReimburseExpenseDto,
} from './dto/expense.dto';
import { ExpenseStatus } from '@prisma/client';

@ApiTags('Expense')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expense: ExpenseService) {}

  // ==========================================================================
  // Categories
  // ==========================================================================

  @Get('categories')
  @RequirePermissions('expense.read')
  @ApiOperation({ summary: 'List expense categories' })
  async listCategories() {
    return { data: await this.expense.listCategories() };
  }

  @Post('categories')
  @RequirePermissions('expense.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create expense category' })
  async createCategory(@Body() body: { name: string; description?: string; type?: string }) {
    return { data: await this.expense.createCategory(body) };
  }

  // ==========================================================================
  // Expenses
  // ==========================================================================

  @Get()
  @RequirePermissions('expense.read')
  @ApiOperation({ summary: 'List expenses with filters' })
  async list(
    @Query('status') status?: ExpenseStatus,
    @Query('categoryId') categoryId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.expense.list({ status, categoryId, from, to, page, pageSize });
  }

  @Get(':id')
  @RequirePermissions('expense.read')
  @ApiOperation({ summary: 'Get expense by ID' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.expense.getById(id) };
  }

  @Post()
  @RequirePermissions('expense.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new expense (DRAFT)' })
  async create(
    @Body() dto: CreateExpenseDto,
    @User() actor: JwtPayload,
    @Query('ip') ip?: string,
    @Query('ua') ua?: string,
  ) {
    return { data: await this.expense.create(dto, actor, ip, ua) };
  }

  @Put(':id')
  @RequirePermissions('expense.update')
  @ApiOperation({ summary: 'Update a DRAFT expense' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.expense.update(id, dto, actor) };
  }

  @Delete(':id')
  @RequirePermissions('expense.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a DRAFT expense' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @User() actor: JwtPayload) {
    return this.expense.delete(id, actor);
  }

  // ==========================================================================
  // State transitions
  // ==========================================================================

  @Post(':id/approve')
  @RequirePermissions('expense.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve an expense (DRAFT → APPROVED)' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveExpenseDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.expense.approve(id, dto, actor) };
  }

  @Post(':id/reject')
  @RequirePermissions('expense.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an expense (DRAFT → REJECTED)' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectExpenseDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.expense.reject(id, dto, actor) };
  }

  @Post(':id/reimburse')
  @RequirePermissions('expense.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark expense as reimbursed (APPROVED → REIMBURSED)' })
  async reimburse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReimburseExpenseDto,
    @User() actor: JwtPayload,
  ) {
    return { data: await this.expense.markReimbursed(id, dto, actor) };
  }
}
