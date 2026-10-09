import { EventEmitter2 } from '@nestjs/event-emitter';
import { EncounterStatus, InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ExpenseService } from '../expense/expense.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { adminPayload, validInvoice } from '../../test/helpers';
import { allocateNet, discountAmountOf, settle } from './domain/invoice-math';
import {
  INVOICE_ISSUED_EVENT,
  INVOICE_PAYMENT_RECORDED_EVENT,
  INVOICE_PAYMENT_VOIDED_EVENT,
  INVOICE_REFUNDED_EVENT,
  INVOICE_VOIDED_EVENT,
} from '../common/events/domain-events';
import { BillingCron } from './billing.cron';

const D = (n: number) => new Prisma.Decimal(n);

const item = (id: string, lineTotal: number, extra: Partial<any> = {}) => ({
  id,
  treatmentId: `tr-${id}`,
  description: id,
  quantity: D(1),
  unitPrice: D(lineTotal),
  lineTotal: D(lineTotal),
  deletedAt: null,
  ...extra,
});

const withItems = (inv: any, items = [item('a', 300_000), item('b', 200_000)]) => ({
  ...inv,
  encounter: { dentistId: 'dentist-1' },
  items,
});

describe('BillingService — corrections (round 4, H6)', () => {
  let prisma: PrismaMockShape;
  let events: { emit: jest.Mock };
  let audit: { log: jest.Mock };
  let service: BillingService;
  const admin = adminPayload('admin-1');

  beforeEach(() => {
    prisma = createPrismaMock();
    events = { emit: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    prisma.$transaction.mockImplementation(async (cb: any) =>
      typeof cb === 'function' ? cb(prisma) : Promise.all(cb),
    );
    prisma.$queryRaw.mockResolvedValue([{ nextval: 7n }]);
    prisma.payment.groupBy.mockResolvedValue([]);
    service = new BillingService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      {} as ExpenseService,
      events as unknown as EventEmitter2,
    );
    // getInvoiceById, used to answer after several corrections
    prisma.invoice.findUnique.mockImplementation(async () => withItems(validInvoice()));
    prisma.invoice.findUniqueOrThrow.mockImplementation(async () =>
      withItems(validInvoice({ status: InvoiceStatus.PARTIAL })),
    );
  });

  describe('money rules', () => {
    it('rounds a percent discount to whole đồng (A2-11)', () => {
      expect(discountAmountOf(333_333, 'PERCENT', 15)).toBe(50_000);
      expect(discountAmountOf(333_333, 'AMOUNT', 1_000)).toBe(1_000);
      expect(discountAmountOf(333_333, null, null)).toBe(0);
    });

    it('a refund does not reopen the debt; < 1đ left counts as settled', () => {
      expect(settle(500_000, 0, 500_000)).toEqual({ outstanding: 0, status: InvoiceStatus.PAID });
      expect(settle(500_000, 200_000, 0)).toEqual({
        outstanding: 300_000,
        status: InvoiceStatus.PARTIAL,
      });
      expect(settle(500_000, 0, 0).status).toBe(InvoiceStatus.ISSUED);
      expect(settle(283_333.05, 283_333, 0).status).toBe(InvoiceStatus.PAID);
    });

    it('splits the discounted total pro rata, parts summing to the total', () => {
      const parts = allocateNet([300_000, 200_000, 100_001], 540_000);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(540_000);
      expect(parts[1]).toBe(180_000);
      expect(allocateNet([0, 0], 0)).toEqual([0, 0]);
    });
  });

  describe('issue', () => {
    it('sends a 0đ invoice straight to PAID and emits invoice.issued (A2-09)', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(
        validInvoice({ subtotal: D(0), total: D(0), outstandingAmount: D(0) }),
      );
      prisma.invoice.findUniqueOrThrow.mockResolvedValue(
        withItems(validInvoice({ status: InvoiceStatus.PAID, total: D(0), subtotal: D(0) }), [
          item('a', 0),
        ]),
      );
      await service.issue('inv-1', { version: 0 }, admin);
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: InvoiceStatus.PAID, outstandingAmount: D(0) }),
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        INVOICE_ISSUED_EVENT,
        expect.objectContaining({ invoiceId: 'inv-1', status: 'PAID', dentistId: 'dentist-1' }),
      );
    });

    it('carries the discounted per-line amounts in invoice.issued', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(validInvoice());
      prisma.invoice.findUniqueOrThrow.mockResolvedValue(
        withItems(
          validInvoice({
            status: InvoiceStatus.ISSUED,
            total: D(450_000),
            issuedAt: new Date('2026-10-01T03:00:00Z'),
          }),
        ),
      );
      await service.issue('inv-1', { version: 0 }, admin);
      const [, payload] = events.emit.mock.calls[0];
      expect(payload.discountAmount).toBe(50_000);
      expect(payload.lines.map((l: any) => l.netLineTotal)).toEqual([270_000, 180_000]);
    });

    it('does not emit when the change fails', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(validInvoice({ version: 3 }));
      await expect(service.issue('inv-1', { version: 0 }, admin)).rejects.toThrow();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('voidInvoice', () => {
    it('refuses while money is kept, pointing at the next step (Vietnamese)', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(
        validInvoice({ status: InvoiceStatus.PARTIAL, paidAmount: D(100_000) }),
      );
      await expect(
        service.voidInvoice('inv-1', { version: 0, reason: 'Ghi sai' }, admin),
      ).rejects.toThrow(/"Hủy phiếu thu \(ghi nhầm\)".*"Hoàn tiền" hết số đã thu/);
    });

    it('checks the receipt rows, not only the paid column', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(
        validInvoice({ status: InvoiceStatus.PAID, paidAmount: D(0) }),
      );
      prisma.payment.groupBy.mockResolvedValue([
        { kind: 'PAYMENT', _sum: { amount: D(500_000) }, _count: { _all: 1 } },
        { kind: 'REFUND', _sum: { amount: D(200_000) }, _count: { _all: 1 } },
      ]);
      await expect(
        service.voidInvoice('inv-1', { version: 0, reason: 'Ghi sai' }, admin),
      ).rejects.toThrow(/300\.000đ đã thu \(1 phiếu thu còn hiệu lực\)/);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('voids once every receipt was cancelled or refunded in full', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(
        validInvoice({
          status: InvoiceStatus.PAID,
          paidAmount: D(0),
          refundedAmount: D(500_000),
          issuedAt: new Date(),
        }),
      );
      prisma.payment.groupBy.mockResolvedValue([
        { kind: 'PAYMENT', _sum: { amount: D(500_000) }, _count: { _all: 1 } },
        { kind: 'REFUND', _sum: { amount: D(500_000) }, _count: { _all: 1 } },
      ]);
      await service.voidInvoice('inv-1', { version: 0, reason: 'Khách hủy liệu trình' }, admin);
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: InvoiceStatus.VOIDED }),
        }),
      );
      expect(prisma.payment.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { invoiceId: 'inv-1', status: 'COMPLETED' } }),
      );
    });

    it('emits invoice.voided with the previous status', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(
        validInvoice({ status: InvoiceStatus.ISSUED, issuedAt: new Date() }),
      );
      prisma.invoice.findUniqueOrThrow.mockResolvedValue(
        withItems(validInvoice({ status: InvoiceStatus.VOIDED, issuedAt: new Date() })),
      );
      await service.voidInvoice('inv-1', { version: 0, reason: 'Khách khiếu nại' }, admin);
      expect(events.emit).toHaveBeenCalledWith(
        INVOICE_VOIDED_EVENT,
        expect.objectContaining({
          status: 'VOIDED',
          previousStatus: 'ISSUED',
          reason: 'Khách khiếu nại',
        }),
      );
    });
  });

  describe('recordPayment', () => {
    it('emits invoice.payment_recorded after commit', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(
        validInvoice({ status: InvoiceStatus.ISSUED }),
      );
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.create.mockResolvedValue({ id: 'pay-1', paidAt: new Date() });
      prisma.invoice.findUniqueOrThrow.mockResolvedValue(
        withItems(validInvoice({ status: InvoiceStatus.PARTIAL, paidAmount: D(100_000) })),
      );
      await service.recordPayment('inv-1', { amount: 100_000, method: PaymentMethod.CASH }, admin);
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ kind: 'PAYMENT' }) }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        INVOICE_PAYMENT_RECORDED_EVENT,
        expect.objectContaining({ paymentId: 'pay-1', amount: 100_000, status: 'PARTIAL' }),
      );
    });
  });

  describe('voidPayment', () => {
    const payment = (extra: Partial<any> = {}) => ({
      id: 'pay-1',
      amount: D(200_000),
      kind: 'PAYMENT',
      status: 'COMPLETED',
      receivedBy: 'reception-1',
      paidAt: new Date('2026-09-30T02:00:00Z'),
      invoice: validInvoice({
        status: InvoiceStatus.PAID,
        paidAmount: D(500_000),
        outstandingAmount: D(0),
        version: 4,
      }),
      ...extra,
    });

    it('puts the amount back on the debt and recomputes the status', async () => {
      prisma.payment.findUnique.mockResolvedValue(payment());
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      await service.voidPayment('pay-1', { reason: 'Thu trùng hai lần' }, admin);
      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', version: 4 },
        data: expect.objectContaining({
          paidAmount: D(300_000),
          outstandingAmount: D(200_000),
          status: InvoiceStatus.PARTIAL,
        }),
      });
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'VOIDED',
            voidedBy: 'admin-1',
            voidReason: 'Thu trùng hai lần',
          }),
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        INVOICE_PAYMENT_VOIDED_EVENT,
        expect.objectContaining({ paymentId: 'pay-1', kind: 'PAYMENT', amount: 200_000 }),
      );
    });

    it('stops the collector from voiding their own payment (A6-xet-A2)', async () => {
      prisma.payment.findUnique.mockResolvedValue(payment({ receivedBy: 'admin-1' }));
      prisma.user.count.mockResolvedValue(1); // another admin exists
      await expect(
        service.voidPayment('pay-1', { reason: 'Thu nhầm hóa đơn' }, admin),
      ).rejects.toMatchObject({ response: { code: 'PAYMENT_SELF_VOID_FORBIDDEN' } });
      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    });

    it('lets the only holder void their own payment, with a fuller reason and its own audit', async () => {
      prisma.payment.findUnique.mockResolvedValue(payment({ receivedBy: 'admin-1' }));
      prisma.user.count.mockResolvedValue(0);
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      await expect(
        service.voidPayment('pay-1', { reason: 'Thu nhầm' }, admin),
      ).rejects.toMatchObject({ response: { code: 'SELF_CORRECTION_REASON_REQUIRED' } });
      await service.voidPayment('pay-1', { reason: 'Thu nhầm hóa đơn của khách khác' }, admin);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_SELF_VOIDED',
          metadata: expect.objectContaining({ soleHolder: true }),
        }),
        prisma,
      );
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: { not: 'admin-1' }, status: 'ACTIVE' }),
      });
      expect(prisma.payment.update).toHaveBeenCalled();
    });

    it('refuses a payment already refunded to the patient', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        payment({
          invoice: validInvoice({
            status: InvoiceStatus.PAID,
            paidAmount: D(0),
            refundedAmount: D(500_000),
            outstandingAmount: D(0),
          }),
        }),
      );
      await expect(
        service.voidPayment('pay-1', { reason: 'Thu nhầm hóa đơn' }, admin),
      ).rejects.toMatchObject({ response: { code: 'PAYMENT_ALREADY_REFUNDED' } });
    });

    it('voiding a mistaken refund gives the money back to "kept", debt unchanged', async () => {
      prisma.payment.findUnique.mockResolvedValue(
        payment({
          kind: 'REFUND',
          amount: D(100_000),
          invoice: validInvoice({
            status: InvoiceStatus.PAID,
            paidAmount: D(400_000),
            refundedAmount: D(100_000),
            outstandingAmount: D(0),
          }),
        }),
      );
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      await service.voidPayment('pay-1', { reason: 'Hoàn nhầm' }, admin);
      expect(prisma.invoice.updateMany.mock.calls[0][0].data).toMatchObject({
        paidAmount: D(500_000),
        refundedAmount: D(0),
        outstandingAmount: D(0),
        status: InvoiceStatus.PAID,
      });
    });

    it('refuses on a voided invoice or an already voided row', async () => {
      prisma.payment.findUnique.mockResolvedValue(payment({ status: 'VOIDED' }));
      await expect(
        service.voidPayment('pay-1', { reason: 'Thu nhầm' }, admin),
      ).rejects.toMatchObject({ response: { code: 'PAYMENT_ALREADY_VOIDED' } });
      prisma.payment.findUnique.mockResolvedValue(
        payment({ invoice: validInvoice({ status: InvoiceStatus.VOIDED }) }),
      );
      await expect(
        service.voidPayment('pay-1', { reason: 'Thu nhầm' }, admin),
      ).rejects.toMatchObject({ response: { code: 'INVOICE_ALREADY_VOIDED' } });
    });
  });

  describe('refund', () => {
    const paid = () =>
      validInvoice({
        status: InvoiceStatus.PAID,
        paidAmount: D(500_000),
        outstandingAmount: D(0),
        version: 2,
      });

    it('records a REFUND row dated today without reopening the debt', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(paid());
      prisma.payment.count.mockResolvedValue(0);
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.create.mockResolvedValue({ id: 'ref-1', paidAt: new Date() });
      await service.refund(
        'inv-1',
        { amount: 200_000, method: PaymentMethod.CASH, reason: 'Hủy một răng trám', version: 2 },
        admin,
      );
      expect(prisma.invoice.updateMany.mock.calls[0][0].data).toMatchObject({
        paidAmount: D(300_000),
        refundedAmount: D(200_000),
        outstandingAmount: D(0),
        status: InvoiceStatus.PAID,
      });
      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'REFUND', amount: 200_000 }),
      });
      expect(events.emit).toHaveBeenCalledWith(
        INVOICE_REFUNDED_EVENT,
        expect.objectContaining({ paymentId: 'ref-1', amount: 200_000 }),
      );
    });

    it('cannot refund more than the clinic kept', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(paid());
      await expect(
        service.refund(
          'inv-1',
          { amount: 600_000, method: PaymentMethod.CASH, reason: 'Hoàn tiền', version: 2 },
          admin,
        ),
      ).rejects.toMatchObject({ response: { code: 'REFUND_EXCEEDS_PAID' } });
    });

    it('the collector cannot refund their own collection when someone else can', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(paid());
      prisma.payment.count.mockResolvedValue(1);
      prisma.user.count.mockResolvedValue(2);
      await expect(
        service.refund(
          'inv-1',
          { amount: 100_000, method: PaymentMethod.CASH, reason: 'Hoàn tiền', version: 2 },
          admin,
        ),
      ).rejects.toMatchObject({ response: { code: 'REFUND_SELF_FORBIDDEN' } });
    });

    it('the sole holder may refund their own collection: reason ≥ 10, INVOICE_SELF_REFUND', async () => {
      prisma.invoice.findUnique.mockResolvedValue(paid());
      prisma.payment.count.mockResolvedValue(1);
      prisma.user.count.mockResolvedValue(0);
      prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.create.mockResolvedValue({ id: 'ref-2', paidAt: new Date() });
      await expect(
        service.refund(
          'inv-1',
          { amount: 100_000, method: PaymentMethod.CASH, reason: 'Hoàn tiền', version: 2 },
          admin,
        ),
      ).rejects.toMatchObject({ response: { code: 'SELF_CORRECTION_REASON_REQUIRED' } });
      await service.refund(
        'inv-1',
        {
          amount: 100_000,
          method: PaymentMethod.CASH,
          reason: 'Khách hủy răng 26, hoàn tiền mặt tại quầy',
          version: 2,
        },
        admin,
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'INVOICE_SELF_REFUND' }),
        prisma,
      );
    });

    it('refuses on DRAFT', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(validInvoice());
      await expect(
        service.refund(
          'inv-1',
          { amount: 1, method: PaymentMethod.CASH, reason: 'Hoàn tiền', version: 0 },
          admin,
        ),
      ).rejects.toMatchObject({ response: { code: 'INVOICE_NOT_EDITABLE' } });
    });
  });

  describe('updateDiscount', () => {
    it('needs a reason above 0 and stores a rounded total', async () => {
      prisma.invoice.findUnique.mockResolvedValue(
        validInvoice({ subtotal: D(333_333), total: D(333_333) }),
      );
      await expect(
        service.updateDiscount(
          'inv-1',
          { discountType: 'PERCENT', discountValue: 15, version: 0 },
          admin,
        ),
      ).rejects.toThrow('Nhập lý do giảm giá');
      prisma.invoice.update.mockResolvedValue(validInvoice({ total: D(283_333) }));
      await service.updateDiscount(
        'inv-1',
        { discountType: 'PERCENT', discountValue: 15, reason: 'Người nhà nhân viên', version: 0 },
        admin,
      );
      expect(prisma.invoice.update.mock.calls[0][0].data.total).toEqual(D(283_333));
    });
  });

  describe('updateItem', () => {
    it('re-prices a DRAFT line, recomputes totals keeping the % discount, audits the reason', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        ...validInvoice({ discountType: 'PERCENT', discountValue: D(10) }),
        items: [item('a', 6_500_000), item('b', 200_000)],
      });
      prisma.invoice.update.mockResolvedValue(validInvoice());
      await service.updateItem(
        'inv-1',
        'a',
        { unitPrice: 650_000, reason: 'Bác sĩ gõ thừa số 0', version: 0 },
        admin,
      );
      expect(prisma.invoiceItem.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: expect.objectContaining({ unitPrice: D(650_000), lineTotal: D(650_000) }),
      });
      expect(prisma.invoice.update.mock.calls[0][0].data).toMatchObject({
        subtotal: D(850_000),
        total: D(765_000),
        outstandingAmount: D(765_000),
      });
      expect(prisma.invoiceAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ITEM_UPDATED',
          after: expect.objectContaining({ reason: 'Bác sĩ gõ thừa số 0' }),
        }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'INVOICE_ITEM_UPDATED' }),
        prisma,
      );
    });

    it('drops a line but never the last one; refuses once issued', async () => {
      prisma.invoice.findUnique.mockResolvedValue({
        ...validInvoice(),
        items: [item('a', 300_000), item('b', 200_000)],
      });
      prisma.invoice.update.mockResolvedValue(validInvoice());
      await service.updateItem(
        'inv-1',
        'b',
        { remove: true, reason: 'Không làm', version: 0 },
        admin,
      );
      expect(prisma.invoiceItem.update).toHaveBeenCalledWith({
        where: { id: 'b' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.invoice.update.mock.calls[0][0].data.subtotal).toEqual(D(300_000));

      prisma.invoice.findUnique.mockResolvedValue({ ...validInvoice(), items: [item('a', 1)] });
      await expect(
        service.updateItem('inv-1', 'a', { remove: true, reason: 'Không làm', version: 0 }, admin),
      ).rejects.toMatchObject({ response: { code: 'INVOICE_LAST_ITEM' } });

      prisma.invoice.findUnique.mockResolvedValue({
        ...validInvoice({ status: InvoiceStatus.ISSUED }),
        items: [item('a', 1)],
      });
      await expect(
        service.updateItem('inv-1', 'a', { unitPrice: 2, reason: 'Sửa giá', version: 0 }, admin),
      ).rejects.toMatchObject({ response: { code: 'INVOICE_NOT_EDITABLE' } });
    });
  });

  describe('drafts, re-issue and backfill', () => {
    const treatments = [
      {
        id: 'tr-1',
        procedure: 'Trám',
        description: null,
        unitPrice: D(300_000),
        quantity: 2,
        sequence: 0,
      },
    ];

    it('makes no invoice for an encounter without treatments (A5-17)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      expect(await service.createDraftFromEncounter('enc-1', [])).toBeNull();
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('never silently re-creates a voided invoice from the close event', async () => {
      prisma.invoice.findFirst
        .mockResolvedValueOnce(null) // no active invoice
        .mockResolvedValueOnce({ id: 'old' }); // a voided one
      expect(
        await service.createDraftFromEncounter('enc-1', [
          { treatmentId: 't', procedure: 'x', description: null, unitPrice: 1 },
        ]),
      ).toBeNull();
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('re-issues a voided invoice from the treatments, linked to it', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(
        validInvoice({ status: InvoiceStatus.VOIDED }),
      );
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.treatment.findMany.mockResolvedValue(treatments);
      prisma.encounter.findUnique.mockResolvedValue({
        id: 'enc-1',
        patientId: 'patient-1',
        dentistId: 'dentist-1',
      });
      prisma.invoice.create.mockResolvedValue(
        validInvoice({ id: 'inv-2', code: 'INV-2026-000007' }),
      );
      await service.reissue('inv-1', { reason: 'Phát hành nhầm giá' }, admin);
      expect(prisma.invoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          encounterId: 'enc-1',
          replacesInvoiceId: 'inv-1',
          createdBy: 'admin-1',
          subtotal: D(600_000),
        }),
      });
      expect(prisma.invoiceAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'REISSUED' }),
      });
    });

    it('re-issue is idempotent and only for voided invoices', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(
        validInvoice({ status: InvoiceStatus.VOIDED }),
      );
      prisma.invoice.findFirst.mockResolvedValueOnce({ id: 'inv-2' });
      await service.reissue('inv-1', { reason: 'Lập lại hóa đơn' }, admin);
      expect(prisma.invoice.create).not.toHaveBeenCalled();

      prisma.invoice.findUnique.mockResolvedValueOnce(
        validInvoice({ status: InvoiceStatus.ISSUED }),
      );
      await expect(
        service.reissue('inv-1', { reason: 'Lập lại hóa đơn' }, admin),
      ).rejects.toMatchObject({ response: { code: 'INVOICE_NOT_VOIDED' } });
    });

    it('"tạo bù" returns the existing invoice, sends a voided one to re-issue', async () => {
      prisma.invoice.findFirst.mockResolvedValueOnce({ id: 'inv-1' });
      const r = await service.createFromEncounter('enc-1', admin);
      expect(r.created).toBe(false);

      prisma.invoice.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'old', code: 'INV-2026-000001' });
      prisma.encounter.findUnique.mockResolvedValue({
        id: 'enc-1',
        status: EncounterStatus.COMPLETED,
      });
      await expect(service.createFromEncounter('enc-1', admin)).rejects.toMatchObject({
        response: { code: 'INVOICE_REISSUE_REQUIRED' },
      });

      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.encounter.findUnique.mockResolvedValue({
        id: 'enc-1',
        status: EncounterStatus.IN_PROGRESS,
      });
      await expect(service.createFromEncounter('enc-1', admin)).rejects.toMatchObject({
        response: { code: 'ENCOUNTER_NOT_COMPLETED' },
      });
    });

    it('a lost race on the partial unique index returns the winner', async () => {
      prisma.invoice.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'winner' });
      prisma.encounter.findUnique.mockResolvedValue({ id: 'enc-1', patientId: 'p' });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        if (typeof cb !== 'function') return Promise.all(cb);
        if (cb.toString().includes('invoiceItem')) {
          throw new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'x',
          });
        }
        return cb(prisma);
      });
      const r = await service.createDraftFromEncounter('enc-1', [
        { treatmentId: 't', procedure: 'x', description: null, unitPrice: 1 },
      ]);
      expect(r).toEqual({ id: 'winner' });
    });

    it('backfill drafts encounters closed without any invoice, in a fixed window', async () => {
      const now = new Date('2026-10-01T05:00:00Z');
      prisma.encounter.findMany.mockResolvedValue([{ id: 'enc-9' }]);
      prisma.encounter.count.mockResolvedValue(2);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.treatment.findMany.mockResolvedValue(treatments);
      prisma.encounter.findUnique.mockResolvedValue({ id: 'enc-9', patientId: 'p' });
      prisma.invoice.create.mockResolvedValue(validInvoice({ id: 'inv-9' }));
      const r = await service.backfillMissingInvoices(now);
      expect(r).toEqual({ checked: 1, created: 1, voidedWithoutReplacement: 2 });
      expect(prisma.encounter.findMany.mock.calls[0][0].where).toMatchObject({
        status: EncounterStatus.COMPLETED,
        closedAt: {
          lte: new Date('2026-10-01T04:50:00Z'),
          gte: new Date('2026-09-01T05:00:00Z'),
        },
        invoices: { none: {} },
      });
    });

    it('the cron never throws', async () => {
      const billing = { backfillMissingInvoices: jest.fn().mockRejectedValue(new Error('db')) };
      await expect(
        new BillingCron(billing as unknown as BillingService).reconcileClosedEncounters(),
      ).resolves.toBeUndefined();
    });
  });
});
