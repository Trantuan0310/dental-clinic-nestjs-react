import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BankTransactionStatus } from '@prisma/client';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload, PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { User } from '../common/decorators/user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BankWebhookService } from './bank-webhook.service';
import { apiKeyMatches } from './bank-transfer';

/**
 * Where the bank's aggregator (SePay) posts incoming transfers. No login:
 * it proves itself with `Authorization: Apikey <BANK_WEBHOOK_API_KEY>`. With
 * no key configured the route does not exist (404), so a clinic that does not
 * use it exposes nothing. SePay retries unless it gets a 2xx with
 * {"success": true}; every readable notification gets one, whatever became of it.
 */
@ApiTags('Webhooks')
@Controller('webhooks/bank')
export class BankWebhookController {
  constructor(private readonly service: BankWebhookService) {}

  @Post('sepay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Incoming bank transfer from SePay: records the payment of the invoice named in the note',
  })
  async sepay(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    const key = process.env.BANK_WEBHOOK_API_KEY?.trim();
    if (!key) throw new NotFoundException();
    if (!apiKeyMatches(authorization, key)) throw new UnauthorizedException();
    const result = await this.service.handleSepay(body);
    return { success: true, outcome: result.outcome };
  }
}

class ResolveBankTransactionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note!: string;
}

class BankTransactionsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}

/** The front desk's list of transfers that were not recorded by themselves. */
@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('billing/bank-transactions')
export class BankTransactionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('invoice.payment.create')
  @ApiOperation({ summary: 'Bank transfers by status (default: needing review), newest first' })
  async list(@Query() q: BankTransactionsQueryDto) {
    const status = Object.values(BankTransactionStatus).find(s => s === q.status);
    const rows = await this.prisma.bankTransaction.findMany({
      where: { status: status ?? BankTransactionStatus.NEEDS_REVIEW },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        invoice: { select: { id: true, code: true, status: true, outstandingAmount: true } },
        resolvedUser: { select: { fullName: true } },
      },
    });
    return {
      data: rows.map(r => ({
        id: r.id,
        status: r.status,
        reason: r.reason,
        amount: Number(r.amount),
        content: r.content,
        referenceCode: r.referenceCode,
        transactionAt: r.transactionAt,
        createdAt: r.createdAt,
        invoice: r.invoice
          ? {
              id: r.invoice.id,
              code: r.invoice.code,
              status: r.invoice.status,
              outstandingAmount: Number(r.invoice.outstandingAmount),
            }
          : null,
        resolvedBy: r.resolvedUser?.fullName ?? null,
        resolvedAt: r.resolvedAt,
        resolutionNote: r.resolutionNote,
      })),
    };
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('invoice.payment.create')
  @ApiOperation({ summary: 'Mark a transfer needing review as handled by hand (with a note)' })
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveBankTransactionDto,
    @User() actor: JwtPayload,
  ) {
    // Guarded: only a row still needing review changes, so two people cannot both resolve it.
    const done = await this.prisma.bankTransaction.updateMany({
      where: { id, status: BankTransactionStatus.NEEDS_REVIEW },
      data: {
        status: BankTransactionStatus.RESOLVED,
        resolvedBy: actor.sub,
        resolvedAt: new Date(),
        resolutionNote: dto.note.trim(),
      },
    });
    if (done.count === 0) throw new NotFoundException('Giao dịch không còn cần xử lý');
    await this.audit.log({
      action: 'BANK_TRANSFER_RESOLVED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'bank_transaction',
      targetId: id,
      metadata: { note: dto.note.trim() },
    });
    return { data: { id, status: BankTransactionStatus.RESOLVED } };
  }
}
