import { Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { JwtPayload } from '../common/guards/permissions.guard';
import { BillingService } from './billing.service';
import { buildVietQrPayload, transferContent, vietQrAccountFromEnv } from './vietqr';

export interface PaymentQr {
  /** False when the clinic has not set its receiving account (VIETQR_*): the screen shows no code. */
  configured: boolean;
  /** False for an invoice that is not owed (draft, paid, voided). */
  payable: boolean;
  /** The text to draw as a QR; present only when configured and payable. */
  payload?: string;
  amount?: number;
  content?: string;
  accountNo?: string;
  accountName?: string;
}

const OWED: InvoiceStatus[] = [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL];

/** The transfer QR for what an invoice still owes. */
@Injectable()
export class PaymentQrService {
  constructor(private readonly billing: BillingService) {}

  async forInvoice(invoiceId: string, actor: JwtPayload): Promise<PaymentQr> {
    // Same read rule as the invoice itself (a dentist sees only their own).
    const invoice = await this.billing.getInvoiceById(invoiceId, actor);
    const account = vietQrAccountFromEnv();
    if (!account) return { configured: false, payable: false };
    const amount = Number(invoice.outstandingAmount);
    if (!OWED.includes(invoice.status) || !(amount > 0))
      return { configured: true, payable: false };
    // The invoice code is the transfer note, so the bank statement names the invoice.
    const content = transferContent(invoice.code);
    return {
      configured: true,
      payable: true,
      payload: buildVietQrPayload(account, { amount, content }),
      amount: Math.round(amount),
      content,
      accountNo: account.accountNo,
      accountName: account.accountName,
    };
  }
}
