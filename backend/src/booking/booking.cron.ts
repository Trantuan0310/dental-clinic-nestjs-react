import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingService } from './booking.service';
import { AppointmentNoticesService } from './appointment-notices.service';
import { bookingEmailConfigProblems } from './clinic-contact';

/**
 * Every 5 minutes: close online booking requests whose time passed before
 * the front desk confirmed them (EXPIRED), so they stop waiting in the inbox.
 * Every hour: email the day-ahead visit reminders.
 * ScheduleModule.forRoot() is registered by AppointmentsModule.
 */
@Injectable()
export class BookingCron implements OnModuleInit {
  private readonly logger = new Logger(BookingCron.name);

  constructor(
    private readonly booking: BookingService,
    private readonly notices: AppointmentNoticesService,
  ) {}

  /** A production deploy missing what patient booking emails need is logged once. */
  onModuleInit() {
    for (const problem of bookingEmailConfigProblems()) {
      this.logger.warn('Booking emails: missing ' + problem);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireOverdueRequests() {
    try {
      const result = await this.booking.expireOverdue();
      if (result.expired > 0) {
        this.logger.log(`Expired ${result.expired} overdue booking requests`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`expireOverdueRequests failed: ${msg}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sendVisitReminders() {
    try {
      const result = await this.notices.sendDueReminders();
      if (result.due > 0) {
        this.logger.log(
          `Visit reminders: ${result.sent} sent of ${result.due} due` +
            ` (${result.blocked} no longer standing, ${result.failed} failed)`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`sendVisitReminders failed: ${msg}`);
    }
  }
}
