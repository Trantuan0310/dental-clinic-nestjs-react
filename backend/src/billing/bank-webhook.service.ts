import { Injectable, Logger } from '@nestjs/common';
import { BankTransactionStatus, InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { BillingService } from './billing.service';
import { extractInvoiceCode, parseSepayPayload, type BankTransfer } from './bank-transfer';
import type { RecordPaymentDto } from './dto/billing.dto';

const PROVIDER = 'sepay';
const OWED: InvoiceStatus[] = [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL];

export type BankReviewReason =
  'NO_CODE' | 'INVOICE_NOT_FOUND' | 'NOT_PAYABLE' | 'AMOUNT_EXCEEDS' | 'NO_ACTOR' | 'RECORD_FAILED';

export type BankWebhookOutcome =
  | { outcome: 'recorded'; invoiceId: string; paymentId: string | null }
  | { outcome: 'needs_review'; reason: BankReviewReason }
  | { outcome: 'duplicate' }
  | { outcome: 'ignored' };

/**
 * A6.3: the bank tells us a transfer arrived; if its note names an invoice
 * that is owed and the amount fits, the payment is recorded with no one
 * pressing "Thu tiền". Anything else is kept in the review queue instead
 * of guessed at: money is never applied to an invoice the note does not
 * name, never more than is owed, and never twice.
 */
@Injectable()
export class BankWebhookService {
  private readonly logger = new Logger(BankWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  async handleSepay(body: unknown): Promise<BankWebhookOutcome> {
    const transfer = parseSepayPayload(body);
    if (!transfer) return { outcome: 'ignored' };
    // Only the clinic's own receiving account (VIETQR_ACCOUNT_NO) is ours; the
    // aggregator may be linked to other accounts too.
    const own = process.env.VIETQR_ACCOUNT_NO?.replace(/\s+/g, '');
    if (own && transfer.accountNo !== own) return { outcome: 'ignored' };

    const seen = await this.prisma.bankTransaction.findUnique({
      where: { provider_externalId: { provider: PROVIDER, externalId: transfer.externalId } },
      select: { id: true },
    });
    if (seen) return { outcome: 'duplicate' };

    const decision = await this.decide(transfer);
    try {
      await this.prisma.bankTransaction.create({
        data: {
          provider: PROVIDER,
          externalId: transfer.externalId,
          referenceCode: transfer.referenceCode,
          accountNo: transfer.accountNo,
          amount: new Prisma.Decimal(transfer.amount),
          content: transfer.content,
          transactionAt: transfer.transactionAt,
          status:
            decision.outcome === 'recorded'
              ? BankTransactionStatus.RECORDED
              : BankTransactionStatus.NEEDS_REVIEW,
          reason: decision.outcome === 'needs_review' ? decision.reason : null,
          invoiceId: decision.invoiceId ?? null,
          paymentId: decision.outcome === 'recorded' ? decision.paymentId : null,
          raw: transfer.raw as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // A resend raced this one and stored the row first; the payment it
      // recorded is the same one (same request key), so nothing doubled.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { outcome: 'duplicate' };
      }
      throw err;
    }

    await this.audit.log({
      action: decision.outcome === 'recorded' ? 'BANK_TRANSFER_RECORDED' : 'BANK_TRANSFER_FLAGGED',
      actorUserId: null,
      targetType: 'invoice',
      targetId: decision.invoiceId,
      metadata: {
        provider: PROVIDER,
        externalId: transfer.externalId,
        amount: transfer.amount,
        ...(decision.outcome === 'needs_review' ? { reason: decision.reason } : {}),
      },
    });
    return decision.outcome === 'recorded'
      ? { outcome: 'recorded', invoiceId: decision.invoiceId, paymentId: decision.paymentId }
      : { outcome: 'needs_review', reason: decision.reason };
  }

  /** Decide, and record the payment when the transfer qualifies. */
  private async decide(
    t: BankTransfer,
  ): Promise<
    | { outcome: 'recorded'; invoiceId: string; paymentId: string | null }
    | { outcome: 'needs_review'; reason: BankReviewReason; invoiceId?: string }
  > {
    const code = extractInvoiceCode(t.content);
    if (!code) return { outcome: 'needs_review', reason: 'NO_CODE' };
    const invoice = await this.prisma.invoice.findFirst({
      where: { code, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, outstandingAmount: true },
    });
    if (!invoice) return { outcome: 'needs_review', reason: 'INVOICE_NOT_FOUND' };
    const outstanding = Number(invoice.outstandingAmount);
    if (!OWED.includes(invoice.status) || !(outstanding > 0)) {
      return { outcome: 'needs_review', reason: 'NOT_PAYABLE', invoiceId: invoice.id };
    }
    if (t.amount > outstanding) {
      return { outcome: 'needs_review', reason: 'AMOUNT_EXCEEDS', invoiceId: invoice.id };
    }
    const actor = await this.recordingActor();
    if (!actor) return { outcome: 'needs_review', reason: 'NO_ACTOR', invoiceId: invoice.id };

    // One key per bank transaction: the same transfer reported again records nothing new.
    const requestKey = `bank:${PROVIDER}:${t.externalId}`.slice(0, 64);
    try {
      await this.billing.recordPayment(
        invoice.id,
        {
          amount: t.amount,
          method: PaymentMethod.BANK_TRANSFER,
          note: `Tự ghi từ ngân hàng (${t.referenceCode ?? t.externalId})`,
          requestKey,
        } as RecordPaymentDto,
        actor,
      );
    } catch (err) {
      this.logger.warn(`Bank transfer ${t.externalId} not recorded: ${(err as Error).message}`);
      return { outcome: 'needs_review', reason: 'RECORD_FAILED', invoiceId: invoice.id };
    }
    const payment = await this.prisma.payment.findUnique({
      where: { invoiceId_requestKey: { invoiceId: invoice.id, requestKey } },
      select: { id: true },
    });
    return { outcome: 'recorded', invoiceId: invoice.id, paymentId: payment?.id ?? null };
  }

  /** The account payments are recorded under (BANK_WEBHOOK_ACTOR_EMAIL), or null. */
  private async recordingActor(): Promise<JwtPayload | null> {
    const email = process.env.BANK_WEBHOOK_ACTOR_EMAIL?.trim().toLowerCase();
    if (!email) {
      this.logger.error('BANK_WEBHOOK_ACTOR_EMAIL is not set: bank transfers go to review');
      return null;
    }
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
      select: { id: true, email: true },
    });
    if (!user) {
      this.logger.error(`BANK_WEBHOOK_ACTOR_EMAIL ${email} matches no user`);
      return null;
    }
    return { sub: user.id, email: user.email, permissions: [] };
  }
}
