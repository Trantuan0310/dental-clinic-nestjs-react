import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { apiKeyMatches, extractInvoiceCode, parseSepayPayload } from './bank-transfer';
import { BankWebhookService } from './bank-webhook.service';
import { BankWebhookController } from './bank-webhook.controller';

const payload = (over: Record<string, unknown> = {}) => ({
  id: 92704,
  gateway: 'Vietcombank',
  transactionDate: '2026-11-05 09:30:15',
  accountNumber: '0011004123456',
  code: null,
  content: 'INV2026000003',
  transferType: 'in',
  transferAmount: 400_000,
  accumulated: 19_077_000,
  referenceCode: 'MBVCB.3278907687',
  description: '',
  ...over,
});

describe('parseSepayPayload', () => {
  it('reads an incoming transfer, in Vietnam time', () => {
    const t = parseSepayPayload(payload())!;
    expect(t).toMatchObject({
      externalId: '92704',
      referenceCode: 'MBVCB.3278907687',
      accountNo: '0011004123456',
      amount: 400_000,
      content: 'INV2026000003',
    });
    expect(t.transactionAt.toISOString()).toBe('2026-11-05T02:30:15.000Z');
  });

  it('leaves a transfer going out alone', () => {
    expect(parseSepayPayload(payload({ transferType: 'out' }))).toBeNull();
  });

  it.each([
    ['not an object', 'abc'],
    ['no id', payload({ id: undefined })],
    ['zero amount', payload({ transferAmount: 0 })],
    ['fractional amount', payload({ transferAmount: 1000.5 })],
    ['bad date', payload({ transactionDate: 'yesterday' })],
    ['no account', payload({ accountNumber: '' })],
    ['unknown type', payload({ transferType: 'refund' })],
  ])('rejects %s so the sender sees the problem', (_name, body) => {
    expect(() => parseSepayPayload(body)).toThrow(BadRequestException);
  });

  it("adds the aggregator's own parsed code to the note", () => {
    expect(
      parseSepayPayload(payload({ content: 'chuyen tien', code: 'INV2026000003' }))!.content,
    ).toBe('chuyen tien INV2026000003');
  });
});

describe('extractInvoiceCode', () => {
  it.each([
    ['INV2026000003', 'INV-2026-000003'],
    ['inv 2026 000003', 'INV-2026-000003'],
    ['INV-2026-000003', 'INV-2026-000003'],
    ['MBVCB.3278907687.INV2026000012.CT tu NGUYEN VAN A', 'INV-2026-000012'],
    ['thanh toan INV2026-3', 'INV-2026-000003'],
  ])('finds the code in %j', (note, code) => {
    expect(extractInvoiceCode(note)).toBe(code);
  });

  it('is null when the note names no invoice', () => {
    expect(extractInvoiceCode('chuyen khoan tien kham')).toBeNull();
    expect(extractInvoiceCode('INV 99')).toBeNull();
  });
});

describe('apiKeyMatches', () => {
  it('needs the Apikey scheme and the exact key', () => {
    expect(apiKeyMatches('Apikey secret-1', 'secret-1')).toBe(true);
    expect(apiKeyMatches('apikey   secret-1 ', 'secret-1')).toBe(true);
    expect(apiKeyMatches('Apikey secret-2', 'secret-1')).toBe(false);
    expect(apiKeyMatches('Bearer secret-1', 'secret-1')).toBe(false);
    expect(apiKeyMatches(undefined, 'secret-1')).toBe(false);
    expect(apiKeyMatches('Apikey ', 'secret-1')).toBe(false);
  });
});

describe('BankWebhookController', () => {
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
  });
  const make = () => {
    const service = { handleSepay: jest.fn().mockResolvedValue({ outcome: 'recorded' }) };
    return { service, controller: new BankWebhookController(service as never) };
  };

  it('does not exist until a key is configured', async () => {
    delete process.env.BANK_WEBHOOK_API_KEY;
    const { controller, service } = make();
    await expect(controller.sepay('Apikey x', payload())).rejects.toBeInstanceOf(NotFoundException);
    expect(service.handleSepay).not.toHaveBeenCalled();
  });

  it('refuses a wrong key before reading the body', async () => {
    process.env.BANK_WEBHOOK_API_KEY = 'right';
    const { controller, service } = make();
    await expect(controller.sepay('Apikey wrong', payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.handleSepay).not.toHaveBeenCalled();
  });

  it('answers success to SePay for a good key', async () => {
    process.env.BANK_WEBHOOK_API_KEY = 'right';
    const { controller } = make();
    expect(await controller.sepay('Apikey right', payload())).toEqual({
      success: true,
      outcome: 'recorded',
    });
  });
});

describe('BankWebhookService', () => {
  const ENV = { ...process.env };
  beforeEach(() => {
    process.env.VIETQR_ACCOUNT_NO = '0011004123456';
    process.env.BANK_WEBHOOK_ACTOR_EMAIL = 'bank@clinic.test';
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  const make = (invoice: Record<string, unknown> | null = null) => {
    const prisma: any = {
      bankTransaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      invoice: { findFirst: jest.fn().mockResolvedValue(invoice) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'bot', email: 'bank@clinic.test' }) },
      payment: { findUnique: jest.fn().mockResolvedValue({ id: 'pay-1' }) },
    };
    const billing = { recordPayment: jest.fn().mockResolvedValue({}) };
    const audit = { log: jest.fn() };
    const service = new BankWebhookService(prisma, billing as never, audit as never);
    return { service, prisma, billing, audit };
  };
  const owed = (over: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    status: InvoiceStatus.PARTIAL,
    outstandingAmount: new Prisma.Decimal(400_000),
    ...over,
  });
  const stored = (prisma: any) => prisma.bankTransaction.create.mock.calls[0][0].data;

  it('records the payment of the invoice the note names', async () => {
    const { service, prisma, billing, audit } = make(owed());
    const res = await service.handleSepay(payload());
    expect(res).toEqual({ outcome: 'recorded', invoiceId: 'inv-1', paymentId: 'pay-1' });
    expect(prisma.invoice.findFirst.mock.calls[0][0].where.code).toBe('INV-2026-000003');
    const [invoiceId, dto, actor] = billing.recordPayment.mock.calls[0];
    expect(invoiceId).toBe('inv-1');
    expect(dto).toMatchObject({
      amount: 400_000,
      method: 'BANK_TRANSFER',
      requestKey: 'bank:sepay:92704',
    });
    expect(actor.sub).toBe('bot');
    expect(stored(prisma)).toMatchObject({
      status: 'RECORDED',
      invoiceId: 'inv-1',
      paymentId: 'pay-1',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BANK_TRANSFER_RECORDED', targetId: 'inv-1' }),
    );
  });

  it('records a part payment', async () => {
    const { service, billing } = make(owed({ outstandingAmount: new Prisma.Decimal(1_000_000) }));
    await service.handleSepay(payload());
    expect(billing.recordPayment.mock.calls[0][1].amount).toBe(400_000);
  });

  it('does not store or pay a transfer it has already seen', async () => {
    const { service, prisma, billing } = make(owed());
    prisma.bankTransaction.findUnique.mockResolvedValue({ id: 'old' });
    expect(await service.handleSepay(payload())).toEqual({ outcome: 'duplicate' });
    expect(billing.recordPayment).not.toHaveBeenCalled();
    expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
  });

  it('treats a resend that raced it as a duplicate', async () => {
    const { service, prisma } = make(owed());
    prisma.bankTransaction.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    expect(await service.handleSepay(payload())).toEqual({ outcome: 'duplicate' });
  });

  it('ignores transfers out and transfers to another account', async () => {
    const { service, prisma } = make(owed());
    expect(await service.handleSepay(payload({ transferType: 'out' }))).toEqual({
      outcome: 'ignored',
    });
    expect(await service.handleSepay(payload({ accountNumber: '999' }))).toEqual({
      outcome: 'ignored',
    });
    expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
  });

  it.each([
    ['a note with no invoice code', payload({ content: 'tien kham' }), null, 'NO_CODE'],
    ['a code no invoice has', payload(), null, 'INVOICE_NOT_FOUND'],
    ['an invoice already paid', payload(), owed({ status: InvoiceStatus.PAID }), 'NOT_PAYABLE'],
    ['a voided invoice', payload(), owed({ status: InvoiceStatus.VOIDED }), 'NOT_PAYABLE'],
    [
      'more than is owed',
      payload({ transferAmount: 900_000 }),
      owed({ outstandingAmount: new Prisma.Decimal(400_000) }),
      'AMOUNT_EXCEEDS',
    ],
  ])('keeps %s for review without recording money', async (_n, body, invoice, reason) => {
    const { service, prisma, billing } = make(invoice);
    expect(await service.handleSepay(body)).toEqual({ outcome: 'needs_review', reason });
    expect(billing.recordPayment).not.toHaveBeenCalled();
    expect(stored(prisma)).toMatchObject({ status: 'NEEDS_REVIEW', reason, paymentId: null });
  });

  it('keeps it for review when no recording account is configured', async () => {
    delete process.env.BANK_WEBHOOK_ACTOR_EMAIL;
    const { service, billing } = make(owed());
    expect(await service.handleSepay(payload())).toEqual({
      outcome: 'needs_review',
      reason: 'NO_ACTOR',
    });
    expect(billing.recordPayment).not.toHaveBeenCalled();
  });

  it('keeps it for review when recording fails (invoice paid by hand a moment before)', async () => {
    const { service, billing, prisma } = make(owed());
    billing.recordPayment.mockRejectedValue(new Error('exceeds outstanding'));
    expect(await service.handleSepay(payload())).toEqual({
      outcome: 'needs_review',
      reason: 'RECORD_FAILED',
    });
    expect(stored(prisma).invoiceId).toBe('inv-1');
  });
});
