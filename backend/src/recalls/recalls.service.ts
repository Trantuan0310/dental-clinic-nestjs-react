import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, Prisma, RecallStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../common/services/email.service';
import { JwtPayload } from '../common/guards/permissions.guard';
import { BusinessRuleException } from '../common/exceptions/business-rule.exception';
import { clinicDateOnly } from '../common/date-range.util';
import {
  appointmentEmailNoticesEnabled,
  clinicContactLine,
  emailDeliverable,
  publicAppUrl,
} from '../booking/clinic-contact';
import { RecallContactDto, RecallListQueryDto } from './dto/recall.dto';

/** Open recalls the front desk still works on (BOOKED waits for the visit). */
const TO_CALL: RecallStatus[] = [RecallStatus.PENDING, RecallStatus.POSTPONED];
/** Visits that count as "already booked" for a recall. */
const UPCOMING_VISIT: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
];
const LIST_LIMIT = 300;
const EMAIL_BATCH = 200;

const RECALL_INCLUDE = {
  patient: {
    select: {
      id: true,
      code: true,
      fullName: true,
      primaryPhone: true,
      email: true,
      recallOptOutAt: true,
    },
  },
  service: { select: { id: true, code: true, name: true, recallIntervalMonths: true } },
  sourceEncounter: { select: { id: true, closedAt: true } },
  contactedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.RecallInclude;

type RecallRow = Prisma.RecallGetPayload<{ include: typeof RECALL_INCLUDE }>;

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * Recall reminders (nhắc tái khám định kỳ): a recall is due a set interval
 * after a visit with a service that has one (recall-schedule.ts makes them
 * when the encounter closes). The front desk calls the patients due and
 * records the outcome; a daily job emails each due patient once, with a
 * booking link and a link to stop these emails.
 */
@Injectable()
export class RecallsService {
  private readonly logger = new Logger(RecallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  async list(query: RecallListQueryDto, now = new Date()) {
    const today = clinicDateOnly(now);
    const scope = query.scope ?? 'due';
    const horizon = addDays(today, query.days ?? 14);
    const statusFilter: Prisma.RecallWhereInput =
      scope === 'due'
        ? {
            OR: [
              { status: RecallStatus.PENDING, dueDate: { lte: asDate(horizon) } },
              { status: RecallStatus.POSTPONED, postponedUntil: { lte: asDate(today) } },
            ],
          }
        : scope === 'booked'
          ? { status: RecallStatus.BOOKED }
          : { status: { in: [RecallStatus.DISMISSED, RecallStatus.DONE] } };
    const q = query.q?.trim();
    const rows = await this.prisma.recall.findMany({
      where: {
        AND: [
          statusFilter,
          { patient: { deletedAt: null } },
          ...(q
            ? [
                {
                  patient: {
                    OR: [
                      { fullName: { contains: q, mode: 'insensitive' as const } },
                      { code: { contains: q, mode: 'insensitive' as const } },
                      { primaryPhone: { contains: q.replace(/\s+/g, '') } },
                    ],
                  },
                },
              ]
            : []),
        ],
      },
      include: RECALL_INCLUDE,
      orderBy: scope === 'closed' ? [{ updatedAt: 'desc' }] : [{ dueDate: 'asc' }],
      take: LIST_LIMIT,
    });
    const upcoming = await this.upcomingVisits(
      rows.map(r => r.patientId),
      now,
    );
    return rows.map(r => this.toView(r, today, upcoming.get(r.patientId) ?? null));
  }

  /** Front desk: the outcome of a call to a patient due back. */
  async recordContact(id: string, dto: RecallContactDto, actor: JwtPayload, now = new Date()) {
    const row = await this.prisma.recall.findUnique({ where: { id }, include: RECALL_INCLUDE });
    if (!row) throw new NotFoundException('Không tìm thấy lượt nhắc tái khám');
    if (!TO_CALL.includes(row.status)) {
      throw new BusinessRuleException(
        'Lượt nhắc này đã được xử lý (đã đặt lịch, đã bỏ hoặc bệnh nhân đã đến khám). Tải lại danh sách.',
        HttpStatus.CONFLICT,
        { status: row.status },
        'RECALL_NOT_OPEN',
      );
    }
    const today = clinicDateOnly(now);
    const note = dto.note?.trim() || null;
    let status: RecallStatus = RecallStatus.PENDING;
    let postponedUntil: Date | null = null;
    let closedAt: Date | null = null;
    switch (dto.result) {
      case 'BOOKED':
        status = RecallStatus.BOOKED;
        break;
      case 'POSTPONED':
        if (!dto.postponedUntil || dto.postponedUntil.slice(0, 10) <= today) {
          throw this.rule('Chọn ngày gọi lại sau hôm nay', 'RECALL_POSTPONE_DATE');
        }
        status = RecallStatus.POSTPONED;
        postponedUntil = asDate(dto.postponedUntil.slice(0, 10));
        break;
      case 'UNREACHABLE':
        // Stays on the list to try again.
        status = RecallStatus.PENDING;
        break;
      case 'DISMISSED':
        if (!note || note.length < 3) {
          throw this.rule('Nhập lý do bỏ nhắc (ít nhất 3 ký tự)', 'RECALL_REASON_REQUIRED');
        }
        status = RecallStatus.DISMISSED;
        closedAt = now;
        break;
    }
    await this.prisma.$transaction(async tx => {
      const { count } = await tx.recall.updateMany({
        where: { id, status: { in: TO_CALL } },
        data: {
          status,
          postponedUntil,
          closedAt,
          contactAttempts: { increment: 1 },
          lastContactAt: now,
          lastContactBy: actor.sub,
          lastContactResult: dto.result,
          lastContactNote: note,
        },
      });
      if (count === 0) {
        throw new BusinessRuleException(
          'Lượt nhắc vừa được người khác xử lý. Tải lại danh sách.',
          HttpStatus.CONFLICT,
          undefined,
          'RECALL_NOT_OPEN',
        );
      }
      await this.audit.log(
        {
          action: 'RECALL_CONTACTED',
          actorUserId: actor.sub,
          actorEmail: actor.email,
          targetType: 'recall',
          targetId: id,
          metadata: {
            patientId: row.patientId,
            service: row.service.name,
            result: dto.result,
            ...(postponedUntil && { postponedUntil: dateOnly(postponedUntil) }),
            ...(note && { note }),
          },
        },
        tx,
      );
    });
    return this.get(id, now);
  }

  /** Undo "booked" or "dismissed": the recall is to call again. */
  async reopen(id: string, actor: JwtPayload, now = new Date()) {
    const row = await this.prisma.recall.findUnique({
      where: { id },
      select: { id: true, status: true, patientId: true, serviceId: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy lượt nhắc tái khám');
    const reopenable: RecallStatus[] = [RecallStatus.BOOKED, RecallStatus.DISMISSED];
    if (!reopenable.includes(row.status)) {
      throw new BusinessRuleException(
        'Chỉ mở lại lượt nhắc đã đặt lịch hoặc đã bỏ',
        HttpStatus.CONFLICT,
        { status: row.status },
        'RECALL_NOT_REOPENABLE',
      );
    }
    if (row.status === RecallStatus.DISMISSED) {
      // A newer visit may have made a new recall for the same service since.
      const open = await this.prisma.recall.count({
        where: {
          patientId: row.patientId,
          serviceId: row.serviceId,
          status: { in: [RecallStatus.PENDING, RecallStatus.POSTPONED, RecallStatus.BOOKED] },
        },
      });
      if (open > 0) {
        throw new BusinessRuleException(
          'Bệnh nhân đã có lượt nhắc khác cho dịch vụ này',
          HttpStatus.CONFLICT,
          undefined,
          'RECALL_ALREADY_OPEN',
        );
      }
    }
    await this.prisma.$transaction(async tx => {
      const { count } = await tx.recall.updateMany({
        where: { id, status: row.status },
        data: { status: RecallStatus.PENDING, postponedUntil: null, closedAt: null },
      });
      if (count === 0) {
        throw new BusinessRuleException(
          'Lượt nhắc vừa thay đổi. Tải lại danh sách.',
          HttpStatus.CONFLICT,
          undefined,
          'RECALL_NOT_OPEN',
        );
      }
      await this.audit.log(
        {
          action: 'RECALL_REOPENED',
          actorUserId: actor.sub,
          actorEmail: actor.email,
          targetType: 'recall',
          targetId: id,
          metadata: { patientId: row.patientId, from: row.status },
        },
        tx,
      );
    });
    return this.get(id, now);
  }

  /** The patient asked at the desk to stop (or to get again) recall emails. */
  async setOptOut(patientId: string, optOut: boolean, actor: JwtPayload) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true, recallOptOutAt: true },
    });
    if (!patient) throw new NotFoundException('Không tìm thấy bệnh nhân');
    if (!!patient.recallOptOutAt === optOut) return { patientId, optOut };
    await this.prisma.$transaction(async tx => {
      await tx.patient.update({
        where: { id: patientId },
        data: { recallOptOutAt: optOut ? new Date() : null, updatedBy: actor.sub },
      });
      await this.audit.log(
        {
          action: optOut ? 'RECALL_OPTED_OUT' : 'RECALL_OPTED_IN',
          actorUserId: actor.sub,
          actorEmail: actor.email,
          targetType: 'patient',
          targetId: patientId,
          metadata: { via: 'desk' },
        },
        tx,
      );
    });
    return { patientId, optOut };
  }

  /** Public: the "stop these emails" link of a recall email. */
  async unsubscribe(token: string) {
    const row = await this.prisma.recall.findUnique({
      where: { emailTokenHash: hashToken(token) },
      select: { patientId: true, patient: { select: { recallOptOutAt: true } } },
    });
    if (!row) {
      throw new NotFoundException('Đường link không đúng hoặc đã hết hiệu lực');
    }
    if (!row.patient.recallOptOutAt) {
      await this.prisma.$transaction(async tx => {
        await tx.patient.update({
          where: { id: row.patientId },
          data: { recallOptOutAt: new Date() },
        });
        await this.audit.log(
          {
            action: 'RECALL_OPTED_OUT',
            actorUserId: null,
            actorEmail: undefined,
            targetType: 'patient',
            targetId: row.patientId,
            metadata: { via: 'email_link' },
          },
          tx,
        );
      });
    }
    return { unsubscribed: true };
  }

  /**
   * Daily: one email to each patient due back (due date reached) who has an
   * email, has not opted out and has no visit booked. Each recall is
   * claimed before sending, so it is emailed at most once.
   */
  async sendDueEmails(now = new Date()) {
    const none = { due: 0, sent: 0, failed: 0 };
    if (!appointmentEmailNoticesEnabled()) return none;
    if (!emailDeliverable()) {
      this.logger.warn('Recall emails skipped: email is not configured (SMTP / EMAIL_MOCK)');
      return none;
    }
    const today = clinicDateOnly(now);
    const due = await this.prisma.recall.findMany({
      where: {
        status: RecallStatus.PENDING,
        emailedAt: null,
        dueDate: { lte: asDate(today) },
        patient: { deletedAt: null, recallOptOutAt: null, email: { not: null } },
      },
      include: RECALL_INCLUDE,
      orderBy: { dueDate: 'asc' },
      take: EMAIL_BATCH,
    });
    const upcoming = await this.upcomingVisits(
      due.map(r => r.patientId),
      now,
    );
    // One email per patient, even when several services are due at once.
    const byPatient = new Map<string, RecallRow[]>();
    for (const r of due) {
      if (upcoming.has(r.patientId)) continue;
      byPatient.set(r.patientId, [...(byPatient.get(r.patientId) ?? []), r]);
    }
    let sent = 0;
    let failed = 0;
    for (const recalls of byPatient.values()) {
      const token = randomBytes(24).toString('base64url');
      const ids = recalls.map(r => r.id);
      // Claim: the first recall carries the unsubscribe token.
      const claimed = await this.prisma.$transaction(async tx => {
        const { count } = await tx.recall.updateMany({
          where: { id: { in: ids }, emailedAt: null, status: RecallStatus.PENDING },
          data: { emailedAt: now },
        });
        if (count === 0) return false;
        await tx.recall.update({
          where: { id: ids[0] },
          data: { emailTokenHash: hashToken(token) },
        });
        return true;
      });
      if (!claimed) continue;
      const ok = await this.sendEmail(recalls, token);
      if (ok) {
        sent++;
        continue;
      }
      failed++;
      // Not handed to the mail server: release for tomorrow's run.
      await this.prisma.recall.updateMany({
        where: { id: { in: ids }, emailedAt: now },
        data: { emailedAt: null, emailTokenHash: null },
      });
    }
    return { due: byPatient.size, sent, failed };
  }

  // ---------------------------------------------------------------------------

  private async get(id: string, now: Date) {
    const row = await this.prisma.recall.findUnique({ where: { id }, include: RECALL_INCLUDE });
    if (!row) throw new NotFoundException('Không tìm thấy lượt nhắc tái khám');
    const upcoming = await this.upcomingVisits([row.patientId], now);
    return this.toView(row, clinicDateOnly(now), upcoming.get(row.patientId) ?? null);
  }

  /** Each patient's next booked visit. */
  private async upcomingVisits(patientIds: string[], now: Date) {
    const map = new Map<string, Date>();
    if (patientIds.length === 0) return map;
    const visits =
      (await this.prisma.appointment.findMany({
        where: {
          patientId: { in: [...new Set(patientIds)] },
          deletedAt: null,
          status: { in: UPCOMING_VISIT },
          startAt: { gte: now },
        },
        select: { patientId: true, startAt: true },
        orderBy: { startAt: 'asc' },
      })) ?? [];
    for (const v of visits) if (!map.has(v.patientId)) map.set(v.patientId, v.startAt);
    return map;
  }

  private toView(r: RecallRow, today: string, nextVisitAt: Date | null) {
    const due = dateOnly(r.dueDate)!;
    return {
      id: r.id,
      status: r.status,
      dueDate: due,
      overdue: due < today,
      postponedUntil: dateOnly(r.postponedUntil),
      patient: {
        id: r.patient.id,
        code: r.patient.code,
        fullName: r.patient.fullName,
        phone: r.patient.primaryPhone,
        hasEmail: !!r.patient.email,
        optedOut: !!r.patient.recallOptOutAt,
      },
      service: { id: r.service.id, code: r.service.code, name: r.service.name },
      lastVisitAt: r.sourceEncounter?.closedAt ?? null,
      sourceEncounterId: r.sourceEncounterId,
      emailedAt: r.emailedAt,
      contactAttempts: r.contactAttempts,
      lastContact: r.lastContactAt
        ? {
            at: r.lastContactAt,
            by: r.contactedBy?.fullName ?? null,
            result: r.lastContactResult,
            note: r.lastContactNote,
          }
        : null,
      nextVisitAt,
      closedAt: r.closedAt,
    };
  }

  private async sendEmail(recalls: RecallRow[], token: string) {
    const patient = recalls[0].patient;
    if (!patient.email) return false;
    const services = recalls.map(r => r.service.name).join(', ');
    const lastVisit = recalls[0].sourceEncounter?.closedAt;
    const base = publicAppUrl();
    const bookingLink = `${base}/booking`;
    const stopLink = `${base}/recall/unsubscribe?token=${encodeURIComponent(token)}`;
    const message =
      'Đã đến lúc tái khám định kỳ: ' +
      services +
      (lastVisit ? ' (lần trước ngày ' + formatDay(lastVisit) + ')' : '') +
      '. Khám định kỳ giúp phát hiện sớm vấn đề răng miệng. Bạn có thể đặt lịch trực tuyến hoặc gọi phòng khám.';
    try {
      return await this.email.send({
        to: patient.email,
        subject: 'Nhắc lịch tái khám định kỳ',
        html:
          '<p>Xin chào ' +
          escape(patient.fullName) +
          ',</p><p>' +
          escape(message) +
          '</p><p><a href="' +
          escape(bookingLink) +
          '">Đặt lịch khám</a></p><p>' +
          escape(clinicContactLine()) +
          '</p><p style="font-size:12px;color:#666">Không muốn nhận email nhắc tái khám? <a href="' +
          escape(stopLink) +
          '">Ngừng nhận</a></p>',
        text:
          'Xin chào ' +
          patient.fullName +
          ',\n' +
          message +
          '\nĐặt lịch: ' +
          bookingLink +
          '\n' +
          clinicContactLine() +
          '\nNgừng nhận email nhắc tái khám: ' +
          stopLink,
      });
    } catch (error) {
      this.logger.warn(`Could not send a recall email: ${String(error)}`);
      return false;
    }
  }

  private rule(message: string, code: string) {
    return new BusinessRuleException(message, HttpStatus.BAD_REQUEST, undefined, code);
  }
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function addDays(day: string, days: number) {
  const d = asDate(day);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDay(at: Date) {
  const [y, m, d] = clinicDateOnly(at).split('-');
  return `${d}/${m}/${y}`;
}

function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
