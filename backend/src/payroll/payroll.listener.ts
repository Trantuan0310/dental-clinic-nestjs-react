import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollService } from './payroll.service';
import {
  ENCOUNTER_CLOSED_EVENT,
  INVOICE_ISSUED_EVENT,
  INVOICE_PAYMENT_VOIDED_EVENT,
  INVOICE_REFUNDED_EVENT,
  INVOICE_VOIDED_EVENT,
  InvoiceChangedEvent,
} from '../common/events/domain-events';

/**
 * Keeps the open payroll period current (BR-PAY-022 + BD-0009).
 *
 * Only the dentist concerned is recomputed (H2: adjustments are kept,
 * Serializable conflicts are retried inside computePeriod). Closed periods
 * (APPROVED/PAID/LOCKED) never change: an invoice voided after its period
 * closed is clawed back in the open period instead (H5).
 */
@Injectable()
export class PayrollEventListener {
  private readonly logger = new Logger(PayrollEventListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payroll: PayrollService,
  ) {}

  /** Hours/visits shown on the payslip; commission waits for the invoice. */
  @OnEvent(ENCOUNTER_CLOSED_EVENT)
  async handleEncounterClosed(payload: { encounterId: string; dentistId: string; closedAt: Date }) {
    const closedAt = new Date(payload.closedAt);
    const period = await this.payroll.findOpenPeriodFor(closedAt);
    if (!period) {
      this.logger.debug(
        `No active payroll period for encounter closed at ${closedAt.toISOString()}`,
      );
      return;
    }
    await this.recompute(period.id, payload.dentistId, `encounter ${payload.encounterId} closed`);
  }

  /**
   * Issue, void, refund and a cancelled payment/refund row change the
   * commission basis (issued total − refunds). A plain payment does not
   * (basis is the issued invoice, not cash), so it is not listened to.
   */
  @OnEvent(INVOICE_ISSUED_EVENT)
  @OnEvent(INVOICE_VOIDED_EVENT)
  @OnEvent(INVOICE_REFUNDED_EVENT)
  @OnEvent(INVOICE_PAYMENT_VOIDED_EVENT)
  async handleInvoiceChanged(
    payload: InvoiceChangedEvent & { occurredAt?: Date; refundedAt?: Date },
  ) {
    try {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: payload.invoiceId },
        select: {
          id: true,
          status: true,
          issuedAt: true,
          voidedAt: true,
          encounter: { select: { dentistId: true } },
        },
      });
      const dentistId = invoice?.encounter?.dentistId;
      if (!invoice || !dentistId) return;

      const periodIds = new Set<string>();
      // The period the invoice counts in (by issuedAt), while still open.
      if (invoice.issuedAt) {
        const p = await this.payroll.findOpenPeriodFor(invoice.issuedAt);
        if (p) periodIds.add(p.id);
      }
      // A void / refund (or a cancelled refund) after that period closed:
      // the open period of the day it happened takes the clawback.
      const changedAt =
        invoice.status === 'VOIDED'
          ? invoice.voidedAt
          : (payload.refundedAt ?? payload.occurredAt ?? null);
      if (changedAt || invoice.status === 'VOIDED') {
        const when = new Date(changedAt ?? new Date());
        const p = await this.payroll.findOpenPeriodFor(when, true);
        if (p) periodIds.add(p.id);
        else this.logger.warn(`No open payroll period to settle invoice ${invoice.id}`);
      }
      for (const id of periodIds) {
        await this.recompute(id, dentistId, `invoice ${invoice.id} ${invoice.status}`);
      }
    } catch (err) {
      this.logger.error(
        `Payroll update for invoice ${payload.invoiceId} failed: ${(err as Error).message}`,
      );
    }
  }

  private async recompute(periodId: string, dentistId: string, why: string) {
    try {
      await this.payroll.computePeriod(periodId, null, { dentistIds: [dentistId] });
      this.logger.log(`Re-computed dentist ${dentistId} in payroll period ${periodId} (${why})`);
    } catch (err) {
      this.logger.error(
        `Failed to re-compute dentist ${dentistId} in period ${periodId}: ${(err as Error).message}`,
      );
    }
  }
}
