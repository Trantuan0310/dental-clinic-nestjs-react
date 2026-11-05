import { createHash, timingSafeEqual } from 'crypto';
import { BadRequestException } from '@nestjs/common';

/**
 * Pure parts of the bank-transfer webhook (A6.3): reading the aggregator's
 * payload, finding the invoice code in the transfer note, checking the key.
 * Written for SePay (https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook);
 * another aggregator needs only another parser that returns BankTransfer.
 */

export interface BankTransfer {
  /** The aggregator's id for the transaction: what makes a resent webhook the same one. */
  externalId: string;
  referenceCode: string | null;
  accountNo: string;
  amount: number;
  content: string;
  transactionAt: Date;
  /** The payload as received, kept with the row for the front desk and for disputes. */
  raw: Record<string, unknown>;
}

/** SePay sends "yyyy-MM-dd HH:mm:ss" in Vietnam time. */
function parseTransactionDate(value: unknown): Date {
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
    if (m) {
      const date = new Date(`${m[1]}T${m[2]}+07:00`);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  throw new BadRequestException('transactionDate không hợp lệ');
}

/**
 * The incoming-transfer payload as a BankTransfer, or null for a transfer
 * going out (not ours to record). Anything unreadable is a 400, so the
 * aggregator sees the problem instead of a silent "success".
 */
export function parseSepayPayload(body: unknown): BankTransfer | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Nội dung webhook không hợp lệ');
  }
  const p = body as Record<string, unknown>;
  if (p.transferType === 'out') return null;
  if (p.transferType !== 'in') throw new BadRequestException('transferType không hợp lệ');

  const id = typeof p.id === 'number' || typeof p.id === 'string' ? String(p.id).trim() : '';
  if (!id || id.length > 100) throw new BadRequestException('Thiếu id giao dịch');
  const amount = Number(p.transferAmount);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw new BadRequestException('transferAmount không hợp lệ');
  }
  const accountNo = typeof p.accountNumber === 'string' ? p.accountNumber.replace(/\s+/g, '') : '';
  if (!accountNo) throw new BadRequestException('Thiếu accountNumber');
  // The transfer note, plus the aggregator's own parsed code when it has one.
  const content = [p.content, p.code, p.description]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ')
    .trim()
    .slice(0, 500);

  return {
    externalId: id,
    referenceCode:
      typeof p.referenceCode === 'string' && p.referenceCode ? p.referenceCode.slice(0, 100) : null,
    accountNo: accountNo.slice(0, 30),
    amount,
    content,
    transactionAt: parseTransactionDate(p.transactionDate),
    raw: p,
  };
}

/**
 * "INV2026000003" (what the QR puts in the note), also as banks and people
 * mangle it ("inv 2026 000003", "INV-2026-000003", after a bank's own prefix)
 * → "INV-2026-000003". Null when the note carries no invoice code.
 */
export function extractInvoiceCode(content: string): string | null {
  const m = content.match(/INV[\s\-_.]*(\d{4})[\s\-_.]*(\d{1,8})(?!\d)/i);
  if (!m) return null;
  return `INV-${m[1]}-${m[2].padStart(6, '0')}`;
}

/** `Authorization: Apikey <key>`, compared without leaking the length or a prefix match. */
export function apiKeyMatches(header: string | undefined, expected: string): boolean {
  const m = header?.match(/^\s*apikey\s+(.+?)\s*$/i);
  if (!m || !expected) return false;
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(m[1]), digest(expected));
}
