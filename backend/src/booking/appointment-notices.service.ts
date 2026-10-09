import { HttpException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../common/services/email.service';
import {
  APPOINTMENT_CANCELLED_EVENT,
  APPOINTMENT_RESCHEDULED_EVENT,
  AppointmentCancelledEvent,
  AppointmentRescheduledEvent,
} from '../common/events/domain-events';
import { formatVisitTime } from './clinic-time-format';
import {
  appointmentEmailNoticesEnabled,
  bookingNotifyRecipients,
  clinicAddressLine,
  clinicContactLine,
  emailDeliverable,
  publicAppUrl,
} from './clinic-contact';
import { CLINIC_UTC_OFFSET_MS } from '../common/date-range.util';
import { AvailabilityService } from '../appointments/availability.service';
import { AppointmentsService } from '../appointments/appointments.service';

/** Reminders go out for visits starting in (now + REMINDER_MIN_AHEAD, now + REMINDER_AHEAD]. */
export const REMINDER_AHEAD_MS = 24 * 60 * 60_000;
const REMINDER_MIN_AHEAD_MS = 2 * 60 * 60_000;
const REMINDER_BATCH = 200;
/** A reminder the mail server refused is tried by this many runs in all (hourly). */
export const REMINDER_MAX_ATTEMPTS = 3;
/** No reminder is sent between 21:00 and 07:00 at the clinic; the next run catches up. */
const QUIET_FROM_HOUR = 21;
const QUIET_UNTIL_HOUR = 7;

/** 21:00–07:00 at the clinic (UTC+7). */
export function isQuietHour(now: Date): boolean {
  const hour = new Date(now.getTime() + CLINIC_UTC_OFFSET_MS).getUTCHours();
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

const VISIT_SELECT = {
  id: true,
  startAt: true,
  endAt: true,
  status: true,
  deletedAt: true,
  dentistId: true,
  reminderStatus: true,
  reminderAttempts: true,
  reminderStatusFor: true,
  patient: { select: { fullName: true, email: true, deletedAt: true } },
  dentist: { select: { fullName: true } },
  services: { select: { serviceName: true }, orderBy: { sortOrder: 'asc' } },
  bookingRequest: { select: { referenceCode: true } },
} as const;

type ReminderVisit = {
  id: string;
  startAt: Date;
  endAt: Date;
  dentistId: string;
  reminderStatus: string | null;
  reminderAttempts: number;
  reminderStatusFor: Date | null;
  patient: { fullName: string; email: string | null };
  dentist: { fullName: string } | null;
  services?: Array<{ serviceName: string }>;
  bookingRequest?: { referenceCode: string } | null;
};

/**
 * Emails patients about their booked visits: a change the clinic made
 * (cancelled, moved, another dentist) and a reminder about a day ahead.
 * Only patients with an email on file; EmailService honours EMAIL_MOCK.
 * Never throws: the change itself has already been saved.
 */
@Injectable()
export class AppointmentNoticesService {
  private readonly logger = new Logger(AppointmentNoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly availability: AvailabilityService,
    private readonly appointments: AppointmentsService,
  ) {}

  @OnEvent(APPOINTMENT_CANCELLED_EVENT)
  async onCancelled(event: AppointmentCancelledEvent) {
    if (!appointmentEmailNoticesEnabled()) return;
    try {
      const visit = await this.visit(event.appointmentId);
      // A visit already under way or past (a late cancel of a checked-in
      // patient) is not news to the patient.
      if (!visit || visit.startAt.getTime() <= Date.now()) return;
      await this.send(
        visit,
        'Lịch hẹn đã bị hủy',
        'Lịch hẹn lúc ' +
          formatVisitTime(visit.startAt) +
          (visit.dentist?.fullName ? ' với bác sĩ ' + visit.dentist.fullName : '') +
          ' đã được hủy. Nếu bạn vẫn muốn khám, vui lòng gọi phòng khám hoặc đặt lịch mới.',
      );
    } catch (error) {
      this.logger.warn(
        `Could not email the cancellation of ${event.appointmentId}: ${String(error)}`,
      );
    }
  }

  @OnEvent(APPOINTMENT_RESCHEDULED_EVENT)
  async onRescheduled(event: AppointmentRescheduledEvent) {
    const moved = event.oldStartAt.getTime() !== event.newStartAt.getTime();
    const changedDentist = event.oldDentistId !== event.newDentistId;
    // The reminder flag is cleared by the move itself (same transaction).
    if ((!moved && !changedDentist) || !appointmentEmailNoticesEnabled()) return;
    try {
      const visit = await this.visit(event.appointmentId);
      if (!visit || visit.startAt.getTime() <= Date.now()) return;
      const dentist = visit.dentist?.fullName;
      const message = moved
        ? 'Phòng khám đã dời lịch hẹn của bạn từ ' +
          formatVisitTime(event.oldStartAt) +
          ' sang ' +
          formatVisitTime(visit.startAt) +
          (dentist ? ', bác sĩ ' + dentist : '') +
          '.'
        : 'Lịch hẹn lúc ' +
          formatVisitTime(visit.startAt) +
          ' của bạn được chuyển sang bác sĩ ' +
          (dentist ?? 'khác') +
          '.';
      await this.send(
        visit,
        moved ? 'Lịch hẹn đã được dời' : 'Lịch hẹn đổi bác sĩ',
        message + ' Nếu thời gian này không phù hợp, vui lòng gọi phòng khám.',
      );
    } catch (error) {
      this.logger.warn(`Could not email the change of ${event.appointmentId}: ${String(error)}`);
    }
  }

  /**
   * Reminds patients (with an email) of visits starting within the next
   * day, once per visit time: reminder_sent_at is claimed before sending, so
   * two runs (or two servers) never send it twice. Run hourly (BookingCron),
   * so each reminder goes out about 24 hours ahead; a visit booked for
   * sooner is reminded at the next run, unless it is under 2 hours away.
   * Nothing is sent at night (isQuietHour). Visits already booked when
   * migration 041 ran were marked as reminded, so the first run after the
   * deploy does not send a backlog.
   *
   * A visit that no longer stands as booked (clinic closed that day, the
   * dentist's approved time-off, outside the dentist's hours, the dentist no
   * longer taking bookings) is not reminded: it is marked BLOCKED for the
   * front desk (reminderIssues) and looked at again by the next run, so a
   * visit fixed in time still gets its reminder. When email cannot be
   * delivered at all nothing is claimed; a send the mail server refuses
   * releases the claim and is retried by the next runs (FAILED).
   */
  async sendDueReminders(now = new Date()) {
    const none = { due: 0, sent: 0, blocked: 0, failed: 0 };
    if (!appointmentEmailNoticesEnabled() || isQuietHour(now)) return none;
    if (!emailDeliverable()) {
      this.logger.warn('Visit reminders skipped: email is not configured (SMTP / EMAIL_MOCK)');
      return none;
    }
    const due: ReminderVisit[] = await this.prisma.appointment.findMany({
      where: {
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        deletedAt: null,
        reminderSentAt: null,
        startAt: {
          gt: new Date(now.getTime() + REMINDER_MIN_AHEAD_MS),
          lte: new Date(now.getTime() + REMINDER_AHEAD_MS),
        },
        patient: { deletedAt: null, email: { not: null } },
      },
      select: VISIT_SELECT,
      orderBy: { startAt: 'asc' },
      take: REMINDER_BATCH,
    });
    let sent = 0;
    let blocked = 0;
    let failed = 0;
    const newlyBlocked: Array<{ visit: ReminderVisit; problem: string }> = [];
    const gaveUp: ReminderVisit[] = [];
    for (const visit of due) {
      const problem = await this.visitProblem(visit);
      if (problem) {
        blocked++;
        const already =
          visit.reminderStatus === 'BLOCKED' &&
          visit.reminderStatusFor?.getTime() === visit.startAt.getTime();
        await this.prisma.appointment.updateMany({
          where: { id: visit.id, reminderSentAt: null, startAt: visit.startAt },
          data: {
            reminderStatus: 'BLOCKED',
            reminderNote: problem.slice(0, 500),
            reminderStatusFor: visit.startAt,
          },
        });
        if (!already) newlyBlocked.push({ visit, problem });
        continue;
      }
      const claimed = await this.prisma.$executeRaw`
        UPDATE appointments SET reminder_sent_at = ${now}
        WHERE id = ${visit.id}::uuid AND reminder_sent_at IS NULL
          AND start_at >= ${visit.startAt}
          AND start_at < ${new Date(visit.startAt.getTime() + 1)}
          AND status IN ('SCHEDULED', 'CONFIRMED') AND deleted_at IS NULL`;
      if (!claimed) continue;
      const ref = visit.bookingRequest?.referenceCode;
      const ok = await this.send(
        visit,
        'Nhắc lịch khám ' + formatVisitTime(visit.startAt),
        this.reminderText(visit),
        ref ? publicAppUrl() + '/booking/status?ref=' + encodeURIComponent(ref) : undefined,
      );
      if (ok) {
        sent++;
        await this.prisma.appointment.updateMany({
          where: { id: visit.id, reminderSentAt: now },
          data: { reminderStatus: 'SENT', reminderNote: null, reminderStatusFor: visit.startAt },
        });
        continue;
      }
      // EmailService reports false only when the message was not handed to
      // the mail server, so another try cannot send it twice. The claim is
      // released for the next runs, up to REMINDER_MAX_ATTEMPTS in all.
      failed++;
      const attempts =
        (visit.reminderStatusFor?.getTime() === visit.startAt.getTime()
          ? visit.reminderAttempts
          : 0) + 1;
      const last = attempts >= REMINDER_MAX_ATTEMPTS;
      await this.prisma.appointment.updateMany({
        where: { id: visit.id, reminderSentAt: now },
        data: {
          reminderSentAt: last ? now : null,
          reminderStatus: 'FAILED',
          reminderNote:
            'Gửi email nhắc lịch không thành công (lần ' +
            attempts +
            (last ? ', đã dừng thử lại' : ', sẽ thử lại') +
            '). Hãy gọi nhắc khách.',
          reminderAttempts: attempts,
          reminderStatusFor: visit.startAt,
        },
      });
      if (last) gaveUp.push(visit);
      this.logger.warn(`Reminder for appointment ${visit.id} was not delivered (try ${attempts})`);
    }
    if (newlyBlocked.length || gaveUp.length) await this.notifyClinic(newlyBlocked, gaveUp);
    return { due: due.length, sent, blocked, failed };
  }

  /**
   * Visits in the next two days whose reminder did not go out (BLOCKED or
   * FAILED for their current time), for the front desk to call. A BLOCKED
   * visit is checked again here, so one fixed since the last run drops out.
   */
  async reminderIssues(now = new Date()) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        deletedAt: null,
        reminderStatus: { in: ['BLOCKED', 'FAILED'] },
        startAt: { gt: now, lte: new Date(now.getTime() + 2 * REMINDER_AHEAD_MS) },
      },
      select: {
        ...VISIT_SELECT,
        reminderNote: true,
        reminderSentAt: true,
        patient: { select: { id: true, fullName: true, primaryPhone: true } },
      },
      orderBy: { startAt: 'asc' },
      take: 100,
    });
    const out = [];
    for (const r of rows) {
      // A status left over from before the visit was moved is not about it.
      if (r.reminderStatusFor?.getTime() !== r.startAt.getTime()) continue;
      let note = r.reminderNote;
      if (r.reminderStatus === 'BLOCKED') {
        note = await this.visitProblem(r);
        // Fixed too close to the visit for the email run (≥2 h ahead): still
        // unreminded, so the front desk calls.
        if (
          !note &&
          r.reminderSentAt == null &&
          r.startAt.getTime() - now.getTime() <= REMINDER_MIN_AHEAD_MS
        )
          note = 'Đã sửa nhưng quá sát giờ để gửi email nhắc — hãy gọi báo khách.';
        if (!note) continue;
      }
      out.push({
        appointmentId: r.id,
        startAt: r.startAt,
        status: r.status,
        reminderStatus: r.reminderStatus,
        reminderNote: note,
        patient: r.patient,
        dentist: r.dentist,
        referenceCode: r.bookingRequest?.referenceCode ?? null,
      });
    }
    return out;
  }

  /**
   * Why the visit no longer stands as booked (the dentist's account and day,
   * other bookings aside), in Vietnamese, or null.
   */
  private async visitProblem(visit: {
    dentistId: string;
    startAt: Date;
    endAt: Date;
  }): Promise<string | null> {
    try {
      await this.appointments.validateDentist(visit.dentistId);
    } catch (error) {
      if (error instanceof HttpException) return error.message;
      throw error;
    }
    const problem = await this.availability.checkSlot(visit.dentistId, visit.startAt, visit.endAt, {
      ignoreBookings: true,
    });
    return problem?.message ?? null;
  }

  private reminderText(visit: ReminderVisit) {
    const services = (visit.services ?? []).map(s => s.serviceName).filter(Boolean);
    const ref = visit.bookingRequest?.referenceCode;
    return [
      'Phòng khám xin nhắc bạn có lịch khám lúc ' +
        formatVisitTime(visit.startAt) +
        (visit.dentist?.fullName ? ' với bác sĩ ' + visit.dentist.fullName : '') +
        (services.length ? ' (' + services.join(', ') + ')' : '') +
        '.',
      'Vui lòng đến trước giờ hẹn khoảng 10 phút.',
      clinicAddressLine(),
      ref ? 'Mã đặt lịch: ' + ref + '.' : '',
      ref
        ? 'Nếu không đến được, bạn có thể báo hủy bằng đường link trong email xác nhận lịch hoặc gọi phòng khám để dời lịch.'
        : 'Nếu không đến được, vui lòng gọi phòng khám để dời hoặc hủy lịch.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  /** Tells the clinic inbox (BOOKING_NOTIFY_EMAILS) which reminders did not go out. */
  private async notifyClinic(
    blocked: Array<{ visit: ReminderVisit; problem: string }>,
    gaveUp: ReminderVisit[],
  ) {
    const recipients = bookingNotifyRecipients();
    if (!recipients.length) return;
    const line = (v: ReminderVisit, why: string) =>
      formatVisitTime(v.startAt) +
      ' · ' +
      v.patient.fullName +
      (v.dentist?.fullName ? ' · BS ' + v.dentist.fullName : '') +
      ' — ' +
      why;
    const lines = [
      ...blocked.map(b => line(b.visit, 'không gửi nhắc lịch: ' + b.problem)),
      ...gaveUp.map(v => line(v, 'gửi email nhắc lịch lỗi nhiều lần')),
    ];
    const intro =
      'Các lịch hẹn dưới đây chưa được nhắc qua email. Hãy gọi khách (dời lịch nếu phòng khám hoặc bác sĩ nghỉ):';
    const link = publicAppUrl() + '/booking-requests';
    try {
      await Promise.all(
        recipients.map(to =>
          this.email.send({
            to,
            subject: '[GENSMILE] Lịch hẹn cần gọi khách (' + lines.length + ')',
            html:
              '<p>' +
              escape(intro) +
              '</p><ul>' +
              lines.map(l => '<li>' + escape(l) + '</li>').join('') +
              '</ul><p><a href="' +
              escape(link) +
              '">Mở danh sách</a></p>',
            text: intro + '\n' + lines.join('\n') + '\n' + link,
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(`Could not tell the clinic about reminders: ${String(error)}`);
    }
  }

  private async visit(id: string) {
    const visit = await this.prisma.appointment.findUnique({
      where: { id },
      select: VISIT_SELECT,
    });
    if (!visit || visit.deletedAt || !visit.patient?.email || visit.patient.deletedAt) return null;
    return visit;
  }

  private async send(
    visit: { patient: { fullName: string; email: string | null } },
    subject: string,
    message: string,
    link?: string,
  ) {
    const to = visit.patient.email;
    if (!to) return false;
    try {
      return await this.email.send({
        to,
        subject,
        html:
          '<p>Xin chào ' +
          escape(visit.patient.fullName) +
          ',</p><p>' +
          escape(message) +
          '</p>' +
          (link ? '<p><a href="' + escape(link) + '">Xem tình trạng lịch hẹn</a></p>' : '') +
          '<p>' +
          escape(clinicContactLine()) +
          '</p>',
        text:
          'Xin chào ' +
          visit.patient.fullName +
          ',\n' +
          message +
          '\n' +
          (link ? link + '\n' : '') +
          clinicContactLine(),
      });
    } catch (error) {
      this.logger.warn(`Could not send "${subject}": ${String(error)}`);
      return false;
    }
  }
}

function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
