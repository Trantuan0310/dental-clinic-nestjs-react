import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentsService } from './appointments.service';

/**
 * Drives periodic bulk operations:
 *   - Every minute: auto-mark SCHEDULED/CONFIRMED appointments as NO_SHOW
 *     after grace period.
 *   - Every hour: auto-cancel PENDING shift registrations whose startTime
 *     is in the past.
 */
@Injectable()
export class AppointmentsCron {
  private readonly logger = new Logger(AppointmentsCron.name);

  constructor(private readonly appointments: AppointmentsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async autoMarkNoShow() {
    try {
      const result = await this.appointments.autoMarkNoShow();
      if (result.updated > 0) {
        this.logger.log(`Auto-marked ${result.updated} appointments as NO_SHOW`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`autoMarkNoShow failed: ${msg}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoCancelPastPendingShifts() {
    try {
      const result = await this.appointments.autoCancelPastPendingShifts();
      if (result.updated > 0) {
        this.logger.log(`Auto-cancelled ${result.updated} past PENDING shift registrations`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`autoCancelPastPendingShifts failed: ${msg}`);
    }
  }
}
