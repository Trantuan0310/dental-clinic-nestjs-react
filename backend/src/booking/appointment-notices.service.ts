import { Injectable, Logger } from '@nestjs/common';
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

/** Reminders go out for visits starting in (now + REMINDER_MIN_AHEAD, now + REMINDER_AHEAD]. */
export const REMINDER_AHEAD_MS = 24 * 60 * 60_000;
const REMINDER_MIN_AHEAD_MS = 2 * 60 * 60_000;
const REMINDER_BATCH = 200;

const VISIT_SELECT = {
  id: true,
  startAt: true,
  status: true,
  deletedAt: true,
  patient: { select: { fullName: true, email: true, deletedAt: true } },
  dentist: { select: { fullName: true } },
} as const;

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
  ) {}

  @OnEvent(APPOINTMENT_CANCELLED_EVENT)
  async onCancelled(event: AppointmentCancelledEvent) {
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
    if (!moved && !changedDentist) return;
    try {
      // The new time gets its own reminder. Raw SQL: a reminder flag is not
      // an edit of the visit (updated_at stays).
      if (moved) {
        await this.prisma.$executeRaw`
          UPDATE appointments SET reminder_sent_at = NULL WHERE id = ${event.appointmentId}::uuid`;
      }
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
   */
  async sendDueReminders(now = new Date()) {
    const due = await this.prisma.appointment.findMany({
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
    for (const visit of due) {
      const claimed = await this.prisma.$executeRaw`
        UPDATE appointments SET reminder_sent_at = ${now}
        WHERE id = ${visit.id}::uuid AND reminder_sent_at IS NULL
          AND start_at >= ${visit.startAt}
          AND start_at < ${new Date(visit.startAt.getTime() + 1)}
          AND status IN ('SCHEDULED', 'CONFIRMED') AND deleted_at IS NULL`;
      if (!claimed) continue;
      const ok = await this.send(
        visit,
        'Nhắc lịch khám ' + formatVisitTime(visit.startAt),
        'Phòng khám xin nhắc bạn có lịch khám lúc ' +
          formatVisitTime(visit.startAt) +
          (visit.dentist?.fullName ? ' với bác sĩ ' + visit.dentist.fullName : '') +
          '. Vui lòng đến trước giờ hẹn khoảng 10 phút. ' +
          'Nếu không đến được, vui lòng gọi phòng khám để dời hoặc hủy lịch.',
      );
      // Not retried: a second attempt could not tell a lost email from a
      // delivered one, and a duplicate reminder is worse than none.
      if (ok) sent++;
      else this.logger.warn(`Reminder for appointment ${visit.id} was not delivered`);
    }
    return { due: due.length, sent };
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
  ) {
    const to = visit.patient.email;
    if (!to) return false;
    try {
      return await this.email.send({
        to,
        subject,
        html:
          '<p>Xin chào ' + escape(visit.patient.fullName) + ',</p><p>' + escape(message) + '</p>',
        text: 'Xin chào ' + visit.patient.fullName + ',\n' + message,
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
