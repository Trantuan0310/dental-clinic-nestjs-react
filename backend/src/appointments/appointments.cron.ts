import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentsService } from './appointments.service';

/**
 * Drives periodic bulk operations:
 *   - Every minute: auto-mark SCHEDULED/CONFIRMED appointments as NO_SHOW
 *     after grace period.
 *   - Every hour: auto-cancel PENDING shift registrations whose startTime
 *     is in the past.
 *   - Just after clinic midnight: close check-ins and queue entries left
 *     open from earlier days — and once more at startup, in case the server
 *     was down at 00:15 (the job only touches days before today, so a
 *     second run is a no-op).
 */
@Injectable()
export class AppointmentsCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppointmentsCron.name);

  constructor(private readonly appointments: AppointmentsService) {}

  async onApplicationBootstrap() {
    await this.closeStaleCheckIns();
  }

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

  // 00:15 clinic time, so yesterday's leftovers are gone before the new day
  // starts; the job only ever touches days before "today", never the current one.
  @Cron('15 0 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async closeStaleCheckIns() {
    try {
      // The service logs what it closed (and any row it could not).
      await this.appointments.closeStaleCheckIns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`closeStaleCheckIns failed: ${msg}`);
    }
  }
}
