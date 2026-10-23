import {
  CONTENT_WIDTH,
  clinicDate,
  clinicHeader,
  createPdf,
  fields,
  FONT,
  pdfBuffer,
  signatures,
  table,
  title,
  totals,
  vnd,
} from './pdf-document';

/** What an invoice PDF shows (BillingService.getInvoiceById, flattened). */
export interface InvoicePdfData {
  code: string;
  status: string;
  createdAt: Date | string;
  issuedAt?: Date | string | null;
  voidedAt?: Date | string | null;
  voidReason?: string | null;
  patientCode?: string | null;
  patientName?: string | null;
  dentistName?: string | null;
  notes?: string | null;
  subtotal: number;
  discountType?: string | null;
  discountValue?: number | null;
  total: number;
  paidAmount: number;
  refundedAmount?: number;
  adjustedAmount?: number;
  outstandingAmount: number;
  items: Array<{ description: string; quantity: number; unitPrice: number; lineTotal: number }>;
  payments: Array<{
    amount: number;
    method: string;
    kind: string;
    status: string;
    paidAt: Date | string;
    note?: string | null;
  }>;
  adjustments?: Array<{ amount: number; reason: string; adjustedAt: Date | string }>;
}

const STATUS: Record<string, string> = {
  DRAFT: 'Nháp (chưa phát hành)',
  ISSUED: 'Đã phát hành, chưa thanh toán',
  PARTIAL: 'Thanh toán một phần',
  PAID: 'Đã thanh toán đủ',
  VOIDED: 'Đã huỷ',
};
const METHOD: Record<string, string> = { CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản' };

export function renderInvoicePdf(inv: InvoicePdfData): Promise<Buffer> {
  const doc = createPdf(`Hoá đơn ${inv.code}`);
  clinicHeader(doc);
  title(doc, 'HOÁ ĐƠN DỊCH VỤ NHA KHOA', `Số: ${inv.code}`);
  fields(doc, [
    ['Bệnh nhân', `${inv.patientName ?? ''}${inv.patientCode ? ` (${inv.patientCode})` : ''}`],
    ['Bác sĩ điều trị', inv.dentistName ?? ''],
    ['Ngày lập', clinicDate(inv.issuedAt ?? inv.createdAt)],
    ['Trạng thái', STATUS[inv.status] ?? inv.status],
    ...(inv.status === 'VOIDED' && inv.voidReason
      ? ([['Lý do huỷ', `${inv.voidReason} (${clinicDate(inv.voidedAt)})`]] as Array<
          [string, string]
        >)
      : []),
  ]);

  table(
    doc,
    [
      { header: '#', width: 28, align: 'center' },
      { header: 'Dịch vụ / thủ thuật', width: CONTENT_WIDTH - 28 - 40 - 100 - 110 },
      { header: 'SL', width: 40, align: 'right' },
      { header: 'Đơn giá', width: 100, align: 'right' },
      { header: 'Thành tiền', width: 110, align: 'right' },
    ],
    inv.items.map((it, i) => [
      String(i + 1),
      it.description,
      String(it.quantity),
      vnd(it.unitPrice),
      vnd(it.lineTotal),
    ]),
  );

  const discount = inv.subtotal - inv.total;
  totals(doc, [
    ['Cộng tiền dịch vụ', vnd(inv.subtotal)],
    ...(discount > 0
      ? ([
          [
            inv.discountType === 'PERCENT' && inv.discountValue
              ? `Giảm giá (${inv.discountValue}%)`
              : 'Giảm giá',
            '-' + vnd(discount),
          ],
        ] as Array<[string, string]>)
      : []),
    ['Tổng thanh toán', vnd(inv.total), true],
    ...((inv.adjustedAmount ?? 0) > 0
      ? ([['Điều chỉnh giảm sau phát hành', '-' + vnd(inv.adjustedAmount!)]] as Array<
          [string, string]
        >)
      : []),
    ['Đã thanh toán', vnd(inv.paidAmount)],
    ...((inv.refundedAmount ?? 0) > 0
      ? ([['Đã hoàn lại', '-' + vnd(inv.refundedAmount!)]] as Array<[string, string]>)
      : []),
    ['Còn phải trả', vnd(inv.outstandingAmount), true],
  ]);

  const payments = inv.payments.filter(p => p.status !== 'VOIDED');
  if (payments.length > 0) {
    doc.font(FONT).fontSize(11).text('Các lần thanh toán', { underline: true }).moveDown(0.3);
    table(
      doc,
      [
        { header: 'Thời gian', width: 120 },
        { header: 'Loại', width: 90 },
        { header: 'Hình thức', width: 100 },
        { header: 'Ghi chú', width: CONTENT_WIDTH - 120 - 90 - 100 - 110 },
        { header: 'Số tiền', width: 110, align: 'right' },
      ],
      payments.map(p => [
        clinicDate(p.paidAt, true),
        p.kind === 'REFUND' ? 'Hoàn tiền' : 'Thanh toán',
        METHOD[p.method] ?? p.method,
        p.note ?? '',
        (p.kind === 'REFUND' ? '-' : '') + vnd(p.amount),
      ]),
    );
  }
  if (inv.adjustments?.length) {
    doc.font(FONT).fontSize(11).text('Điều chỉnh sau phát hành', { underline: true }).moveDown(0.3);
    table(
      doc,
      [
        { header: 'Ngày', width: 100 },
        { header: 'Lý do', width: CONTENT_WIDTH - 100 - 110 },
        { header: 'Số tiền', width: 110, align: 'right' },
      ],
      inv.adjustments.map(a => [clinicDate(a.adjustedAt), a.reason, '-' + vnd(a.amount)]),
    );
  }
  if (inv.notes) doc.font(FONT).fontSize(9).text(`Ghi chú: ${inv.notes}`).moveDown(0.5);
  signatures(doc, 'Khách hàng', 'Người lập phiếu');
  return pdfBuffer(doc);
}
