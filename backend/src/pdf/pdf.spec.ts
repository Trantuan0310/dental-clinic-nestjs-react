import { renderInvoicePdf } from './invoice-pdf';
import { renderPayslipPdf, renderPayslipsPdf, PayslipPdfData } from './payslip-pdf';
import { vnd } from './pdf-document';

const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

const slip: PayslipPdfData = {
  dentistName: 'BS. Nguyễn Minh Khoa',
  dentistEmail: 'bs@x.vn',
  periodStart: '2026-09-01T00:00:00Z',
  periodEnd: '2026-09-30T00:00:00Z',
  periodStatus: 'PAID',
  paidAt: '2026-10-05T03:00:00Z',
  encountersCount: 2,
  workedShifts: 20,
  totalHours: 160,
  overtimeHours: 4,
  baseSalaryVnd: 10_000_000,
  commissionVnd: 3_500_000,
  overtimePayVnd: 400_000,
  bonusVnd: 500_000,
  penaltyVnd: 0,
  grossPayVnd: 14_400_000,
  taxTncnVnd: 300_000,
  bhxhVnd: 1_050_000,
  netPayVnd: 13_050_000,
  adjustments: [{ type: 'BONUS', amountVnd: 500_000, reason: 'Thưởng chuyên cần' }],
  encounters: [
    {
      at: '2026-09-02T03:00:00Z',
      patientCode: 'BN-1',
      patientName: 'Trần Thị Ánh',
      revenueVnd: 1_200_000,
    },
  ],
};

describe('PDF documents', () => {
  it('formats đồng the way the screens do', () => {
    expect(vnd(1_250_000)).toBe('1.250.000 ₫');
    expect(vnd(-50_000)).toBe('-50.000 ₫');
  });

  it('renders an invoice with Vietnamese text', async () => {
    const pdf = await renderInvoicePdf({
      code: 'INV-2026-00042',
      status: 'PARTIAL',
      createdAt: '2026-10-01T03:00:00Z',
      issuedAt: '2026-10-01T04:00:00Z',
      patientCode: 'BN-1',
      patientName: 'Trần Thị Ánh',
      dentistName: 'BS. Nguyễn Minh Khoa',
      subtotal: 1_500_000,
      discountType: 'PERCENT',
      discountValue: 10,
      total: 1_350_000,
      paidAmount: 1_000_000,
      outstandingAmount: 350_000,
      items: [
        {
          description: 'Trám răng composite (răng 16)',
          quantity: 2,
          unitPrice: 500_000,
          lineTotal: 1_000_000,
        },
        { description: 'Cạo vôi + đánh bóng', quantity: 1, unitPrice: 500_000, lineTotal: 500_000 },
      ],
      payments: [
        {
          amount: 1_000_000,
          method: 'CASH',
          kind: 'PAYMENT',
          status: 'COMPLETED',
          paidAt: '2026-10-01T04:10:00Z',
        },
        {
          amount: 200_000,
          method: 'CASH',
          kind: 'PAYMENT',
          status: 'VOIDED',
          paidAt: '2026-10-01T04:05:00Z',
        },
      ],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(pdf)).toBe(1);
    // The embedded font is a subset of DejaVu Sans.
    expect(pdf.toString('latin1')).toContain('DejaVuSans');
  });

  it('breaks a long invoice across pages', async () => {
    const items = Array.from({ length: 80 }, (_, i) => ({
      description: `Thủ thuật ${i + 1}`,
      quantity: 1,
      unitPrice: 100_000,
      lineTotal: 100_000,
    }));
    const pdf = await renderInvoicePdf({
      code: 'INV-1',
      status: 'ISSUED',
      createdAt: new Date(),
      subtotal: 8_000_000,
      total: 8_000_000,
      paidAmount: 0,
      outstandingAmount: 8_000_000,
      items,
      payments: [],
    });
    expect(pages(pdf)).toBeGreaterThan(1);
  });

  it('renders one payslip, and a period with one page per payslip', async () => {
    expect(pages(await renderPayslipPdf(slip))).toBe(1);
    expect(pages(await renderPayslipsPdf([slip, slip, slip]))).toBe(3);
  });
});
