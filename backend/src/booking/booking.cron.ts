import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingService } from './booking.service';
import { AppointmentNoticesService } from './appointment-notices.service';

/**
 * Every 5 minutes: close online booking requests whose time passed before
 * the front desk confirmed them (EXPIRED), so they stop waiting in the inbox.
 * Every hour: email the day-ahead visit reminders.
 * ScheduleModule.forRoot() is registered by AppointmentsModule.
 */
@Injectable()
export class BookingCron {
  private readonly logger = new Logger(BookingCron.name);

  constructor(
    private readonly booking: BookingService,
    private readonly notices: AppointmentNoticesService,
  ) {}

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
        this.logger.log(`Visit reminders: ${result.sent} sent of ${result.due} due`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`sendVisitReminders failed: ${msg}`);
    }
  }
}
