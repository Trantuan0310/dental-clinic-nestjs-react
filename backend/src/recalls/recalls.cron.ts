import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RecallsService } from './recalls.service';

/** Every day at 09:10 clinic time: email the patients due back for a recall. */
@Injectable()
export class RecallsCron {
  private readonly logger = new Logger(RecallsCron.name);

  constructor(private readonly recalls: RecallsService) {}

  @Cron('10 9 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async sendDueEmails() {
    try {
      const result = await this.recalls.sendDueEmails();
      if (result.due > 0) {
        this.logger.log(
          `Recall emails: ${result.sent} sent of ${result.due} due (${result.failed} failed)`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`sendDueEmails failed: ${msg}`);
    }
  }
}
