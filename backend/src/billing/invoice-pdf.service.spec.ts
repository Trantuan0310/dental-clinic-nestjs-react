import { InvoicePdfService } from './invoice-pdf.service';

const actor = { sub: 'desk-1', email: 'lt@x', permissions: ['invoice.read.any'] };
const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  code: 'INV-2026-000001',
  status: 'PAID',
  patientId: 'p1',
  patientName: 'Nguyễn An',
  patientCode: 'BN-1',
  createdAt: new Date('2026-10-01T03:00:00Z'),
  issuedAt: new Date('2026-10-01T03:00:00Z'),
  subtotal: 500_000,
  total: 500_000,
  paidAmount: 500_000,
  refundedAmount: 0,
  outstandingAmount: 0,
  items: [{ description: 'Cạo vôi', quantity: 1, unitPrice: 500_000, lineTotal: 500_000 }],
  payments: [],
  adjustments: [],
  encounter: { dentist: { fullName: 'BS Khoa' } },
  ...over,
});

function setup(inv = invoice(), email: string | null = 'an@x.vn', sent = true) {
  const billing = { getInvoiceById: jest.fn().mockResolvedValue(inv) };
  const prisma = { patient: { findUnique: jest.fn().mockResolvedValue({ email }) } };
  const audit = { log: jest.fn() };
  const mail = { send: jest.fn().mockResolvedValue(sent) };
  const service = new InvoicePdfService(billing as any, prisma as any, audit as any, mail as any);
  return { service, billing, audit, mail };
}

describe('InvoicePdfService', () => {
  it('reads the invoice with the caller (dentist row scope applies) and names the file by code', async () => {
    const { service, billing } = setup();
    const file = await service.pdf('inv-1', actor as any);
    expect(billing.getInvoiceById).toHaveBeenCalledWith('inv-1', actor);
    expect(file.filename).toBe('INV-2026-000001.pdf');
    expect(file.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it("emails the PDF to the patient's email and logs it", async () => {
    const { service, mail, audit } = setup();
    await expect(service.emailToPatient('inv-1', actor as any)).resolves.toEqual({
      sent: true,
      to: 'an@x.vn',
    });
    const msg = mail.send.mock.calls[0][0];
    expect(msg.to).toBe('an@x.vn');
    expect(msg.attachments[0]).toMatchObject({
      filename: 'INV-2026-000001.pdf',
      contentType: 'application/pdf',
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'INVOICE_EMAILED' }));
  });

  it('does not send a draft or a voided invoice', async () => {
    for (const status of ['DRAFT', 'VOIDED']) {
      const { service, mail } = setup(invoice({ status }));
      await expect(service.emailToPatient('inv-1', actor as any)).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'INVOICE_NOT_SENDABLE' }),
      });
      expect(mail.send).not.toHaveBeenCalled();
    }
  });

  it('says so when the patient has no email, or the mail server did not take it', async () => {
    await expect(
      setup(invoice(), null).service.emailToPatient('inv-1', actor as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'PATIENT_NO_EMAIL' }),
    });
    const failing = setup(invoice(), 'an@x.vn', false);
    await expect(failing.service.emailToPatient('inv-1', actor as any)).rejects.toMatchObject({
      response: expect.objectContaining({ error: 'EMAIL_NOT_SENT' }),
    });
    expect(failing.audit.log).not.toHaveBeenCalled();
  });
});
