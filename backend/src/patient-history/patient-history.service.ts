import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../common/services/email.service';
import { MessagingService } from '../messaging/messaging.service';
import { clinicContactLine, publicAppUrl } from '../booking/clinic-contact';
import { normalizePhone } from '../booking/booking.service';
import { isMinor } from '../patients/domain/patient-rules';
import type { JwtPayload } from '../common/guards/permissions.guard';
import { DentistReviewsService } from '../dentist-reviews/dentist-reviews.service';

/** How long a history link stays open. */
export const HISTORY_LINK_DAYS = 7;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const historyLinkHash = (token: string) => createHash('sha256').update(token).digest('hex');
/** Names a visit on the history page without its id: only this link can produce or use it. */
export const reviewKey = (tokenHash: string, encounterId: string) =>
  historyLinkHash(`${tokenHash}:review:${encounterId}`).slice(0, 24);

/** "0901234567" → "090****567"; "an@example.com" → "a***@example.com". */
export function maskContact(value: string): string {
  const at = value.indexOf('@');
  if (at > 0) return value[0] + '***' + value.slice(at);
  return value.length > 6 ? value.slice(0, 3) + '****' + value.slice(-3) : '***';
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * Patients read their own visit history through a link (no account): staff
 * issue one at the desk, or the patient asks for one with their phone number
 * and it is sent to the email / phone already on file — never shown on the
 * screen that asked, so knowing a number is not enough to read a record.
 */
@Injectable()
export class PatientHistoryService {
  private readonly logger = new Logger(PatientHistoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly messaging: MessagingService,
    private readonly reviews: DentistReviewsService,
  ) {}

  private async issue(patientId: string, createdBy: string | null, now = new Date()) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(+now + HISTORY_LINK_DAYS * 86_400_000);
    await this.prisma.patientHistoryLink.create({
      data: { patientId, tokenHash: historyLinkHash(token), expiresAt, createdBy },
    });
    return { url: `${publicAppUrl()}/lich-su/${token}`, expiresAt };
  }

  /** Staff: a link for the patient in front of them, also sent to their email / phone. */
  async issueForPatient(patientId: string, actor: JwtPayload) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, fullName: true, email: true, primaryPhone: true, deletedAt: true },
    });
    if (!patient || patient.deletedAt) throw new NotFoundException('Không tìm thấy bệnh nhân');
    const link = await this.issue(patient.id, actor.sub);
    const sentTo = await this.deliver(patient, link.url);
    await this.audit.log({
      action: 'PATIENT_HISTORY_LINK_ISSUED',
      actorUserId: actor.sub,
      actorEmail: actor.email,
      targetType: 'patient',
      targetId: patient.id,
      metadata: { by: 'staff', sentTo: sentTo.length },
    });
    return { ...link, sentTo };
  }

  /**
   * Public: "send me my history". Always the same answer, whether or not the
   * number belongs to a patient, so the form cannot be used to find out who
   * is a patient here.
   */
  async requestByPhone(rawPhone: string) {
    const phone = normalizePhone(String(rawPhone ?? ''));
    if (/^0\d{9}$/.test(phone)) {
      const candidates = await this.prisma.patient.findMany({
        where: {
          deletedAt: null,
          OR: [
            { primaryPhone: { contains: phone.slice(1) } },
            { contactPersonPhone: { contains: phone.slice(1) } },
          ],
        },
        select: {
          id: true,
          fullName: true,
          dob: true,
          email: true,
          primaryPhone: true,
          contactPersonPhone: true,
        },
        take: 10,
      });
      // The number must be the patient's own; a guardian's counts only for a
      // minor with no phone (same rule as the returning-patient booking).
      const owners = candidates
        .filter(
          p =>
            (!!p.primaryPhone && normalizePhone(p.primaryPhone) === phone) ||
            (isMinor(p.dob) &&
              !p.primaryPhone &&
              !!p.contactPersonPhone &&
              normalizePhone(p.contactPersonPhone) === phone),
        )
        .slice(0, 3);
      for (const p of owners) {
        const link = await this.issue(p.id, null);
        const sentTo = await this.deliver({ ...p, primaryPhone: phone }, link.url);
        await this.audit.log({
          action: 'PATIENT_HISTORY_LINK_ISSUED',
          targetType: 'patient',
          targetId: p.id,
          metadata: { by: 'patient', sentTo: sentTo.length },
        });
      }
    }
    return {
      message:
        'Nếu số điện thoại khớp hồ sơ tại phòng khám, đường dẫn xem lịch sử khám đã được gửi tới email hoặc số điện thoại trong hồ sơ.',
    };
  }

  /** Email and SMS/Zalo on file; returns where it went (masked). */
  private async deliver(
    patient: { id: string; fullName: string; email: string | null; primaryPhone: string | null },
    url: string,
  ): Promise<string[]> {
    const sentTo: string[] = [];
    const text = `Đường dẫn xem lịch sử khám của ${patient.fullName} (hiệu lực ${HISTORY_LINK_DAYS} ngày): ${url}`;
    if (patient.email) {
      try {
        const ok = await this.email.send({
          to: patient.email,
          subject: 'Lịch sử khám tại phòng khám',
          html:
            '<p>Xin chào ' +
            escapeHtml(patient.fullName) +
            ',</p><p>Bạn có thể xem lịch sử khám, điều trị và hóa đơn của mình tại đường dẫn dưới đây (hiệu lực ' +
            HISTORY_LINK_DAYS +
            ' ngày, chỉ gửi riêng cho bạn, vui lòng không chia sẻ):</p><p><a href="' +
            escapeHtml(url) +
            '">Xem lịch sử khám</a></p><p>' +
            escapeHtml(clinicContactLine()) +
            '</p>',
          text: text + '\n' + clinicContactLine(),
        });
        if (ok) sentTo.push(maskContact(patient.email));
      } catch (error) {
        this.logger.warn(`History link email failed: ${String(error)}`);
      }
    }
    if (patient.primaryPhone) {
      try {
        const status = await this.messaging.send({
          phone: patient.primaryPhone,
          template: 'HISTORY_LINK',
          text,
          params: { customer_name: patient.fullName, link: url },
          dedupeKey: `history-link:${historyLinkHash(url)}`,
          patientId: patient.id,
          targetType: 'patient',
          targetId: patient.id,
        });
        if (status === 'SENT' || status === 'MOCKED')
          sentTo.push(maskContact(normalizePhone(patient.primaryPhone)));
      } catch (error) {
        this.logger.warn(`History link SMS failed: ${String(error)}`);
      }
    }
    return sentTo;
  }

  /** Public: the history behind a link. Nothing the patient did not already receive. */
  /** The live link a token opens, or 404 (same answer for unknown, expired, deleted). */
  private async openLink(token: string, now: Date) {
    const denied = () => new NotFoundException('Đường dẫn không hợp lệ hoặc đã hết hạn');
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw denied();
    const link = await this.prisma.patientHistoryLink.findUnique({
      where: { tokenHash: historyLinkHash(token) },
      include: {
        patient: { select: { id: true, code: true, fullName: true, dob: true, deletedAt: true } },
      },
    });
    if (!link || link.expiresAt <= now || link.patient.deletedAt) throw denied();
    return link;
  }

  /** The patient rates the dentist of one of their closed visits (once per visit). */
  async review(token: string, key: string, rating: number, comment?: string, now = new Date()) {
    const link = await this.openLink(token, now);
    const visits = await this.prisma.encounter.findMany({
      where: { patientId: link.patientId, status: 'COMPLETED' },
      orderBy: { startedAt: 'desc' },
      take: 100,
      select: { id: true },
    });
    const visit = visits.find(v => reviewKey(link.tokenHash, v.id) === key);
    if (!visit) throw new NotFoundException('Không tìm thấy lần khám này');
    const review = await this.reviews.createForPatient(
      link.patientId,
      visit.id,
      rating,
      comment,
      now,
    );
    return { rating: review.rating, comment: review.comment };
  }

  async view(token: string, now = new Date()) {
    const link = await this.openLink(token, now);
    const patientId = link.patientId;

    const [visits, plans, upcoming, invoices] = await Promise.all([
      this.prisma.encounter.findMany({
        where: { patientId, status: 'COMPLETED' },
        orderBy: { startedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          startedAt: true,
          closedAt: true,
          chiefComplaint: true,
          diagnosis: true,
          summary: true,
          dentist: { select: { fullName: true } },
          treatments: {
            where: { deletedAt: null },
            orderBy: { sequence: 'asc' },
            select: { procedure: true, toothNumbers: true, quantity: true },
          },
          prescription: {
            select: {
              deletedAt: true,
              lines: {
                where: { deletedAt: null },
                select: { drugName: true, dosage: true, frequency: true, duration: true },
              },
            },
          },
        },
      }),
      this.prisma.treatmentPlan.findMany({
        where: { patientId, status: { in: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          title: true,
          status: true,
          items: { select: { procedure: true, toothNumbers: true, status: true } },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          patientId,
          deletedAt: null,
          startAt: { gt: now },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
        orderBy: { startAt: 'asc' },
        take: 10,
        select: {
          startAt: true,
          status: true,
          reason: true,
          dentist: { select: { fullName: true } },
        },
      }),
      this.prisma.invoice.findMany({
        where: { patientId, deletedAt: null, status: { in: ['ISSUED', 'PARTIAL', 'PAID'] } },
        orderBy: { issuedAt: 'desc' },
        take: 50,
        select: {
          code: true,
          issuedAt: true,
          status: true,
          total: true,
          paidAmount: true,
          outstandingAmount: true,
        },
      }),
    ]);

    await this.prisma.patientHistoryLink.update({
      where: { id: link.id },
      data: { lastUsedAt: now },
    });
    await this.audit.log({
      action: 'PATIENT_HISTORY_VIEWED',
      targetType: 'patient',
      targetId: patientId,
      metadata: { linkId: link.id },
    });

    const given = await this.reviews.forEncounters(visits.map(v => v.id));
    const teeth = (value: unknown) =>
      Array.isArray(value) ? value.map(Number).filter(n => Number.isInteger(n) && n > 0) : [];
    return {
      patient: { code: link.patient.code, fullName: link.patient.fullName },
      expiresAt: link.expiresAt,
      visits: visits.map(v => ({
        reviewKey: reviewKey(link.tokenHash, v.id),
        date: v.closedAt ?? v.startedAt,
        review: given.get(v.id) ?? null,
        canReview: !given.has(v.id) && DentistReviewsService.canReview(v.closedAt, now),
        dentistName: v.dentist.fullName,
        chiefComplaint: v.chiefComplaint,
        diagnosis: v.diagnosis,
        summary: v.summary,
        treatments: v.treatments.map(t => ({
          name: t.procedure,
          teeth: teeth(t.toothNumbers),
          quantity: t.quantity,
        })),
        prescription:
          v.prescription && !v.prescription.deletedAt
            ? v.prescription.lines.map(l => ({
                drugName: l.drugName,
                dosage: l.dosage,
                frequency: l.frequency,
                duration: l.duration,
              }))
            : [],
      })),
      plans: plans.map(p => ({
        title: p.title,
        status: p.status,
        done: p.items.filter(i => i.status === 'DONE').length,
        total: p.items.filter(i => i.status !== 'SKIPPED').length,
        items: p.items.map(i => ({
          procedure: i.procedure,
          teeth: teeth(i.toothNumbers),
          status: i.status,
        })),
      })),
      upcoming: upcoming.map(a => ({
        startAt: a.startAt,
        status: a.status,
        reason: a.reason,
        dentistName: a.dentist.fullName,
      })),
      invoices: invoices.map(i => ({
        code: i.code,
        issuedAt: i.issuedAt,
        status: i.status,
        total: Number(i.total),
        paid: Number(i.paidAmount),
        outstanding: Number(i.outstandingAmount),
      })),
    };
  }
}
