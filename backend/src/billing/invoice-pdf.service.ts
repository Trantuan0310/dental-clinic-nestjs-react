import { HttpStatus, Injectable } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../common/services/email.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import { clinicContactLine } from '../booking/clinic-contact';
import { renderInvoicePdf, InvoicePdfData } from '../pdf/invoice-pdf';

/** Invoice PDFs: downloaded by staff, emailed to the patient. */
@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** The PDF and its file name; access as for reading the invoice (BR-BILL-003). */
  async pdf(id: string, actor: JwtPayload) {
    const inv = await this.billing.getInvoiceById(id, actor);
    const bytes = await renderInvoicePdf(toPdfData(inv));
    return { bytes, filename: `${inv.code}.pdf` };
  }

  /** Emails the invoice PDF to the patient's email on file. */
  async emailToPatient(id: string, actor: JwtPayload) {
    const inv = await this.billing.getInvoiceById(id, actor);
    if (inv.status === 'DRAFT' || inv.status === 'VOIDED') {
      throw new BusinessRuleException(
        'Chỉ gửi hoá đơn đã phát hành',
        HttpStatus.CONFLICT,
        { status: inv.status },
        'INVOICE_NOT_SENDABLE',
      );
    }
    const patient = await this.prisma.patient.findUnique({
      where: { id: inv.patientId },
      select: { email: true },
    });
    const to = patient?.email;
    if (!to) {
      throw new BusinessRuleException(
        'Bệnh nhân chưa có email. Thêm email trong hồ sơ bệnh nhân rồi gửi lại.',
        HttpStatus.BAD_REQUEST,
        undefined,
        'PATIENT_NO_EMAIL',
      );
    }
    const bytes = await renderInvoicePdf(toPdfData(inv));
    const name = inv.patientName ?? '';
    const sent = await this.email.send({
      to,
      subject: `Hoá đơn ${inv.code}`,
      html:
        `<p>Xin chào ${escape(name)},</p>` +
        `<p>Phòng khám gửi bạn hoá đơn ${escape(inv.code)} (đính kèm, PDF).</p>` +
        `<p>${escape(clinicContactLine())}</p>`,
      text: `Xin chào ${name},\nPhòng khám gửi bạn hoá đơn ${inv.code} (đính kèm, PDF).\n${clinicContactLine()}`,
      attachments: [
        { filename: `${inv.code}.pdf`, content: bytes, contentType: 'application/pdf' },
      ],
    });
    if (!sent) {
      throw new BusinessRuleException(
        'Chưa gửi được email (máy chủ thư chưa cấu hình hoặc từ chối). Thử lại sau.',
        HttpStatus.BAD_GATEWAY,
        undefined,
        'EMAIL_NOT_SENT',
      );
    }
    await this.audit.log({
      action: 'INVOICE_EMAILED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'invoice',
      targetId: id,
      metadata: { code: inv.code, to },
    });
    return { sent: true, to };
  }
}

type InvoiceView = Awaited<ReturnType<BillingService['getInvoiceById']>>;

function toPdfData(inv: InvoiceView): InvoicePdfData {
  return {
    code: inv.code,
    status: inv.status,
    createdAt: inv.createdAt,
    issuedAt: inv.issuedAt,
    voidedAt: inv.voidedAt,
    voidReason: inv.voidReason,
    patientCode: inv.patientCode,
    patientName: inv.patientName,
    dentistName: inv.encounter?.dentist?.fullName ?? null,
    notes: inv.notes,
    subtotal: inv.subtotal,
    discountType: inv.discountType,
    discountValue: inv.discountValue ?? null,
    total: inv.total,
    paidAmount: inv.paidAmount,
    refundedAmount: Number(inv.refundedAmount ?? 0),
    adjustedAmount: inv.adjustedAmount,
    outstandingAmount: inv.outstandingAmount,
    items: (inv.items ?? []).map(i => ({
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
    })),
    payments: (inv.payments ?? []).map(p => ({
      amount: Number(p.amount),
      method: p.method,
      kind: p.kind,
      status: p.status,
      paidAt: p.paidAt,
      note: p.note,
    })),
    adjustments: (inv.adjustments ?? []).map(a => ({
      amount: Number(a.amount),
      reason: a.reason,
      adjustedAt: a.adjustedAt,
    })),
  };
}

function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
