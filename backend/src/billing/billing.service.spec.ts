import { Test } from '@nestjs/testing';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ExpenseService } from '../expense/expense.service';
import { createPrismaMock, PrismaMockShape } from '../../test/helpers/prisma-mock';
import { validInvoice, validEncounter, adminPayload } from '../../test/helpers';
import {
  InvoiceNotFoundException,
  InvoiceNotEditableException,
  PaymentExceedsOutstandingException,
  InvoiceDiscountInvalidException,
} from './domain/exceptions';

describe('BillingService', () => {
  let service: BillingService;
  let prisma: PrismaMockShape;
  let audit: { log: jest.Mock };
  const adminActor = adminPayload();

  beforeEach(async () => {
    prisma = createPrismaMock();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ nextval: 1n }]);

    const mockExpenseService = {
      aggregateApproved: jest.fn().mockResolvedValue(0),
    };

    const module = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: ExpenseService, useValue: mockExpenseService },
      ],
    }).compile();

    service = module.get(BillingService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createDraftFromEncounter', () => {
    it('returns existing invoice if already created (idempotent)', async () => {
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(validInvoice());
      const result = await service.createDraftFromEncounter('enc-1', [
        { treatmentId: 'tr-1', procedure: 'D1110', description: 'Cleaning', unitPrice: 500_000 },
      ]);
      expect(result).toBeDefined();
    });

    it('creates new draft invoice with line items', async () => {
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.encounter.findUnique as jest.Mock).mockResolvedValue(
        validEncounter({ patientId: 'patient-1', dentistId: 'dentist-1' }),
      );
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.create as jest.Mock).mockResolvedValue(validInvoice());

      const result = await service.createDraftFromEncounter('enc-1', [
        { treatmentId: 'tr-1', procedure: 'D1110', description: 'Cleaning', unitPrice: 500_000 },
      ]);

      expect(result).toBeDefined();
      expect(prisma.invoiceItem.create).toHaveBeenCalled();
    });
  });

  describe('recordPayment', () => {
    it('throws when invoice not found', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.recordPayment(
          'inv-1',
          { amount: 100_000, method: PaymentMethod.CASH } as any,
          adminActor,
        ),
      ).rejects.toThrow(InvoiceNotFoundException);
    });

    it('rejects payment when invoice is DRAFT (must issue first)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(
        validInvoice({ status: InvoiceStatus.DRAFT }),
      );
      await expect(
        service.recordPayment(
          'inv-1',
          { amount: 100_000, method: PaymentMethod.CASH } as any,
          adminActor,
        ),
      ).rejects.toThrow(InvoiceNotEditableException);
    });

    it('rejects payment when invoice is VOIDED', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(
        validInvoice({ status: InvoiceStatus.VOIDED }),
      );
      await expect(
        service.recordPayment(
          'inv-1',
          { amount: 100_000, method: PaymentMethod.CASH } as any,
          adminActor,
        ),
      ).rejects.toThrow(InvoiceNotEditableException);
    });

    it('rejects over-payment', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(
        validInvoice({
          status: InvoiceStatus.ISSUED,
          outstandingAmount: new Prisma.Decimal(200_000),
          paidAmount: new Prisma.Decimal(300_000),
        }),
      );
      await expect(
        service.recordPayment(
          'inv-1',
          { amount: 500_000, method: PaymentMethod.CASH } as any,
          adminActor,
        ),
      ).rejects.toThrow(PaymentExceedsOutstandingException);
    });

    it('uses guarded updateMany with version + outstanding check (R2-9)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock)
        .mockResolvedValueOnce(
          validInvoice({
            status: InvoiceStatus.ISSUED,
            outstandingAmount: new Prisma.Decimal(500_000),
            paidAmount: new Prisma.Decimal(0),
            version: 1,
          }),
        )
        .mockResolvedValueOnce(validInvoice({ status: InvoiceStatus.PARTIAL }));
      (prisma.invoice.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.payment.create as jest.Mock).mockResolvedValue({ id: 'pay-1' });

      await service.recordPayment(
        'inv-1',
        { amount: 200_000, method: PaymentMethod.CASH } as any,
        adminActor,
      );

      expect(prisma.invoice.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'inv-1',
            outstandingAmount: { gte: 200_000 },
            version: 1,
          }),
          data: expect.objectContaining({
            paidAmount: expect.any(Prisma.Decimal),
            outstandingAmount: expect.any(Prisma.Decimal),
            version: { increment: 1 },
          }),
        }),
      );
    });

    it('throws PaymentExceedsOutstanding when guarded update returns count=0 (concurrent payment)', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock)
        .mockResolvedValueOnce(
          validInvoice({
            status: InvoiceStatus.ISSUED,
            outstandingAmount: new Prisma.Decimal(500_000),
            paidAmount: new Prisma.Decimal(0),
            version: 1,
          }),
        )
        .mockResolvedValueOnce({ outstandingAmount: new Prisma.Decimal(100_000) });
      (prisma.invoice.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.recordPayment(
          'inv-1',
          { amount: 200_000, method: PaymentMethod.CASH } as any,
          adminActor,
        ),
      ).rejects.toThrow(PaymentExceedsOutstandingException);
    });
  });

  describe('updateDiscount', () => {
    it('throws version mismatch on optimistic lock', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(validInvoice({ version: 5 }));
      await expect(
        service.updateDiscount(
          'inv-1',
          { version: 3, discountType: 'AMOUNT', discountValue: 50_000 } as any,
          adminActor,
        ),
      ).rejects.toThrow(/version/i);
    });

    it('rejects percent > 100', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(validInvoice());

      await expect(
        service.updateDiscount(
          'inv-1',
          { version: 0, discountType: 'PERCENT', discountValue: 150 } as any,
          adminActor,
        ),
      ).rejects.toThrow(InvoiceDiscountInvalidException);
    });

    it('rejects when invoice not in DRAFT', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(
        validInvoice({ status: InvoiceStatus.ISSUED }),
      );
      await expect(
        service.updateDiscount(
          'inv-1',
          { version: 0, discountType: 'AMOUNT', discountValue: 50_000 } as any,
          adminActor,
        ),
      ).rejects.toThrow(InvoiceNotEditableException);
    });
  });

  describe('issue', () => {
    it('transitions DRAFT → ISSUED, writes audit', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(validInvoice());
      (prisma.invoice.update as jest.Mock).mockResolvedValue(
        validInvoice({ status: InvoiceStatus.ISSUED, issuedAt: new Date() }),
      );

      const result = await service.issue('inv-1', { version: 0 } as any, adminActor);
      expect(result.status).toBe(InvoiceStatus.ISSUED);
    });

    it('rejects when not DRAFT', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(
        validInvoice({ status: InvoiceStatus.ISSUED, version: 0 }),
      );
      await expect(service.issue('inv-1', { version: 0 } as any, adminActor)).rejects.toThrow(
        InvoiceNotEditableException,
      );
    });
  });

  describe('voidInvoice', () => {
    it('voids ISSUED invoice and records reason', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(prisma));
      (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(
        validInvoice({
          status: InvoiceStatus.ISSUED,
          version: 0,
          paidAmount: new Prisma.Decimal(0),
        }),
      );
      (prisma.invoice.update as jest.Mock).mockResolvedValue(
        validInvoice({ status: InvoiceStatus.VOIDED, voidedAt: new Date() }),
      );

      await service.voidInvoice(
        'inv-1',
        { version: 0, reason: 'patient dispute' } as any,
        adminActor,
      );

      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: InvoiceStatus.VOIDED,
            voidReason: 'patient dispute',
          }),
        }),
      );
    });
  });
});
