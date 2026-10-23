import {
  CONTENT_WIDTH,
  clinicDate,
  clinicHeader,
  createPdf,
  fields,
  FONT,
  pdfBuffer,
  Pdf,
  signatures,
  table,
  title,
  totals,
  vnd,
  minusVnd,
} from './pdf-document';

/** What a payslip PDF shows (a payroll line item with its details). */
export interface PayslipPdfData {
  dentistName: string;
  dentistEmail?: string | null;
  periodStart: Date | string;
  periodEnd: Date | string;
  periodStatus: string;
  paidAt?: Date | string | null;
  encountersCount: number;
  workedShifts: number;
  totalHours: number;
  overtimeHours: number;
  baseSalaryVnd: number;
  commissionVnd: number;
  overtimePayVnd: number;
  bonusVnd: number;
  penaltyVnd: number;
  grossPayVnd: number;
  taxTncnVnd: number;
  bhxhVnd: number;
  netPayVnd: number;
  adjustments: Array<{ type: string; amountVnd: number; reason: string }>;
  encounters: Array<{
    at: Date | string;
    patientCode?: string | null;
    patientName?: string | null;
    revenueVnd: number;
  }>;
}

const STATUS: Record<string, string> = {
  DRAFT: 'Nháp (chưa duyệt)',
  REVIEWING: 'Đang xem xét (chưa duyệt)',
  APPROVED: 'Đã duyệt',
  PAID: 'Đã trả lương',
  LOCKED: 'Đã khoá',
};
const ADJUSTMENT: Record<string, string> = {
  BONUS: 'Thưởng',
  PENALTY: 'Phạt',
  DEDUCTION: 'Khấu trừ',
  MANUAL_OVERRIDE: 'Điều chỉnh',
};

/** One payslip as its own PDF. */
export function renderPayslipPdf(p: PayslipPdfData): Promise<Buffer> {
  const doc = createPdf(`Phiếu lương ${p.dentistName}`);
  drawPayslip(doc, p);
  return pdfBuffer(doc);
}

/** Every payslip of a period in one PDF, one per page. */
export function renderPayslipsPdf(slips: PayslipPdfData[]): Promise<Buffer> {
  const doc = createPdf('Phiếu lương kỳ');
  slips.forEach((p, i) => {
    if (i > 0) doc.addPage();
    drawPayslip(doc, p);
  });
  return pdfBuffer(doc);
}

function drawPayslip(doc: Pdf, p: PayslipPdfData) {
  clinicHeader(doc);
  title(doc, 'PHIẾU LƯƠNG', `Kỳ lương ${clinicDate(p.periodStart)} – ${clinicDate(p.periodEnd)}`);
  fields(doc, [
    ['Nhân viên', p.dentistName],
    ...(p.dentistEmail ? ([['Email', p.dentistEmail]] as Array<[string, string]>) : []),
    ['Trạng thái kỳ', STATUS[p.periodStatus] ?? p.periodStatus],
    ...(p.paidAt ? ([['Ngày trả', clinicDate(p.paidAt)]] as Array<[string, string]>) : []),
    [
      'Công việc',
      `${p.encountersCount} lượt khám • ${p.workedShifts} ca • ${num(p.totalHours)} giờ` +
        (p.overtimeHours > 0 ? ` (${num(p.overtimeHours)} giờ ngoài giờ)` : ''),
    ],
  ]);

  doc.font(FONT).fontSize(11).text('Thu nhập', { underline: true }).moveDown(0.3);
  totals(doc, [
    ['Lương cơ bản', vnd(p.baseSalaryVnd)],
    ['Hoa hồng', vnd(p.commissionVnd)],
    ['Làm ngoài giờ', vnd(p.overtimePayVnd)],
    ['Thưởng', vnd(p.bonusVnd)],
    ['Tổng thu nhập', vnd(p.grossPayVnd), true],
  ]);
  doc.font(FONT).fontSize(11).text('Khấu trừ', { underline: true }).moveDown(0.3);
  totals(doc, [
    ['Thuế TNCN', minusVnd(p.taxTncnVnd)],
    ['Bảo hiểm (BHXH)', minusVnd(p.bhxhVnd)],
    ['Phạt / khấu trừ khác', minusVnd(p.penaltyVnd)],
    ['THỰC LĨNH', vnd(p.netPayVnd), true],
  ]);

  if (p.adjustments.length > 0) {
    doc.font(FONT).fontSize(11).text('Điều chỉnh', { underline: true }).moveDown(0.3);
    table(
      doc,
      [
        { header: 'Loại', width: 90 },
        { header: 'Lý do', width: CONTENT_WIDTH - 90 - 120 },
        { header: 'Số tiền', width: 120, align: 'right' },
      ],
      p.adjustments.map(a => [ADJUSTMENT[a.type] ?? a.type, a.reason, vnd(a.amountVnd)]),
    );
  }
  if (p.encounters.length > 0) {
    doc.font(FONT).fontSize(11).text('Doanh thu tính hoa hồng', { underline: true }).moveDown(0.3);
    table(
      doc,
      [
        { header: 'Ngày khám', width: 90 },
        { header: 'Bệnh nhân', width: CONTENT_WIDTH - 90 - 120 },
        { header: 'Doanh thu', width: 120, align: 'right' },
      ],
      p.encounters.map(e => [
        clinicDate(e.at),
        `${e.patientName ?? ''}${e.patientCode ? ` (${e.patientCode})` : ''}`,
        vnd(e.revenueVnd),
      ]),
    );
  }
  signatures(doc, 'Người nhận', 'Người lập');
}

const num = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
