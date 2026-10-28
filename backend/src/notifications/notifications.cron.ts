import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InboxService } from './inbox.service';

/** Feeds the bell: new events every 2 minutes, a morning digest, a nightly purge. */
@Injectable()
export class NotificationsCron {
  private readonly logger = new Logger(NotificationsCron.name);
  private scanning = false;

  constructor(private readonly inbox: InboxService) {}

  @Cron('*/2 * * * *')
  async scan() {
    // One scan at a time: a slow run must not overlap the next.
    if (this.scanning) return;
    this.scanning = true;
    try {
      await this.inbox.scanEvents();
    } catch (err: unknown) {
      this.logger.error(`scanEvents failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.scanning = false;
    }
  }

  @Cron('31 7 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async digest() {
    try {
      await this.inbox.morningDigest();
    } catch (err: unknown) {
      this.logger.error(
        `morningDigest failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @Cron('17 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async purge() {
    try {
      await this.inbox.purgeOld();
    } catch (err: unknown) {
      this.logger.error(`purgeOld failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
