import { join } from 'path';
import PDFDocument = require('pdfkit');

/**
 * Server-side PDFs (invoices, payslips). pdfkit draws text with an embedded
 * font: DejaVu Sans covers Vietnamese and ships next to this file (copied
 * into dist by nest-cli.json "assets").
 */
const FONT_DIR = join(__dirname, 'fonts');
export const FONT = 'Body';
export const FONT_BOLD = 'Bold';

export const PAGE_MARGIN = 48;
const A4_WIDTH = 595.28;
export const CONTENT_WIDTH = A4_WIDTH - PAGE_MARGIN * 2;

export type Pdf = PDFKit.PDFDocument;

export function createPdf(title: string): Pdf {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    info: { Title: title, Producer: 'GENSMILE' },
    bufferPages: true,
  });
  doc.registerFont(FONT, join(FONT_DIR, 'DejaVuSans.ttf'));
  doc.registerFont(FONT_BOLD, join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
  doc.font(FONT).fontSize(10);
  return doc;
}

/** Ends the document and resolves with its bytes. */
export function pdfBuffer(doc: Pdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    addPageNumbers(doc);
    doc.end();
  });
}

/** A deduction: "-50.000 ₫", or "0 ₫" when there is none. */
export function minusVnd(amount: number): string {
  return amount > 0 ? '-' + vnd(amount) : vnd(0);
}

/** "1.250.000 ₫" — the format the screens use. */
export function vnd(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return sign + Math.round(Math.abs(amount)).toLocaleString('vi-VN') + ' ₫';
}

/** The clinic's name, address and phone from the same env as patient emails. */
export function clinicHeader(doc: Pdf, env: NodeJS.ProcessEnv = process.env) {
  const name = env.CLINIC_NAME?.trim() || 'Phòng khám nha khoa';
  const lines = [
    env.CLINIC_ADDRESS?.trim(),
    env.CLINIC_PHONE?.trim() && 'ĐT: ' + env.CLINIC_PHONE.trim(),
  ]
    .filter(Boolean)
    .join(' • ');
  doc.font(FONT_BOLD).fontSize(14).text(name.toUpperCase(), { align: 'center' });
  if (lines) doc.font(FONT).fontSize(9).fillColor('#444').text(lines, { align: 'center' });
  doc.fillColor('black').moveDown(0.8);
}

export function title(doc: Pdf, text: string, subtitle?: string) {
  doc.font(FONT_BOLD).fontSize(16).text(text, { align: 'center' });
  if (subtitle) doc.font(FONT).fontSize(10).fillColor('#444').text(subtitle, { align: 'center' });
  doc.fillColor('black').moveDown(0.8);
}

/** "Label: value" lines, two columns. */
export function fields(doc: Pdf, rows: Array<[string, string]>) {
  doc.fontSize(10);
  for (const [label, value] of rows) {
    const y = doc.y;
    doc.font(FONT).fillColor('#555').text(label, PAGE_MARGIN, y, { width: 130 });
    doc
      .font(FONT)
      .fillColor('black')
      .text(value, PAGE_MARGIN + 130, y, { width: CONTENT_WIDTH - 130 });
    doc.moveDown(0.2);
  }
  doc.x = PAGE_MARGIN;
  doc.moveDown(0.5);
}

export interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

/** A table that breaks across pages, repeating its header. */
export function table(doc: Pdf, columns: Column[], rows: string[][]) {
  const drawRow = (cells: string[], bold: boolean) => {
    doc.font(bold ? FONT_BOLD : FONT).fontSize(9);
    const heights = cells.map((c, i) => doc.heightOfString(c, { width: columns[i].width - 8 }));
    const h = Math.max(...heights) + 8;
    if (doc.y + h > doc.page.height - PAGE_MARGIN - 20) {
      doc.addPage();
      if (!bold)
        drawRow(
          columns.map(c => c.header),
          true,
        );
    }
    const y = doc.y;
    let x = PAGE_MARGIN;
    if (bold) doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, h).fill('#f0f0f0').fillColor('black');
    cells.forEach((c, i) => {
      doc.text(c, x + 4, y + 4, { width: columns[i].width - 8, align: columns[i].align ?? 'left' });
      x += columns[i].width;
    });
    doc
      .moveTo(PAGE_MARGIN, y + h)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + h)
      .strokeColor('#ddd')
      .stroke();
    doc.x = PAGE_MARGIN;
    doc.y = y + h;
  };
  drawRow(
    columns.map(c => c.header),
    true,
  );
  for (const r of rows) drawRow(r, false);
  doc.moveDown(0.6);
}

/** Right-aligned "label  amount" lines under a table. */
export function totals(doc: Pdf, rows: Array<[string, string, boolean?]>) {
  for (const [label, value, bold] of rows) {
    const y = doc.y;
    doc.font(bold ? FONT_BOLD : FONT).fontSize(bold ? 11 : 10);
    doc.text(label, PAGE_MARGIN, y, { width: CONTENT_WIDTH - 130, align: 'right' });
    doc.text(value, PAGE_MARGIN + CONTENT_WIDTH - 125, y, { width: 125, align: 'right' });
    doc.moveDown(0.25);
  }
  doc.x = PAGE_MARGIN;
  doc.moveDown(0.6);
}

/** Two signature boxes side by side. */
export function signatures(doc: Pdf, left: string, right: string) {
  if (doc.y > doc.page.height - PAGE_MARGIN - 90) doc.addPage();
  doc.moveDown(1.5);
  const y = doc.y;
  const half = CONTENT_WIDTH / 2;
  doc.font(FONT_BOLD).fontSize(10);
  doc.text(left, PAGE_MARGIN, y, { width: half, align: 'center' });
  doc.text(right, PAGE_MARGIN + half, y, { width: half, align: 'center' });
  doc.font(FONT).fontSize(8).fillColor('#666');
  doc.text('(Ký, ghi rõ họ tên)', PAGE_MARGIN, y + 14, { width: half, align: 'center' });
  doc.text('(Ký, ghi rõ họ tên)', PAGE_MARGIN + half, y + 14, { width: half, align: 'center' });
  doc.fillColor('black');
  doc.x = PAGE_MARGIN;
}

/** "dd/MM/yyyy" and "dd/MM/yyyy HH:mm" at the clinic (UTC+7). */
export function clinicDate(at: Date | string | null | undefined, withTime = false): string {
  if (!at) return '';
  const d = new Date(new Date(at).getTime() + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return withTime ? `${day} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : day;
}

function addPageNumbers(doc: Pdf) {
  const range = doc.bufferedPageRange();
  if (range.count < 2) return;
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin must not start a new page.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font(FONT)
      .fontSize(8)
      .fillColor('#888')
      .text(
        `Trang ${i - range.start + 1}/${range.count}`,
        PAGE_MARGIN,
        doc.page.height - PAGE_MARGIN + 10,
        {
          width: CONTENT_WIDTH,
          align: 'right',
          lineBreak: false,
        },
      );
    doc.page.margins.bottom = bottom;
  }
}
