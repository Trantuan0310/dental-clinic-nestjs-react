import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingService } from './booking.service';

/**
 * Every 5 minutes: close online booking requests whose time passed before
 * the front desk confirmed them (EXPIRED), so they stop waiting in the inbox.
 * ScheduleModule.forRoot() is registered by AppointmentsModule.
 */
@Injectable()
export class BookingCron {
  private readonly logger = new Logger(BookingCron.name);

  constructor(private readonly booking: BookingService) {}

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
}
