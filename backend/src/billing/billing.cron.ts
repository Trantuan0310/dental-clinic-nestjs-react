import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingService } from './billing.service';

/**
 * Every 30 minutes: an encounter closed without an invoice (the close
 * listener failed, the server restarted right after the close) gets its DRAFT
 * invoice, so no visit leaves unbilled unnoticed (A2-03). Encounters whose
 * invoice was voided and not re-made are only counted in the log; the front
 * desk sees them in "Phiên đã đóng chưa có hóa đơn".
 * ScheduleModule.forRoot() is registered by AppointmentsModule/PayrollModule.
 */
@Injectable()
export class BillingCron {
  private readonly logger = new Logger(BillingCron.name);

  constructor(private readonly billing: BillingService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcileClosedEncounters() {
    try {
      const r = await this.billing.backfillMissingInvoices();
      if (r.created > 0 || r.checked > r.created) {
        this.logger.warn(`Encounters closed without invoice: ${r.checked}, drafted ${r.created}`);
      }
      if (r.voidedWithoutReplacement > 0) {
        this.logger.warn(
          `Completed encounters whose invoice was voided and not re-made: ${r.voidedWithoutReplacement}`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`reconcileClosedEncounters failed: ${msg}`);
    }
  }
}
